# Application Power Apps : Gestion des tickets

Application canevas avec trois écrans :

| Écran | Rôle |
|---|---|
| `scrListe` | Liste des tickets : recherche par titre, filtre par statut (Tous / Ouvert / Clôturé), badges de priorité et de statut |
| `scrNouveau` | Création d'un ticket : titre, description, priorité, catégorie. Le demandeur est rempli automatiquement |
| `scrDetail` | Détail d'un ticket : clôture avec commentaire de résolution (date et auteur enregistrés), réouverture possible |

Les données sont stockées dans une **liste SharePoint `Tickets`**.

---

## Étape 1 : créer la liste SharePoint `Tickets`

**Option A, à la main** (sur votre site SharePoint, *Nouveau > Liste > Liste vide*, nommée `Tickets`).
Ajoutez ces colonnes **en respectant exactement les noms** (sans accents) :

| Colonne | Type |
|---|---|
| `Title` (existe déjà, « Titre ») | Une ligne de texte |
| `Description` | Plusieurs lignes de texte (texte brut) |
| `Priorite` | Une ligne de texte |
| `Categorie` | Une ligne de texte |
| `Statut` | Une ligne de texte |
| `Demandeur` | Une ligne de texte |
| `DemandeurEmail` | Une ligne de texte |
| `DateCloture` | Date et heure (avec l'heure) |
| `CloturePar` | Une ligne de texte |
| `CommentaireCloture` | Plusieurs lignes de texte (texte brut) |

**Option B, par script** : `sharepoint/Create-TicketsList.ps1` (PnP.PowerShell).

```powershell
.\sharepoint\Create-TicketsList.ps1 -SiteUrl "https://VOTRE_TENANT.sharepoint.com/sites/VOTRE_SITE" -ClientId "VOTRE_CLIENT_ID"
```

## Étape 2 : créer l'application et connecter la liste

1. Sur [make.powerapps.com](https://make.powerapps.com) : **Créer > Application vide > Application canevas vide**, format **Tablette**.
2. Menu **Données > Ajouter des données > SharePoint**, choisissez votre site puis la liste **Tickets**.
3. Supprimez l'écran `Screen1` après avoir collé les autres écrans (étape 3).

## Étape 3 : coller les écrans (YAML)

Pour chaque fichier du dossier `Src/` :

1. Ouvrez le fichier (`scrListe.pa.yaml`, `scrNouveau.pa.yaml`, `scrDetail.pa.yaml`) et copiez **tout** son contenu.
2. Dans Power Apps Studio, panneau **Arborescence** : clic droit sur un écran existant (ou sur **App**), puis **Coller > Coller le code**.
   *(Selon votre version de Studio : sélectionnez l'arborescence puis `Ctrl+V`.)*
3. Collez dans l'ordre : `scrListe`, puis `scrNouveau`, puis `scrDetail`.

Puis réglez l'objet **App** (voir `Src/App.pa.yaml`) :
- `StartScreen` : `scrListe`
- `OnStart` : `Set(varTicket, Blank())`

Enfin **Fichier > Enregistrer**, puis **Publier**.

> Si une formule apparaît en rouge juste après le collage, c'est généralement parce que la liste `Tickets`
> n'est pas encore connectée ou qu'une colonne n'a pas le bon nom : vérifiez l'étape 1.

## Fonctionnement

- **Création** : `Patch(Tickets, Defaults(Tickets), {...})` avec statut `Ouvert`, demandeur = utilisateur connecté.
- **Clôture** : `Patch` du ticket avec `Statut = "Clôturé"`, `DateCloture = Now()`, `CloturePar`, `CommentaireCloture`.
- **Liste** : `Filter` + `StartsWith` + `SortByColumns` sur l'ID, tout est délégable à SharePoint (pas de limite des 500 lignes).
- Numéro affiché : `TCK-0001`, `TCK-0002`… (basé sur l'ID SharePoint).

## Personnaliser

- Priorités : `ddPriorite.Items` dans `scrNouveau`.
- Catégories : `ddCategorie.Items` dans `scrNouveau`.
- Couleur principale : `RGBA(0, 95, 184, 1)` dans les en-têtes et les boutons.
