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
      </style><header><ha-menu-button></ha-menu-button><span>🔥</span><h1>Suivi Granulés</h1><span class="badge">Bêta 0.2</span><span class="spacer"></span><select id="journal" aria-label="Poêle"></select></header><main><div id="notice" role="status"></div><div id="content">Chargement…</div></main>`;
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
  render() {
    const d = this.data,
      s = d.summary,
      c = s.seasons[s.season],
      e = this.editing || {
        date: this.localDate(),
        kind: "use",
        quantity: 1,
        comment: "",
        supplier: "",
        brand: "",
        unit_price: "",
      };
    const cards = [
      ["Stock restant", `${this.number(s.stock)} sacs`],
      ["Utilisés · " + s.season, `${this.number(c.used)} sacs`],
      ["Dépenses · " + s.season, this.money(c.spend)],
      ["Coût des sacs utilisés", this.money(c.cost)],
      [
        "Dernier nettoyage",
        s.last_clean
          ? s.last_clean.split("-").reverse().join("/")
          : "Non renseigné",
      ],
      ["Depuis le nettoyage", `${this.number(s.bags_since_clean)} sacs`],
      [
        "Autonomie estimée",
        s.autonomy_days == null
          ? "Données insuffisantes"
          : `${this.number(s.autonomy_days)} jours${s.estimate_status === "limited" ? " (recul limité)" : ""}`,
      ],
      [
        "Rythme récent",
        s.daily_rate == null
          ? "Non renseigné"
          : `${this.number(s.daily_rate)} sac/j`,
      ],
    ];
    const events = [...d.events].sort(
      (a, b) => b.date.localeCompare(a.date) || b.order - a.order,
    );
    this.shadowRoot.querySelector("#content").innerHTML =
      `<div class="row"><h2>${escapeHTML(d.name)}</h2><span class="spacer"></span><button id="refresh">Actualiser</button><button id="export">Export JSON</button><button id="csv">Export CSV</button></div>
      <div class="row nav"><button data-jump="operation">Saisie</button><button data-jump="stats">Statistiques</button><button data-jump="journalSection">Journal</button><button data-jump="settingsSection">Paramètres</button></div>
      <div class="grid">${cards.map(([k, v]) => `<div class="card"><div class="muted">${escapeHTML(k)}</div><div class="value" style="${String(v).length > 12 ? "font-size:19px" : ""}">${escapeHTML(v)}</div></div>`).join("")}</div>
      <p class="muted">Les coûts incomplets restent non renseignés. Stock sans prix : ${this.number(s.stock_unpriced)} sacs. Les sorties représentent les sacs versés au poêle, pas une mesure de combustion.</p>
      <p class="muted">Autonomie : fenêtre de ${s.estimate_window} jours, ${s.estimate_sample_days} dates de consommation. ${s.exhaustion_date ? `Épuisement indicatif au ${escapeHTML(s.exhaustion_date.split("-").reverse().join("/"))}.` : "Au moins 7 jours de recul et 3 dates de consommation récentes sont nécessaires."} Cette estimation suit les saisies et ne prévoit pas la météo.</p>
      <section><h2>${this.editing ? "Modifier une opération" : "Enregistrer une opération"}</h2><form id="operation">
      <label>Opération<select name="kind">${Object.entries(labels)
        .map(
          ([k, v]) =>
            `<option value="${k}" ${k === e.kind ? "selected" : ""}>${v}</option>`,
        )
        .join("")}</select></label>
      <label>Date<input name="date" type="date" value="${escapeHTML(e.date)}" max="${this.localDate()}" required></label>
      <label>Quantité (sacs)<input name="quantity" type="number" step="0.0001" value="${escapeHTML(e.quantity)}" required></label>
      <label>Prix unitaire (${escapeHTML(d.currency)}/sac)<input name="unit_price" type="number" min="0" step="0.0001" value="${escapeHTML(e.unit_price)}" placeholder="Facultatif"></label>
      <label>Fournisseur<input name="supplier" maxlength="200" value="${escapeHTML(e.supplier)}"></label><label>Marque<input name="brand" maxlength="200" value="${escapeHTML(e.brand)}"></label>
      <label class="wide">Commentaire<textarea name="comment" maxlength="2000">${escapeHTML(e.comment)}</textarea></label>
      ${this.editing ? "" : '<label class="check wide"><input type="checkbox" name="cleaned">Enregistrer aussi un nettoyage</label>'}
      <div class="wide row"><span id="formTotal"></span><span class="spacer"></span>${this.editing ? '<button type="button" id="cancel">Annuler la modification</button>' : ""}<button class="primary" type="submit">Enregistrer</button></div></form></section>
      <section><h2>Évolution du stock</h2>${this.chart(s.stock_history)}</section>
      ${this.statistics()}
      <section><h2>Comparaison des saisons</h2><p class="muted">La saison ${escapeHTML(s.season)} est en cours. Les autres lignes représentent les données enregistrées, sans présumer qu’une saison est complète. Prix moyen pondéré sur les achats dont le prix est connu.</p><div class="scroll"><table><thead><tr><th>Saison</th><th>Premier allumage</th><th>Sacs utilisés</th><th>Sacs achetés</th><th>Nettoyages</th><th>Dépenses</th><th>Coût utilisé FIFO</th><th>Prix moyen</th><th>Min / max</th></tr></thead><tbody>${Object.entries(
        s.seasons,
      )
        .reverse()
        .map(
          ([season, x]) =>
            `<tr><td>${escapeHTML(season)}</td><td>${escapeHTML(x.first_start || "—")}</td><td>${this.number(x.used)}</td><td>${this.number(x.purchased)}</td><td>${x.cleanings}</td><td>${this.money(x.spend)}${x.purchase_unpriced ? `<br><span class="muted">${this.number(x.purchase_unpriced)} sacs sans prix</span>` : ""}</td><td>${this.money(x.cost)}${x.use_unpriced ? `<br><span class="muted">${this.number(x.use_unpriced)} sacs sans prix</span>` : ""}</td><td>${this.money(x.average_price)}</td><td>${this.money(x.min_price)} / ${this.money(x.max_price)}</td></tr>`,
        )
        .join("")}</tbody></table></div></section>
      <section id="journalSection"><div class="row"><h2>Journal · ${events.length} opérations</h2><span class="spacer"></span><label>Saison<select id="filter"><option value="">Toutes</option>${Object.keys(
        s.seasons,
      )
        .reverse()
        .map((k) => `<option>${escapeHTML(k)}</option>`)
        .join(
          "",
        )}</select></label></div><div class="scroll"><table><thead><tr><th>Date</th><th>Opération</th><th>Quantité</th><th>Prix / sac</th><th>Commentaire</th><th>Actions</th></tr></thead><tbody id="events">${events.map((x) => `<tr class="${x.voided ? "voided" : ""}" data-season="${escapeHTML(x.season || this.seasonFor(x.date))}"><td>${escapeHTML(x.date)}</td><td>${escapeHTML(labels[x.kind])}</td><td>${this.number(Number(x.quantity))}</td><td>${x.unit_price === null ? "—" : this.money(Number(x.unit_price))}</td><td class="comment">${escapeHTML(x.comment)}</td><td>${x.voided ? `Annulée <button data-restore="${escapeHTML(x.id)}">Rétablir</button>` : `<button data-edit="${escapeHTML(x.id)}">Modifier</button> <button data-void="${escapeHTML(x.id)}">Annuler</button>`}</td></tr>`).join("")}</tbody></table></div></section>
      <section><h2>Import de l’historique</h2><p class="muted">Import JSON version 1, avec identifiants stables. Les identifiants déjà présents sont ignorés. L’import est validé entièrement avant enregistrement.</p><input id="file" type="file" accept="application/json,.json" aria-label="Fichier historique JSON"><details><summary>Coller un import JSON</summary><textarea id="json" aria-label="Import JSON" placeholder="Coller le contenu JSON"></textarea><button id="previewJson">Prévisualiser</button></details><div id="preview"></div><button id="import" disabled>Importer les opérations</button></section>
      ${this.settingsForm()}
      <details><summary>Dernières modifications du journal</summary><div class="scroll"><table><thead><tr><th>Date</th><th>Révision</th><th>Action</th><th>Opérations concernées</th></tr></thead><tbody>${[
        ...d.audit,
      ]
        .reverse()
        .slice(0, 30)
        .map(
          (a) =>
            `<tr><td>${escapeHTML(a.at)}</td><td>${a.revision}</td><td>${escapeHTML(a.action)}</td><td>${a.after.length}</td></tr>`,
        )
        .join("")}</tbody></table></div></details>
      <p class="muted">Journal local · révision ${d.revision} · valorisation FIFO · les annulations restent dans la piste d’audit.</p>`;
    const root = this.shadowRoot,
      form = root.querySelector("#operation");
    const update = () => {
      const kind = form.elements.kind.value,
        paid = ["purchase", "adjust"].includes(kind);
      form.elements.unit_price.disabled = !paid;
      form.elements.quantity.disabled = ["clean", "start", "note"].includes(
        kind,
      );
      root.querySelector("#formTotal").textContent =
        paid && form.elements.unit_price.value !== ""
          ? "Montant : " +
            this.money(
              Number(form.elements.quantity.value) *
                Number(form.elements.unit_price.value),
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
      payload.cleaned = form.elements.cleaned?.checked || false;
      if (this.editing) {
        payload.id = this.editing.id;
        if (this.editing.season && payload.date === this.editing.date)
          payload.season = this.editing.season;
        if (this.editing.untracked) payload.untracked = true;
        if (this.editing.purchases_unknown) payload.purchases_unknown = true;
      }
      await this.mutate(this.editing ? "edit" : "add", payload);
    });
    root.querySelector("#refresh").onclick = () => {
      this.editing = null;
      this.load();
    };
    root.querySelector("#cancel")?.addEventListener("click", () => {
      this.editing = null;
      this.render();
    });
    root.querySelectorAll("[data-edit]").forEach(
      (b) =>
        (b.onclick = () => {
          this.editing = d.events.find((x) => x.id === b.dataset.edit);
          this.render();
          this.shadowRoot
            .querySelector("#operation")
            .scrollIntoView({ behavior: "smooth", block: "center" });
        }),
    );
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
    root
      .querySelectorAll("[data-jump]")
      .forEach(
        (b) =>
          (b.onclick = () =>
            root
              .getElementById(b.dataset.jump)
              .scrollIntoView({ behavior: "smooth", block: "start" })),
      );
    this.bindStatistics();
    this.bindSettings();
    root.querySelector("#filter").onchange = (ev) =>
      root
        .querySelectorAll("#events tr")
        .forEach(
          (row) =>
            (row.hidden =
              !!ev.target.value && row.dataset.season !== ev.target.value),
        );
    root.querySelector("#filter").value = s.season;
    root
      .querySelectorAll("#events tr")
      .forEach((row) => (row.hidden = row.dataset.season !== s.season));
    root.querySelector("#export").onclick = () => {
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }),
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
  statistics() {
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
    <section><h2>Comparaison à date équivalente</h2><p class="muted">Cumul de chaque saison arrêté au même jour et au même mois. Le 29 février est comparé au 28 février pour les années non bissextiles. Les valeurs proviennent des opérations enregistrées.</p><p>Évolution des sacs utilisés par rapport à la saison précédente : <strong>${s.usage_change_percent == null ? "Non calculable" : `${s.usage_change_percent > 0 ? "+" : ""}${this.number(s.usage_change_percent)} %`}</strong></p><div class="scroll"><table><thead><tr><th>Saison</th><th>Arrêté au</th><th>Sacs utilisés</th><th>Sacs achetés</th><th>Dépenses</th><th>Coût des sacs utilisés</th><th>Prix moyen</th></tr></thead><tbody>${[
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
      ["cleaning_bags", "Nettoyage après (sacs)", 1, 10000],
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
    return `<section id="settingsSection"><h2>Paramètres et notifications</h2><p class="muted">Les alertes regroupées apparaissent dans Home Assistant. Une destination supplémentaire peut être choisie parmi tes services de notification et tes scripts existants. Les scripts reçoivent title, message, kind et entry_id. Devise : ${escapeHTML(this.data.currency)} · début de saison : mois ${this.data.season_month}.</p>${this.data.notification_error ? `<p class="error">Dernier échec de notification : ${escapeHTML(this.data.notification_error)}</p>` : ""}<form id="settingsForm"><label>Nom du poêle<input name="name" value="${escapeHTML(cfg.name)}" maxlength="80" required></label>${numbers.map(([key, label, min, max]) => `<label>${label}<input type="number" name="${key}" min="${min}" max="${max}" step="1" value="${cfg[key]}" required></label>`).join("")}<label class="wide">Destination supplémentaire<select name="notification_action">${Object.entries(
      choices,
    )
      .map(
        ([k, v]) =>
          `<option value="${escapeHTML(k)}" ${k === cfg.notification_action ? "selected" : ""}>${escapeHTML(v)}</option>`,
      )
      .join(
        "",
      )}</select></label><label class="check"><input name="notify_enabled" type="checkbox" ${cfg.notify_enabled ? "checked" : ""}>Notifications automatiques</label><label class="check"><input name="notify_recovery" type="checkbox" ${cfg.notify_recovery ? "checked" : ""}>Notifier aussi le retour à la normale</label><div class="row wide"><button type="button" id="testNotification">Tester la notification enregistrée</button><span class="spacer"></span><button type="submit" class="primary">Enregistrer les paramètres</button></div></form><p class="muted">Nouvelle alerte après une saisie : immédiate. Rappels : à l’heure choisie, seulement après le délai configuré. Le choix d’une nouvelle destination s’applique après enregistrement des paramètres.</p></section>`;
  }
  bindSettings() {
    const form = this.shadowRoot.getElementById("settingsForm");
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (this.busy || !form.reportValidity()) return;
      const settings = Object.fromEntries(new FormData(form));
      for (const key of ["notify_enabled", "notify_recovery"])
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
