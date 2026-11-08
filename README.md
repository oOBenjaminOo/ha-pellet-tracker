# Pellet Tracker · Suivi Granulés

Local Home Assistant custom integration for pellet stock, seasonal usage,
cleaning and purchase costs. Original project by Benjamin (@oOBenjaminOo).

**0.6.3b1 is a feature-complete beta for real-world testing.** No HACS default-catalog submission has
been made. No cloud account, stove connection or runtime Python dependency.

## Language / Langue

Choose **Français** or **English** when creating a tracker, or later in
**Settings → Tracker language → Save settings**. Each stove keeps its own language.
Existing trackers default to French. Numbers, months, interface messages, CSV headings,
notifications and newly generated dashboard cards use the selected language.
User names, comments, entity IDs, MQTT values and historical records are never translated.
Home Assistant's own settings screens and native entity names follow your HA profile language.
Existing copied dashboard cards keep their original text; replace their configuration
with the newly generated card to switch their language.

Choisissez **Français** ou **English** à la création, ou dans
**Réglages → Langue du suivi → Enregistrer les paramètres**. Chaque poêle conserve
son choix ; les suivis existants restent en français. Pour changer la langue d’une
carte déjà ajoutée, remplacez sa configuration par la nouvelle carte générée.

## Fonctionnement

- Interface français/anglais avec six vues distinctes : **Accueil, Statistiques,
  Saisons, Historique, Dashboards et Réglages**. Seule la vue choisie est affichée.
- Saisies et modifications dans des fenêtres modales, avec champs contextuels.
- Un seul bouton **Ajouter une action** sur l’accueil : choisir consommation,
  réapprovisionnement, nettoyage ou autre opération dans le formulaire.
- Accès direct **Modifier mes seuils** sur l’accueil ; seuil de stock et rappels
  d’entretien par sacs/jours personnalisables. Les options complètes restent dans Réglages.
- Historique filtrable et paginé.
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
- Autonomie estimée, date d’épuisement et rythme récent, sans inventer de données.
- Graphiques mensuels des quantités, coûts et prix, avec export CSV.
- Comparaison des saisons complètes et à date équivalente.
- Notifications regroupées intégrées, rappels et destination supplémentaire facultative.
- Paramètres modifiables sans redémarrage, boutons rapides et actions d’automatisation.
- Une saisie peut enregistrer les sacs et un nettoyage dans la même transaction.

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

## Nouveautés : saisie, bilan, budget et prix

- **Annuler la dernière saisie** retire en une transaction les opérations du dernier
  ajout, y compris un nettoyage associé. Une nouvelle modification rend cette
  annulation rapide indisponible ; l’annulation détaillée reste dans l’historique.
- **Saisons → Bilan et budget** : premier allumage, fin de chauffe, durée inclusive,
  sacs sur cette période et moyenne quotidienne. Les opérations hors période restent
  dans les totaux comptables. La fin de chauffe ne ferme pas la saison et ne vide pas le stock.
- Budget facultatif **par saison** : laisser le champ vide pour le désactiver.
  Le restant est inconnu si des achats n’ont pas de prix ; un dépassement reste négatif.
- **Statistiques → Fournisseurs et marques** : prix moyen pondéré, min/max, sacs
  sans prix et dépenses, regroupés par saison et nom (espaces et casse normalisés).
- Les achats acceptent une livraison et une remise **totales pour l’achat**.
  Le prix unitaire saisi reste le prix de base ; le coût réel réparti par sac inclut
  livraison moins remise dans les dépenses, prix moyens et valorisation FIFO.
  Les anciens achats sans ces champs conservent exactement leurs montants.

## Image dynamique d’un poêle connecté (facultatif)

Dans **Réglages → Poêle connecté**, choisir l’entité d’état et, si nécessaire,
l’attribut à lire. Renseigner les valeurs exactes signifiant allumé et éteint,
séparées par des virgules. Pour un thermostat, `hvac_action: heating/idle` peut
être adapté s’il est disponible ; le mode `heat` seul ne prouve pas une chauffe.

