# Simulation 3D de l'automatisation (HTML seul, sans Python)

Ouvrez simplement `index.html` dans un navigateur récent (Chrome, Edge, Firefox).
Une connexion Internet est nécessaire au premier chargement (bibliothèque 3D Three.js chargée depuis unpkg.com).

## Flux simulé (repris du plan)
1. **Formeuses automatiques** : création de cartons 600×400 et 400×300
2. **Étiqueteuse de routage** : code-barres sur le carton vide
3. **5 stations GtP (PS01 à PS05)** : picking par l'opérateur (affectation à la station la moins chargée)
4. **Contrôle poids W03** : les colis en erreur deviennent rouges et partent vers la rampe *Erreur*
5. **Insertion bon de livraison**, puis **fermeture automatique** (ligne 600×400 ou 400×300)
6. **Imprimante étiquette transport**, **scanner de tri**
7. **Palettisation** : 6 rampes + 1 rampe erreur, palettes de 24 colis

## Commandes
- Pause / réinitialiser, vitesse de simulation, cadence formeuse, temps de picking, taux d'erreur
- Caméras prédéfinies, suivi d'un colis (clic sur un colis), étiquettes, rotation auto
- Souris : clic gauche = rotation, clic droit = déplacement, molette = zoom
