// =====================================================================
//  Centre de support : formules nommées (App > Formulas)
//  Syntaxe en-US : séparateur d'arguments "," et chaînage ";"
// =====================================================================

// ---- Configuration : adresses e-mail des agents du support ----------
// Les agents voient tous les tickets, peuvent les assigner et les résoudre.
// Les autres utilisateurs ne voient que leurs propres demandes.
Agents = ["support@contoso.com", "admin@contoso.com"];

EstAgent = Lower(User().Email) in Agents;
EmailUtilisateur = User().Email;
Compact = App.Width < 1000;

// ---- Utilisateur courant au format colonne Personne SharePoint -------
UtilisateurSP = {
    '@odata.type': "#Microsoft.Azure.Connectors.SharePoint.SPListExpandedUser",
    Claims: "i:0#.f|membership|" & Lower(User().Email),
    Department: "",
    DisplayName: User().FullName,
    Email: User().Email,
    JobTitle: "",
    Picture: ""
};

// ---- Valeurs de référence (identiques aux choix de la liste) ---------
ListeCategories = ["Matériel", "Logiciel", "Réseau", "Accès / Compte", "Messagerie", "Autre"];
ListePriorites = ["Basse", "Normale", "Haute", "Critique"];
ListeStatuts = ["Nouveau", "En cours", "En attente", "Résolu", "Fermé"];

// ---- Palette (Fluent 2) ----------------------------------------------
Couleurs = {
    Primaire: ColorValue("#0F6CBD"),
    PrimaireFonce: ColorValue("#0C3B5E"),
    Fond: ColorValue("#F5F7FA"),
    Carte: ColorValue("#FFFFFF"),
    Texte: ColorValue("#1B1B1F"),
    TexteSecondaire: ColorValue("#5F6B7A"),
    Bordure: ColorValue("#E1E5EA"),
    Succes: ColorValue("#107C10"),
    Danger: ColorValue("#C50F1F")
};

CouleursStatut = Table(
    {Nom: "Nouveau", Couleur: ColorValue("#0F6CBD")},
    {Nom: "En cours", Couleur: ColorValue("#8764B8")},
    {Nom: "En attente", Couleur: ColorValue("#B08800")},
    {Nom: "Résolu", Couleur: ColorValue("#107C10")},
    {Nom: "Fermé", Couleur: ColorValue("#616161")}
);

CouleursPriorite = Table(
    {Nom: "Basse", Couleur: ColorValue("#498205")},
    {Nom: "Normale", Couleur: ColorValue("#0F6CBD")},
    {Nom: "Haute", Couleur: ColorValue("#CA5010")},
    {Nom: "Critique", Couleur: ColorValue("#C50F1F")}
);
