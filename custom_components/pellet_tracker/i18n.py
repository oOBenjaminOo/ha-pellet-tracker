"""Local messages for generated cards and notifications. Journal data is never translated."""

ENGLISH = {
    "Annuler la dernière saisie": "Undo latest entry",
    "Annuler la dernière saisie et recalculer le stock ?": "Undo the latest entry and recalculate stock?",
    "Allumer le poêle ?": "Turn on the stove?",
    "Éteindre le poêle ?": "Turn off the stove?",
    "Ouvrir le suivi": "Open tracker",
    "Ajouter un sac consommé": "Add a consumed bag",
    "Enregistrer un nettoyage": "Record a cleaning",
    "Indisponible": "Unavailable",
    "{{ states(entity) | replace('.', ',') if is_number(states(entity)) else 'Indisponible' }}": "{{ states(entity) if is_number(states(entity)) else 'Unavailable' }}",
    "{{ (('%.2f' | format(states(entity) | float)) | replace('.', ',')) + ' ' + (state_attr(entity, 'unit_of_measurement') or '') if is_number(states(entity)) else 'Non renseigné' }}": "{{ (('%.2f' | format(states(entity) | float))) + ' ' + (state_attr(entity, 'unit_of_measurement') or '') if is_number(states(entity)) else 'Not provided' }}",
    "Granulés · stock, consommation et entretien": "Pellets · stock, consumption and maintenance",
    "Consommation": "Consumption",
    "Dépenses": "Spending",
    "Prix moyen / sac": "Average price / bag",
    "Nettoyage": "Cleaning",
    "{{ as_timestamp(states(entity), 0) | timestamp_custom('%d/%m/%Y', true) if states(entity) not in ['unknown','unavailable'] else 'À renseigner' }}": "{{ as_timestamp(states(entity), 0) | timestamp_custom('%d/%m/%Y', true) if states(entity) not in ['unknown','unavailable'] else 'To be provided' }}",
    "Stock faible": "Low stock",
    "Entretien OK": "Maintenance OK",
    "À nettoyer": "Cleaning due",
    "Ajouter un sac": "Add a bag",
    "Consommation du jour": "Today’s consumption",
    "Aujourd’hui": "Today",
    "sacs cette saison": "bags this season",
    " sacs cette saison": " bags this season",
    " cette saison": " this season",
    "{{ 'Rappel désactivé' if state_attr(entity, 'enabled') == false else ": "{{ 'Reminder disabled' if state_attr(entity, 'enabled') == false else ",
    " de réserve": " in reserve",
    "Ajouter un sac à la consommation d’aujourd’hui ?": "Add one bag to today’s consumption?",
    "Enregistrer un nettoyage pour aujourd’hui ?": "Record a cleaning for today?",
    "Nettoyage fait": "Cleaning done",
    "+1 sac utilisé": "+1 bag used",
    "Rappeler dans 24 h": "Remind in 24 h",
    "Action depuis une notification": "Action from a notification",
    "Cette action n’a pas été enregistrée. Le journal a peut-être changé ; vérifiez le suivi avant de recommencer.": "This action was not recorded. The journal may have changed; check the tracker before trying again.",
    "Notification de test du suivi des granulés.": "Pellet Tracker test notification.",
    "Le stock et l’entretien sont à jour.": "Stock and maintenance are up to date.",
    "Stock faible : {stock:g} sacs restants.": "Low stock: {stock:g} bags remaining.",
    "Nettoyage à prévoir : {bags:g} sacs{elapsed} depuis le dernier nettoyage.": "Cleaning due: {bags:g} bags{elapsed} since the last cleaning.",
    ", {days} jours": ", {days} days",
    "Autonomie estimée courte : {autonomy:g} jours.": "Low estimated autonomy: {autonomy:g} days.",
}


FRENCH_ERRORS = {
    "Stove control is disabled": "La commande du poêle est désactivée.",
    "Stove control configuration changed; refresh the card": "Le switch configuré a changé. Actualisez la carte.",
    "Stove control switch unavailable": "Le switch de commande du poêle est indisponible.",
    "Invalid stove command": "Commande du poêle non valide.",
}


def text(language, message, **values):
    """Resolve an authored message, retaining French for existing journals."""
    template = (
        ENGLISH.get(message, message)
        if language == "en"
        else FRENCH_ERRORS.get(message, message)
    )
    return template.format(**values) if values else template
