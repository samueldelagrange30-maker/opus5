# opus5
## Tickets de maintenance

Site statique (HTML, CSS, JavaScript) pour créer des tickets de maintenance, les suivre et y répondre.

Ouvrir `index.html` dans un navigateur suffit : aucun serveur ni dépendance.

- **Création** : titre, catégorie, priorité, lieu, description, demandeur.
- **Liste** : compteurs par statut, recherche, filtres (statut, priorité) et tri.
- **Suivi** : fil chronologique des réponses (demandeur / technicien) et des changements de statut, priorité et assignation.
- **Gestion** : statut (Ouvert, En cours, En attente, Résolu, Fermé), priorité, technicien assigné, suppression.

Les données sont stockées dans le `localStorage` du navigateur : chaque navigateur a ses propres tickets.
Les boutons Exporter / Importer (pied de page) permettent de sauvegarder ou transférer les tickets en JSON.
