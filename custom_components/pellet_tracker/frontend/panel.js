import { ENGLISH } from "./translations.js";

/* Pellet Tracker: local, dependency-free Home Assistant panel. */
const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
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
      </style><header><ha-menu-button></ha-menu-button><span>🔥</span><h1>${this.t("Suivi Granulés")}</h1><span class="badge">${this.t("Bêta 0.6")}</span><span class="spacer"></span><select id="journal" aria-label="${this.t("Poêle")}"></select></header><main><div id="notice" role="status"></div><div id="content">${this.t("Chargement…")}</div></main>`;
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
    if (this.started && this.view === "settings") this.updateStovePreview();
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
        this.shadowRoot.querySelector("#content").innerHTML = this.t(
          "Ajoute Pellet Tracker dans Paramètres → Appareils et services → Ajouter une intégration.",
        );
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
        "Journal changed. Refresh before saving.": this.t(
          "Le journal a changé. Actualise la page avant d’enregistrer.",
        ),
        "Quantity must be positive": this.t(
          "La quantité doit être supérieure à zéro.",
        ),
        "Future operations are not supported": this.t(
          "Choisis une date passée ou la date du jour.",
        ),
        "Operation not found": this.t(
          "Cette opération n’est plus disponible. Actualise le journal.",
        ),
        "Invalid number": this.t("Vérifie les nombres saisis."),
        "At most four decimal places": this.t(
          "Les nombres acceptent au maximum quatre décimales.",
        ),
      };
      Object.assign(translations, {
        "Only the latest entry can be undone": this.t(
          "Seule la dernière saisie peut être annulée immédiatement.",
        ),
        "Discount exceeds purchase total": this.t(
          "La remise dépasse le montant de l’achat.",
        ),
        "Heating end precedes first ignition": this.t(
          "La fin de chauffe précède le premier allumage.",
        ),
        "Heating end must belong to its accounting season": this.t(
          "La fin de chauffe doit appartenir à la saison choisie.",
        ),
        "Fees and discounts require a priced purchase": this.t(
          "Les frais et remises nécessitent un achat avec prix.",
        ),
        "Number outside supported range": this.t(
          "Le nombre est hors des limites autorisées.",
        ),
        "Number below minimum": this.t(
          "Le nombre est hors des limites autorisées.",
        ),
        "Unsupported language": this.t("Vérifiez les réglages saisis."),
        "Journal not found": this.t("Journal introuvable."),
      });
      message = shortage
        ? `${this.t("Stock insuffisant au ")}${shortage[1].split("-").reverse().join("/")}${this.t(". Vérifie la quantité et les mouvements précédents.")}`
        : translations[message] || this.t(message);
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
  get language() {
    return this.data?.settings?.language === "en" ? "en" : "fr";
  }
  get locale() {
    return this.language === "en" ? "en-GB" : "fr-FR";
  }
  t(text) {
    return this.language === "en" ? (ENGLISH[text] ?? text) : text;
  }
  get labels() {
    return {
      use: this.t("Sacs utilisés"),
      purchase: this.t("Réapprovisionnement"),
      clean: this.t("Nettoyage"),
      start: this.t("Premier allumage"),
      end: this.t("Fin de chauffe"),
      adjust: this.t("Correction de stock (+/-)"),
      loss: this.t("Perte de sacs"),
      note: "Note",
    };
  }
  number(n) {
    return n === null || n === undefined
      ? this.t("Non renseigné")
      : new Intl.NumberFormat(this.locale, { maximumFractionDigits: 2 }).format(
          n,
        );
  }
  money(n) {
    return n === null || n === undefined
      ? this.t("Non renseigné")
      : new Intl.NumberFormat(this.locale, {
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
      overview: this.t("Accueil"),
      stats: this.t("Statistiques"),
      seasons: this.t("Saisons"),
      journal: this.t("Historique"),
      dashboards: "Dashboards",
      settings: this.t("Réglages"),
    };
    this.view = views[this.view] ? this.view : "overview";
    const root = this.shadowRoot;
    root.querySelector("h1").textContent = this.t("Suivi Granulés");
    root.querySelector("header .badge").textContent = this.t("Bêta 0.6");
    root.querySelector("#journal").setAttribute("aria-label", this.t("Poêle"));
    root.host?.setAttribute("lang", this.language);
    let content;
    switch (this.view) {
      case "stats":
        content = this.statisticsView();
        break;
      case "seasons":
        content =
          `<div class="row subtabs"><button data-seasonpage="manage" ${this.seasonPage !== "report" ? 'aria-current="page"' : ""}>${this.t("Gestion des saisons")}</button><button data-seasonpage="report" ${this.seasonPage === "report" ? 'aria-current="page"' : ""}>${this.t("Bilan et budget")}</button></div>` +
          (this.seasonPage === "report"
            ? this.seasonReport()
            : this.seasonsView());
        break;
      case "journal":
        content =
          this.journalView() +
          `<details><summary>${this.t("Importer un historique")}</summary><section><h2>${this.t("Import de l’historique")}</h2><p class="muted">${this.t("Import JSON version 1, avec identifiants stables. Les identifiants déjà présents sont ignorés. L’import est validé entièrement avant enregistrement.")}</p><input id="file" type="file" accept="application/json,.json" aria-label="${this.t("Fichier historique JSON")}"><details><summary>${this.t("Coller un import JSON")}</summary><textarea id="json" aria-label="Import JSON" placeholder="${this.t("Coller le contenu JSON")}"></textarea><button id="previewJson">${this.t("Prévisualiser")}</button></details><div id="preview"></div><button id="import" disabled>${this.t("Importer les opérations")}</button></section></details>`;
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
      <nav aria-label="${this.t("Navigation du suivi")}" class="tabs">${Object.entries(
        views,
      )
        .map(
          ([key, label]) =>
            `<button data-view="${key}" ${key === this.view ? 'aria-current="page"' : ""}>${label}</button>`,
        )
        .join("")}</nav>
      <div class="page-heading row"><div><p class="eyebrow">${escapeHTML(d.name)} · ${escapeHTML(s.season)}</p><h2 id="viewTitle" tabindex="-1">${views[this.view]}</h2></div><span class="spacer"></span><button id="refresh" aria-label="${this.t("Actualiser les données")}">${this.t("↻ Actualiser")}</button></div>
      ${this.undoMarkup()}${content}<p class="muted footer">${this.t("Journal local · révision ")}${d.revision}${this.t(" · les prix manquants restent inconnus.")}</p>`;
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
        delete backup.stove_sources;
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
            this.t("Saison"),
            this.t("Opération"),
            this.t("Sacs"),
            this.t("Prix unitaire"),
            this.t("Livraison"),
            this.t("Remise"),
            this.t("Devise"),
            this.t("Fournisseur"),
            this.t("Marque"),
            this.t("Commentaire"),
            this.t("Annulée"),
          ],
          ...[...d.events]
            .sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order)
            .map((x) => [
              x.date,
              x.season || this.seasonFor(x.date),
              this.labels[x.kind],
              Number(x.quantity),
              x.unit_price === null ? "" : Number(x.unit_price),
              Number(x.shipping || 0),
              Number(x.discount || 0),
              d.currency,
              x.supplier,
              x.brand,
              x.comment,
              x.voided ? this.t("Oui") : this.t("Non"),
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
            throw Error(this.t("Format JSON non reconnu."));
          this.pendingImport = parsed;
          const known = new Set(d.events.map((e) => e.id));
          root.querySelector("#preview").textContent =
            `${parsed.events.length}${this.t(" opérations · ")}${parsed.events.filter((e) => !known.has(e.id)).length}${this.t(" nouvelles.")}`;
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
            throw Error(this.t("Fichier trop volumineux (10 Mo maximum)."));
          const parsed = JSON.parse(await f.text());
          if (parsed.schema_version !== 1 || !Array.isArray(parsed.events))
            throw Error(this.t("Format JSON non reconnu."));
          this.pendingImport = parsed;
          const known = new Set(d.events.map((e) => e.id));
          root.querySelector("#preview").textContent =
            `${parsed.events.length}${this.t(" opérations · ")}${parsed.events.filter((e) => !known.has(e.id)).length}${this.t(" nouvelles. Vérifie le fichier avant de confirmer.")}`;
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
      root.querySelector("#addMushroom").onclick = () =>
        this.openAddDashboard();
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
  buildDashboardConfig(config, viewIndex, sectionIndex, card) {
    if (!config || "strategy" in config || !Array.isArray(config.views))
      throw Error(
        this.t(
          "Ce dashboard est généré automatiquement. Choisissez un dashboard modifiable depuis l’interface.",
        ),
      );
    if (!Number.isInteger(viewIndex) || !config.views[viewIndex])
      throw Error(this.t("Vue introuvable."));
    const next = JSON.parse(JSON.stringify(config)),
      view = next.views[viewIndex];
    if ("strategy" in view)
      throw Error(this.t("Cette vue est générée automatiquement."));
    const incoming = JSON.parse(JSON.stringify(card));
    if (view.type === "sections") incoming.grid_options ||= { columns: "full" };
    const existing = [
      ...(view.cards || []),
      ...(view.sections || []).flatMap((section) => section.cards || []),
    ];
    if (
      existing.some((item) => JSON.stringify(item) === JSON.stringify(incoming))
    )
      throw Error(this.t("Cette carte est déjà présente dans cette vue."));
    if (view.type === "sections") {
      if (view.sections != null && !Array.isArray(view.sections))
        throw Error(this.t("Sections non reconnues."));
      view.sections ||= [];
      if (sectionIndex === "new")
        view.sections.push({ type: "grid", cards: [incoming] });
      else {
        const section =
          Number.isInteger(sectionIndex) && view.sections[sectionIndex];
        if (
          !section ||
          section.strategy ||
          (section.type && section.type !== "grid")
        )
          throw Error(this.t("Section non modifiable."));
        if (section.cards != null && !Array.isArray(section.cards))
          throw Error(this.t("Section non reconnue."));
        (section.cards ||= []).push(incoming);
      }
    } else {
      if (view.cards != null && !Array.isArray(view.cards))
        throw Error(this.t("Cartes non reconnues."));
      if ((view.type === "panel" || view.panel) && view.cards?.length)
        throw Error(
          this.t(
            "Une vue panneau contient une seule carte. Choisissez une autre vue.",
          ),
        );
      (view.cards ||= []).push(incoming);
    }
    return next;
  }
  async openAddDashboard() {
    if (this.busy) return;
    const card = JSON.parse(JSON.stringify(this.data.mushroom_card));
    const dialog = this.showEditor(
      this.t("Ajouter la carte Mushroom"),
      `<p>${this.t("Ajoutez la carte complète du poêle, avec son image et ses capteurs, dans le tableau de bord de votre choix.")}</p><form id="dashboardForm"><label class="wide">${this.t("Tableau de bord")}<select id="targetDashboard" required disabled><option>${this.t("Chargement…")}</option></select></label><label class="wide">${this.t("Vue")}<select id="targetView" required disabled></select></label><label class="wide" id="targetSectionLabel" hidden>Section<select id="targetSection"></select></label><p class="muted wide" id="destinationHelp" role="status"></p><div class="wide row"><button type="button" id="cancelDashboard">${this.t("Annuler")}</button><span class="spacer"></span><button class="primary" type="submit" id="installDashboard" disabled>${this.t("Ajouter la carte")}</button></div></form>`,
    );
    if (!dialog) return;
    const flow = { dialog, card, config: null, generation: 0 };
    dialog.querySelector("#cancelDashboard").onclick = () => this.closeEditor();
    dialog.querySelector("#targetDashboard").onchange = () =>
      this.loadDashboardTarget(flow);
    dialog.querySelector("#targetView").onchange = () =>
      this.updateDashboardSections(flow);
    dialog.querySelector("#dashboardForm").onsubmit = (event) => {
      event.preventDefault();
      this.installDashboardCard(flow);
    };
    try {
      const dashboards = await this._hass.callWS({
        type: "lovelace/dashboards/list",
      });
      if (!dialog.isConnected) return;
      const choices = [
        {
          url_path: "lovelace",
          title: this._hass.panels?.lovelace?.title || this.t("Aperçu"),
          mode: this._hass.panels?.lovelace?.config?.mode || "storage",
        },
        ...dashboards.filter((d) => d.url_path !== "lovelace"),
      ];
      const select = dialog.querySelector("#targetDashboard");
      select.innerHTML = choices
        .map(
          (d) =>
            `<option value="${escapeHTML(d.url_path)}" ${d.mode !== "storage" ? "disabled" : ""}>${escapeHTML(d.title)}${d.mode !== "storage" ? this.t(" · non modifiable") : ""}</option>`,
        )
        .join("");
      select.disabled = false;
      const first = choices.find((d) => d.mode === "storage");
      if (!first)
        throw Error(
          this.t(
            "Aucun dashboard modifiable disponible. Créez un tableau de bord dans Home Assistant.",
          ),
        );
      select.value = first.url_path;
      await this.loadDashboardTarget(flow);
    } catch (error) {
      if (dialog.isConnected) this.notice(error.message || String(error), true);
    }
  }
  async loadDashboardTarget(flow) {
    const dialog = flow.dialog,
      generation = ++flow.generation;
    flow.config = null;
    const viewSelect = dialog.querySelector("#targetView"),
      install = dialog.querySelector("#installDashboard");
    viewSelect.disabled = install.disabled = true;
    dialog.querySelector("#targetSectionLabel").hidden = true;
    dialog.querySelector("#destinationHelp").textContent = this.t(
      "Chargement des vues…",
    );
    const path = dialog.querySelector("#targetDashboard").value;
    try {
      const config = await this._hass.callWS({
        type: "lovelace/config",
        url_path: path === "lovelace" ? null : path,
        force: false,
      });
      if (!dialog.isConnected || generation !== flow.generation) return;
      if ("strategy" in config || !Array.isArray(config.views))
        throw Error(
          this.t(
            "Ce dashboard est généré automatiquement. Choisissez un dashboard modifiable depuis l’interface.",
          ),
        );
      flow.config = config;
      flow.path = path;
      flow.original = JSON.stringify(config);
      const editable = (v) =>
        !v.strategy && !((v.type === "panel" || v.panel) && v.cards?.length);
      viewSelect.innerHTML = config.views
        .map(
          (v, index) =>
            `<option value="${index}" ${editable(v) ? "" : "disabled"}>${escapeHTML(v.title || `${this.t("Vue")} ${index + 1}`)}${editable(v) ? "" : this.t(" · non modifiable")}</option>`,
        )
        .join("");
      const first = config.views.findIndex(editable);
      if (first === -1)
        throw Error(
          this.t(
            "Aucune vue modifiable dans ce dashboard. Ajoutez une vue manuelle ou choisissez un autre dashboard.",
          ),
        );
      viewSelect.value = String(first);
      viewSelect.disabled = false;
      this.updateDashboardSections(flow);
    } catch (error) {
      if (!dialog.isConnected || generation !== flow.generation) return;
      flow.config = null;
      viewSelect.innerHTML = "";
      dialog.querySelector("#destinationHelp").textContent =
        error.message || String(error);
    }
  }
  updateDashboardSections(flow) {
    const dialog = flow.dialog,
      view =
        flow.config?.views[Number(dialog.querySelector("#targetView").value)];
    const label = dialog.querySelector("#targetSectionLabel"),
      select = dialog.querySelector("#targetSection");
    label.hidden = view?.type !== "sections";
    if (view?.type === "sections")
      select.innerHTML = `<option value="new">${this.t("Nouvelle section")}</option>${(view.sections || []).map((section, index) => `<option value="${index}" ${section.strategy || (section.type && section.type !== "grid") ? "disabled" : ""}>${escapeHTML(section.title || `Section ${index + 1}`)}</option>`).join("")}`;
    dialog.querySelector("#installDashboard").disabled = !view;
    dialog.querySelector("#destinationHelp").textContent = this.t(
      "La carte entière sera ajoutée à la destination choisie. Mushroom doit être installé. Les autres cartes sont conservées.",
    );
  }
  async installDashboardCard(flow) {
    if (this.busy || !flow.config || !flow.dialog.isConnected) return;
    const dialog = flow.dialog,
      index = Number(dialog.querySelector("#targetView").value);
    const section = dialog.querySelector("#targetSection").value;
    const sectionIndex = section === "new" ? "new" : Number(section);
    this.busy = true;
    const controls = [
      ...this.shadowRoot.querySelectorAll("button,input,select,textarea"),
    ].map((el) => [el, el.disabled]);
    controls.forEach(([el]) => (el.disabled = true));
    this.notice(this.t("Ajout de la carte…"));
    try {
      const current = await this._hass.callWS({
        type: "lovelace/config",
        url_path: flow.path === "lovelace" ? null : flow.path,
        force: false,
      });
      if (JSON.stringify(current) !== flow.original) {
        await this.loadDashboardTarget(flow);
        throw Error(
          this.t(
            "Le dashboard a changé. Vérifiez à nouveau la vue et la section avant d’ajouter la carte.",
          ),
        );
      }
      const config = this.buildDashboardConfig(
        current,
        index,
        sectionIndex,
        flow.card,
      );
      await this._hass.callWS({
        type: "lovelace/config/save",
        url_path: flow.path === "lovelace" ? null : flow.path,
        config,
      });
      const view = config.views[index];
      this.dashboardAddedUrl = `/${flow.path}/${view.path || index}`;
      this.closeEditor(true);
      this.render();
      this.notice(this.t("Carte Mushroom ajoutée au dashboard."));
    } catch (error) {
      this.notice(
        error.message ||
          this.t(
            "Impossible de confirmer l’ajout. Vérifiez le dashboard avant de recommencer.",
          ),
        true,
      );
    } finally {
      controls.forEach(([el, disabled]) => {
        if (el.isConnected) el.disabled = disabled;
      });
      if (!flow.config && dialog.isConnected) {
        dialog.querySelector("#targetView").disabled = true;
        dialog.querySelector("#installDashboard").disabled = true;
      }
      this.busy = false;
    }
  }
  showEditor(title, content) {
    if (this.busy) return null;
    this.shadowRoot.querySelector("#editorDialog")?.remove();
    this.notice("");
    this.editorOpener = this.shadowRoot.activeElement;
    const dialog = document.createElement("dialog");
    dialog.id = "editorDialog";
    dialog.setAttribute("aria-labelledby", "editorTitle");
    dialog.innerHTML = `<div class="row dialog-heading"><h2 id="editorTitle">${escapeHTML(title)}</h2><span class="spacer"></span><button type="button" id="closeEditor" aria-label="${this.t("Fermer la fenêtre")}">✕</button></div><div id="dialogNotice" role="status"></div>${content}`;
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
    if (!force) this.notice("");
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
        ? this.t("Modifier une opération")
        : this.t("Ajouter une action"),
      `<p id="entryHelp" class="muted"></p><form id="operation">
      <label>${this.t("Opération")}<select name="kind">${Object.entries(
        this.labels,
      )
        .map(
          ([k, v]) =>
            `<option value="${k}" ${k === e.kind ? "selected" : ""}>${v}</option>`,
        )
        .join("")}</select></label>
      <label>Date<input name="date" type="date" value="${escapeHTML(e.date)}" max="${this.localDate()}" required></label>
      <label>${this.t("Quantité (sacs)")}<input name="quantity" type="number" step="0.0001" value="${escapeHTML(e.quantity)}" required></label>
      <label>${this.t("Prix unitaire")} (${escapeHTML(d.currency)}${this.t("/sac")})<input name="unit_price" type="number" min="0" step="0.0001" value="${escapeHTML(e.unit_price)}" placeholder="${this.t("Facultatif")}"></label>
      <label>${this.t("Livraison")} (${escapeHTML(d.currency)})<input name="shipping" type="number" min="0" step="0.0001" value="${escapeHTML(e.shipping || 0)}"></label><label>${this.t("Remise totale")} (${escapeHTML(d.currency)})<input name="discount" type="number" min="0" step="0.0001" value="${escapeHTML(e.discount || 0)}"></label>
      <label>${this.t("Fournisseur")}<input name="supplier" maxlength="200" value="${escapeHTML(e.supplier)}"></label><label>${this.t("Marque")}<input name="brand" maxlength="200" value="${escapeHTML(e.brand)}"></label>
      <label class="wide">${this.t("Commentaire")}<textarea name="comment" maxlength="2000">${escapeHTML(e.comment)}</textarea></label>
      ${this.editing ? "" : this.t('<label class="check wide"><input type="checkbox" name="cleaned">Enregistrer aussi un nettoyage</label>')}
      <div class="wide row"><span id="formTotal"></span><span class="spacer"></span><button type="button" id="cancel">${this.editing ? this.t("Annuler la modification") : this.t("Annuler")}</button><button class="primary" type="submit">${this.t("Enregistrer")}</button></div></form>`,
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
        use: this.t("Sacs versés au poêle : ils sont retirés du stock."),
        purchase: this.t(
          "Ajoutez les sacs reçus et leur prix unitaire pour suivre vos dépenses.",
        ),
        clean: this.t(
          "Enregistrez un nettoyage : le compteur d’entretien repart de zéro.",
        ),
        start: this.t(
          "Date du premier allumage de cette saison. Le stock reste identique.",
        ),
        end: this.t(
          "Dernier jour de chauffe : permet de calculer le bilan, sans modifier le stock.",
        ),
        adjust: this.t(
          "Correction positive ou négative du stock. Précisez la raison en commentaire.",
        ),
        loss: this.t(
          "Sacs abîmés ou perdus : ils sont retirés du stock, sans compter comme consommation.",
        ),
        note: this.t(
          "Une note dans l’historique, sans modifier les compteurs.",
        ),
      }[kind];
      root.querySelector("#formTotal").textContent =
        paid && form.elements.unit_price.value !== ""
          ? this.t("Montant : ") +
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
      this.t("Mes seuils d’alerte"),
      `<p>${this.t("Choisissez les valeurs qui correspondent à votre réserve et à l’entretien de votre poêle.")}</p><form id="thresholdForm"><label>${this.t("Alerte stock à partir de (sacs restants)")}<input name="low_stock" type="number" min="0" max="10000" step="1" value="${cfg.low_stock}" required></label><p class="muted">${this.t("L’alerte se déclenche à cette quantité ou en dessous.")}</p><label>${this.t("Nettoyage après (sacs utilisés)")}<input name="cleaning_bags" type="number" min="0" max="10000" step="1" value="${cfg.cleaning_bags}" required></label><label>${this.t("Nettoyage après (jours)")}<input name="cleaning_days" type="number" min="0" max="365" step="1" value="${cfg.cleaning_days}" required></label><p class="wide muted">${this.t("Le premier seuil d’entretien atteint déclenche l’alerte. Le critère en jours exige au moins un sac utilisé depuis le dernier nettoyage. Une valeur à 0 désactive le critère ; les deux à 0 désactivent le rappel d’entretien. Les réapprovisionnements ne comptent pas comme sacs utilisés.")}</p><div class="wide row"><button type="button" id="cancelThresholds">${this.t("Annuler")}</button><span class="spacer"></span><button class="primary" type="submit">${this.t("Enregistrer mes seuils")}</button></div></form>`,
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
      ? `<section class="row"><span>${this.t("Dernière saisie : ")}${last.after.length}${this.t(" opération(s).")}</span><span class="spacer"></span><button id="undoLast">${this.t("Annuler la dernière saisie")}</button></section>`
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
    return `<div class="row subtabs"><button data-stats="monthly">${this.t("← Statistiques mensuelles")}</button></div><section><h2>${this.t("Comparer les prix d’achat")}</h2><div class="row"><label>${this.t("Saison")}<select id="priceSeason"><option value="">${this.t("Toutes les saisons")}</option>${Object.keys(
      s.seasons,
    )
      .reverse()
      .map(
        (k) =>
          `<option ${this.priceSeason === k ? "selected" : ""}>${escapeHTML(k)}</option>`,
      )
      .join(
        "",
      )}</select></label><label>${this.t("Comparer par")}<select id="priceDimension"><option value="supplier" ${this.priceDimension === "supplier" ? "selected" : ""}>${this.t("Fournisseur")}</option><option value="brand" ${this.priceDimension === "brand" ? "selected" : ""}>${this.t("Marque")}</option></select></label></div><p class="muted">${this.t("Prix moyen pondéré par le nombre de sacs, livraison et remise incluses. Les achats sans prix restent inconnus. Les prix ne constituent pas une mesure de qualité ou de rendement.")}</p><div class="scroll"><table><thead><tr><th>${this.t("Saison")}</th><th>${this.t("Nom")}</th><th>${this.t("Sacs")}</th><th>${this.t("Dépenses")}</th><th>${this.t("Prix moyen / sac")}</th><th>Min / max</th><th>${this.t("Sacs sans prix")}</th></tr></thead><tbody>${rows.map((x) => `<tr><td>${escapeHTML(x.season)}</td><td>${escapeHTML(x.name)}</td><td>${this.number(x.quantity)}</td><td>${this.money(x.spend)}</td><td>${this.money(x.average_price)}</td><td>${this.money(x.min_price)} / ${this.money(x.max_price)}</td><td>${this.number(x.unknown_quantity)}</td></tr>`).join("") || this.t('<tr><td colspan="7">Aucun achat pour cette sélection.</td></tr>')}</tbody></table></div></section>`;
  }
  seasonReport() {
    const d = this.data,
      s = d.summary;
    this.reportSeason = s.seasons[this.reportSeason]
      ? this.reportSeason
      : s.season;
    const r = s.seasons[this.reportSeason];
    return `<section><h2>${this.t("Bilan de chauffe et budget")}</h2><label>${this.t("Saison du bilan")}<select id="reportSeason">${Object.keys(
      s.seasons,
    )
      .reverse()
      .map(
        (k) =>
          `<option ${this.reportSeason === k ? "selected" : ""}>${escapeHTML(k)}</option>`,
      )
      .join(
        "",
      )}</select></label><div class="grid"><div class="card"><div class="muted">${this.t("Premier allumage")}</div><div class="value">${this.formatDate(r.first_start)}</div></div><div class="card"><div class="muted">${this.t("Fin de chauffe")}</div><div class="value">${this.formatDate(r.last_end)}</div></div><div class="card"><div class="muted">${this.t("Durée de chauffe")}</div><div class="value">${r.heating_days == null ? this.t("À compléter") : r.heating_days + this.t(" jours")}</div></div><div class="card"><div class="muted">${this.t("Sacs sur la période de chauffe")}</div><div class="value">${this.number(r.heating_used)}</div></div></div><p>${this.t("Saison comptable : ")}${this.number(r.used)}${this.t(" sacs utilisés · dépenses ")}${this.money(r.spend)}${this.t(" · coût des sacs utilisés ")}${this.money(r.cost)}.</p><p class="muted">${r.heating_days == null ? this.t("Renseignez le premier allumage et la fin de chauffe pour calculer la durée et la consommation sur cette période.") : `${this.t("Moyenne sur la période : ")}${this.number(r.heating_daily_rate)}${this.t(" sacs/jour. ")}${this.number(r.outside_heating_used)}${this.t(" sacs enregistrés en dehors de cette période restent comptabilisés dans la saison.")}`}${this.t(" Les dates de chauffe ne ferment pas le journal et ne remettent jamais le stock à zéro.")}</p><form id="endForm"><label>${this.t("Dernier jour de chauffe")}<input name="date" type="date" required max="${this.localDate() < this.seasonDates(this.reportSeason).end ? this.localDate() : this.seasonDates(this.reportSeason).end}" min="${r.first_start || this.seasonDates(this.reportSeason).start}" value="${r.last_end || ""}"></label><div class="row"><button type="submit">${r.last_end ? this.t("Modifier la fin de chauffe") : this.t("Enregistrer la fin de chauffe")}</button><button id="reportExport" type="button">${this.t("Exporter le bilan JSON")}</button></div></form><hr><h2>${this.t("Budget facultatif · ")}${escapeHTML(this.reportSeason)}</h2><p>Budget : <strong>${this.money(r.budget)}</strong>${this.t(" · restant : ")}<strong>${this.money(r.budget_remaining)}</strong>${r.budget_percent == null ? "" : ` · ${this.number(r.budget_percent)}${this.t(" % utilisé")}`}.</p><form id="budgetForm"><label>Budget (${escapeHTML(d.currency)})<input name="budget" type="number" min="0" max="1000000" step="0.01" placeholder="${this.t("Laisser vide pour désactiver")}" value="${escapeHTML(d.settings.season_budgets?.[this.reportSeason] ?? "")}"></label><button type="submit">${this.t("Enregistrer le budget")}</button></form><p class="muted">${this.t("Aucun budget n’est requis. Une valeur vide le désactive pour cette saison. Le restant n’est pas calculé si les dépenses sont incomplètes. Un dépassement apparaît comme un restant négatif.")}</p></section>`;
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
      this.notice(this.t("Copié dans le presse-papiers."));
    } catch {
      this.notice(
        this.t("Sélectionnez le texte pour le copier manuellement."),
        true,
      );
    }
  }
  overviewView() {
    const s = this.data.summary,
      c = s.seasons[s.season];
    const metrics = [
      [this.t("Sacs utilisés"), `${this.number(c.used)}${this.t(" sacs")}`],
      [this.t("Dépenses de la saison"), this.money(c.spend)],
      [
        this.t("Autonomie estimée"),
        s.autonomy_days == null
          ? this.t("En apprentissage")
          : `${this.number(s.autonomy_days)}${this.t(" jours")}`,
      ],
      [
        this.t("Dernier nettoyage"),
        s.last_clean ? this.formatDate(s.last_clean) : this.t("À renseigner"),
      ],
    ];
    return `<section class="hero"><div><p class="eyebrow">${this.t("Votre réserve")}</p><div class="stock">${this.number(s.stock)} <small>${this.t("sacs disponibles")}</small></div><p>${s.stock <= this.data.settings.low_stock ? this.t("Le stock est bas. Pensez au prochain réapprovisionnement.") : this.t("Votre stock est à jour avec les dernières saisies.")}</p></div><div class="quick-actions"><button class="primary" data-kind="use">＋ ${this.t("Ajouter une action")}</button></div></section>
      <div class="grid">${metrics.map(([label, value]) => `<div class="card"><div class="muted">${label}</div><div class="value">${escapeHTML(value)}</div></div>`).join("")}</div>
      <p class="muted">${s.autonomy_days == null ? this.t("L’autonomie apparaîtra après au moins 7 jours de recul et 3 dates de consommation récentes.") : `${this.t("Estimation basée sur ")}${s.estimate_sample_days}${this.t(" dates de saisie, sur ")}${s.estimate_window}${this.t(" jours. ")}${s.estimate_status === "limited" ? this.t("Recul encore limité.") : ""}${this.t(" Elle ne prévoit pas la météo.")}`}</p>
      <section><div class="row"><h2>${this.t("Mes seuils d’alerte")}</h2><span class="spacer"></span><button id="editThresholds">${this.t("Modifier mes seuils")}</button></div><p>${this.t("Stock faible à ")}<strong>${this.number(this.data.settings.low_stock)}${this.t(" sacs ou moins")}</strong>.</p><p>${this.t("Entretien : ")}${this.cleaningRule()}.</p><p class="muted">${this.t("Vous choisissez vos seuils. Les badges et les notifications suivent automatiquement vos réglages.")}</p></section>
      <section><div class="row"><h2>${this.t("Dernières opérations")}</h2><span class="spacer"></span><button data-view="journal">${this.t("Tout l’historique →")}</button></div>${
        this.recentEvents()
          .slice(0, 3)
          .map(
            (x) =>
              `<div class="activity row"><span class="activity-icon">${x.kind === "purchase" ? "＋" : x.kind === "clean" ? "✓" : "•"}</span><div><strong>${escapeHTML(this.labels[x.kind])}</strong><div class="muted">${this.formatDate(x.date)}${x.comment ? " · " + escapeHTML(x.comment) : ""}</div></div><span class="spacer"></span><strong>${["use", "purchase", "adjust", "loss"].includes(x.kind) ? this.number(Number(x.quantity)) + this.t(" sacs") : ""}</strong></div>`,
          )
          .join("") ||
        this.t(
          '<p class="muted">Commencez par un réapprovisionnement ou une correction du stock initial.</p>',
        )
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
      label: new Intl.DateTimeFormat(this.locale, {
        month: "long",
        timeZone: "UTC",
      }).format(new Date(`${start}T12:00:00Z`)),
    };
  }
  seasonsView() {
    const s = this.data.summary,
      c = s.seasons[s.season],
      dates = this.seasonDates();
    return `<section class="hero"><div><p class="eyebrow">${this.t("Saison en cours · automatique")}</p><h2>${escapeHTML(s.season)}</h2><p>${this.t("Du ")}${this.formatDate(dates.start)}${this.t(" au ")}${this.formatDate(dates.end)}</p><p>${this.t("La prochaine saison commencera automatiquement le ")}<strong>${this.formatDate(dates.next)}</strong>.</p></div><span class="badge">${this.t("Aucune création manuelle nécessaire")}</span></section>
      <div class="two-columns"><section><h2>${this.t("Comment se passe la bascule ?")}</h2><p>${this.t("Une saison commence le 1er ")}${dates.label}${this.t(". Chaque opération est rattachée à la saison de sa date, même si elle est saisie plus tard.")}</p><p>${this.t("Le stock restant est conservé. Les compteurs de la nouvelle saison démarrent à zéro et l’historique reste disponible.")}</p></section><section><h2>${this.t("Premier allumage")}</h2><div class="value">${this.formatDate(c.first_start)}</div><p class="muted">${this.t("Le début de chauffe est distinct du début comptable de la saison. Cette date ne consomme aucun sac.")}</p><button id="firstStart">${c.first_start ? this.t("Modifier cette date") : this.t("Enregistrer le premier allumage")}</button></section></div>
      <h2 class="section-title">${this.t("Vos saisons")}</h2><div class="season-grid">${Object.entries(
        s.seasons,
      )
        .reverse()
        .map(
          ([season, x]) =>
            `<section><div class="row"><h2>${escapeHTML(season)}</h2>${season === s.season ? this.t('<span class="badge">En cours</span>') : ""}</div><div class="value">${this.number(x.used)} <small>${this.t("sacs utilisés")}</small></div><p>${this.t("Dépenses")} : <strong>${this.money(x.spend)}</strong><br>${this.t("Prix moyen d’achat : ")}${this.money(x.average_price)}</p><p class="muted">${this.t("Premier allumage")} : ${this.formatDate(x.first_start)}</p><button data-season="${escapeHTML(season)}">${this.t("Voir les statistiques →")}</button></section>`,
        )
        .join("")}</div>`;
  }
  statisticsView() {
    const s = this.data.summary;
    this.statsTab ||= "monthly";
    if (this.statsTab === "prices") return this.priceComparison();
    return `<div class="row subtabs" aria-label="${this.t("Type de statistiques")}">${[
      ["monthly", this.t("Par mois")],
      ["compare", this.t("Comparer les saisons")],
      ["stock", this.t("Évolution du stock")],
      ["prices", this.t("Fournisseurs et marques")],
    ]
      .map(
        ([key, label]) =>
          `<button data-stats="${key}" ${this.statsTab === key ? 'aria-current="page"' : ""}>${label}</button>`,
      )
      .join("")}</div>${
      this.statsTab === "monthly"
        ? this.monthlyStats()
        : this.statsTab === "compare"
          ? `<label class="comparison-mode">${this.t("Période")}<select id="compareMode"><option value="date" ${this.compareMode !== "full" ? "selected" : ""}>${this.t("Même date de chaque saison")}</option><option value="full" ${this.compareMode === "full" ? "selected" : ""}>${this.t("Saisons entières (saison actuelle en cours)")}</option></select></label>${
              this.compareMode === "full"
                ? `<section><h2>${this.t("Comparaison des saisons")}</h2><p class="muted">${this.t("La saison ")}${escapeHTML(s.season)}${this.t(" est en cours. Les autres lignes représentent les données enregistrées, sans présumer qu’une saison est complète. Prix moyen pondéré sur les achats dont le prix est connu.")}</p><div class="scroll"><table><thead><tr><th>${this.t("Saison")}</th><th>${this.t("Premier allumage")}</th><th>${this.t("Sacs utilisés")}</th><th>${this.t("Sacs achetés")}</th><th>${this.t("Nettoyages")}</th><th>${this.t("Dépenses")}</th><th>${this.t("Coût utilisé FIFO")}</th><th>${this.t("Prix moyen")}</th><th>Min / max</th></tr></thead><tbody>${Object.entries(
                    s.seasons,
                  )
                    .reverse()
                    .map(
                      ([season, x]) =>
                        `<tr><td>${escapeHTML(season)}</td><td>${escapeHTML(x.first_start || "—")}</td><td>${this.number(x.used)}</td><td>${this.number(x.purchased)}</td><td>${x.cleanings}</td><td>${this.money(x.spend)}${x.purchase_unpriced ? `<br><span class="muted">${this.number(x.purchase_unpriced)}${this.t(" sacs sans prix")}</span>` : ""}</td><td>${this.money(x.cost)}${x.use_unpriced ? `<br><span class="muted">${this.number(x.use_unpriced)}${this.t(" sacs sans prix")}</span>` : ""}</td><td>${this.money(x.average_price)}</td><td>${this.money(x.min_price)} / ${this.money(x.max_price)}</td></tr>`,
                    )
                    .join("")}</tbody></table></div></section>`
                : this.sameDateStats()
            }`
          : `<section><h2>${this.t("Évolution du stock")}</h2><p class="muted">${this.t("Historique disponible depuis le premier inventaire enregistré. Les passages entre saisons conservent le stock.")}</p>${this.chart(this.data.summary.stock_history)}</section>`
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
            .toLocaleLowerCase(this.language)
            .includes(this.journalSearch.toLocaleLowerCase(this.language)),
      )
      .sort((a, b) => b.date.localeCompare(a.date) || b.order - a.order);
    const pages = Math.max(1, Math.ceil(events.length / 25));
    this.journalPage = Math.min(this.journalPage || 0, pages - 1);
    return `<section><div class="row filters"><label>${this.t("Saison")}<select id="filter"><option value="">${this.t("Toutes les saisons")}</option>${Object.keys(
      s.seasons,
    )
      .reverse()
      .map(
        (k) =>
          `<option ${k === this.journalSeason ? "selected" : ""}>${escapeHTML(k)}</option>`,
      )
      .join(
        "",
      )}</select></label><label>${this.t("Opération")}<select id="kindFilter"><option value="">${this.t("Toutes les opérations")}</option>${Object.entries(
      this.labels,
    )
      .map(
        ([key, label]) =>
          `<option value="${key}" ${key === this.journalKind ? "selected" : ""}>${label}</option>`,
      )
      .join(
        "",
      )}</select></label><label>${this.t("Rechercher")}<input id="search" placeholder="${this.t("Date, commentaire, fournisseur…")}" value="${escapeHTML(this.journalSearch)}"></label><label class="check"><input type="checkbox" id="showVoided" ${this.showVoided ? "checked" : ""}>${this.t("Inclure les annulations")}</label></div>
      <p class="muted">${events.length}${this.t(" opérations · 25 par page")}</p><div class="scroll"><table><thead><tr><th>Date</th><th>${this.t("Opération")}</th><th>${this.t("Sacs")}</th><th>${this.t("Prix / sac")}</th><th>${this.t("Commentaire")}</th><th>Actions</th></tr></thead><tbody>${
        events
          .slice(this.journalPage * 25, (this.journalPage + 1) * 25)
          .map(
            (x) =>
              `<tr class="${x.voided ? "voided" : ""}"><td>${this.formatDate(x.date)}</td><td>${escapeHTML(this.labels[x.kind])}</td><td>${["use", "purchase", "adjust", "loss"].includes(x.kind) ? this.number(Number(x.quantity)) : "—"}</td><td>${x.unit_price == null ? "—" : this.money(Number(x.unit_price))}</td><td class="comment">${escapeHTML(x.comment)}</td><td>${x.voided ? `<button data-restore="${escapeHTML(x.id)}">${this.t("Rétablir")}</button>` : `<button data-edit="${escapeHTML(x.id)}">${this.t("Modifier")}</button> <button data-void="${escapeHTML(x.id)}">${this.t("Annuler")}</button>`}</td></tr>`,
          )
          .join("") ||
        this.t(
          '<tr><td colspan="6">Aucune opération pour ces filtres.</td></tr>',
        )
      }</tbody></table></div><div class="row pagination"><button id="previous" ${this.journalPage === 0 ? "disabled" : ""}>${this.t("← Précédent")}</button><span>Page ${this.journalPage + 1} / ${pages}</span><button id="next" ${this.journalPage + 1 === pages ? "disabled" : ""}>${this.t("Suivant →")}</button><span class="spacer"></span><button id="export">${this.t("Sauvegarde JSON")}</button><button id="csv">Export CSV</button></div></section>
      <details><summary>${this.t("Traçabilité des dernières modifications")}</summary><div class="scroll"><table><thead><tr><th>Date</th><th>${this.t("Révision")}</th><th>Action</th></tr></thead><tbody>${[
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
              this.t(
                "Annuler cette opération et recalculer le journal ? Elle restera dans l’audit.",
              ),
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
      ["stock", this.t("Stock restant")],
      ["used", this.t("Sacs utilisés")],
      ["spend", this.t("Dépenses de la saison")],
      ["autonomy_days", this.t("Autonomie estimée")],
      ["last_clean", this.t("Dernier nettoyage")],
      ["average_price", this.t("Prix moyen du sac")],
    ]
      .filter(([key]) => entity(key))
      .map(
        ([key, name]) =>
          `      - type: tile\n        entity: ${quote(entity(key))}\n        name: ${quote(name)}`,
      )
      .join("\n");
    const actions = [
      ["add_bag", this.t("Ajouter un sac"), "mdi:fire"],
      ["clean", this.t("Noter un nettoyage"), "mdi:broom"],
    ]
      .filter(([key]) => entity(key))
      .map(
        ([key, name, icon]) =>
          `      - type: button\n        name: ${quote(name)}\n        icon: ${icon}\n        tap_action:\n          action: perform-action\n          perform_action: button.press\n          target:\n            entity_id: ${quote(entity(key))}\n          confirmation:\n            text: ${quote(key === "add_bag" ? this.t("Ajouter un sac à la consommation d’aujourd’hui ?") : this.t("Enregistrer un nettoyage pour aujourd’hui ?"))}`,
      )
      .join("\n");
    if (!tiles)
      return this.t(
        "# Aucun capteur disponible. Vérifiez que l’intégration est chargée.",
      );
    return `type: vertical-stack\ncards:\n  - type: markdown\n    content: ${quote("## 🔥 " + this.data.name)}\n  - type: grid\n    columns: 2\n    square: false\n    cards:\n${tiles}${actions ? `\n  - type: grid\n    columns: 2\n    square: false\n    cards:\n${actions}` : ""}\n`;
  }
  cleaningRule() {
    const cfg = this.data.settings,
      rules = [];
    if (cfg.cleaning_bags)
      rules.push(`${cfg.cleaning_bags}${this.t(" sacs utilisés")}`);
    if (cfg.cleaning_days)
      rules.push(
        `${cfg.cleaning_days}${this.t(" jours avec consommation depuis le dernier nettoyage")}`,
      );
    return rules.length
      ? `${this.t("alerte après ")}${rules.join(this.t(" ou "))}`
      : this.t("rappel désactivé");
  }
  dashboardsView() {
    const entities = this.data.entities || [];
    return `<section><h2>${this.t("Carte Mushroom")}</h2><p>${this.t("Le visuel de poêle fourni avec l’intégration, le stock, l’autonomie, les dépenses, le nettoyage et les actions avec confirmation. Nécessite Mushroom installé depuis HACS.")}</p><div class="row"><button id="addMushroom" class="primary">${this.t("Ajouter à un dashboard")}</button><button id="copyMushroom">${this.t("Copier la carte Mushroom")}</button>${this.dashboardAddedUrl ? `<a href="${escapeHTML(this.dashboardAddedUrl)}">${this.t("Ouvrir le dashboard →")}</a>` : ""}</div><p class="muted">${this.t("Collez ce contenu dans une carte Manuelle. Le format JSON fourni est également du YAML valide. Stock OK : plus de ")}${this.data.settings.low_stock}${this.t(" sacs")}. ${this.t("Entretien : ")}${this.cleaningRule()}${this.t(". Les seuils se règlent dans Réglages.")}</p><details><summary>${this.t("Afficher la configuration Mushroom")}</summary><textarea class="code" readonly aria-label="${this.t("Carte Mushroom YAML")}">${escapeHTML(JSON.stringify(this.data.mushroom_card, null, 2))}</textarea></details></section><section><h2>${this.t("Votre suivi dans vos tableaux de bord")}</h2><p>${this.t("Les données sont disponibles sous forme d’entités Home Assistant : capteurs, alertes et boutons. Vous pouvez les utiliser dans vos cartes et automatisations, indépendamment de cette interface.")}</p><div class="row"><span class="badge">${entities.length}${this.t(" entités pour ce poêle")}</span><span class="badge">${this.t("Cartes natives · aucune carte supplémentaire à installer")}</span></div></section>
      <section><div class="row"><h2>${this.t("Carte prête à ajouter")}</h2><span class="spacer"></span><button id="copyCard" class="primary">${this.t("Copier la carte YAML")}</button></div><ol><li>${this.t("Ouvrez votre dashboard et choisissez « Modifier le tableau de bord ».")}</li><li>${this.t("Ajoutez une carte « Manuelle ».")}</li><li>${this.t("Collez ce YAML et enregistrez.")}</li></ol><p class="muted">${this.t("La carte inclut le stock, la consommation, les dépenses, l’autonomie, le nettoyage et le prix moyen. Les boutons demandent confirmation avant d’enregistrer une opération.")}</p><details><summary>${this.t("Afficher le YAML")}</summary><textarea class="code" readonly aria-label="${this.t("Carte dashboard YAML")}">${escapeHTML(this.dashboardYaml())}</textarea></details></section>
      ${[
        ["sensor", this.t("Capteurs")],
        ["binary_sensor", this.t("Alertes")],
        ["button", this.t("Boutons d’action")],
      ]
        .map(
          ([domain, title]) =>
            `<section><h2>${title}</h2><div class="entity-list">${
              entities
                .filter((x) => x.entity_id.startsWith(domain + "."))
                .map(
                  (x) =>
                    `<div class="entity row"><div><strong>${escapeHTML(x.name)}</strong><div class="muted"><code>${escapeHTML(x.entity_id)}</code>${x.available ? "" : this.t(" · indisponible")}</div></div><span class="spacer"></span><button data-info="${escapeHTML(x.entity_id)}">${this.t("Détails")}</button><button data-copy="${escapeHTML(x.entity_id)}" aria-label="${this.t("Copier ")}${escapeHTML(x.entity_id)}">${this.t("Copier l’identifiant")}</button></div>`,
                )
                .join("") ||
              this.t('<p class="muted">Aucune entité de ce type.</p>')
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
    return `<section id="stats"><div class="row"><h2>${this.t("Statistiques mensuelles")}</h2><span class="spacer"></span><label>${this.t("Saison des graphiques")}<select id="statsSeason">${Object.keys(
      s.seasons,
    )
      .reverse()
      .map(
        (k) =>
          `<option ${k === this.statsSeason ? "selected" : ""}>${escapeHTML(k)}</option>`,
      )
      .join(
        "",
      )}</select></label><label>${this.t("Mesure")}<select id="statsMetric">${[
      ["quantity", this.t("Quantités de sacs")],
      ["cost", this.t("Coûts")],
      ["price", this.t("Prix d’achat par sac")],
    ]
      .map(
        ([k, v]) =>
          `<option value="${k}" ${k === this.statsMetric ? "selected" : ""}>${v}</option>`,
      )
      .join(
        "",
      )}</select></label><button id="monthlyCsv">${this.t("Export mensuel CSV")}</button></div><div id="monthlyContent">${this.monthlyContent()}</div></section>
`;
  }
  sameDateStats() {
    const s = this.data.summary;
    return `<section><h2>${this.t("Comparaison à date équivalente")}</h2><p class="muted">${this.t("Cumul de chaque saison arrêté au même jour et au même mois. Le 29 février est comparé au 28 février pour les années non bissextiles. Les valeurs proviennent des opérations enregistrées.")}</p><p>${this.t("Évolution des sacs utilisés par rapport à la saison précédente : ")}<strong>${s.usage_change_percent == null ? this.t("Non calculable") : `${s.usage_change_percent > 0 ? "+" : ""}${this.number(s.usage_change_percent)} %`}</strong></p><div class="scroll"><table><thead><tr><th>${this.t("Saison")}</th><th>${this.t("Arrêté au")}</th><th>${this.t("Sacs utilisés")}</th><th>${this.t("Sacs achetés")}</th><th>${this.t("Dépenses")}</th><th>${this.t("Coût des sacs utilisés")}</th><th>${this.t("Prix moyen")}</th></tr></thead><tbody>${[
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
            ["used", this.t("Sacs utilisés"), "#29b6f6"],
            ["purchased", this.t("Sacs achetés"), "#ffa726"],
          ]
        : this.statsMetric === "cost"
          ? [
              ["cost", this.t("Coût utilisé"), "#29b6f6"],
              ["spend", this.t("Dépenses"), "#ffa726"],
            ]
          : [["average_price", this.t("Prix moyen pondéré"), "#ffa726"]];
    const money = this.statsMetric !== "quantity";
    const max = Math.max(
      1,
      ...rows.flatMap((x) =>
        series.map(([key]) => (x.future ? 0 : x[key] || 0)),
      ),
    );
    const months = [
      this.t("janv."),
      this.t("févr."),
      this.t("mars"),
      this.t("avr."),
      this.t("mai"),
      this.t("juin"),
      this.t("juil."),
      this.t("août"),
      this.t("sept."),
      this.t("oct."),
      this.t("nov."),
      this.t("déc."),
    ];
    return `<div class="chart-large"><svg viewBox="0 0 1000 230" role="img" aria-label="${this.t("Graphique mensuel ")}${escapeHTML(this.statsSeason)}"><line x1="35" y1="190" x2="990" y2="190" stroke="currentColor" opacity=".25"/>${rows
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
              : `<rect x="${px}" y="${190 - height}" width="${width}" height="${height}" rx="2" fill="${color}"><title>${escapeHTML(x.month + " · " + label + " : " + (money ? this.money(val) : this.number(val) + this.t(" sacs")))}</title></rect>`;
          })
          .join(
            "",
          )}<text x="${center}" y="212" fill="currentColor" text-anchor="middle" font-size="12">${months[Number(x.month.slice(5)) - 1]}</text>`;
      })
      .join(
        "",
      )}<text x="35" y="18" fill="currentColor" font-size="12">${this.t("Maximum : ")}${escapeHTML(money ? this.money(max) : this.number(max) + this.t(" sacs"))}</text></svg></div><p class="muted">${series.map(([, label, color]) => `<span style="color:${color}">● ${label}</span>`).join(" · ")}${this.t(" · ? = non renseigné · · = mois à venir. Les zéros représentent l’absence d’opération enregistrée.")}</p><details><summary>${this.t("Valeurs mensuelles")}</summary><div class="scroll"><table><thead><tr><th>${this.t("Mois")}</th><th>${this.t("Utilisés")}</th><th>${this.t("Achetés")}</th><th>${this.t("Dépenses")}</th><th>${this.t("Coût utilisé")}</th><th>${this.t("Prix moyen / sac")}</th></tr></thead><tbody>${rows.map((x) => `<tr><td>${escapeHTML(x.month)}</td>${x.future ? this.t('<td colspan="5">À venir</td>') : `<td>${this.number(x.used)}</td><td>${this.number(x.purchased)}</td><td>${this.money(x.spend)}</td><td>${this.money(x.cost)}</td><td>${this.money(x.average_price)}</td>`}</tr>`).join("")}</tbody></table></div></details>`;
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
          this.t("Saison"),
          this.t("Mois"),
          this.t("Sacs utilisés"),
          this.t("Sacs achetés"),
          this.t("Dépenses"),
          this.t("Coût utilisé"),
          this.t("Prix moyen"),
          this.t("Devise"),
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
    const sources = {
      "": this.t("Pas de poêle connecté"),
      ...(this.data.stove_sources || {}),
    };
    if (cfg.stove_entity && !sources[cfg.stove_entity])
      sources[cfg.stove_entity] = cfg.stove_entity + this.t(" · indisponible");
    const numbers = [
      ["low_stock", this.t("Stock faible (sacs)"), 0, 10000],
      [
        "low_autonomy_days",
        this.t("Autonomie courte (jours, 0 = désactivé)"),
        0,
        365,
      ],
      ["estimate_window", this.t("Fenêtre de consommation (jours)"), 7, 180],
      [
        "cleaning_bags",
        this.t("Nettoyage après (sacs, 0 = désactivé)"),
        0,
        10000,
      ],
      [
        "cleaning_days",
        this.t("Nettoyage après (jours, 0 = désactivé)"),
        0,
        365,
      ],
      [
        "repeat_days",
        this.t("Rappeler après (jours, 0 = sans rappel)"),
        0,
        365,
      ],
      ["notify_hour", this.t("Heure des rappels quotidiens"), 0, 23],
    ];
    const choices = {
      ...(this.data.notification_choices || {
        "": this.t("Home Assistant uniquement"),
      }),
    };
    if ("" in choices) choices[""] = this.t("Home Assistant uniquement");
    if (!(cfg.notification_action in choices))
      choices[cfg.notification_action] = this.t(
        "Destination indisponible - en choisir une autre",
      );
    return `<section id="settingsSection"><h2>${this.t("Paramètres et notifications")}</h2><p class="muted">${this.t("Les alertes regroupées apparaissent dans Home Assistant. Une destination supplémentaire peut être choisie parmi tes services de notification et tes scripts existants. Les scripts reçoivent title, message, kind et entry_id. Devise : ")}${escapeHTML(this.data.currency)}${this.t(" · début de saison : 1er ")}${this.seasonDates().label}.</p>${this.data.notification_error ? `<p class="error">${this.t("Dernier échec de notification : ")}${escapeHTML(this.data.notification_error)}</p>` : ""}<p class="muted">${this.t("Stock faible : stock inférieur ou égal au seuil. Nettoyage : seuil de sacs OU seuil de jours atteint, avec au moins un sac utilisé depuis le nettoyage. Un réapprovisionnement ne déclenche pas le compteur de nettoyage. Un seuil de jours à 0 le désactive.")}</p><form id="settingsForm"><label>${this.t("Langue du suivi")}<select name="language"><option value="fr" ${cfg.language !== "en" ? "selected" : ""}>Français</option><option value="en" ${cfg.language === "en" ? "selected" : ""}>English</option></select></label><p class="wide muted">${this.t("La langue s’applique après enregistrement. Les cartes déjà ajoutées restent dans leur langue d’origine ; remplacez-les pour changer leur langue.")}</p><label>${this.t("Nom du poêle")}<input name="name" value="${escapeHTML(cfg.name)}" maxlength="80" required></label>${numbers.map(([key, label, min, max]) => `<label>${label}<input type="number" name="${key}" min="${min}" max="${max}" step="1" value="${cfg[key]}" required></label>`).join("")}<h2 class="wide">${this.t("Poêle connecté · facultatif")}</h2><p class="wide muted">${this.t("Choisissez une entité qui indique la chauffe réelle. Pour une entité climate, l’attribut hvac_action peut fournir heating/idle s’il est exposé ; le mode heat ne signifie pas forcément que le poêle chauffe. Sans association, l’image reste sans flamme et l’état est « non renseigné ». Les états absents ou non reconnus restent inconnus.")}</p><label class="wide">${this.t("Entité d’état du poêle")}<select name="stove_entity">${Object.entries(
      sources,
    )
      .map(
        ([key, name]) =>
          `<option value="${escapeHTML(key)}" ${key === (cfg.stove_entity || "") ? "selected" : ""}>${escapeHTML(name)}</option>`,
      )
      .join(
        "",
      )}</select></label><label>${this.t("Attribut à lire (facultatif)")}<input name="stove_attribute" maxlength="80" placeholder="${this.t("Ex. hvac_action ; vide = état de l’entité")}" value="${escapeHTML(cfg.stove_attribute || "")}"></label><label>${this.t("États correspondant à allumé")}<input name="stove_on_states" value="${escapeHTML(cfg.stove_on_states || "on,heating")}" required></label><label>${this.t("États correspondant à éteint")}<input name="stove_off_states" value="${escapeHTML(cfg.stove_off_states || "off,idle")}" required></label><p class="wide muted">${this.t("Plusieurs valeurs possibles, séparées par des virgules. Les valeurs sont exactes et sensibles à la casse. La carte suit ensuite les changements automatiquement.")}</p><p class="wide muted" id="stoveObserved" role="status"></p><label class="wide">${this.t("Destination supplémentaire")}<select name="notification_action">${Object.entries(
      choices,
    )
      .map(
        ([k, v]) =>
          `<option value="${escapeHTML(k)}" ${k === cfg.notification_action ? "selected" : ""}>${escapeHTML(v)}</option>`,
      )
      .join(
        "",
      )}</select></label><label class="check"><input name="notify_enabled" type="checkbox" ${cfg.notify_enabled ? "checked" : ""}>${this.t("Notifications automatiques")}</label><label class="check"><input name="notify_recovery" type="checkbox" ${cfg.notify_recovery ? "checked" : ""}>${this.t("Notifier aussi le retour à la normale")}</label><label class="check wide"><input name="notify_actions" type="checkbox" ${cfg.notify_actions !== false ? "checked" : ""}>${this.t("Boutons sur les notifications Companion : nettoyage fait, +1 sac utilisé, rappel dans 24 h")}</label><div class="row wide"><button type="button" id="testNotification">${this.t("Tester la notification enregistrée")}</button><span class="spacer"></span><button type="submit" class="primary">${this.t("Enregistrer les paramètres")}</button></div></form><p class="muted">${this.t("Nouvelle alerte après une saisie : immédiate. Rappels : à l’heure choisie, seulement après le délai configuré. Le choix d’une nouvelle destination s’applique après enregistrement des paramètres.")}</p></section>`;
  }
  updateStovePreview() {
    const form = this.shadowRoot.querySelector("#settingsForm"),
      preview = this.shadowRoot.querySelector("#stoveObserved");
    if (!form || !preview) return;
    const source = form.elements.stove_entity.value,
      attribute = form.elements.stove_attribute.value.trim();
    if (!source) {
      preview.textContent = this.t(
        "Aucune association : état du poêle non renseigné.",
      );
      return;
    }
    const state = this._hass.states[source];
    if (!state || ["unknown", "unavailable"].includes(state.state)) {
      preview.textContent = this.t(
        "L’entité sélectionnée ne fournit pas d’état actuellement.",
      );
      return;
    }
    const value = attribute ? state.attributes?.[attribute] : state.state;
    preview.textContent =
      value == null
        ? this.t("L’attribut choisi n’est pas disponible sur cette entité.")
        : `${this.t("Valeur actuellement lue : ")}${String(value)}${this.t(". À comparer aux états allumé/éteint ci-dessus.")}`;
  }
  bindSettings() {
    const form = this.shadowRoot.getElementById("settingsForm");
    form.elements.stove_entity.onchange = () => this.updateStovePreview();
    form.elements.stove_attribute.oninput = () => this.updateStovePreview();
    this.updateStovePreview();
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
        this.notice(this.t("Paramètres enregistrés."));
      } else this.notice(this.t("Notification de test envoyée."));
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
      return this.t('<p class="muted">Aucun mouvement enregistré.</p>');
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
    return `<svg viewBox="0 0 1000 150" role="img" aria-label="${this.t("Stock de ")}${escapeHTML(points[0].date)}${this.t(" à ")}${escapeHTML(points.at(-1).date)}"><line x1="20" y1="130" x2="980" y2="130" stroke="currentColor" opacity=".2"/><polyline points="${xy}" fill="none" stroke="var(--primary-color,#03a9f4)" stroke-width="3"/><text x="20" y="148" fill="currentColor" font-size="12">${escapeHTML(points[0].date)}</text><text x="980" y="148" text-anchor="end" fill="currentColor" font-size="12">${escapeHTML(points.at(-1).date)}</text><text x="20" y="15" fill="currentColor" font-size="12">${max}${this.t(" sacs (max.)")}</text></svg>`;
  }
  async mutate(operation, payload) {
    if (this.busy) return;
    this.busy = true;
    const controls = [
      ...this.shadowRoot.querySelectorAll("button,input,select,textarea"),
    ].map((element) => [element, element.disabled]);
    controls.forEach(([element]) => (element.disabled = true));
    this.notice(this.t("Enregistrement…"));
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
      this.notice(this.t("Journal enregistré."));
    } catch (e) {
      this.notice(e.message || String(e), true);
    } finally {
      controls.forEach(([element, disabled]) => (element.disabled = disabled));
      this.busy = false;
    }
  }
}
customElements.define("pellet-tracker-panel", PelletTrackerPanel);
