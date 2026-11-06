# Convoy3D — Conception et simulation de convoyage industriel 3D

Logiciel web **100 % HTML / CSS / JavaScript** (Three.js r158 fourni localement dans `vendor/`).
Aucune installation, aucun serveur, aucun Python : **ouvrez simplement `index.html`** dans un navigateur récent (Chrome, Edge, Firefox).

## Fonctionnalités

- **Environnement 3D** : perspective / orthographique, rotation, zoom vers le curseur, déplacement, vues dessus / face / côté / iso, grille cotée, repère XYZ, zone de travail réglable, cotes et hauteurs.
- **Bibliothèque** : convoyeurs droits (rouleaux, bande, tapis modulaire, chaîne, rouleaux libres), virages 45° / 90° / 180° / personnalisables (rouleaux coniques ou bande, réellement courbes), montants / descendants / pente réglable / changement de hauteur / spirale hélicoïdale, transfert 90°, table tournante, élévateur, descente gravitaire, butée, guide, séparateur, zone d'accumulation (ZPA), poste de préparation, table, trieur, entrées (générateurs), sorties, obstacles.
- **Personnalisation complète** : longueur, largeurs, hauteur, rotation, pente en ° ou %, hauteur d'extrémité, vitesse, sens, technologie, couleur, Ø / pas / nombre de rouleaux, guides, rayon, etc.
- **Connexions automatiques** : accrochage magnétique des ports (position, cap, hauteur), ajout chaîné à la sortie sélectionnée, jonctions latérales (fusion de flux), ports colorés (raccordé / libre / écart de hauteur).
- **Simulation** : cartons personnalisables (formats prédéfinis + formats utilisateur), suivi des virages et des pentes, transferts entre modules, espacement, accumulation, butées, séparateurs, obstacles, capacité des élévateurs / tables, tri par règles (`1 : format=Petit`, `2 : poids>10`…), détection de collisions. Lecture / pause / arrêt / retour au début, ×1 ×2 ×5 ×10, statistiques (en circulation, traités, débit, temps de parcours et d'attente, blocages, saturation), carte de saturation, coloration des flux.
- **Outils** : sélection multiple, rectangle, déplacer, rotation, dupliquer, copier / coller, grouper, mesurer, annuler / rétablir.
- **Analyse** : continuité, hauteurs de raccordement, pentes / technologie, largeurs, virages, pas de spirale, interférences, longueurs, débits théoriques et goulots.
- **Sauvegarde / export** : projets multiples en stockage local, import / export JSON (dimensions, positions, connexions, configurations), capture PNG, vue de dessus PNG, plan 2D imprimable (SVG), nomenclature (tableau, CSV, impression).

## Organisation du code

| Dossier | Rôle |
|---|---|
| `js/core/` | utilitaires, géométrie des trajectoires (lignes, arcs, hélices) |
| `js/model/` | catalogue des types, projet + historique, réseau de connexions, analyse |
| `js/view/` | maillages 3D des modules, zone de conception (caméras, sélection, accrochage) |
| `js/sim/` | moteur de simulation des cartons |
| `js/io/` | stockage local, JSON, plan 2D, nomenclature |
| `js/ui/` | icônes, interface (menus, panneaux, dialogues) |
| `js/app.js` | contrôleur principal, raccourcis, projet d'exemple |

Pour ajouter un type de module : déclarer ses paramètres et sa trajectoire dans `js/model/types.js`, puis son maillage dans `js/view/geometry.js`.
