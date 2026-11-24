# Gestion des tickets de maintenance – Guide d'installation

Application Power Apps Canvas connectée à la liste Microsoft Lists **`Ticket dépannage`**.
Aucune colonne n'est ajoutée : l'application utilise uniquement les colonnes existantes.

## 1. Contenu

| Fichier | Écran | Rôle |
|---|---|---|
| `1-scrAccueil.pa.yaml` | `scrAccueil` | Tableau de bord : 5 indicateurs, 4 graphiques, tickets prioritaires |
| `2-scrListe.pa.yaml` | `scrListe` | Tableau des tickets : recherche, filtres statut / priorité, 4 tris |
| `3-scrCreer.pa.yaml` | `scrCreer` | Création d'un ticket (accueille le formulaire `Form1`) |
| `4-scrDetail.pa.yaml` | `scrDetail` | Détail, modification, passage en cours, clôture, réouverture |
| `generer_application.py` | – | Régénère les 4 fichiers (`python3 generer_application.py <dossier>`) |

Chaque écran contient la navigation : barre latérale bleu foncé sur ordinateur (réduite en icônes sur tablette),
barre en bas sur téléphone.

## 2. Correspondance avec la liste

| Dans l'application | Colonne Microsoft Lists | Valeurs |
|---|---|---|
| N° du ticket | `ID` | automatique |
| Demandeur | `Créé par` (`Author`) | automatique |
| Date de création | `Créé` (`Created`) | automatique |
| Description | `Description` | (le `Titre` est utilisé s'il est rempli) |
| Priorité | `Statut Urgence` | `High - …` = Haute (rouge), `Medium - …` = Moyenne (orange), `Low - …` = Basse (vert) |
| Statut | `Ticket clôturer` | `Non` ou vide = Non démarré (gris), `En cours` (orange), `Oui` = Clôturé (vert) |
| Responsable | `Prise en charge` | personne |
| Suivi / résolution | `Résolution de l'intervention` | 255 caractères max. |
| Heure de clôture | `Heure cloture du ticket` | `hh:mm`, remplie à la clôture |
| Date de clôture | `Modifié` (`Modified`) du ticket clôturé | approximation : pas de colonne dédiée |

Les listes de choix (priorité, statut, secteur, cellule, équipement, responsable) sont lues
directement dans la liste avec `Choices(...)`.

## 3. Installation (15 minutes)

### 3.1 Préparer l'application
1. Ouvrez votre application dans Power Apps Studio.
2. **Paramètres → Général → Limite de lignes de données** : `2000`.
3. Vérifiez que la source `Ticket dépannage` est bien connectée (volet **Données**).

### 3.2 Mettre Form1 de côté
Le formulaire `Form1` (qui enregistre aussi les photos) est réutilisé.
S'il se trouve dans un écran que vous allez supprimer, coupez-le (**Ctrl+X**) et collez-le provisoirement
sur un autre écran.

### 3.3 Coller les 4 écrans
Pour chaque fichier, dans l'ordre 1 → 4 :
1. Ouvrez le fichier, copiez **tout** son contenu (il commence par `Screens:`).
2. Arborescence → clic droit → **Coller le code**.

Des erreurs peuvent s'afficher tant que les 4 écrans ne sont pas collés (ils se référencent entre eux).

### 3.4 Installer le formulaire de création
1. Coupez `Form1` et collez-le dans le conteneur **`crFormulaire`** de `scrCreer`.
2. Réglez `Form1` :

| Propriété | Valeur |
|---|---|
| DataSource | `'Ticket dépannage'` |
| DefaultMode | `FormMode.New` |
| Item | (vide) |
| AlignInContainer | `AlignInContainer.Stretch` |
| FillPortions | `1` |
| OnSuccess | `Set(varNumTicket; Form1.LastSubmit.ID);; Set(varMsgCreation; true);; ResetForm(Form1);; NewForm(Form1);; ClearCollect(colTickets; 'Ticket dépannage')` |
| OnFailure | `Notify("Erreur : " & Form1.Error; NotificationType.Error)` |

Champs obligatoires : ceux marqués obligatoires dans la liste (ou propriété `Required` des cartes).
Le statut initial n'est pas forcé : la valeur par défaut de la colonne `Ticket clôturer` s'applique.

### 3.5 Écran de démarrage
**App → StartScreen** : `scrAccueil`.

### 3.6 Nettoyage
Une fois l'application validée (F5), supprimez les anciens écrans
(`Liste Ticket`, `Nouveau Ticket`, `scrTickets`, `scrNouveauTicket`, `scrTableauBord`).

## 4. Fonctionnement

### Tableau de bord (`scrAccueil`)
* `OnVisible` déclenche le bouton **Actualiser**, qui recharge `colTickets` et calcule
  `colStatut`, `colPriorite`, `colMois` et les anneaux (`colDonutStatut`, `colDonutPriorite`).
* Indicateurs : total, non démarrés, en cours, clôturés, prioritaires ouverts.
* Graphiques (SVG / HTML générés en Power Fx) : anneau par statut, anneau par priorité,
  tickets créés par mois (6 mois), clôturés vs encore ouverts par mois.
* Liste des 5 tickets « High » non clôturés ; un clic ouvre le détail.

### Liste (`scrListe`)
* Tri par défaut : **priorité (haute en tête) puis date (récent en premier)**.
* Autres tris : date récente, date ancienne, priorité.
* Filtres statut et priorité, recherche (n°, description, équipement, secteur, demandeur, responsable).
* Colonnes complètes sur grand écran ; demandeur, responsable et date de clôture masqués sur tablette ;
  affichage en cartes sur téléphone. Un clic ouvre `scrDetail`.

### Création (`scrCreer`)
* Bouton **Créer le ticket** grisé tant que les champs obligatoires ne sont pas remplis (`Form1.Valid`).
* Bandeau vert de confirmation avec le n° du ticket et un lien « Voir le ticket ».
* Colonne d'aide (légende des priorités, conseils, 5 derniers tickets de l'utilisateur) sur grand écran.

### Détail et suivi (`scrDetail`)
* Informations complètes, photos (clic = ouverture en grand), plan B.
* Modification : description, priorité, statut, responsable (recherche dans l'annuaire), informations de suivi.
* Actions rapides : **Passer en cours** (vous assigne si personne n'est responsable), **Clôturer**
  (exige une résolution, remplit l'heure de clôture), **Rouvrir**, **M'assigner**.
* Chaque action écrit dans Microsoft Lists avec `Patch`, vérifie `Errors(...)`, recharge `colTickets`
  et affiche une notification.

## 5. Performances et délégation
Les écrans travaillent sur la collection `colTickets` (copie de la liste rechargée à chaque ouverture
d'écran et après chaque modification). Cela permet des tris et calculs non délégables (priorité, graphiques)
sans avertissement, jusqu'à **2000 tickets** (limite de lignes de données). Au-delà, il faudra filtrer la
collection par période (par ex. les 12 derniers mois) dans le bouton **Actualiser** et `scrListe.OnVisible`.

## 6. Limites connues
* **Date de clôture** : sans colonne dédiée, elle est déduite de la date de dernière modification du ticket
  clôturé ; elle change si le ticket est modifié après sa clôture.
* **Suivi** : `Résolution de l'intervention` est limitée à 255 caractères et n'a pas d'historique.
* Pas de fichier `.msapp` : seul Power Apps Studio produit ce format. Après installation,
  **Fichier → Enregistrer sous → Cet ordinateur** génère votre `.msapp`.
