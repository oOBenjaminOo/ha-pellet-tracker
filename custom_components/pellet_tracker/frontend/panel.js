/* Pellet Tracker: local, dependency-free Home Assistant panel. */
const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const labels = {
  use: "Sacs utilisés",
  purchase: "Réapprovisionnement",
  clean: "Nettoyage",
  start: "Premier allumage",
  end: "Fin de chauffe",
  adjust: "Correction de stock (+/-)",
  loss: "Perte de sacs",
  note: "Note",
};
const csvCell = (value) => {
  let text = String(value ?? "");
  if (typeof value !== "number" && /^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
};

class PelletTrackerPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.busy = false;
    this.loadGeneration = 0;
    this.editing = null;
    this.shadowRoot.innerHTML = `<style>
      :host{display:block;height:100%;overflow:auto;background:var(--primary-background-color);color:var(--primary-text-color);font:14px var(--paper-font-body1_-_font-family,Roboto,sans-serif)}
      *{box-sizing:border-box} header{display:flex;align-items:center;gap:12px;padding:16px 24px;border-bottom:1px solid var(--divider-color);background:var(--card-background-color)}
      h1{font-size:22px;margin:0} h2{font-size:17px;margin:0 0 15px} main{max-width:1200px;margin:auto;padding:24px} .muted{color:var(--secondary-text-color);font-size:12px} .badge{border-radius:20px;padding:5px 10px;background:#ef9f1925;color:var(--primary-text-color)}
      .grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:16px 0}.card,section{background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:14px;padding:18px}.value{font-size:24px;margin-top:7px;font-weight:600}section{margin-top:16px}.row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.spacer{flex:1}
      button,select,input,textarea{font:inherit;color:inherit;border:1px solid var(--divider-color);border-radius:8px;background:var(--secondary-background-color);padding:10px}button{cursor:pointer}button:hover{border-color:var(--primary-color)}button.primary{background:var(--primary-color);color:var(--text-primary-color,#fff)}button:disabled{opacity:.45;cursor:wait}label{display:flex;flex-direction:column;gap:6px}form{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}textarea{min-height:70px;width:100%}.wide{grid-column:1/-1}table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;padding:11px 9px;border-bottom:1px solid var(--divider-color);white-space:nowrap}td.comment{white-space:normal;min-width:140px;max-width:300px}th{color:var(--secondary-text-color)}.scroll{overflow:auto}.error{color:var(--error-color,#db4437);padding:12px 0;white-space:pre-wrap}.success{color:var(--success-color,#4caf50);padding:8px 0}details{margin-top:12px}summary{cursor:pointer;padding:8px 0}.voided{opacity:.5;text-decoration:line-through}svg{display:block;width:100%;height:150px}#formTotal{font-size:16px;font-weight:600} @media(max-width:600px){main{padding:12px}header{padding:12px}.grid{grid-template-columns:repeat(2,1fr)}.value{font-size:23px}}
      .check{flex-direction:row;align-items:center}.check input{width:18px;height:18px}.warning{color:var(--warning-color,#ffa726)}.chart-large{overflow:auto}.chart-large svg{height:230px;min-width:640px}.nav{margin-top:12px}.value small{font-size:13px;font-weight:400}button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid var(--primary-color);outline-offset:2px}

      [hidden]{display:none!important}.tabs{display:flex;gap:6px;overflow-x:auto;padding:8px 0 14px;border-bottom:1px solid var(--divider-color)}.tabs button{white-space:nowrap;background:transparent;border-color:transparent}.tabs button[aria-current],.subtabs button[aria-current]{background:var(--primary-color);color:var(--text-primary-color,#fff)}.page-heading{margin:24px 0 8px}.page-heading h2{font-size:26px;margin:0}.eyebrow{text-transform:uppercase;letter-spacing:.08em;font-size:11px;color:var(--secondary-text-color);margin:0 0 8px}.hero{display:flex;justify-content:space-between;align-items:center;gap:24px;padding:28px;background:linear-gradient(120deg,#ef9f1914,var(--card-background-color))}.stock{font-size:48px;font-weight:700;line-height:1.2}.stock small{display:block;font-size:16px;font-weight:400;margin-top:6px}.quick-actions{display:grid;gap:10px;min-width:220px}.value{font-size:23px}.activity,.entity{padding:16px 0;border-bottom:1px solid var(--divider-color)}.activity:last-child,.entity:last-child{border-bottom:0}.activity-icon{font-size:24px;background:#ef9f1920;padding:8px 14px;border-radius:12px}.two-columns,.season-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.section-title{margin-top:28px}.season-grid section{margin:0}.subtabs{margin:20px 0}.comparison-mode{max-width:450px}.pagination{margin-top:18px}.filters{align-items:end}.filters label{flex:1;min-width:160px}.filters .check{min-width:180px}.code{font-family:monospace;min-height:320px}.entity code{overflow-wrap:anywhere}.footer{margin-top:24px}.entity-list strong{font-weight:500}li{margin-bottom:10px}@media(max-width:700px){.hero{align-items:stretch;flex-direction:column;padding:20px}.two-columns,.season-grid{grid-template-columns:1fr}.entity{align-items:flex-start}.entity>div{width:100%}.tabs{margin:0 -12px;padding-left:12px}.stock{font-size:42px}.page-heading h2{font-size:23px}}
dialog{color:var(--primary-text-color);background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:18px;padding:24px;width:min(720px,calc(100vw - 32px));max-height:calc(100dvh - 32px);overflow:auto;box-shadow:0 20px 70px #0008}dialog::backdrop{background:#0009}dialog .dialog-heading{margin-bottom:16px}dialog h2{margin:0}dialog form{margin-top:16px}dialog .dialog-heading button{padding:8px 12px}dialog #dialogNotice:empty{display:none}@media(max-width:600px){dialog{padding:18px;width:calc(100vw - 20px);max-height:calc(100dvh - 20px)}dialog form{grid-template-columns:1fr}}
      </style><header><ha-menu-button></ha-menu-button><span>🔥</span><h1>Suivi Granulés</h1><span class="badge">Bêta 0.4.1</span><span class="spacer"></span><select id="journal" aria-label="Poêle"></select></header><main><div id="notice" role="status"></div><div id="content">Chargement…</div></main>`;
    this.shadowRoot
      .querySelector("ha-menu-button")
      .addEventListener("click", () =>
        this.dispatchEvent(
          new CustomEvent("hass-toggle-menu", {
            bubbles: true,
            composed: true,
          }),
        ),
      );
    this.shadowRoot
      .querySelector("#journal")
      .addEventListener("change", (e) => {
        this.entry = e.target.value;
        this.editing = null;
        this.settingsDraft = null;
        this.journalSeason = null;
        this.load();
      });
  }
  set hass(value) {
    this._hass = value;
    if (!this.started) {
      this.started = true;
      this.init();
    }
  }
  disconnectedCallback() {
    this.started = false;
  }
  async init() {
    try {
      const entries = await this._hass.callWS({ type: "pellet_tracker/list" });
      this.shadowRoot.querySelector("#journal").innerHTML = entries
        .map(
          (e) =>
            `<option value="${escapeHTML(e.id)}">${escapeHTML(e.name)}</option>`,
        )
        .join("");
      if (!entries.length) {
        this.shadowRoot.querySelector("#content").innerHTML =
          "Ajoute Pellet Tracker dans Paramètres → Appareils et services → Ajouter une intégration.";
        return;
      }
      this.entry = entries[0].id;
      await this.load();
    } catch (e) {
      this.notice(e.message || String(e), true);
    }
  }
  notice(message, error = false) {
    if (error) {
      const shortage = String(message).match(
        /Insufficient stock on (\d{4}-\d{2}-\d{2})/,
      );
      const translations = {
        "Journal changed. Refresh before saving.":
          "Le journal a changé. Actualise la page avant d’enregistrer.",
        "Quantity must be positive": "La quantité doit être supérieure à zéro.",
        "Future operations are not supported":
          "Choisis une date passée ou la date du jour.",
        "Operation not found":
          "Cette opération n’est plus disponible. Actualise le journal.",
        "Invalid number": "Vérifie les nombres saisis.",
        "At most four decimal places":
          "Les nombres acceptent au maximum quatre décimales.",
      };
      message = shortage
        ? `Stock insuffisant au ${shortage[1].split("-").reverse().join("/")}. Vérifie la quantité et les mouvements précédents.`
        : translations[message] || message;
    }
    const box = this.shadowRoot.querySelector("#notice");
    box.className = error ? "error" : "success";
    box.textContent = message;
    const modalNotice = this.shadowRoot.querySelector("#dialogNotice");
    if (modalNotice) {
      modalNotice.className = box.className;
      modalNotice.textContent = message;
    }
  }
  async load() {
    const entry = this.entry;
    const generation = ++this.loadGeneration;
    try {
      const data = await this._hass.callWS({
        type: "pellet_tracker/journal",
        entry_id: entry,
      });
      if (entry !== this.entry || generation !== this.loadGeneration) return;
      this.data = data;
      this.notice("");
      this.render();
    } catch (e) {
      if (entry !== this.entry || generation !== this.loadGeneration) return;
      this.notice(e.message || String(e), true);
    }
  }
  number(n) {
    return n === null || n === undefined
      ? "Non renseigné"
      : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n);
  }
  money(n) {
    return n === null || n === undefined
      ? "Non renseigné"
      : new Intl.NumberFormat("fr-FR", {
          style: "currency",
          currency: this.data.currency,
        }).format(n);
  }
  localDate() {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: this._hass.config.time_zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
  }
  navigate(view) {
    if (this.busy) return;
    const settings = this.shadowRoot.querySelector("#settingsForm");
    if (settings) {
      this.settingsDraft = Object.fromEntries(new FormData(settings));
      for (const key of ["notify_enabled", "notify_recovery", "notify_actions"])
        this.settingsDraft[key] = settings.elements[key].checked;
    }
    this.view = view;
    this.render();
    this.scrollTop = 0;
    this.shadowRoot.querySelector("#viewTitle")?.focus();
  }
  render() {
    const d = this.data,
      s = d.summary,
      c = s.seasons[s.season];
    const views = {
      overview: "Accueil",
      stats: "Statistiques",
      seasons: "Saisons",
      journal: "Historique",
      dashboards: "Dashboards",
      settings: "Réglages",
    };
    this.view = views[this.view] ? this.view : "overview";
    const root = this.shadowRoot;
    let content;
    switch (this.view) {
      case "stats":
        content = this.statisticsView();
        break;
      case "seasons":
        content =
          `<div class="row subtabs"><button data-seasonpage="manage" ${this.seasonPage !== "report" ? 'aria-current="page"' : ""}>Gestion des saisons</button><button data-seasonpage="report" ${this.seasonPage === "report" ? 'aria-current="page"' : ""}>Bilan et budget</button></div>` +
          (this.seasonPage === "report"
            ? this.seasonReport()
            : this.seasonsView());
        break;
      case "journal":
        content =
          this.journalView() +
          `<details><summary>Importer un historique</summary><section><h2>Import de l’historique</h2><p class="muted">Import JSON version 1, avec identifiants stables. Les identifiants déjà présents sont ignorés. L’import est validé entièrement avant enregistrement.</p><input id="file" type="file" accept="application/json,.json" aria-label="Fichier historique JSON"><details><summary>Coller un import JSON</summary><textarea id="json" aria-label="Import JSON" placeholder="Coller le contenu JSON"></textarea><button id="previewJson">Prévisualiser</button></details><div id="preview"></div><button id="import" disabled>Importer les opérations</button></section></details>`;
        break;
      case "dashboards":
        content = this.dashboardsView();
        break;
      case "settings":
        content = this.settingsForm();
        break;
      default:
        content = this.overviewView();
    }
    root.querySelector("#content").innerHTML = `
      <nav aria-label="Navigation du suivi" class="tabs">${Object.entries(views)
        .map(
          ([key, label]) =>
            `<button data-view="${key}" ${key === this.view ? 'aria-current="page"' : ""}>${label}</button>`,
        )
        .join("")}</nav>
      <div class="page-heading row"><div><p class="eyebrow">${escapeHTML(d.name)} · ${escapeHTML(s.season)}</p><h2 id="viewTitle" tabindex="-1">${views[this.view]}</h2></div><span class="spacer"></span><button id="refresh" aria-label="Actualiser les données">↻ Actualiser</button></div>
      ${this.undoMarkup()}${content}<p class="muted footer">Journal local · révision ${d.revision} · les prix manquants restent inconnus.</p>`;
    root
      .querySelectorAll("[data-view]")
      .forEach((b) => (b.onclick = () => this.navigate(b.dataset.view)));
    root
      .querySelector("#editThresholds")
      ?.addEventListener("click", () => this.openThresholds());
    root.querySelector("#refresh").onclick = () => {
      this.navigate(this.view);
      this.load();
    };
    root.querySelectorAll("[data-kind]").forEach(
      (b) =>
        (b.onclick = () => {
          this.openOperation(b.dataset.kind);
        }),
    );
    root.querySelectorAll("[data-edit]").forEach(
      (b) =>
        (b.onclick = () => {
          this.openOperation(
            null,
            d.events.find((x) => x.id === b.dataset.edit),
          );
        }),
    );
    root.querySelectorAll("[data-season]").forEach(
      (b) =>
        (b.onclick = () => {
          this.statsSeason = b.dataset.season;
          this.statsTab = "monthly";
          this.navigate("stats");
        }),
    );
    if (this.view === "stats") this.bindStatisticsView();
    if (this.view === "journal") {
      this.bindJournal();
      root.querySelector("#export").onclick = () => {
        const backup = { ...d };
        delete backup.notification_choices;
        delete backup.notification_error;
        delete backup.entities;
        delete backup.mushroom_card;
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(backup, null, 2)], {
            type: "application/json",
          }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = "pellet-tracker-journal.json";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      };
      root.querySelector("#csv").onclick = () => {
        const rows = [
          [
            "Date",
            "Saison",
            "Opération",
            "Sacs",
            "Prix unitaire",
            "Livraison",
            "Remise",
            "Devise",
            "Fournisseur",
            "Marque",
            "Commentaire",
            "Annulée",
          ],
          ...[...d.events]
            .sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order)
            .map((x) => [
              x.date,
              x.season || this.seasonFor(x.date),
              labels[x.kind],
              Number(x.quantity),
              x.unit_price === null ? "" : Number(x.unit_price),
              Number(x.shipping || 0),
              Number(x.discount || 0),
              d.currency,
              x.supplier,
              x.brand,
              x.comment,
              x.voided ? "Oui" : "Non",
            ]),
        ];
        this.download(
          "\ufeff" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n"),
          "pellet-tracker-journal.csv",
          "text/csv;charset=utf-8",
        );
      };
      root.querySelector("#previewJson").onclick = () => {
        try {
          const parsed = JSON.parse(root.querySelector("#json").value);
          if (parsed.schema_version !== 1 || !Array.isArray(parsed.events))
            throw Error("Format JSON non reconnu.");
          this.pendingImport = parsed;
          const known = new Set(d.events.map((e) => e.id));
          root.querySelector("#preview").textContent =
            `${parsed.events.length} opérations · ${parsed.events.filter((e) => !known.has(e.id)).length} nouvelles.`;
          root.querySelector("#import").disabled = false;
        } catch (e) {
          this.pendingImport = null;
          root.querySelector("#import").disabled = true;
          this.notice(e.message, true);
        }
      };
      root.querySelector("#file").onchange = async (ev) => {
        this.pendingImport = null;
        root.querySelector("#import").disabled = true;
        try {
          const f = ev.target.files[0];
          if (!f) return;
          if (f.size > 10000000)
            throw Error("Fichier trop volumineux (10 Mo maximum).");
          const parsed = JSON.parse(await f.text());
          if (parsed.schema_version !== 1 || !Array.isArray(parsed.events))
            throw Error("Format JSON non reconnu.");
          this.pendingImport = parsed;
          const known = new Set(d.events.map((e) => e.id));
          root.querySelector("#preview").textContent =
            `${parsed.events.length} opérations · ${parsed.events.filter((e) => !known.has(e.id)).length} nouvelles. Vérifie le fichier avant de confirmer.`;
          root.querySelector("#import").disabled = false;
        } catch (e) {
          this.notice(e.message, true);
        }
      };
      root.querySelector("#import").onclick = () =>
        this.pendingImport &&
        this.mutate("import", { events: this.pendingImport.events });
    }
    if (this.view === "seasons") {
      root.querySelectorAll("[data-seasonpage]").forEach(
        (b) =>
          (b.onclick = () => {
            this.seasonPage = b.dataset.seasonpage;
            this.render();
          }),
      );
      if (this.seasonPage === "report") this.bindSeasonReport();
      else {
        root.querySelector("#firstStart").onclick = () => {
          const first = d.events
            .filter(
              (x) =>
                !x.voided &&
                x.kind === "start" &&
                (x.season || this.seasonFor(x.date)) === s.season,
            )
            .sort((a, b) => a.date.localeCompare(b.date))[0];
          this.openOperation("start", first);
        };
      }
    }
    if (this.view === "settings") {
      const form = root.querySelector("#settingsForm");
      for (const [key, value] of Object.entries(this.settingsDraft || {})) {
        const input = form.elements[key];
        if (input) {
          if (input.type === "checkbox") input.checked = value;
          else input.value = value;
        }
      }
      this.bindSettings();
    }
    root
      .querySelector("#undoLast")
      ?.addEventListener("click", () => this.mutate("undo", {}));
    if (this.view === "dashboards") {
      root.querySelector("#copyMushroom").onclick = () =>
        this.copyText(JSON.stringify(d.mushroom_card, null, 2));
      root.querySelector("#copyCard").onclick = () =>
        this.copyText(this.dashboardYaml());
      root
        .querySelectorAll("[data-copy]")
        .forEach((b) => (b.onclick = () => this.copyText(b.dataset.copy)));
      root.querySelectorAll("[data-info]").forEach(
        (b) =>
          (b.onclick = () =>
            this.dispatchEvent(
              new CustomEvent("hass-more-info", {
                bubbles: true,
                composed: true,
                detail: { entityId: b.dataset.info },
              }),
            )),
      );
    }
  }
  showEditor(title, content) {
    if (this.busy) return null;
    this.shadowRoot.querySelector("#editorDialog")?.remove();
    this.editorOpener = this.shadowRoot.activeElement;
    const dialog = document.createElement("dialog");
    dialog.id = "editorDialog";
    dialog.setAttribute("aria-labelledby", "editorTitle");
    dialog.innerHTML = `<div class="row dialog-heading"><h2 id="editorTitle">${escapeHTML(title)}</h2><span class="spacer"></span><button type="button" id="closeEditor" aria-label="Fermer la fenêtre">✕</button></div><div id="dialogNotice" role="status"></div>${content}`;
    this.shadowRoot.append(dialog);
    dialog.querySelector("#closeEditor").onclick = () => this.closeEditor();
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.closeEditor();
    });
    dialog.showModal();
    return dialog;
  }
  closeEditor(force = false) {
    if (this.busy && !force) return;
    const dialog = this.shadowRoot.querySelector("#editorDialog");
    if (!dialog) return;
    dialog.close();
    dialog.remove();
    this.editing = null;
    if (this.editorOpener?.isConnected) this.editorOpener.focus();
  }
  openOperation(kind = "use", existing = null) {
    if (this.busy) return;
    this.editing = existing || null;
    const e = existing || {
      date: this.localDate(),
      kind: kind || "use",
      quantity: 1,
    };
    const d = this.data;
    const dialog = this.showEditor(
      this.editing
        ? "Modifier une opération"
        : {
            use: "Ajouter une consommation",
            purchase: "Réapprovisionner le stock",
            clean: "Enregistrer un nettoyage",
          }[e.kind] || labels[e.kind],
      `<p id="entryHelp" class="muted"></p><form id="operation">
      <label>Opération<select name="kind">${Object.entries(labels)
        .map(
          ([k, v]) =>
            `<option value="${k}" ${k === e.kind ? "selected" : ""}>${v}</option>`,
        )
        .join("")}</select></label>
      <label>Date<input name="date" type="date" value="${escapeHTML(e.date)}" max="${this.localDate()}" required></label>
      <label>Quantité (sacs)<input name="quantity" type="number" step="0.0001" value="${escapeHTML(e.quantity)}" required></label>
      <label>Prix unitaire (${escapeHTML(d.currency)}/sac)<input name="unit_price" type="number" min="0" step="0.0001" value="${escapeHTML(e.unit_price)}" placeholder="Facultatif"></label>
      <label>Livraison (${escapeHTML(d.currency)})<input name="shipping" type="number" min="0" step="0.0001" value="${escapeHTML(e.shipping || 0)}"></label><label>Remise totale (${escapeHTML(d.currency)})<input name="discount" type="number" min="0" step="0.0001" value="${escapeHTML(e.discount || 0)}"></label>
      <label>Fournisseur<input name="supplier" maxlength="200" value="${escapeHTML(e.supplier)}"></label><label>Marque<input name="brand" maxlength="200" value="${escapeHTML(e.brand)}"></label>
      <label class="wide">Commentaire<textarea name="comment" maxlength="2000">${escapeHTML(e.comment)}</textarea></label>
      ${this.editing ? "" : '<label class="check wide"><input type="checkbox" name="cleaned">Enregistrer aussi un nettoyage</label>'}
      <div class="wide row"><span id="formTotal"></span><span class="spacer"></span><button type="button" id="cancel">${this.editing ? "Annuler la modification" : "Annuler"}</button><button class="primary" type="submit">Enregistrer</button></div></form>`,
    );
    if (!dialog) return;
    const root = dialog;
    const form = root.querySelector("#operation");
    if (form.elements.cleaned) form.elements.cleaned.checked = !!e.cleaned;
    const update = () => {
      const kind = form.elements.kind.value,
        paid = ["purchase", "adjust"].includes(kind);
      form.elements.unit_price.disabled = !paid;
      form.elements.quantity.disabled = [
        "clean",
        "start",
        "note",
        "end",
      ].includes(kind);
      for (const name of ["unit_price", "supplier", "brand"]) {
        form.elements[name].closest("label").hidden = !paid;
        form.elements[name].disabled = !paid;
      }
      form.elements.quantity.closest("label").hidden =
        form.elements.quantity.disabled;
      if (form.elements.cleaned) {
        form.elements.cleaned.closest("label").hidden = ![
          "use",
          "purchase",
        ].includes(kind);
        form.elements.cleaned.disabled = !["use", "purchase"].includes(kind);
      }
      for (const name of ["shipping", "discount"]) {
        form.elements[name].closest("label").hidden = kind !== "purchase";
        form.elements[name].disabled = kind !== "purchase";
      }
      root.querySelector("#entryHelp").textContent = {
        use: "Sacs versés au poêle : ils sont retirés du stock.",
        purchase:
          "Ajoutez les sacs reçus et leur prix unitaire pour suivre vos dépenses.",
        clean:
          "Enregistrez un nettoyage : le compteur d’entretien repart de zéro.",
        start:
          "Date du premier allumage de cette saison. Le stock reste identique.",
        end: "Dernier jour de chauffe : permet de calculer le bilan, sans modifier le stock.",
        adjust:
          "Correction positive ou négative du stock. Précisez la raison en commentaire.",
        loss: "Sacs abîmés ou perdus : ils sont retirés du stock, sans compter comme consommation.",
        note: "Une note dans l’historique, sans modifier les compteurs.",
      }[kind];
      root.querySelector("#formTotal").textContent =
        paid && form.elements.unit_price.value !== ""
          ? "Montant : " +
            this.money(
              Number(form.elements.quantity.value) *
                Number(form.elements.unit_price.value) +
                (kind === "purchase"
                  ? Number(form.elements.shipping.value || 0) -
                    Number(form.elements.discount.value || 0)
                  : 0),
            )
          : "";
    };
    form.addEventListener("input", update);
    update();
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      if (!form.reportValidity()) return;
      const payload = Object.fromEntries(new FormData(form));
      payload.quantity = payload.quantity || 0;
      payload.cleaned =
        !form.elements.cleaned?.disabled &&
        (form.elements.cleaned?.checked || false);
      if (this.editing) {
        payload.id = this.editing.id;
        if (this.editing.season && payload.date === this.editing.date)
          payload.season = this.editing.season;
        if (this.editing.untracked) payload.untracked = true;
        if (this.editing.purchases_unknown) payload.purchases_unknown = true;
      }
      await this.mutate(this.editing ? "edit" : "add", payload);
    });

    root.querySelector("#cancel").onclick = () => this.closeEditor();
    root.querySelector('[name="date"]').focus();
  }
  openThresholds() {
    const cfg = this.data.settings;
    const dialog = this.showEditor(
      "Mes seuils d’alerte",
      `<p>Choisissez les valeurs qui correspondent à votre réserve et à l’entretien de votre poêle.</p><form id="thresholdForm"><label>Alerte stock à partir de (sacs restants)<input name="low_stock" type="number" min="0" max="10000" step="1" value="${cfg.low_stock}" required></label><p class="muted">L’alerte se déclenche à cette quantité ou en dessous.</p><label>Nettoyage après (sacs utilisés)<input name="cleaning_bags" type="number" min="0" max="10000" step="1" value="${cfg.cleaning_bags}" required></label><label>Nettoyage après (jours)<input name="cleaning_days" type="number" min="0" max="365" step="1" value="${cfg.cleaning_days}" required></label><p class="wide muted">Le premier seuil d’entretien atteint déclenche l’alerte. Le critère en jours exige au moins un sac utilisé depuis le dernier nettoyage. Une valeur à 0 désactive le critère ; les deux à 0 désactivent le rappel d’entretien. Les réapprovisionnements ne comptent pas comme sacs utilisés.</p><div class="wide row"><button type="button" id="cancelThresholds">Annuler</button><span class="spacer"></span><button class="primary" type="submit">Enregistrer mes seuils</button></div></form>`,
    );
    if (!dialog) return;
    dialog.querySelector("#cancelThresholds").onclick = () =>
      this.closeEditor();
    dialog.querySelector("#thresholdForm").onsubmit = async (event) => {
      event.preventDefault();
      if (!event.target.reportValidity()) return;
      await this.settingsRequest("pellet_tracker/settings", {
        settings: Object.fromEntries(new FormData(event.target)),
        revision: this.data.settings.settings_revision || 0,
      });
    };
    dialog.querySelector('[name="low_stock"]').focus();
  }
  undoMarkup() {
    const last = this.data.audit?.at(-1);
    return last?.action === "add" && last.revision === this.data.revision
      ? `<section class="row"><span>Dernière saisie : ${last.after.length} opération(s).</span><span class="spacer"></span><button id="undoLast">Annuler la dernière saisie</button></section>`
      : "";
  }
  priceComparison() {
    const s = this.data.summary;
    this.priceSeason ??= s.season;
    this.priceDimension ||= "supplier";
    const rows = (s.price_comparisons || []).filter(
      (x) =>
        (!this.priceSeason || x.season === this.priceSeason) &&
        x.dimension === this.priceDimension,
    );
    return `<div class="row subtabs"><button data-stats="monthly">← Statistiques mensuelles</button></div><section><h2>Comparer les prix d’achat</h2><div class="row"><label>Saison<select id="priceSeason"><option value="">Toutes les saisons</option>${Object.keys(
      s.seasons,
    )
      .reverse()
      .map(
        (k) =>
          `<option ${this.priceSeason === k ? "selected" : ""}>${escapeHTML(k)}</option>`,
      )
      .join(
        "",
      )}</select></label><label>Comparer par<select id="priceDimension"><option value="supplier" ${this.priceDimension === "supplier" ? "selected" : ""}>Fournisseur</option><option value="brand" ${this.priceDimension === "brand" ? "selected" : ""}>Marque</option></select></label></div><p class="muted">Prix moyen pondéré par le nombre de sacs, livraison et remise incluses. Les achats sans prix restent inconnus. Les prix ne constituent pas une mesure de qualité ou de rendement.</p><div class="scroll"><table><thead><tr><th>Saison</th><th>Nom</th><th>Sacs</th><th>Dépenses</th><th>Prix moyen / sac</th><th>Min / max</th><th>Sacs sans prix</th></tr></thead><tbody>${rows.map((x) => `<tr><td>${escapeHTML(x.season)}</td><td>${escapeHTML(x.name)}</td><td>${this.number(x.quantity)}</td><td>${this.money(x.spend)}</td><td>${this.money(x.average_price)}</td><td>${this.money(x.min_price)} / ${this.money(x.max_price)}</td><td>${this.number(x.unknown_quantity)}</td></tr>`).join("") || '<tr><td colspan="7">Aucun achat pour cette sélection.</td></tr>'}</tbody></table></div></section>`;
  }
  seasonReport() {
    const d = this.data,
      s = d.summary;
    this.reportSeason = s.seasons[this.reportSeason]
      ? this.reportSeason
      : s.season;
    const r = s.seasons[this.reportSeason];
    return `<section><h2>Bilan de chauffe et budget</h2><label>Saison du bilan<select id="reportSeason">${Object.keys(
      s.seasons,
    )
      .reverse()
      .map(
        (k) =>
          `<option ${this.reportSeason === k ? "selected" : ""}>${escapeHTML(k)}</option>`,
      )
      .join(
        "",
      )}</select></label><div class="grid"><div class="card"><div class="muted">Premier allumage</div><div class="value">${this.formatDate(r.first_start)}</div></div><div class="card"><div class="muted">Fin de chauffe</div><div class="value">${this.formatDate(r.last_end)}</div></div><div class="card"><div class="muted">Durée de chauffe</div><div class="value">${r.heating_days == null ? "À compléter" : r.heating_days + " jours"}</div></div><div class="card"><div class="muted">Sacs sur la période de chauffe</div><div class="value">${this.number(r.heating_used)}</div></div></div><p>Saison comptable : ${this.number(r.used)} sacs utilisés · dépenses ${this.money(r.spend)} · coût des sacs utilisés ${this.money(r.cost)}.</p><p class="muted">${r.heating_days == null ? "Renseignez le premier allumage et la fin de chauffe pour calculer la durée et la consommation sur cette période." : `Moyenne sur la période : ${this.number(r.heating_daily_rate)} sacs/jour. ${this.number(r.outside_heating_used)} sacs enregistrés en dehors de cette période restent comptabilisés dans la saison.`} Les dates de chauffe ne ferment pas le journal et ne remettent jamais le stock à zéro.</p><form id="endForm"><label>Dernier jour de chauffe<input name="date" type="date" required max="${this.localDate() < this.seasonDates(this.reportSeason).end ? this.localDate() : this.seasonDates(this.reportSeason).end}" min="${r.first_start || this.seasonDates(this.reportSeason).start}" value="${r.last_end || ""}"></label><div class="row"><button type="submit">${r.last_end ? "Modifier la fin de chauffe" : "Enregistrer la fin de chauffe"}</button><button id="reportExport" type="button">Exporter le bilan JSON</button></div></form><hr><h2>Budget facultatif · ${escapeHTML(this.reportSeason)}</h2><p>Budget : <strong>${this.money(r.budget)}</strong> · restant : <strong>${this.money(r.budget_remaining)}</strong>${r.budget_percent == null ? "" : ` · ${this.number(r.budget_percent)} % utilisé`}.</p><form id="budgetForm"><label>Budget (${escapeHTML(d.currency)})<input name="budget" type="number" min="0" max="1000000" step="0.01" placeholder="Laisser vide pour désactiver" value="${escapeHTML(d.settings.season_budgets?.[this.reportSeason] ?? "")}"></label><button type="submit">Enregistrer le budget</button></form><p class="muted">Aucun budget n’est requis. Une valeur vide le désactive pour cette saison. Le restant n’est pas calculé si les dépenses sont incomplètes. Un dépassement apparaît comme un restant négatif.</p></section>`;
  }
  bindSeasonReport() {
    const root = this.shadowRoot;
    root.querySelector("#reportSeason").onchange = (e) => {
      this.reportSeason = e.target.value;
      this.render();
    };
    root.querySelector("#budgetForm").onsubmit = async (e) => {
      e.preventDefault();
      const form = e.target;
      if (!form.reportValidity()) return;
      const budgets = { ...(this.data.settings.season_budgets || {}) };
      if (form.elements.budget.value === "") delete budgets[this.reportSeason];
      else budgets[this.reportSeason] = form.elements.budget.value;
      await this.settingsRequest("pellet_tracker/settings", {
        settings: { season_budgets: budgets },
        revision: this.data.settings.settings_revision || 0,
      });
    };
    root.querySelector("#reportExport").onclick = () =>
      this.download(
        JSON.stringify(
          {
            season: this.reportSeason,
            currency: this.data.currency,
            ...this.data.summary.seasons[this.reportSeason],
          },
          null,
          2,
        ),
        `bilan-granules-${this.reportSeason.replace("/", "-")}.json`,
        "application/json",
      );
    root.querySelector("#endForm").onsubmit = async (e) => {
      e.preventDefault();
      if (!e.target.reportValidity()) return;
      const date = e.target.elements.date.value;
      const existing = this.data.events
        .filter(
          (x) =>
            !x.voided &&
            x.kind === "end" &&
            (x.season || this.seasonFor(x.date)) === this.reportSeason,
        )
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      await this.mutate(existing ? "edit" : "add", {
        ...(existing || {}),
        kind: "end",
        date,
        season: this.reportSeason,
        quantity: 0,
      });
    };
  }
  async copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      this.notice("Copié dans le presse-papiers.");
    } catch {
      this.notice("Sélectionnez le texte pour le copier manuellement.", true);
    }
  }
  overviewView() {
    const s = this.data.summary,
      c = s.seasons[s.season];
    const metrics = [
      ["Sacs utilisés", `${this.number(c.used)} sacs`],
      ["Dépenses de la saison", this.money(c.spend)],
      [
        "Autonomie estimée",
        s.autonomy_days == null
          ? "En apprentissage"
          : `${this.number(s.autonomy_days)} jours`,
      ],
      [
        "Dernier nettoyage",
        s.last_clean ? this.formatDate(s.last_clean) : "À renseigner",
      ],
    ];
    return `<section class="hero"><div><p class="eyebrow">Votre réserve</p><div class="stock">${this.number(s.stock)} <small>sacs disponibles</small></div><p>${s.stock <= this.data.settings.low_stock ? "Le stock est bas. Pensez au prochain réapprovisionnement." : "Votre stock est à jour avec les dernières saisies."}</p></div><div class="quick-actions"><button class="primary" data-kind="use">− Ajouter une consommation</button><button data-kind="purchase">＋ Réapprovisionner</button><button data-kind="clean">✓ Noter un nettoyage</button></div></section>
      <div class="grid">${metrics.map(([label, value]) => `<div class="card"><div class="muted">${label}</div><div class="value">${escapeHTML(value)}</div></div>`).join("")}</div>
      <p class="muted">${s.autonomy_days == null ? "L’autonomie apparaîtra après au moins 7 jours de recul et 3 dates de consommation récentes." : `Estimation basée sur ${s.estimate_sample_days} dates de saisie, sur ${s.estimate_window} jours. ${s.estimate_status === "limited" ? "Recul encore limité." : ""} Elle ne prévoit pas la météo.`}</p>
      <section><div class="row"><h2>Mes seuils d’alerte</h2><span class="spacer"></span><button id="editThresholds">Modifier mes seuils</button></div><p>Stock faible à <strong>${this.number(this.data.settings.low_stock)} sacs ou moins</strong>.</p><p>Entretien : ${this.cleaningRule()}.</p><p class="muted">Vous choisissez vos seuils. Les badges et les notifications suivent automatiquement vos réglages.</p><button data-kind="note">Autre opération</button></section>
      <section><div class="row"><h2>Dernières opérations</h2><span class="spacer"></span><button data-view="journal">Tout l’historique →</button></div>${
        this.recentEvents()
          .slice(0, 3)
          .map(
            (x) =>
              `<div class="activity row"><span class="activity-icon">${x.kind === "purchase" ? "＋" : x.kind === "clean" ? "✓" : "•"}</span><div><strong>${escapeHTML(labels[x.kind])}</strong><div class="muted">${this.formatDate(x.date)}${x.comment ? " · " + escapeHTML(x.comment) : ""}</div></div><span class="spacer"></span><strong>${["use", "purchase", "adjust", "loss"].includes(x.kind) ? this.number(Number(x.quantity)) + " sacs" : ""}</strong></div>`,
          )
          .join("") ||
        '<p class="muted">Commencez par un réapprovisionnement ou une correction du stock initial.</p>'
      }</section>`;
  }
  formatDate(day) {
    return day ? day.split("-").reverse().join("/") : "—";
  }
  recentEvents() {
    return [...this.data.events]
      .filter((x) => !x.voided)
      .sort((a, b) => b.date.localeCompare(a.date) || b.order - a.order);
  }
  seasonDates(season = this.data.summary.season) {
    const year = Number(season.split("/")[0]),
      month = Number(this.data.season_month);
    const start = `${year}-${String(month).padStart(2, "0")}-01`;
    const next = `${year + 1}-${String(month).padStart(2, "0")}-01`;
    const end = new Date(Date.UTC(year + 1, month - 1, 0))
      .toISOString()
      .slice(0, 10);
    return {
      start,
      end,
      next,
      label: new Intl.DateTimeFormat("fr-FR", {
        month: "long",
        timeZone: "UTC",
      }).format(new Date(`${start}T12:00:00Z`)),
    };
  }
  seasonsView() {
    const s = this.data.summary,
      c = s.seasons[s.season],
      dates = this.seasonDates();
    return `<section class="hero"><div><p class="eyebrow">Saison en cours · automatique</p><h2>${escapeHTML(s.season)}</h2><p>Du ${this.formatDate(dates.start)} au ${this.formatDate(dates.end)}</p><p>La prochaine saison commencera automatiquement le <strong>${this.formatDate(dates.next)}</strong>.</p></div><span class="badge">Aucune création manuelle nécessaire</span></section>
      <div class="two-columns"><section><h2>Comment se passe la bascule ?</h2><p>Une saison commence le 1er ${dates.label}. Chaque opération est rattachée à la saison de sa date, même si elle est saisie plus tard.</p><p>Le stock restant est conservé. Les compteurs de la nouvelle saison démarrent à zéro et l’historique reste disponible.</p></section><section><h2>Premier allumage</h2><div class="value">${this.formatDate(c.first_start)}</div><p class="muted">Le début de chauffe est distinct du début comptable de la saison. Cette date ne consomme aucun sac.</p><button id="firstStart">${c.first_start ? "Modifier cette date" : "Enregistrer le premier allumage"}</button></section></div>
      <h2 class="section-title">Vos saisons</h2><div class="season-grid">${Object.entries(
        s.seasons,
      )
        .reverse()
        .map(
          ([season, x]) =>
            `<section><div class="row"><h2>${escapeHTML(season)}</h2>${season === s.season ? '<span class="badge">En cours</span>' : ""}</div><div class="value">${this.number(x.used)} <small>sacs utilisés</small></div><p>Dépenses : <strong>${this.money(x.spend)}</strong><br>Prix moyen d’achat : ${this.money(x.average_price)}</p><p class="muted">Premier allumage : ${this.formatDate(x.first_start)}</p><button data-season="${escapeHTML(season)}">Voir les statistiques →</button></section>`,
        )
        .join("")}</div>`;
  }
  statisticsView() {
    const s = this.data.summary;
    this.statsTab ||= "monthly";
    if (this.statsTab === "prices") return this.priceComparison();
    return `<div class="row subtabs" aria-label="Type de statistiques">${[
      ["monthly", "Par mois"],
      ["compare", "Comparer les saisons"],
      ["stock", "Évolution du stock"],
      ["prices", "Fournisseurs et marques"],
    ]
      .map(
        ([key, label]) =>
          `<button data-stats="${key}" ${this.statsTab === key ? 'aria-current="page"' : ""}>${label}</button>`,
      )
      .join("")}</div>${
      this.statsTab === "monthly"
        ? this.monthlyStats()
        : this.statsTab === "compare"
          ? `<label class="comparison-mode">Période<select id="compareMode"><option value="date" ${this.compareMode !== "full" ? "selected" : ""}>Même date de chaque saison</option><option value="full" ${this.compareMode === "full" ? "selected" : ""}>Saisons entières (saison actuelle en cours)</option></select></label>${
              this.compareMode === "full"
                ? `<section><h2>Comparaison des saisons</h2><p class="muted">La saison ${escapeHTML(s.season)} est en cours. Les autres lignes représentent les données enregistrées, sans présumer qu’une saison est complète. Prix moyen pondéré sur les achats dont le prix est connu.</p><div class="scroll"><table><thead><tr><th>Saison</th><th>Premier allumage</th><th>Sacs utilisés</th><th>Sacs achetés</th><th>Nettoyages</th><th>Dépenses</th><th>Coût utilisé FIFO</th><th>Prix moyen</th><th>Min / max</th></tr></thead><tbody>${Object.entries(
                    s.seasons,
                  )
                    .reverse()
                    .map(
                      ([season, x]) =>
                        `<tr><td>${escapeHTML(season)}</td><td>${escapeHTML(x.first_start || "—")}</td><td>${this.number(x.used)}</td><td>${this.number(x.purchased)}</td><td>${x.cleanings}</td><td>${this.money(x.spend)}${x.purchase_unpriced ? `<br><span class="muted">${this.number(x.purchase_unpriced)} sacs sans prix</span>` : ""}</td><td>${this.money(x.cost)}${x.use_unpriced ? `<br><span class="muted">${this.number(x.use_unpriced)} sacs sans prix</span>` : ""}</td><td>${this.money(x.average_price)}</td><td>${this.money(x.min_price)} / ${this.money(x.max_price)}</td></tr>`,
                    )
                    .join("")}</tbody></table></div></section>`
                : this.sameDateStats()
            }`
          : `<section><h2>Évolution du stock</h2><p class="muted">Historique disponible depuis le premier inventaire enregistré. Les passages entre saisons conservent le stock.</p>${this.chart(this.data.summary.stock_history)}</section>`
    }`;
  }
  bindStatisticsView() {
    const root = this.shadowRoot;
    root.querySelectorAll("[data-stats]").forEach(
      (b) =>
        (b.onclick = () => {
          this.statsTab = b.dataset.stats;
          this.render();
        }),
    );
    if (this.statsTab === "monthly") this.bindStatistics();
    if (this.statsTab === "prices") {
      root.querySelector("#priceSeason").onchange = (e) => {
        this.priceSeason = e.target.value;
        this.render();
      };
      root.querySelector("#priceDimension").onchange = (e) => {
        this.priceDimension = e.target.value;
        this.render();
      };
    }
    if (root.querySelector("#compareMode"))
      root.querySelector("#compareMode").onchange = (e) => {
        this.compareMode = e.target.value;
        this.render();
      };
  }
  journalView() {
    const s = this.data.summary;
    this.journalSeason ??= s.season;
    this.journalKind ||= "";
    this.journalSearch ||= "";
    const events = [...this.data.events]
      .filter(
        (x) =>
          (this.showVoided || !x.voided) &&
          (!this.journalSeason ||
            (x.season || this.seasonFor(x.date)) === this.journalSeason) &&
          (!this.journalKind || x.kind === this.journalKind) &&
          `${x.date} ${x.comment} ${x.supplier} ${x.brand}`
            .toLocaleLowerCase("fr")
            .includes(this.journalSearch.toLocaleLowerCase("fr")),
      )
      .sort((a, b) => b.date.localeCompare(a.date) || b.order - a.order);
    const pages = Math.max(1, Math.ceil(events.length / 25));
    this.journalPage = Math.min(this.journalPage || 0, pages - 1);
    return `<section><div class="row filters"><label>Saison<select id="filter"><option value="">Toutes les saisons</option>${Object.keys(
      s.seasons,
    )
      .reverse()
      .map(
        (k) =>
          `<option ${k === this.journalSeason ? "selected" : ""}>${escapeHTML(k)}</option>`,
      )
      .join(
        "",
      )}</select></label><label>Opération<select id="kindFilter"><option value="">Toutes les opérations</option>${Object.entries(
      labels,
    )
      .map(
        ([key, label]) =>
          `<option value="${key}" ${key === this.journalKind ? "selected" : ""}>${label}</option>`,
      )
      .join(
        "",
      )}</select></label><label>Rechercher<input id="search" placeholder="Date, commentaire, fournisseur…" value="${escapeHTML(this.journalSearch)}"></label><label class="check"><input type="checkbox" id="showVoided" ${this.showVoided ? "checked" : ""}>Inclure les annulations</label></div>
      <p class="muted">${events.length} opérations · 25 par page</p><div class="scroll"><table><thead><tr><th>Date</th><th>Opération</th><th>Sacs</th><th>Prix / sac</th><th>Commentaire</th><th>Actions</th></tr></thead><tbody>${
        events
          .slice(this.journalPage * 25, (this.journalPage + 1) * 25)
          .map(
            (x) =>
              `<tr class="${x.voided ? "voided" : ""}"><td>${this.formatDate(x.date)}</td><td>${escapeHTML(labels[x.kind])}</td><td>${["use", "purchase", "adjust", "loss"].includes(x.kind) ? this.number(Number(x.quantity)) : "—"}</td><td>${x.unit_price == null ? "—" : this.money(Number(x.unit_price))}</td><td class="comment">${escapeHTML(x.comment)}</td><td>${x.voided ? `<button data-restore="${escapeHTML(x.id)}">Rétablir</button>` : `<button data-edit="${escapeHTML(x.id)}">Modifier</button> <button data-void="${escapeHTML(x.id)}">Annuler</button>`}</td></tr>`,
          )
          .join("") ||
        '<tr><td colspan="6">Aucune opération pour ces filtres.</td></tr>'
      }</tbody></table></div><div class="row pagination"><button id="previous" ${this.journalPage === 0 ? "disabled" : ""}>← Précédent</button><span>Page ${this.journalPage + 1} / ${pages}</span><button id="next" ${this.journalPage + 1 === pages ? "disabled" : ""}>Suivant →</button><span class="spacer"></span><button id="export">Sauvegarde JSON</button><button id="csv">Export CSV</button></div></section>
      <details><summary>Traçabilité des dernières modifications</summary><div class="scroll"><table><thead><tr><th>Date</th><th>Révision</th><th>Action</th></tr></thead><tbody>${[
        ...this.data.audit,
      ]
        .reverse()
        .slice(0, 30)
        .map(
          (a) =>
            `<tr><td>${escapeHTML(a.at)}</td><td>${a.revision}</td><td>${escapeHTML(a.action)}</td></tr>`,
        )
        .join("")}</tbody></table></div></details>`;
  }
  bindJournal() {
    const root = this.shadowRoot;
    for (const [id, key] of [
      ["filter", "journalSeason"],
      ["kindFilter", "journalKind"],
      ["search", "journalSearch"],
      ["showVoided", "showVoided"],
    ])
      root.querySelector(`#${id}`).onchange = (e) => {
        this[key] =
          e.target.type === "checkbox" ? e.target.checked : e.target.value;
        this.journalPage = 0;
        this.render();
      };
    root.querySelector("#previous").onclick = () => {
      this.journalPage--;
      this.render();
    };
    root.querySelector("#next").onclick = () => {
      this.journalPage++;
      this.render();
    };
    root.querySelectorAll("[data-void]").forEach(
      (b) =>
        (b.onclick = () => {
          if (
            confirm(
              "Annuler cette opération et recalculer le journal ? Elle restera dans l’audit.",
            )
          )
            this.mutate("void", { id: b.dataset.void });
        }),
    );
    root
      .querySelectorAll("[data-restore]")
      .forEach(
        (b) =>
          (b.onclick = () => this.mutate("restore", { id: b.dataset.restore })),
      );
  }
  dashboardYaml() {
    const entities = this.data.entities || [];
    const entity = (key) =>
      entities.find((x) => x.key === key && x.available)?.entity_id;
    const quote = (value) => JSON.stringify(value);
    const tiles = [
      ["stock", "Stock restant"],
      ["used", "Sacs utilisés"],
      ["spend", "Dépenses de la saison"],
      ["autonomy_days", "Autonomie estimée"],
      ["last_clean", "Dernier nettoyage"],
      ["average_price", "Prix moyen du sac"],
    ]
      .filter(([key]) => entity(key))
      .map(
        ([key, name]) =>
          `      - type: tile\n        entity: ${quote(entity(key))}\n        name: ${quote(name)}`,
      )
      .join("\n");
    const actions = [
      ["add_bag", "Ajouter un sac", "mdi:fire"],
      ["clean", "Noter un nettoyage", "mdi:broom"],
    ]
      .filter(([key]) => entity(key))
      .map(
        ([key, name, icon]) =>
          `      - type: button\n        name: ${quote(name)}\n        icon: ${icon}\n        tap_action:\n          action: perform-action\n          perform_action: button.press\n          target:\n            entity_id: ${quote(entity(key))}\n          confirmation:\n            text: ${quote(name + " dans le journal ?")}`,
      )
      .join("\n");
    if (!tiles)
      return "# Aucun capteur disponible. Vérifiez que l’intégration est chargée.";
    return `type: vertical-stack\ncards:\n  - type: markdown\n    content: ${quote("## 🔥 " + this.data.name)}\n  - type: grid\n    columns: 2\n    square: false\n    cards:\n${tiles}${actions ? `\n  - type: grid\n    columns: 2\n    square: false\n    cards:\n${actions}` : ""}\n`;
  }
  cleaningRule() {
    const cfg = this.data.settings,
      rules = [];
    if (cfg.cleaning_bags) rules.push(`${cfg.cleaning_bags} sacs utilisés`);
    if (cfg.cleaning_days)
      rules.push(
        `${cfg.cleaning_days} jours avec consommation depuis le dernier nettoyage`,
      );
    return rules.length
      ? `alerte après ${rules.join(" ou ")}`
      : "rappel désactivé";
  }
  dashboardsView() {
    const entities = this.data.entities || [];
    return `<section><h2>Carte Mushroom</h2><p>Le visuel de poêle fourni avec l’intégration, le stock, l’autonomie, les dépenses, le nettoyage et les actions avec confirmation. Nécessite Mushroom installé depuis HACS.</p><button id="copyMushroom" class="primary">Copier la carte Mushroom</button><p class="muted">Collez ce contenu dans une carte Manuelle. Le format JSON fourni est également du YAML valide. Stock OK : plus de ${this.data.settings.low_stock} sacs. Entretien : ${this.cleaningRule()}. Les seuils se règlent dans Réglages.</p><details><summary>Afficher la configuration Mushroom</summary><textarea class="code" readonly aria-label="Carte Mushroom YAML">${escapeHTML(JSON.stringify(this.data.mushroom_card, null, 2))}</textarea></details></section><section><h2>Votre suivi dans vos tableaux de bord</h2><p>Les données sont disponibles sous forme d’entités Home Assistant : capteurs, alertes et boutons. Vous pouvez les utiliser dans vos cartes et automatisations, indépendamment de cette interface.</p><div class="row"><span class="badge">${entities.length} entités pour ce poêle</span><span class="badge">Cartes natives · aucune carte supplémentaire à installer</span></div></section>
      <section><div class="row"><h2>Carte prête à ajouter</h2><span class="spacer"></span><button id="copyCard" class="primary">Copier la carte YAML</button></div><ol><li>Ouvrez votre dashboard et choisissez « Modifier le tableau de bord ».</li><li>Ajoutez une carte « Manuelle ».</li><li>Collez ce YAML et enregistrez.</li></ol><p class="muted">La carte inclut le stock, la consommation, les dépenses, l’autonomie, le nettoyage et le prix moyen. Les boutons demandent confirmation avant d’enregistrer une opération.</p><details><summary>Afficher le YAML</summary><textarea class="code" readonly aria-label="Carte dashboard YAML">${escapeHTML(this.dashboardYaml())}</textarea></details></section>
      ${[
        ["sensor", "Capteurs"],
        ["binary_sensor", "Alertes"],
        ["button", "Boutons d’action"],
      ]
        .map(
          ([domain, title]) =>
            `<section><h2>${title}</h2><div class="entity-list">${
              entities
                .filter((x) => x.entity_id.startsWith(domain + "."))
                .map(
                  (x) =>
                    `<div class="entity row"><div><strong>${escapeHTML(x.name)}</strong><div class="muted"><code>${escapeHTML(x.entity_id)}</code>${x.available ? "" : " · indisponible"}</div></div><span class="spacer"></span><button data-info="${escapeHTML(x.entity_id)}">Détails</button><button data-copy="${escapeHTML(x.entity_id)}" aria-label="Copier ${escapeHTML(x.entity_id)}">Copier l’identifiant</button></div>`,
                )
                .join("") || '<p class="muted">Aucune entité de ce type.</p>'
            }</div></section>`,
        )
        .join("")}`;
  }
  monthlyStats() {
    const s = this.data.summary;
    this.statsSeason = s.monthly[this.statsSeason]
      ? this.statsSeason
      : s.season;
    this.statsMetric ||= "quantity";
    return `<section id="stats"><div class="row"><h2>Statistiques mensuelles</h2><span class="spacer"></span><label>Saison des graphiques<select id="statsSeason">${Object.keys(
      s.seasons,
    )
      .reverse()
      .map(
        (k) =>
          `<option ${k === this.statsSeason ? "selected" : ""}>${escapeHTML(k)}</option>`,
      )
      .join("")}</select></label><label>Mesure<select id="statsMetric">${[
      ["quantity", "Quantités de sacs"],
      ["cost", "Coûts"],
      ["price", "Prix d’achat par sac"],
    ]
      .map(
        ([k, v]) =>
          `<option value="${k}" ${k === this.statsMetric ? "selected" : ""}>${v}</option>`,
      )
      .join(
        "",
      )}</select></label><button id="monthlyCsv">Export mensuel CSV</button></div><div id="monthlyContent">${this.monthlyContent()}</div></section>
`;
  }
  sameDateStats() {
    const s = this.data.summary;
    return `<section><h2>Comparaison à date équivalente</h2><p class="muted">Cumul de chaque saison arrêté au même jour et au même mois. Le 29 février est comparé au 28 février pour les années non bissextiles. Les valeurs proviennent des opérations enregistrées.</p><p>Évolution des sacs utilisés par rapport à la saison précédente : <strong>${s.usage_change_percent == null ? "Non calculable" : `${s.usage_change_percent > 0 ? "+" : ""}${this.number(s.usage_change_percent)} %`}</strong></p><div class="scroll"><table><thead><tr><th>Saison</th><th>Arrêté au</th><th>Sacs utilisés</th><th>Sacs achetés</th><th>Dépenses</th><th>Coût des sacs utilisés</th><th>Prix moyen</th></tr></thead><tbody>${[
      ...s.same_date,
    ]
      .reverse()
      .map(
        (x) =>
          `<tr><td>${escapeHTML(x.season)}</td><td>${escapeHTML(x.cutoff.split("-").reverse().join("/"))}</td><td>${this.number(x.used)}</td><td>${this.number(x.purchased)}</td><td>${this.money(x.spend)}</td><td>${this.money(x.cost)}</td><td>${this.money(x.average_price)}</td></tr>`,
      )
      .join("")}</tbody></table></div></section>`;
  }
  monthlyContent() {
    const rows = this.data.summary.monthly[this.statsSeason];
    const series =
      this.statsMetric === "quantity"
        ? [
            ["used", "Sacs utilisés", "#29b6f6"],
            ["purchased", "Sacs achetés", "#ffa726"],
          ]
        : this.statsMetric === "cost"
          ? [
              ["cost", "Coût utilisé", "#29b6f6"],
              ["spend", "Dépenses", "#ffa726"],
            ]
          : [["average_price", "Prix moyen pondéré", "#ffa726"]];
    const money = this.statsMetric !== "quantity";
    const max = Math.max(
      1,
      ...rows.flatMap((x) =>
        series.map(([key]) => (x.future ? 0 : x[key] || 0)),
      ),
    );
    const months = [
      "janv.",
      "févr.",
      "mars",
      "avr.",
      "mai",
      "juin",
      "juil.",
      "août",
      "sept.",
      "oct.",
      "nov.",
      "déc.",
    ];
    return `<div class="chart-large"><svg viewBox="0 0 1000 230" role="img" aria-label="Graphique mensuel ${escapeHTML(this.statsSeason)}"><line x1="35" y1="190" x2="990" y2="190" stroke="currentColor" opacity=".25"/>${rows
      .map((x, i) => {
        const center = 70 + i * 78;
        return `${series
          .map(([key, label, color], j) => {
            const val = x.future ? null : x[key];
            const width = series.length === 1 ? 32 : 22;
            const px =
              center + (j - (series.length - 1) / 2) * (width + 3) - width / 2;
            const height = val == null ? 0 : (val / max) * 155;
            return val == null
              ? `<text x="${px + width / 2}" y="185" fill="currentColor" opacity=".5" text-anchor="middle" font-size="12">${x.future ? "·" : "?"}</text>`
              : `<rect x="${px}" y="${190 - height}" width="${width}" height="${height}" rx="2" fill="${color}"><title>${escapeHTML(x.month + " · " + label + " : " + (money ? this.money(val) : this.number(val) + " sacs"))}</title></rect>`;
          })
          .join(
            "",
          )}<text x="${center}" y="212" fill="currentColor" text-anchor="middle" font-size="12">${months[Number(x.month.slice(5)) - 1]}</text>`;
      })
      .join(
        "",
      )}<text x="35" y="18" fill="currentColor" font-size="12">Maximum : ${escapeHTML(money ? this.money(max) : this.number(max) + " sacs")}</text></svg></div><p class="muted">${series.map(([, label, color]) => `<span style="color:${color}">● ${label}</span>`).join(" · ")} · ? = non renseigné · · = mois à venir. Les zéros représentent l’absence d’opération enregistrée.</p><details><summary>Valeurs mensuelles</summary><div class="scroll"><table><thead><tr><th>Mois</th><th>Utilisés</th><th>Achetés</th><th>Dépenses</th><th>Coût utilisé</th><th>Prix moyen / sac</th></tr></thead><tbody>${rows.map((x) => `<tr><td>${escapeHTML(x.month)}</td>${x.future ? '<td colspan="5">À venir</td>' : `<td>${this.number(x.used)}</td><td>${this.number(x.purchased)}</td><td>${this.money(x.spend)}</td><td>${this.money(x.cost)}</td><td>${this.money(x.average_price)}</td>`}</tr>`).join("")}</tbody></table></div></details>`;
  }
  bindStatistics() {
    const root = this.shadowRoot;
    root.getElementById("statsSeason").onchange = (e) => {
      this.statsSeason = e.target.value;
      root.getElementById("monthlyContent").innerHTML = this.monthlyContent();
    };
    root.getElementById("statsMetric").onchange = (e) => {
      this.statsMetric = e.target.value;
      root.getElementById("monthlyContent").innerHTML = this.monthlyContent();
    };
    root.getElementById("monthlyCsv").onclick = () => {
      const rows = [
        [
          "Saison",
          "Mois",
          "Sacs utilisés",
          "Sacs achetés",
          "Dépenses",
          "Coût utilisé",
          "Prix moyen",
          "Devise",
        ],
        ...this.data.summary.monthly[this.statsSeason]
          .filter((x) => !x.future)
          .map((x) => [
            this.statsSeason,
            x.month,
            x.used,
            x.purchased,
            x.spend,
            x.cost,
            x.average_price,
            this.data.currency,
          ]),
      ];
      this.download(
        "\ufeff" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n"),
        "pellet-tracker-mensuel.csv",
        "text/csv;charset=utf-8",
      );
    };
  }
  settingsForm() {
    const cfg = this.data.settings;
    const numbers = [
      ["low_stock", "Stock faible (sacs)", 0, 10000],
      ["low_autonomy_days", "Autonomie courte (jours, 0 = désactivé)", 0, 365],
      ["estimate_window", "Fenêtre de consommation (jours)", 7, 180],
      ["cleaning_bags", "Nettoyage après (sacs, 0 = désactivé)", 0, 10000],
      ["cleaning_days", "Nettoyage après (jours, 0 = désactivé)", 0, 365],
      ["repeat_days", "Rappeler après (jours, 0 = sans rappel)", 0, 365],
      ["notify_hour", "Heure des rappels quotidiens", 0, 23],
    ];
    const choices = {
      ...(this.data.notification_choices || {
        "": "Home Assistant uniquement",
      }),
    };
    if (!(cfg.notification_action in choices))
      choices[cfg.notification_action] =
        "Destination indisponible - en choisir une autre";
    return `<section id="settingsSection"><h2>Paramètres et notifications</h2><p class="muted">Les alertes regroupées apparaissent dans Home Assistant. Une destination supplémentaire peut être choisie parmi tes services de notification et tes scripts existants. Les scripts reçoivent title, message, kind et entry_id. Devise : ${escapeHTML(this.data.currency)} · début de saison : 1er ${this.seasonDates().label}.</p>${this.data.notification_error ? `<p class="error">Dernier échec de notification : ${escapeHTML(this.data.notification_error)}</p>` : ""}<p class="muted">Stock faible : stock inférieur ou égal au seuil. Nettoyage : seuil de sacs OU seuil de jours atteint, avec au moins un sac utilisé depuis le nettoyage. Un réapprovisionnement ne déclenche pas le compteur de nettoyage. Un seuil de jours à 0 le désactive.</p><form id="settingsForm"><label>Nom du poêle<input name="name" value="${escapeHTML(cfg.name)}" maxlength="80" required></label>${numbers.map(([key, label, min, max]) => `<label>${label}<input type="number" name="${key}" min="${min}" max="${max}" step="1" value="${cfg[key]}" required></label>`).join("")}<label class="wide">Destination supplémentaire<select name="notification_action">${Object.entries(
      choices,
    )
      .map(
        ([k, v]) =>
          `<option value="${escapeHTML(k)}" ${k === cfg.notification_action ? "selected" : ""}>${escapeHTML(v)}</option>`,
      )
      .join(
        "",
      )}</select></label><label class="check"><input name="notify_enabled" type="checkbox" ${cfg.notify_enabled ? "checked" : ""}>Notifications automatiques</label><label class="check"><input name="notify_recovery" type="checkbox" ${cfg.notify_recovery ? "checked" : ""}>Notifier aussi le retour à la normale</label><label class="check wide"><input name="notify_actions" type="checkbox" ${cfg.notify_actions !== false ? "checked" : ""}>Boutons sur les notifications Companion : nettoyage fait, +1 sac utilisé, rappel dans 24 h</label><div class="row wide"><button type="button" id="testNotification">Tester la notification enregistrée</button><span class="spacer"></span><button type="submit" class="primary">Enregistrer les paramètres</button></div></form><p class="muted">Nouvelle alerte après une saisie : immédiate. Rappels : à l’heure choisie, seulement après le délai configuré. Le choix d’une nouvelle destination s’applique après enregistrement des paramètres.</p></section>`;
  }
  bindSettings() {
    const form = this.shadowRoot.getElementById("settingsForm");
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (this.busy || !form.reportValidity()) return;
      const settings = Object.fromEntries(new FormData(form));
      for (const key of ["notify_enabled", "notify_recovery", "notify_actions"])
        settings[key] = form.elements[key].checked;
      await this.settingsRequest("pellet_tracker/settings", {
        settings,
        revision: this.data.settings.settings_revision || 0,
      });
    };
    this.shadowRoot.getElementById("testNotification").onclick = () =>
      this.settingsRequest("pellet_tracker/test_notification", {});
  }
  async settingsRequest(type, payload) {
    if (this.busy) return;
    this.busy = true;
    const controls = [
      ...this.shadowRoot.querySelectorAll("button,input,select,textarea"),
    ].map((el) => [el, el.disabled]);
    controls.forEach(([el]) => (el.disabled = true));
    try {
      const result = await this._hass.callWS({
        type,
        entry_id: this.entry,
        ...payload,
      });
      if (type === "pellet_tracker/settings") {
        this.data = result;
        this.settingsDraft = null;
        this.closeEditor(true);
        this.render();
        this.notice("Paramètres enregistrés.");
      } else this.notice("Notification de test envoyée.");
    } catch (e) {
      this.notice(e.message || String(e), true);
    } finally {
      controls.forEach(([el, disabled]) => (el.disabled = disabled));
      this.busy = false;
    }
  }
  download(content, filename, type) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  seasonFor(day) {
    const d = new Date(day + "T12:00:00");
    const month = this.data.season_month || 7;
    const y = d.getFullYear() - (d.getMonth() + 1 < month ? 1 : 0);
    return `${y}/${y + 1}`;
  }
  chart(points) {
    if (!points.length)
      return '<p class="muted">Aucun mouvement enregistré.</p>';
    const start = Date.parse(points[0].date),
      end = Date.parse(points.at(-1).date),
      max = Math.max(1, ...points.map((p) => p.stock));
    const xy = points
      .flatMap((p, i) => {
        const x =
          20 +
          ((Date.parse(p.date) - start) / Math.max(86400000, end - start)) *
            960;
        return [
          ...(i ? [`${x},${130 - (points[i - 1].stock / max) * 110}`] : []),
          `${x},${130 - (p.stock / max) * 110}`,
        ];
      })
      .join(" ");
    return `<svg viewBox="0 0 1000 150" role="img" aria-label="Stock de ${escapeHTML(points[0].date)} à ${escapeHTML(points.at(-1).date)}"><line x1="20" y1="130" x2="980" y2="130" stroke="currentColor" opacity=".2"/><polyline points="${xy}" fill="none" stroke="var(--primary-color,#03a9f4)" stroke-width="3"/><text x="20" y="148" fill="currentColor" font-size="12">${escapeHTML(points[0].date)}</text><text x="980" y="148" text-anchor="end" fill="currentColor" font-size="12">${escapeHTML(points.at(-1).date)}</text><text x="20" y="15" fill="currentColor" font-size="12">${max} sacs (max.)</text></svg>`;
  }
  async mutate(operation, payload) {
    if (this.busy) return;
    this.busy = true;
    const controls = [
      ...this.shadowRoot.querySelectorAll("button,input,select,textarea"),
    ].map((element) => [element, element.disabled]);
    controls.forEach(([element]) => (element.disabled = true));
    this.notice("Enregistrement…");
    try {
      this.data = await this._hass.callWS({
        type: "pellet_tracker/mutate",
        entry_id: this.entry,
        operation,
        payload,
        revision: this.data.revision,
      });
      this.editing = null;
      this.closeEditor(true);
      this.render();
      this.notice("Journal enregistré.");
    } catch (e) {
      this.notice(e.message || String(e), true);
    } finally {
      controls.forEach(([element, disabled]) => (element.disabled = disabled));
      this.busy = false;
    }
  }
}
customElements.define("pellet-tracker-panel", PelletTrackerPanel);
