# Centre de support : app Power Apps de gestion de tickets

Application canevas Power Apps **moderne** (contrôles modernes Fluent 2, mise en page responsive par conteneurs) pour **créer, suivre et résoudre des tickets** stockés dans **Microsoft Lists / SharePoint**.

## Fonctionnalités

| Pour tous les utilisateurs | Pour les agents du support |
|---|---|
| Créer un ticket (titre, catégorie, priorité, description, échéance) | Voir **tous** les tickets, filtrer « Assignés à moi » |
| Suivre ses demandes (indicateurs, recherche, filtres statut / priorité) | **M'assigner** ou assigner à un collègue |
| Échanger avec le support dans le **fil de discussion** du ticket | Changer le statut (Nouveau / En cours / En attente) |
| Une réponse sur un ticket « En attente » le relance automatiquement | Ajouter des **notes internes** invisibles du demandeur |
| **Confirmer** la résolution (ticket fermé) ou **rouvrir** le ticket | Saisir la solution et **marquer comme résolu** |

Chaque action (prise en charge, assignation, changement de statut, résolution, réouverture) est tracée dans le fil de discussion, ce qui donne un historique complet du ticket.

Cycle de vie d'un ticket :

```
Nouveau ──► En cours ◄──► En attente
               │
               ▼
            Résolu ──► Fermé  (confirmé par le demandeur)
               │
               └──► En cours  (rouvert par le demandeur)
```

## Contenu du dossier

```
helpdesk-powerapps/
├── liste/
│   ├── Creer-Listes.ps1           # crée les 2 listes + colonnes + index (PnP PowerShell)
│   └── format-statut.json         # mise en forme « pastilles » de la colonne Statut dans Lists
└── app/
    ├── formules/
    │   ├── App.Formulas.en-US.fx  # formules nommées, Studio en anglais (séparateur ,)
    │   └── App.Formulas.fr-FR.fx  # formules nommées, Studio en français (séparateur ;)
    └── ecrans/
        ├── scrAccueil.pa.yaml     # tableau de bord + liste des tickets
        ├── scrFormTicket.pa.yaml  # création / modification
        └── scrDetailTicket.pa.yaml# détail, discussion, assignation, résolution
```

---

## 1. Créer les listes Microsoft Lists

### Option A : script (recommandé)

```bash
pwsh ./liste/Creer-Listes.ps1 -SiteUrl "https://contoso.sharepoint.com/sites/Support" -ClientId "<id-app-entra-pnp>"
```

Pas encore d'application Entra pour PnP ? Créez-la une fois avec :

```bash
pwsh -c "Register-PnPEntraIDAppForInteractiveLogin -ApplicationName 'PnP Helpdesk' -Tenant contoso.onmicrosoft.com"
```

### Option B : création manuelle dans Microsoft Lists

> ⚠️ Respectez **exactement** les noms de colonnes ci-dessous (sans accents) : l'app y fait référence.

**Liste `Tickets`**

| Colonne | Type | Valeurs / remarques |
|---|---|---|
| Title *(existante)* | Une ligne de texte | Titre du ticket |
| Details | Plusieurs lignes de texte (texte brut) | Description |
| Categorie | Choix | Matériel, Logiciel, Réseau, Accès / Compte, Messagerie, Autre (défaut : Autre) |
| Priorite | Choix | Basse, Normale, Haute, Critique (défaut : Normale) |
| Statut | Choix | Nouveau, En cours, En attente, Résolu, Fermé (défaut : Nouveau) |
| Demandeur | Personne | |
| AssigneA | Personne | |
| Echeance | Date (sans heure) | |
| DateResolution | Date et heure | |
| Resolution | Plusieurs lignes de texte (texte brut) | Solution apportée |

**Liste `CommentairesTickets`**

| Colonne | Type | Remarques |
|---|---|---|
| Title *(existante)* | Une ligne de texte | Rempli automatiquement avec le n° de ticket |
| TicketId | Nombre (0 décimale) | ID du ticket parent, **à indexer** |
| Message | Plusieurs lignes de texte (texte brut) | |
| Interne | Oui/Non (défaut : Non) | Note visible des agents uniquement |

Indexez aussi `Statut`, `Priorite`, `Demandeur` et `AssigneA` dans *Paramètres de la liste > Colonnes indexées*.

---

## 2. Créer l'application dans Power Apps

