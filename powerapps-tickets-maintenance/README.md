# Power Apps – Tickets de maintenance

Une application canvas pour créer, suivre et clôturer des tickets de maintenance.

## Contenu du dossier

| Fichier | Rôle |
|---|---|
| `TicketsMaintenance.xlsx` | Source de données : un tableau Excel `TicketsMaintenance` avec 8 tickets d'exemple et une feuille `Listes` qui contient les valeurs possibles |
| `1-Ecran-Accueil.pa.yaml` | Écran **liste** : 4 indicateurs, recherche, filtres par statut et priorité, liste des tickets avec couleurs et alerte « En retard » |
| `2-Ecran-Ticket.pa.yaml` | Écran **création / modification** : formulaire complet, bouton « Je prends en charge », date de clôture remplie automatiquement |

## Installation (environ 5 minutes)

### 1. Déposer la source de données
Déposez `TicketsMaintenance.xlsx` dans **OneDrive Entreprise** (ou dans une bibliothèque SharePoint).

### 2. Créer l'application
1. Allez sur [make.powerapps.com](https://make.powerapps.com), puis **Créer** → **Application vierge** → **Application canevas vierge**.
2. Choisissez le format **Tablette**, puis cliquez sur **Créer**.
3. Ouvrez le volet **Données** → **Ajouter des données** → **Excel Online (Entreprise)**. Sélectionnez le fichier, puis cochez le tableau **TicketsMaintenance**.
   > Power Apps ajoute une colonne `__PowerAppsId__` au fichier. C'est normal.

### 3. Coller les écrans
Faites ces étapes pour chaque fichier `.pa.yaml`, en commençant par le 1 :
1. Ouvrez le fichier dans un éditeur de texte et copiez **tout** son contenu.
2. Dans Power Apps Studio, faites un clic droit dans l'**arborescence**, à gauche (sur `App` ou sur un écran), puis choisissez **Coller le code**.

Les erreurs de formule qui apparaissent après le premier collage disparaissent quand le second écran est collé, car les deux écrans se référencent mutuellement.

**Si « Coller le code » refuse un écran entier :** créez un écran vide et renommez-le `scrAccueil` (ou `scrTicket`). Copiez ensuite les propriétés `Fill` et `OnVisible` de l'écran. Collez enfin les contrôles (le bloc sous `Children:`) dans cet écran.

### 4. Finaliser
1. Supprimez l'écran vide `Screen1`. Faites ensuite glisser `scrAccueil` en haut de l'arborescence pour qu'il soit l'écran de démarrage.
2. **Enregistrez**, puis **publiez** et partagez l'application avec vos équipes. Partagez aussi le fichier Excel avec elles.

## Fonctionnement

- **Statuts :** Ouvert → En cours → En attente → Résolu → Clôturé
- **Priorités :** Basse, Moyenne, Haute, Urgente (une couleur par niveau)
- Le numéro de ticket est attribué automatiquement. La date de création, le demandeur (utilisateur connecté) et une échéance à J+7 sont remplis par défaut.
- La date de clôture est remplie automatiquement quand le statut passe à « Résolu » ou « Clôturé ».

## Aller plus loin

- **Plus de 500 tickets ou beaucoup d'utilisateurs :** passez à une liste SharePoint ou à Dataverse. Gardez les mêmes noms de colonnes et nommez la source `TicketsMaintenance`. Les colonnes Statut, Priorité et Catégorie doivent être de type **texte** pour que les formules fonctionnent sans modification.
- **Notifications par e-mail :** ajoutez un flux Power Automate « Quand une ligne est ajoutée » qui écrit à l'équipe maintenance.
- **Récupérer un fichier `.msapp` :** dans Studio, **Fichier** → **Enregistrer sous** → **Cet ordinateur**. Ce fichier pourra ensuite être réimporté directement (**Ouvrir** → **Parcourir**).
