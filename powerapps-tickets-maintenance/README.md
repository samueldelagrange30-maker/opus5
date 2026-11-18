# Power Apps – Tickets de maintenance (Microsoft Lists)

Une application canvas pour créer, suivre et clôturer des tickets de maintenance. Les données sont stockées dans une **liste Microsoft Lists / SharePoint**.

## Contenu du dossier

| Fichier | Rôle |
|---|---|
| `Creer-Liste-TicketsMaintenance.ps1` | Crée la liste `TicketsMaintenance` avec ses colonnes, des badges de couleur dans Lists et 6 tickets d'exemple |
| `1-Ecran-Accueil.pa.yaml` | Écran **liste** : 4 indicateurs, recherche, filtres (vue, statut, urgence), liste des tickets avec alerte « En retard » |
| `2-Ecran-Ticket.pa.yaml` | Écran **création / modification** : formulaire, choix d'un technicien dans l'annuaire, bouton « Je prends en charge » |

## 1. Créer la liste

### Option A – Script (recommandé)
```powershell
Install-Module PnP.PowerShell -Scope CurrentUser
# Une seule fois par tenant, si vous n'avez pas encore d'application PnP (notez le ClientId affiché) :
Register-PnPEntraIDAppForInteractiveLogin -ApplicationName "PnP PowerShell" -Tenant "<tenant>.onmicrosoft.com"

.\Creer-Liste-TicketsMaintenance.ps1 -SiteUrl "https://<tenant>.sharepoint.com/sites/<site>" -ClientId "<ClientId>"
```
Ajoutez `-SansExemples` si vous ne voulez pas de tickets d'exemple.

### Option B – À la main dans Microsoft Lists
Créez une **liste vide** nommée exactement `TicketsMaintenance`, puis ajoutez les colonnes suivantes. Respectez les noms **à la lettre** : sans accent, sans espace.

| Nom de la colonne | Type | Paramètres |
|---|---|---|
| *(Titre, existe déjà)* | Une ligne de texte | – |
| `Description` | Plusieurs lignes de texte | Texte brut |
| `Equipement` | Une ligne de texte | Obligatoire |
| `Lieu` | Une ligne de texte | – |
| `Domaine` | Choix | Mécanique, Électricité, Plomberie, CVC, Informatique, Bâtiment, Préventif, Autre (défaut : Mécanique) |
| `Urgence` | Choix | Basse, Moyenne, Haute, Urgente (défaut : Moyenne) |
| `Statut` | Choix | Ouvert, En cours, En attente, Résolu, Clôturé (défaut : Ouvert) |
| `Technicien` | Personne | Une seule personne |
| `DateLimite` | Date | Sans l'heure |
| `DateCloture` | Date | Sans l'heure |
| `Intervention` | Plusieurs lignes de texte | Texte brut |

Les colonnes **Demandeur** et **Date de création** ne sont pas à créer. L'application utilise les colonnes intégrées *Créé par* et *Créé*.

## 2. Créer l'application
1. Allez sur [make.powerapps.com](https://make.powerapps.com), puis **Créer** → **Application vierge** → **Application canevas vierge**, au format **Tablette**.
2. Ouvrez le volet **Données** → **Ajouter des données** → **SharePoint**. Choisissez votre site, puis la liste **TicketsMaintenance**.
3. Pour chaque fichier `.pa.yaml`, en commençant par le 1 :
   1. Copiez tout son contenu.
   2. Dans Power Apps Studio, faites un clic droit dans l'**arborescence**, puis choisissez **Coller le code**.

   Les erreurs qui apparaissent après le premier collage disparaissent quand le second écran est collé.
4. Supprimez l'écran vide `Screen1`. Placez ensuite `scrAccueil` en premier dans l'arborescence pour qu'il soit l'écran de démarrage.
5. Ouvrez **Paramètres** → **Général** et réglez la **limite de lignes de données** sur **2000**, pour que les compteurs soient justes.
6. **Enregistrez**, **publiez**, puis partagez l'application. Donnez aussi aux utilisateurs le droit de **modification** sur la liste, ou faites-les membres du site.

**Si « Coller le code » refuse un écran entier :** créez un écran vide et nommez-le `scrAccueil` (ou `scrTicket`). Copiez ensuite les propriétés `Fill` et `OnVisible` de l'écran. Collez enfin le bloc qui se trouve sous `Children:`.

**Pour obtenir un fichier `.msapp` :** dans Studio, **Fichier** → **Enregistrer sous** → **Cet ordinateur**. Ce fichier pourra ensuite être réimporté directement (**Ouvrir** → **Parcourir**).

## Fonctionnement
- **Statuts :** Ouvert → En cours → En attente → Résolu → Clôturé
- **Urgences :** Basse, Moyenne, Haute, Urgente (une couleur par niveau)
- Le numéro de ticket est l'**ID** de la liste. Le demandeur et la date de création sont remplis automatiquement par SharePoint.
- **« Je prends en charge »** assigne le ticket à l'utilisateur connecté et le passe « En cours ».
- La **date de clôture** est remplie automatiquement quand le statut passe à « Résolu » ou « Clôturé ».
- La vue **Mes tickets** affiche les tickets qui me sont assignés. La vue **Mes demandes** affiche ceux que j'ai créés.
- La recherche porte sur le **début** du titre, de l'équipement ou du lieu. Elle reste ainsi délégable à SharePoint, même avec beaucoup de tickets.

## Aller plus loin
- **Notifications :** créez un flux Power Automate « Lorsqu'un élément est créé » pour prévenir l'équipe maintenance, et « Lorsqu'un élément est modifié » pour prévenir le demandeur quand son ticket est résolu.
- **Photos :** les pièces jointes de la liste sont accessibles avec un contrôle *Formulaire d'édition* ajouté sur l'écran du ticket.
