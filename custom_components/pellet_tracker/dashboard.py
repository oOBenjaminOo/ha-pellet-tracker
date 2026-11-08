"""Portable Mushroom card configuration, using registered IDs rather than guessed names."""

from .i18n import text


def mushroom_card(name, entities, language="fr"):
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

    cards = [
        {
            "type": "custom:mushroom-title-card",
            "title": name,
            "subtitle": tr("Granulés · stock, consommation et entretien"),
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
                    "suffix": tr(" de réserve") if key == "autonomy_days" else "",
                    "style": {
                        "left": "25%",
                        "top": top,
                        "color": "#fff",
                        "font-size": size,
                        "font-weight": "700" if key == "stock" else "400",
                    },
                }
            )
    status_entity = by_key.get("stove_status")

    def header(image):
        return {
            "type": "picture-elements",
            "image": image,
            "aspect_ratio": "2:1",
            "elements": elements,
        }

    off_image = "/pellet_tracker_static/pellet-stove-off.jpg"
    if status_entity:
        cards.extend(
            [
                {
                    "type": "conditional",
                    "conditions": [
                        {"condition": "state", "entity": status_entity, "state": "on"}
                    ],
                    "card": header("/pellet_tracker_static/pellet-stove.jpg"),
                },
                {
                    "type": "conditional",
                    "conditions": [
                        {
                            "condition": "state",
                            "entity": status_entity,
                            "state": ["off", "unknown", "unavailable", "unconfigured"],
                        }
                    ],
                    "card": header(off_image),
                },
            ]
        )
    else:
        cards.append(header(off_image))
    number = tr(
        "{{ states(entity) | replace('.', ',') if is_number(states(entity)) else 'Indisponible' }}"
    )
    money = tr(
        "{{ (('%.2f' | format(states(entity) | float)) | replace('.', ',')) + ' ' + (state_attr(entity, 'unit_of_measurement') or '') if is_number(states(entity)) else 'Non renseigné' }}"
    )
    metrics = [
        template(
            "used",
            tr("Consommation"),
            number + tr(" sacs cette saison"),
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
        (
            "add_bag",
            tr("Ajouter un sac"),
            tr("Consommation du jour"),
            "mdi:plus-circle-outline",
        ),
        ("clean", tr("Nettoyage"), tr("Aujourd’hui"), "mdi:broom"),
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
                        "confirmation": {
                            "text": tr(
                                "Ajouter un sac à la consommation d’aujourd’hui ?"
                            )
                            if key == "add_bag"
                            else tr("Enregistrer un nettoyage pour aujourd’hui ?")
                        },
                    },
                }
            )
    if actions:
        cards.append({"type": "horizontal-stack", "cards": actions})
    return {"type": "vertical-stack", "cards": cards}
