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
      .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:12px;margin:16px 0}.card,section{background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:14px;padding:18px}.value{font-size:24px;margin-top:7px;font-weight:600}section{margin-top:16px}.row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.spacer{flex:1}
      button,select,input,textarea{font:inherit;color:inherit;border:1px solid var(--divider-color);border-radius:8px;background:var(--secondary-background-color);padding:10px}button{cursor:pointer}button:hover{border-color:var(--primary-color)}button.primary{background:var(--primary-color);color:var(--text-primary-color,#fff)}button:disabled{opacity:.45;cursor:wait}label{display:flex;flex-direction:column;gap:6px}form{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}textarea{min-height:70px;width:100%}.wide{grid-column:1/-1}table{border-collapse:collapse;width:100%;font-size:13px}th,td{text-align:left;padding:11px 9px;border-bottom:1px solid var(--divider-color);white-space:nowrap}td.comment{white-space:normal;min-width:140px;max-width:300px}th{color:var(--secondary-text-color)}.scroll{overflow:auto}.error{color:var(--error-color,#db4437);padding:12px 0;white-space:pre-wrap}.success{color:var(--success-color,#4caf50);padding:8px 0}details{margin-top:12px}summary{cursor:pointer;padding:8px 0}.voided{opacity:.5;text-decoration:line-through}svg{display:block;width:100%;height:150px}#formTotal{font-size:16px;font-weight:600} @media(max-width:600px){main{padding:12px}header{padding:12px}.grid{grid-template-columns:repeat(2,1fr)}.value{font-size:23px}}
      </style><header><ha-menu-button></ha-menu-button><span>🔥</span><h1>Suivi Granulés</h1><span class="badge">Bêta 0.1</span><span class="spacer"></span><select id="journal" aria-label="Poêle"></select></header><main><div id="notice" role="status"></div><div id="content">Chargement…</div></main>`;
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
    ];
    const events = [...d.events].sort(
      (a, b) => b.date.localeCompare(a.date) || b.order - a.order,
    );
    this.shadowRoot.querySelector("#content").innerHTML =
      `<div class="row"><h2>${escapeHTML(d.name)}</h2><span class="spacer"></span><button id="refresh">Actualiser</button><button id="export">Exporter le journal</button></div>
      <div class="grid">${cards.map(([k, v]) => `<div class="card"><div class="muted">${escapeHTML(k)}</div><div class="value" style="${String(v).length > 12 ? "font-size:19px" : ""}">${escapeHTML(v)}</div></div>`).join("")}</div>
      <p class="muted">Les coûts incomplets restent non renseignés. Stock sans prix : ${this.number(s.stock_unpriced)} sacs. Les sorties représentent les sacs versés au poêle, pas une mesure de combustion.</p>
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
      <div class="wide row"><span id="formTotal"></span><span class="spacer"></span>${this.editing ? '<button type="button" id="cancel">Annuler la modification</button>' : ""}<button class="primary" type="submit">Enregistrer</button></div></form></section>
      <section><h2>Évolution du stock</h2>${this.chart(s.stock_history)}</section>
      <section><h2>Comparaison des saisons</h2><p class="muted">La saison ${escapeHTML(s.season)} est en cours. Les autres lignes représentent les données enregistrées, sans présumer qu’une saison est complète. Prix moyen pondéré sur les achats dont le prix est connu.</p><div class="scroll"><table><thead><tr><th>Saison</th><th>Premier allumage</th><th>Sacs utilisés</th><th>Sacs achetés</th><th>Nettoyages</th><th>Dépenses</th><th>Coût utilisé FIFO</th><th>Prix moyen</th><th>Min / max</th></tr></thead><tbody>${Object.entries(
        s.seasons,
      )
        .reverse()
        .map(
          ([season, x]) =>
            `<tr><td>${escapeHTML(season)}</td><td>${escapeHTML(x.first_start || "—")}</td><td>${this.number(x.used)}</td><td>${this.number(x.purchased)}</td><td>${x.cleanings}</td><td>${this.money(x.spend)}${x.purchase_unpriced ? `<br><span class="muted">${this.number(x.purchase_unpriced)} sacs sans prix</span>` : ""}</td><td>${this.money(x.cost)}${x.use_unpriced ? `<br><span class="muted">${this.number(x.use_unpriced)} sacs sans prix</span>` : ""}</td><td>${this.money(x.average_price)}</td><td>${this.money(x.min_price)} / ${this.money(x.max_price)}</td></tr>`,
        )
        .join("")}</tbody></table></div></section>
      <section><div class="row"><h2>Journal · ${events.length} opérations</h2><span class="spacer"></span><label>Saison<select id="filter"><option value="">Toutes</option>${Object.keys(
        s.seasons,
      )
        .reverse()
        .map((k) => `<option>${escapeHTML(k)}</option>`)
        .join(
          "",
        )}</select></label></div><div class="scroll"><table><thead><tr><th>Date</th><th>Opération</th><th>Quantité</th><th>Prix / sac</th><th>Commentaire</th><th>Actions</th></tr></thead><tbody id="events">${events.map((x) => `<tr class="${x.voided ? "voided" : ""}" data-season="${escapeHTML(x.season || this.seasonFor(x.date))}"><td>${escapeHTML(x.date)}</td><td>${escapeHTML(labels[x.kind])}</td><td>${this.number(Number(x.quantity))}</td><td>${x.unit_price === null ? "—" : this.money(Number(x.unit_price))}</td><td class="comment">${escapeHTML(x.comment)}</td><td>${x.voided ? "Annulée" : `<button data-edit="${escapeHTML(x.id)}">Modifier</button> <button data-void="${escapeHTML(x.id)}">Annuler</button>`}</td></tr>`).join("")}</tbody></table></div></section>
      <section><h2>Import de l’historique</h2><p class="muted">Import JSON version 1, avec identifiants stables. Les identifiants déjà présents sont ignorés. L’import est validé entièrement avant enregistrement.</p><input id="file" type="file" accept="application/json,.json" aria-label="Fichier historique JSON"><details><summary>Coller un import JSON</summary><textarea id="json" aria-label="Import JSON" placeholder="Coller le contenu JSON"></textarea><button id="previewJson">Prévisualiser</button></details><div id="preview"></div><button id="import" disabled>Importer les opérations</button></section>
      <p class="muted">Journal local · révision ${d.revision} · valorisation FIFO · les annulations restent dans la piste d’audit.</p>`;
    const root = this.shadowRoot,
      form = root.querySelector("form");
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
      if (this.editing) {
        payload.id = this.editing.id;
        if (this.editing.season) payload.season = this.editing.season;
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
