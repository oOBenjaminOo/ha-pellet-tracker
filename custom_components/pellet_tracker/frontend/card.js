/* Live wrapper around native HA + Mushroom cards. No journal data is cached. */
class PelletTrackerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.generation = 0;
    this.renderGeneration = 0;
  }
  setConfig(config) {
    if (!config.entry_id || typeof config.entry_id !== "string")
      throw new Error("Choose a pellet tracker / Choisissez un suivi granulés");
    if (this.config?.entry_id === config.entry_id) return;
    this.stop();
    this.config = { ...config };
    this.signature = null;
    this.shadowRoot.replaceChildren();
    if (this.isConnected && this._hass) this.subscribe();
  }
  set hass(value) {
    const connectionChanged = this._hass?.connection !== value.connection;
    this._hass = value;
    if (this.child) this.child.hass = value;
    if (connectionChanged) this.stop();
    if (this.isConnected && this.config && !this.subscribing) this.subscribe();
  }
  connectedCallback() {
    this.style.setProperty("display", "block");
    if (this._hass && this.config && !this.subscribing) this.subscribe();
  }
  disconnectedCallback() {
    this.stop();
  }
  stop() {
    this.generation++;
    this.renderGeneration++;
    Promise.resolve(this.unsubscribe?.()).catch(() => {});
    this.unsubscribe = null;
    this.subscribing = false;
  }
  async subscribe() {
    if (this.subscribing) return;
    this.subscribing = true;
    const generation = ++this.generation;
    try {
      const unsubscribe = await this._hass.connection.subscribeMessage(
        (packet) => {
          if (generation === this.generation && this.isConnected)
            this.update(packet);
        },
        { type: "pellet_tracker/card_updates", entry_id: this.config.entry_id },
      );
      if (generation !== this.generation || !this.isConnected) unsubscribe();
      else this.unsubscribe = unsubscribe;
    } catch (error) {
      if (generation !== this.generation) return;
      this.subscribing = false;
      this.signature = null;
      this.error(error.message || String(error));
    }
  }
  async update(packet) {
    if (packet.error) {
      this.signature = null;
      this.error(packet.error);
      return;
    }
    const signature = JSON.stringify(packet.config);
    if (signature === this.signature) return;
    const generation = ++this.renderGeneration;
    try {
      const helpers = await window.loadCardHelpers();
      if (generation !== this.renderGeneration || !this.isConnected) return;
      const child = helpers.createCardElement(packet.config);
      child.hass = this._hass;
      this.child = child;
      this.signature = signature;
      this.shadowRoot.replaceChildren(child);
    } catch (error) {
      if (generation !== this.renderGeneration) return;
      this.signature = null;
      this.error(error.message || String(error));
    }
  }
  error(message) {
    const box = document.createElement("ha-card"),
      text = document.createElement("p"),
      retry = document.createElement("button");
    box.style.padding = "16px";
    text.textContent = "Pellet Tracker: " + message;
    retry.textContent = this._hass?.language?.startsWith("fr")
      ? "Réessayer"
      : "Retry";
    retry.onclick = () => {
      this.stop();
      this.subscribe();
    };
    box.append(text, retry);
    this.shadowRoot.replaceChildren(box);
  }
  getCardSize() {
    return this.child?.getCardSize?.() || 7;
  }
  getGridOptions() {
    return { columns: 12, min_columns: 6 };
  }
  static getConfigElement() {
    return document.createElement("pellet-tracker-card-editor");
  }
  static getStubConfig() {
    return { entry_id: "" };
  }
}

class PelletTrackerCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.sequence = 0;
  }
  setConfig(config) {
    this.config = { ...config };
    this.render();
  }
  set hass(hass) {
    this._hass = hass;
    if (!this.loading) {
      this.loading = true;
      const sequence = ++this.sequence;
      hass
        .callWS({ type: "pellet_tracker/list" })
        .then((entries) => {
          if (sequence !== this.sequence) return;
          this.entries = entries;
          this.render();
        })
        .catch(() => {
          this.loading = false;
        });
    }
  }
  render() {
    if (!this.config) return;
    const label = document.createElement("label"),
      select = document.createElement("select");
    label.textContent = this._hass?.language?.startsWith("fr")
      ? "Poêle à afficher "
      : "Stove to display ";
    label.style.cssText = "display:block;padding:16px";
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "-";
    select.append(empty);
    for (const entry of this.entries || []) {
      const option = document.createElement("option");
      option.value = entry.id;
      option.textContent = entry.name;
      select.append(option);
    }
    select.value = this.config.entry_id || "";
    select.onchange = () => {
      this.config = { ...this.config, entry_id: select.value };
      this.dispatchEvent(
        new CustomEvent("config-changed", {
          detail: { config: this.config },
          bubbles: true,
          composed: true,
        }),
      );
    };
    label.append(select);
    this.shadowRoot.replaceChildren(label);
  }
}
// Display formatting belongs to the card, so automation sensor values stay numeric.
class PelletTrackerValue extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }
  setConfig(config) {
    this.config = config;
    this.render();
  }
  set hass(hass) {
    this._hass = hass;
    this.render();
  }
  render() {
    if (!this.config || !this._hass) return;
    const { entity, metric, language } = this.config;
    const raw = this._hass.states[entity]?.state;
    const value = raw == null || raw.trim() === "" ? NaN : Number(raw);
    const french = language === "fr";
    if (!Number.isFinite(value)) {
      this.shadowRoot.textContent = french ? "Indisponible" : "Unavailable";
      return;
    }
    const days = metric === "autonomy_days";
    const amount = days ? Math.floor(value) : value;
    const formatted = new Intl.NumberFormat(language, {
      maximumFractionDigits: 4,
    }).format(amount);
    const unit = days
      ? french
        ? amount === 1
          ? "Jour de réserve"
          : "Jours de réserve"
        : amount === 1
          ? "day in reserve"
          : "days in reserve"
      : french
        ? amount === 1
          ? "Sac"
          : "Sacs"
        : amount === 1
          ? "Bag"
          : "Bags";
    this.shadowRoot.textContent = (days ? "≈ " : "") + formatted + " " + unit;
  }
}

// Wait for the HA root before registering in installations using scoped registries.
customElements.whenDefined("home-assistant").then(() => {
  if (!customElements.get("pellet-tracker-value"))
    customElements.define("pellet-tracker-value", PelletTrackerValue);
  if (!customElements.get("pellet-tracker-card"))
    customElements.define("pellet-tracker-card", PelletTrackerCard);
  if (!customElements.get("pellet-tracker-card-editor"))
    customElements.define(
      "pellet-tracker-card-editor",
      PelletTrackerCardEditor,
    );
  window.customCards ||= [];
  if (!window.customCards.some((c) => c.type === "pellet-tracker-card"))
    window.customCards.push({
      type: "pellet-tracker-card",
      name: "Pellet Tracker",
      description:
        "Live stove card / Carte du poêle mise à jour automatiquement",
      preview: true,
    });
});