1. **make.powerapps.com** > **+ Créer** > **Application vide** > **Application canevas vide**, format **Tablette**.
2. **Paramètres** > **Mises à jour** : vérifiez que **Contrôles et thèmes modernes** est activé.
3. **Paramètres** > **Affichage** : désactivez **Mettre à l'échelle** *(Scale to fit)* pour que la mise en page responsive fonctionne.
4. **Données** > **Ajouter des données** > **SharePoint** > votre site > cochez **Tickets** et **CommentairesTickets**.
5. Sélectionnez l'objet **App** dans l'arborescence, propriété **Formulas**, puis collez le contenu de :
   - `app/formules/App.Formulas.fr-FR.fx` si Power Apps Studio est en **français** (séparateur `;`),
   - `app/formules/App.Formulas.en-US.fx` s'il est en **anglais** (séparateur `,`).
6. **Remplacez les adresses de la formule `Agents`** par celles de votre équipe support.
7. Pour chaque fichier de `app/ecrans/` : ouvrez-le, copiez **tout** son contenu, puis dans l'arborescence faites **clic droit > Coller** *(Paste code)*. L'écran est créé avec tous ses contrôles.
   Collez-les dans l'ordre `scrAccueil`, `scrFormTicket`, `scrDetailTicket`.
8. Supprimez l'écran vide `Screen1` et vérifiez que `scrAccueil` est le premier écran (ou réglez `App.StartScreen = scrAccueil`).
9. **Enregistrez**, **Publiez**, puis partagez l'app (les utilisateurs ont besoin d'un accès **Modification** aux deux listes).

> Le code YAML des écrans utilise toujours la syntaxe invariante (anglaise) : Power Apps le convertit automatiquement si votre Studio est en français.

### En cas d'erreur au collage

- **Version de contrôle** (ex. `Button@0.0.45`) : Power Apps met régulièrement à jour les contrôles modernes. Si le collage refuse une version, supprimez la partie `@x.y.z` du `Control:` concerné ou remplacez-la par la version proposée par votre Studio (insérez un contrôle du même type puis faites *Afficher le code* pour la connaître).
- **`'Titre'` au lieu de `Title`** : sur un site SharePoint en français, Studio peut afficher les noms d'affichage (`Titre`, `Créé`, `Créé par`). Les formules utilisent les noms internes (`Title`, `Created`, `Author`), que Power Apps accepte et convertit.

---

## 3. Personnalisation

| Besoin | Où |
|---|---|
| Liste des agents | Formule nommée `Agents` (ou remplacez `EstAgent` par un test d'appartenance à un groupe Entra via le connecteur Office 365 Groupes) |
| Couleurs | Formules `Couleurs`, `CouleursStatut`, `CouleursPriorite` |
| Catégories / priorités | Formules `ListeCategories` / `ListePriorites` **et** les choix des colonnes de la liste |
| Seuil d'affichage compact (mobile) | Formule `Compact` (largeur < 1000 px) |

## 4. Notifications par e-mail (Power Automate, facultatif)

Deux flux automatisés suffisent :

1. **Nouveau ticket → équipe support**
   Déclencheur *SharePoint : Lors de la création d'un élément* (liste `Tickets`) > *Office 365 Outlook : Envoyer un e-mail (V2)* à la boîte du support, avec `Title`, `Priorite`, `Demandeur DisplayName` et un lien vers l'app.
2. **Ticket résolu → demandeur**
   Déclencheur *Lors de la modification d'un élément* > condition `Statut Value` = `Résolu` **et** `DateResolution` modifiée récemment > e-mail au `Demandeur Email` contenant la `Resolution` et une invitation à confirmer ou rouvrir dans l'app.

Variante : déclencheur *Lors de la création d'un élément* sur `CommentairesTickets` (avec `Interne` = Non) pour prévenir le demandeur ou l'agent assigné à chaque nouveau message.

## 5. Limites connues

- Les **indicateurs** du tableau de bord utilisent `CountRows(Filter(...))`, qui n'est pas délégable vers SharePoint : au-delà de 2 000 tickets (limite à régler dans *Paramètres > Général > Limite de lignes de données*), les compteurs sont approximatifs. La **liste** des tickets, elle, reste entièrement délégable (filtres sur choix, personnes et `StartsWith`).
- La recherche porte sur le **début** du titre (`StartsWith`), seul type de recherche texte délégable sur SharePoint.
- La visibilité « mes tickets uniquement » est appliquée par l'app. Pour une confidentialité stricte, restreignez aussi les permissions SharePoint (par exemple *Paramètres avancés > Accès en lecture : éléments créés par l'utilisateur* ; les agents doivent alors avoir des droits de gestion sur la liste).
