"""Portable Mushroom card configuration, using registered IDs rather than guessed names."""


def mushroom_card(name, entities):
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

    cards = [
        {
            "type": "custom:mushroom-title-card",
            "title": name,
            "subtitle": "Granulés · stock, consommation et entretien",
            "alignment": "center",
        }
    ]
    elements = []
    for key, top, size in (("stock", "43%", "34px"), ("autonomy_days", "65%", "13px")):
        if key in by_key:
            elements.append(
                {
                    "type": "state-label",
                    "entity": by_key[key],
                    "prefix": "≈ " if key == "autonomy_days" else "",
                    "suffix": " de réserve" if key == "autonomy_days" else "",
                    "style": {
                        "left": "25%",
                        "top": top,
                        "color": "#fff",
                        "font-size": size,
                        "font-weight": "700" if key == "stock" else "400",
                    },
                }
            )
    cards.append(
        {
            "type": "picture-elements",
            "image": "/pellet_tracker_static/pellet-stove.jpg",
            "aspect_ratio": "2:1",
            "elements": elements,
        }
    )
    number = "{{ states(entity) | replace('.', ',') if is_number(states(entity)) else 'Indisponible' }}"
    money = "{{ (('%.2f' | format(states(entity) | float)) | replace('.', ',')) + ' ' + (state_attr(entity, 'unit_of_measurement') or '') if is_number(states(entity)) else 'Non renseigné' }}"
    metrics = [
        template(
            "used", "Consommation", number + " sacs cette saison", "mdi:fire", "orange"
        ),
        template(
            "spend", "Dépenses", money + " cette saison", "mdi:wallet-outline", "amber"
        ),
        template("average_price", "Prix moyen / sac", money, "mdi:tag-outline", "blue"),
        template(
            "last_clean",
            "Nettoyage",
            "{{ as_timestamp(states(entity), 0) | timestamp_custom('%d/%m/%Y', true) if states(entity) not in ['unknown','unavailable'] else 'À renseigner' }}",
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
    chips = []
    for key, icon, ok, due in (
        ("low_stock", "mdi:package-variant", "Stock OK", "Stock faible"),
        ("cleaning_due", "mdi:broom", "Entretien OK", "À nettoyer"),
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
                + "' if is_state(entity, 'off') else 'Indisponible' }}",
                "tap_action": {"action": "more-info"},
            }
        )
    for chip in chips:
        if chip.get("entity") == by_key.get("cleaning_due"):
            chip["content"] = chip["content"].replace(
                "{{ ",
                "{{ 'Rappel désactivé' if state_attr(entity, 'enabled') == false else ",
                1,
            )
    chips.append(
        {
            "type": "action",
            "icon": "mdi:chart-box-outline",
            "tap_action": {"action": "navigate", "navigation_path": "/pellet-tracker"},
        }
    )
    cards.append(
        {"type": "custom:mushroom-chips-card", "alignment": "center", "chips": chips}
    )
    actions = []
    for key, title, subtitle, icon in (
        ("add_bag", "Ajouter un sac", "Versé au poêle", "mdi:plus-circle-outline"),
        ("clean", "Nettoyage", "Enregistrer", "mdi:broom"),
    ):
        if key in by_key:
            actions.append(
                {
                    "type": "custom:mushroom-template-card",
                    "primary": title,
                    "secondary": subtitle,
                    "icon": icon,
                    "color": "orange",
                    "icon_color": "orange",
                    "tap_action": {
                        "action": "perform-action",
                        "perform_action": "button.press",
                        "target": {"entity_id": by_key[key]},
                        "confirmation": {"text": title + " dans le journal ?"},
                    },
                }
            )
    if actions:
        cards.append({"type": "horizontal-stack", "cards": actions})
    return {"type": "vertical-stack", "cards": cards}
