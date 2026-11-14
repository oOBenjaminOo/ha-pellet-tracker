"""Portable Mushroom card configuration, using registered IDs rather than guessed names."""

from urllib.parse import urlencode

from .i18n import text


def mushroom_card(
    name, entities, language="fr", settings=None, entry_id=None, undo_revision=None
):
    def tr(message):
        return text(language, message)

    by_key = {
        e["key"]: e["entity_id"]
        for e in entities
        if e.get("enabled", e.get("available"))
    }

    def template(key, title, text, icon, color):
        entity = by_key.get(key)
        if not entity:
            return None
        return {
            "type": "custom:mushroom-template-card",
            "entity": entity,
            "primary": title,
            "secondary": text,
            "icon": icon,
            "color": color,
            "icon_color": color,
            "multiline_secondary": True,
            "tap_action": {"action": "more-info"},
        }

    home = "/pellet-tracker" + (
        "?" + urlencode({"entry_id": entry_id}) if entry_id else ""
    )
    cards = [
        {
            "type": "custom:mushroom-title-card",
            "title": name,
            "subtitle": tr("Granulés · stock, consommation et entretien"),
            "alignment": "center",
        }
    ]
    elements = []
    for key, top, size in (
        ("stock", "45%", "clamp(22px, 5vw, 34px)"),
        ("autonomy_days", "56%", "clamp(10px, 2.5vw, 13px)"),
    ):
        if key in by_key:
            elements.append(
                {
                    "type": "custom:pellet-tracker-value",
                    "entity": by_key[key],
                    "metric": key,
                    "language": language,
                    "style": {
                        "left": "25%",
                        "top": top,
                        "color": "#fff",
                        "font-size": size,
                        "font-weight": "700" if key == "stock" else "400",
                    },
                }
            )
    for key, filename, label, left, width in (
        ("add_bag", "pellet-bag.webp", "Ajouter un sac consommé", "16%", "20%"),
        ("clean", "ash-vacuum.webp", "Enregistrer un nettoyage", "42%", "22%"),
    ):
        if key not in by_key:
            continue
        elements.append(
            {
                "type": "image",
                "image": f"/pellet_tracker_static/{filename}",
                "title": tr(label),
                "aspect_ratio": "1:1",
                "filter": "none",
                "entity": by_key[key],
                "style": {
                    "left": left,
                    "top": "80%",
                    "width": width,
                    "cursor": "pointer",
                    "filter": "drop-shadow(0 4px 5px #0008)",
                },
                "tap_action": {
                    "action": "perform-action",
                    "perform_action": "button.press",
                    "target": {"entity_id": by_key[key]},
                    "confirmation": {
                        "text": tr(
                            "Ajouter un sac à la consommation d’aujourd’hui ?"
                            if key == "add_bag"
                            else "Enregistrer un nettoyage pour aujourd’hui ?"
                        )
                    },
                },
                "hold_action": {"action": "none"},
                "double_tap_action": {"action": "none"},
            }
        )
    chips = []
    for key, icon, ok, due in (
        ("low_stock", "mdi:package-variant", "Stock OK", tr("Stock faible")),
        ("cleaning_due", "mdi:broom", tr("Entretien OK"), tr("À nettoyer")),
    ):
        if key not in by_key:
            continue
        chips.append(
            {
                "type": "template",
                "entity": by_key[key],
                "icon": icon,
                "icon_color": "{{ 'orange' if is_state(entity, 'on') else 'green' if is_state(entity, 'off') else 'grey' }}",
                "content": "{{ '"
                + due
                + "' if is_state(entity, 'on') else '"
                + ok
                + "' if is_state(entity, 'off') else '"
                + tr("Indisponible")
                + "' }}",
                "tap_action": {"action": "more-info"},
            }
        )
    for chip in chips:
        if chip.get("entity") == by_key.get("cleaning_due"):
            chip["content"] = chip["content"].replace(
                "{{ ",
                tr(
                    "{{ 'Rappel désactivé' if state_attr(entity, 'enabled') == false else "
                ),
                1,
            )
    for chip, top in zip(chips, ("12%", "26%"), strict=False):
        elements.append(
            {
                "type": "custom:mushroom-chips-card",
                "alignment": "center",
                "chips": [chip],
                "style": {
                    "left": "25%",
                    "top": top,
                    "width": "43%",
                    "--chip-height": "30px",
                    "--chip-font-size": "11px",
                    "--chip-background": "rgba(20,20,20,0.78)",
                    "--chip-border-color": "rgba(255,255,255,0.18)",
                    "--chip-border-width": "1px",
                    "--primary-text-color": "#fff",
                },
            }
        )
    elements.append(
        {
            "type": "icon",
            "icon": "mdi:home-outline",
            "title": tr("Ouvrir le suivi"),
            "style": {
                "left": "53%",
                "top": "12%",
                "color": "#fff",
                "background": "rgba(20,20,20,0.78)",
                "border-radius": "50%",
                "padding": "7px",
                "--mdc-icon-size": "20px",
            },
            "tap_action": {"action": "navigate", "navigation_path": home},
            "hold_action": {"action": "none"},
            "double_tap_action": {"action": "none"},
        }
    )
    if entry_id and undo_revision is not None:
        elements.append(
            {
                "type": "icon",
                "icon": "mdi:undo-variant",
                "title": tr("Annuler la dernière saisie"),
                "style": {
                    "left": "53%",
                    "top": "26%",
                    "color": "#fff",
                    "background": "rgba(20,20,20,0.78)",
                    "padding": "7px",
                    "border-radius": "50%",
                    "--mdc-icon-size": "20px",
                },
                "tap_action": {
                    "action": "perform-action",
                    "perform_action": "pellet_tracker.undo_last",
                    "data": {"entry_id": entry_id, "revision": undo_revision},
                    "confirmation": {
                        "text": tr(
                            "Annuler la dernière saisie et recalculer le stock ?"
                        )
                    },
                },
                "hold_action": {"action": "none"},
                "double_tap_action": {"action": "none"},
            }
        )
    if (
        settings
        and settings.get("stove_control_enabled")
        and entry_id
        and settings.get("stove_control_entity")
    ):
        target = settings["stove_control_entity"]
        for state, command, label in (
            ("off", "turn_on", "Allumer le poêle ?"),
            ("on", "turn_off", "Éteindre le poêle ?"),
        ):
            elements.append(
                {
                    "type": "conditional",
                    "conditions": [{"entity": target, "state": state}],
                    "elements": [
                        {
                            "type": "image",
                            "image": "/pellet_tracker_static/stove-control.svg",
                            "entity": target,
                            "title": tr(label),
                            "aspect_ratio": "0.7:1",
                            "filter": "none",
                            "style": {
                                "left": "78%",
                                "top": "51%",
                                "width": "36%",
                                "cursor": "pointer",
                            },
                            "tap_action": {
                                "action": "perform-action",
                                "perform_action": "pellet_tracker.control_stove",
                                "data": {
                                    "entry_id": entry_id,
                                    "entity_id": target,
                                    "command": command,
                                },
                                "confirmation": {"text": tr(label)},
                            },
                            "hold_action": {"action": "none"},
                            "double_tap_action": {"action": "none"},
                        }
                    ],
                }
            )
    status_entity = by_key.get("stove_status")

    def header(image):
        return {
            "type": "picture-elements",
            "image": image,
            "aspect_ratio": "3:2",
            "elements": elements,
        }

    cleaning_entity = by_key.get("cleaning_due")
    # Unknown maintenance data retains the neutral clean illustration; the badge
    # continues to report unavailable, rather than inventing a maintenance alert.
    for heating in (True, False) if status_entity else (False,):
        for dirty in (True, False) if cleaning_entity else (False,):
            conditions = []
            if status_entity:
                conditions.append(
                    {
                        "condition": "state",
                        "entity": status_entity,
                        "state": "on"
                        if heating
                        else ["off", "unknown", "unavailable", "unconfigured"],
                    }
                )
            if cleaning_entity:
                conditions.append(
                    {
                        "condition": "state",
                        "entity": cleaning_entity,
                        "state": "on" if dirty else ["off", "unknown", "unavailable"],
                    }
                )
            filename = (
                "pellet-stove"
                + ("" if heating else "-off")
                + ("-dirty" if dirty else "")
                + ".jpg"
            )
            picture = header(f"/pellet_tracker_static/{filename}?v=0.6.1b1")
            cards.append(
                {"type": "conditional", "conditions": conditions, "card": picture}
                if conditions
                else picture
            )
    quantity = (
        "{% set value = states(entity) %}"
        "{% if is_number(value) %}"
        "{{ value | int if value | float == value | int else value"
        + (" | replace('.', ',')" if language == "fr" else "")
        + " }} "
        + tr("sacs cette saison")
        + "{% else %}"
        + tr("Indisponible")
        + "{% endif %}"
    )
    money = tr(
        "{{ (('%.2f' | format(states(entity) | float)) | replace('.', ',')) + ' ' + (state_attr(entity, 'unit_of_measurement') or '') if is_number(states(entity)) else 'Non renseigné' }}"
    )
    metrics = [
        template(
            "used",
            tr("Consommation"),
            quantity,
            "mdi:fire",
            "orange",
        ),
        template(
            "spend",
            tr("Dépenses"),
            money + tr(" cette saison"),
            "mdi:wallet-outline",
            "amber",
        ),
        template(
            "average_price", tr("Prix moyen / sac"), money, "mdi:tag-outline", "blue"
        ),
        template(
            "last_clean",
            tr("Nettoyage"),
            tr(
                "{{ as_timestamp(states(entity), 0) | timestamp_custom('%d/%m/%Y', true) if states(entity) not in ['unknown','unavailable'] else 'À renseigner' }}"
            ),
            "mdi:broom",
            "teal",
        ),
    ]
    cards.append(
        {
            "type": "grid",
            "columns": 2,
            "square": False,
            "cards": [c for c in metrics if c],
        }
    )
    return {"type": "vertical-stack", "cards": cards}