Le capteur **État de chauffe du poêle** suit les changements de l’entité et de
ses attributs sans interrogation périodique. La carte Mushroom affiche l’image
avec flamme seulement pour l’état reconnu `on`, l’image sans flamme pour `off`,
et une indication distincte pour une source inconnue/indisponible ou non configurée.
Les valeurs non reconnues restent inconnues. Aucune consommation, aucun nettoyage
ni commande du poêle ne découle de cette association.

Les anciennes cartes copiées avant cette version gardent leur configuration :
remplacer leur YAML par la nouvelle carte proposée dans **Dashboards** pour activer
le visuel dynamique et les nouvelles confirmations. Les changements ultérieurs
d’association dans Réglages seront suivis automatiquement par cette nouvelle carte.

## Seuils d’alerte

Les seuils se modifient dans **Réglages**, ou via les options de l’intégration.
Stock faible : stock **inférieur ou égal** au seuil (10 sacs par défaut).
Entretien : **5 sacs utilisés OU 7 jours** depuis le nettoyage par défaut ; le
critère en jours exige au moins une consommation depuis ce nettoyage.
Un réapprovisionnement n’augmente pas le compteur d’entretien.
Chaque critère d’entretien accepte `0` pour le désactiver ; les deux à zéro
désactivent ce rappel. Les valeurs sont aussi visibles dans les attributs des alertes.

## Notifications avec actions

Avec une destination `notify.mobile_app_…` explicitement choisie, les alertes
Companion proposent **Nettoyage fait**, **+1 sac utilisé**, **Rappeler dans 24 h**.
L’option de boutons est désactivable. Les actions d’écriture sont limitées à la
révision du journal au moment de l’envoi, expirent au bout de 24 h et ne peuvent
être rejouées. Une notification ancienne ne crée pas silencieusement une nouvelle
opération. Le report suspend les envois externes, sans masquer les capteurs ni
l’alerte locale. Les destinations génériques et scripts restent des messages simples.
Le bouton de test envoie uniquement un message, sans action d’écriture.

## Saisons automatiques

Aucune création manuelle n’est nécessaire. Par défaut, la saison 2026/2027 couvre
le 1er juillet 2026 au 30 juin 2027. Le 1er juillet suivant, la nouvelle saison
est prise en compte automatiquement et le stock restant est conservé. Les saisies
rétroactives sont rattachées à la saison de leur date. Le premier mois est choisi
à la configuration du journal ; il reste fixe pour préserver l’historique.

La vue **Saisons** présente la période courante, la prochaine bascule, les saisons
passées et la date du premier allumage. Celle-ci est un repère de début de chauffe,
indépendant de la période comptable, et ne consomme aucun sac.

## Intégration aux dashboards

Chaque journal expose **20 capteurs, 3 alertes binaires et 2 boutons**, utilisables
dans les dashboards et les automatisations habituels de Home Assistant.
La vue **Dashboards → Ajouter à un dashboard** propose un assistant : choisir le
tableau de bord, la vue et, pour une vue Sections, une section existante ou nouvelle,
puis **Ajouter la carte**. La carte entière est ajoutée via les API Home Assistant ;
les autres cartes et options sont conservées. Les dashboards YAML, les vues générées
automatiquement et les vues Panneau déjà occupées ne sont pas modifiés. La configuration
est relue avant l’écriture ; si elle a changé depuis le choix, il faut revérifier la destination.
La copie YAML reste disponible pour les usages avancés.

La vue **Dashboards** propose aussi la **carte Mushroom prête à copier**, avec
le visuel de poêle fourni localement (`frontend/pellet-stove.jpg`). Installer Mushroom
depuis HACS pour cette variante ; la carte native reste disponible sans dépendance.
L’image est une illustration générique générée pour le projet, et ne représente pas
un modèle commercial précis. Aucune valeur d’exemple n’est utilisée par la carte distribuée.

