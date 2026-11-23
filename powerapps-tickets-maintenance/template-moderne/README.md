# Template moderne – Tickets de maintenance

Deux écrans à coller dans l'application existante (source : liste SharePoint `Ticket dépannage`).

| Fichier | Écran | Contenu |
|---|---|---|
| `1-Ecran-Tickets.pa.yaml` | `scrTickets` | En-tête et navigation, 4 indicateurs cliquables (filtre par statut), recherche, filtres urgence et secteur, liste en cartes, panneau de détail avec photos |
| `2-Ecran-TableauDeBord.pa.yaml` | `scrTableauBord` | En-tête, 4 indicateurs (total, ouverts, en cours, taux de clôture), 4 graphiques en barres (statut, urgence, secteur, équipements) |

Le bouton « Nouveau ticket » ouvre l'écran existant `'Nouveau Ticket'` (formulaire `Form1`).

## Import
1. Copier tout le contenu d'un fichier (il commence par `Screens:`).
2. Dans Power Apps Studio, arborescence → clic droit → **Coller le code**.
3. Recommencer avec le second fichier.
4. Sélectionner **App** → **StartScreen** : `scrTickets`.

Les formules sont au format invariant (virgules) : Studio les convertit automatiquement en `;`.

## Colonnes utilisées
Title, Description, Created, Author, ID, `Date de la demande`, `Heure ticket`, `Statut Urgence` (choix),
`Secteur demandeur` (choix), `Dans quelle cellule devons nous intervenir ?` (choix),
`Intervention sur équipement` (choix), `Plan B en attendant l'intervention`, `Prise en charge` (personne),
`Ticket clôturer` (choix Oui / Non / En cours), `Heure cloture du ticket`, `Résolution de l'intervention`,
`Photo 1`, `Photo 2`, `Photo 3` (image).

`generer_template.py` régénère les deux fichiers (`python3 generer_template.py <dossier>`).
