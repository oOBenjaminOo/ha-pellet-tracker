# Pellet Tracker · Suivi Granulés

Local Home Assistant custom integration for pellet stock, seasonal usage,
cleaning and purchase costs. Original project by Benjamin (@oOBenjaminOo).

**0.1.0b1 is an early test release.** No HACS default-catalog submission has
been made. No cloud account, stove connection or runtime Python dependency.

## Fonctionnement

- Page **Suivi Granulés** : saisie datée, historique, modification, annulation,
  comparaison des saisons et courbe de stock. Interface de gestion en français.
- Réapprovisionnement avec quantité, prix unitaire facultatif, fournisseur et marque.
- Consommation, nettoyage, premier allumage, perte, note et correction de stock.
- Valorisation FIFO : les sacs les plus anciens sont utilisés en premier.
- Dépenses d’achat et coût des sacs utilisés calculés séparément par saison.
- Prix moyen pondéré sur les achats dont le prix est connu ; min/max par saison.
- Prix manquant ≠ gratuit : les totaux incomplets restent inconnus. Les
  sous-totaux connus et quantités non valorisées restent disponibles dans l’export.
- Journal local dans `.storage/pellet_tracker.<entry_id>`, indépendant du Recorder.
  Sauvegardes Home Assistant complètes incluant `.storage` recommandées.
- Écritures sérialisées, sauvegarde avant publication, contrôle de révision.
  Une modification concurrente est refusée, jamais écrasée silencieusement.
- Piste d’audit des corrections et annulations ; aucune suppression physique
  d’opérations depuis l’interface.
- Plusieurs journaux indépendants, capteurs traduits en français et anglais.

## Installation de test

1. Télécharger le dépôt et copier **uniquement** `custom_components/pellet_tracker`
   dans le dossier `custom_components` de Home Assistant.
2. Redémarrer Home Assistant.
3. Paramètres → Appareils et services → Ajouter une intégration → **Pellet Tracker**.
4. Nommer le poêle, choisir la devise, le premier mois de saison (juillet par
   défaut), le seuil de stock et le seuil de nettoyage.
5. Ouvrir **Suivi Granulés** dans la barre latérale. Pour démarrer sans historique,
   enregistrer une correction positive du stock initial, avec son prix si connu.

Le dépôt peut également être ajouté comme dépôt personnalisé de type intégration
dans HACS. Les mises à jour de code nécessitent un redémarrage de Home Assistant.
L’interface et les API du journal sont réservées aux administrateurs. Les
capteurs peuvent être utilisés dans les tableaux de bord habituels.

## Règles de calcul

Une quantité positive en correction ajoute un lot ; une quantité négative retire
des sacs des lots les plus anciens. Les corrections ne sont pas des achats.
Les pertes réduisent le stock mais sont séparées de la consommation. Toute
transaction créant un stock négatif, même dans le passé, est refusée en entier.
Les opérations du même jour sont rejouées dans leur ordre d’enregistrement.
Une correction de date recalcule tous les mouvements suivants.

Les prix unitaires acceptent quatre décimales. Les calculs utilisent `Decimal` ;
l’affichage monétaire arrondit à deux décimales. Une devise unique est définie
par journal, sans conversion. Les saisons sont définies par leur premier mois
et ne réinitialisent jamais le stock. La date du premier allumage est distincte.

Les sacs enregistrés comme utilisés représentent des sorties de stock vers le
poêle, pas une mesure du combustible effectivement brûlé ni de chaleur produite.
Les seuils d’entretien sont des rappels personnalisés, pas des prescriptions.

## Import et export

La page accepte un JSON `schema_version: 1` contenant `events`. L’import ajoute
les opérations nouvelles en conservant leurs identifiants ; les identifiants
déjà présents sont ignorés. Il ne remplace jamais un journal existant.
Vérifier le fichier et l’aperçu avant de confirmer. Importer plusieurs fois le
même fichier ne duplique pas les opérations.

L’export contient le journal courant, ses révisions d’audit et les statistiques.
Conserver aussi une sauvegarde Home Assistant pour une restauration complète.
L’import est une reprise des événements ; il ne restaure pas l’audit d’un autre
journal. Une opération annulée exportée reste annulée lors de l’import.

Pour l’ancien tableau français `Suivie XX-XX`, un convertisseur facultatif est
disponible :

```bash
python tools/convert_xlsx.py source.xlsx private-import.json
```

Il nécessite `openpyxl` sur la machine de conversion seulement. Vérifier le
JSON avant de l’importer. Les sorties antérieures au premier inventaire sont
marquées comme historiques sans suivi de stock. Les saisons sans suivi des achats
restent inconnues pour les dépenses et quantités achetées. Les commentaires et le type
des mouvements sources sont conservés ; une anomalie métier doit être revue
avant de reclasser une sortie en perte. Aucun historique personnel n’est fourni
dans le dépôt.

## Capteurs

Stock, sacs utilisés et achetés cette saison, nettoyages, dépenses, coût utilisé,
prix moyen, valeur du stock, date du dernier nettoyage, jours et sacs depuis
nettoyage. Deux capteurs binaires : stock faible et nettoyage à prévoir.
Les valeurs saisonnières corrigibles n’utilisent pas `total_increasing`.
Les notifications peuvent être construites avec les automatisations natives.

## Développement et limites actuelles

```bash
python -m unittest discover -s tests -v
node --check custom_components/pellet_tracker/frontend/panel.js
```

Le moteur est indépendant de Home Assistant. Les tests couvrent les coûts FIFO,
les frontières de saisons, les prix inconnus, les pertes, les corrections,
la concurrence, la persistance et le rejet atomique d’un import invalide.

Cette bêta ne fournit pas encore de prévision d’autonomie, de comparaison à
date équivalente, de graphique mensuel, de services d’automatisation de saisie,
de carte Lovelace dédiée ou d’éditeur de paramètres après création du journal.
La page de gestion est française ; les entités et le formulaire de configuration
ont des traductions FR/EN. Les ajouts futurs seront versionnés et migrés.

## English

Pellet Tracker is a local inventory ledger. Add purchases with optional unit
prices, log bag usage and cleaning, and compare heating seasons. FIFO costs
carry across seasons. Unknown prices remain unknown. Administration uses the
French built-in panel; configuration and entities are available in English.
Install the custom component, restart Home Assistant and add Pellet Tracker
from Devices & services. This beta is intended for a test instance first.

## License

MIT. See [LICENSE](LICENSE).