La vue **Dashboards** affiche leurs identifiants réels, même après renommage,
et propose une carte YAML native prête à copier : modifier un dashboard, ajouter
une carte **Manuelle**, puis coller le YAML. Aucune carte personnalisée requise.
Les boutons de la carte demandent confirmation avant d’enregistrer un sac utilisé
ou un nettoyage. Les boutons et services directs restent utilisables dans les
automatisations sans confirmation interactive.

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
nettoyage, autonomie, date d’épuisement estimée, consommation récente et évolution
à date équivalente. Trois capteurs binaires : stock faible, nettoyage à prévoir
et autonomie courte. Deux boutons : ajouter un sac au poêle et enregistrer un nettoyage.
Les valeurs saisonnières corrigibles n’utilisent pas `total_increasing`.
Les boutons et capteurs fonctionnent dans les cartes natives Home Assistant.
La page Suivi Granulés fournit l’interface complète sans carte externe à installer.

## Autonomie et comparaisons

La fenêtre de consommation est configurable de 7 à 180 jours (30 par défaut).
Le rythme est calculé sur les jours calendaires de la fenêtre, ou depuis le
premier allumage connu lorsqu’il est plus récent. Il faut au moins 7 jours de
recul, 3 dates de consommation distinctes et une utilisation dans les 14 derniers
jours. Une estimation issue de peu de saisies est signalée comme limitée.
Le stock nul donne 0 jour ; une absence de consommation récente donne une
estimation inconnue, jamais une autonomie infinie. Il ne s’agit pas d’une
prévision météo ni d’une mesure du réservoir du poêle.

Les graphiques affichent 12 mois par saison. Les mois futurs sont distingués des
mois sans opération. Les coûts mensuels utilisent les mêmes allocations FIFO que
le journal, y compris pour les sacs achetés les saisons précédentes. Les prix
moyens sont pondérés par le nombre de sacs dont le prix est connu.

La comparaison à date équivalente s’arrête au même jour et au même mois de
chaque saison. Le 29 février devient le 28 février pour les années non bissextiles.
Un pourcentage n’est calculé que si la saison précédente existe avec une
consommation non nulle. Les exports CSV sont compatibles avec Excel (UTF-8,
séparateur point-virgule) ; les formules dans les champs texte sont neutralisées.

## Notifications prêtes à l’emploi

Les notifications automatiques sont actives par défaut dans Home Assistant :
stock faible (10 sacs), nettoyage (5 sacs ou 7 jours après le dernier nettoyage,
avec consommation depuis celui-ci), autonomie courte (7 jours si calculable).
Une seule notification regroupe les alertes du poêle. Elle est actualisée et
retirée quand les conditions disparaissent. Aucun rappel de nettoyage en période
d’inactivité après un nettoyage de fin de saison.

Une nouvelle condition déclenche une alerte après la saisie. Les rappels sont
vérifiés à l’heure configurée (08h par défaut), après le délai choisi (3 jours par
défaut ; 0 désactive les rappels). La déduplication est conservée après redémarrage.
Le retour à la normale est facultatif pour les destinations supplémentaires.

Dans **Paramètres et notifications**, choisir éventuellement un service notify,
une entité notify ou un script existant. Aucune destination privée n’est devinée.
Un script reçoit les variables `title`, `message`, `kind` (`alert`, `recovery`,
`test`) et `entry_id` : il peut relayer vers Telegram ou AWTRIX avec les actions
habituelles du propriétaire. Le bouton de test utilise la destination enregistrée.
Une erreur de livraison conserve l’opération du journal ; elle est affichée
séparément et la destination en échec est réessayée après un délai minimal d’une
heure lors de la prochaine vérification. L’événement `pellet_tracker_alert` est
également émis lors d’un changement des conditions pour des automatisations avancées.

## Actions natives

Toutes les actions nécessitent `entry_id`, sélectionnable dans l’éditeur visuel.
Elles sont réservées aux administrateurs et aux automatisations locales.

| Action | Fonction |
| --- | --- |
| `pellet_tracker.record` | Ajout : use, purchase, clean, start, adjust, loss ou note |
| `pellet_tracker.edit` | Modification partielle d’une opération existante |
| `pellet_tracker.cancel` | Annulation réversible par `operation_id` |
| `pellet_tracker.restore` | Rétablissement avec contrôle du stock |
| `pellet_tracker.export` | Retour du journal et des statistiques (réponse obligatoire) |
| `pellet_tracker.test_notification` | Envoi d’un test vers les destinations enregistrées |
| `pellet_tracker.check_notifications` | Vérification des alertes en respectant la déduplication |

Exemple de réapprovisionnement (remplacer `IDENTIFIANT_DU_JOURNAL`) :

```yaml
action: pellet_tracker.record
data:
  entry_id: IDENTIFIANT_DU_JOURNAL
  kind: purchase
  quantity: 20
  unit_price: 6.50
  comment: Livraison
  request_id: livraison-unique-001
```

`request_id` est facultatif : répéter une requête identique ne duplique pas la
saisie. Réutiliser l’identifiant avec un autre contenu est refusé. Pour les
boutons physiques, chaque nouvelle utilisation doit avoir un identifiant
nouveau, ou ne pas transmettre ce champ. `cleaned: true` ajoute atomiquement
un nettoyage avec une consommation ou un achat. Les dates sont facultatives
(jour courant par défaut). Une édition conserve les champs non fournis.
Les corrections peuvent être antidatées ; les écritures sont sérialisées.
Les paramètres de seuils et de notification sont aussi accessibles dans le
flux d’options de l’intégration. Devise et premier mois de saison restent fixés
par journal pour préserver la signification de l’historique.

## Développement et limites actuelles

```bash
python -m unittest discover -s tests -v
node --check custom_components/pellet_tracker/frontend/panel.js
node --test tests/test_frontend.cjs
```

Le moteur est indépendant de Home Assistant. Les tests couvrent les coûts FIFO,
les frontières de saisons, les prix inconnus, les pertes, les corrections,
la concurrence, la persistance et le rejet atomique d’un import invalide.

La page de gestion est française ; les entités et les formulaires de configuration
et d’options ont des traductions FR/EN. Cette bêta doit encore être évaluée en
usage quotidien avant une version stable. Les diagnostics excluent le contenu
du journal, les destinataires et les commentaires. Le fonctionnement est local ;
les destinations de notification choisies peuvent utiliser leurs propres services.

## English

Pellet Tracker is a local inventory ledger. Add purchases with optional unit
prices, log bag usage and cleaning, and compare heating seasons. FIFO costs
carry across seasons. Unknown prices remain unknown. Administration uses the
French built-in panel; configuration and entities are available in English.
Install the custom component, restart Home Assistant and add Pellet Tracker
from Devices & services. Monthly charts, same-date comparisons, guarded autonomy
estimates, native actions, quick buttons and configurable grouped notifications
are included. This beta is intended for a test instance first.

## License

MIT. See [LICENSE](LICENSE).

### Dynamic glass / Vitre dynamique

The Mushroom image combines heating state with the existing cleaning-due sensor.
Dirty glass means the configured maintenance threshold has been reached; recording
a cleaning resets the reminder and restores the clean image. Off images have an empty
firebox burn pot and keep pellets in the upper hopper. Unknown maintenance data keeps
the clean illustration while the alert badge remains unavailable. Replace previously
copied cards once to use the four-image configuration.

La vitre devient sale lorsque le capteur de nettoyage indique un entretien à prévoir,
selon vos seuils de sacs/jours. Enregistrer un nettoyage réinitialise le rappel et
rétablit la vitre propre. Le foyer est vide sur les deux images du poêle éteint.

### Image actions / Actions dans l’image

Click the pellet bag to record one bag consumed today; click the ash vacuum to record
a cleaning today. Both actions require confirmation. These actions only update the
journal and never control the stove or a vacuum device. The standalone HA button
entities remain available for automations and other cards.

Cliquez sur le sac pour ajouter un sac consommé aujourd’hui, ou sur l’aspirateur
pour enregistrer un nettoyage aujourd’hui. Une confirmation est demandée. Les
anciens boutons sous la carte Mushroom sont remplacés par ces objets cliquables.

The Mushroom header preserves the original 3:2 photograph framing. Dynamic stock
and maintenance badges, plus the tracker home shortcut, are positioned directly on
the image alongside the existing bag and vacuum actions.
