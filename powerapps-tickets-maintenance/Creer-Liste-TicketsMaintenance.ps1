<#
.SYNOPSIS
    Crée la liste Microsoft Lists « TicketsMaintenance » utilisée par l'application Power Apps.

.DESCRIPTION
    Crée la liste, ses colonnes (choix, personne, dates…), une mise en forme colorée
    des colonnes Statut et Urgence, et (en option) quelques tickets d'exemple.

    Prérequis :
      - PowerShell 7 recommandé
      - Module PnP.PowerShell :  Install-Module PnP.PowerShell -Scope CurrentUser
      - Une application Entra ID pour PnP (une seule fois par tenant) :
            Register-PnPEntraIDAppForInteractiveLogin -ApplicationName "PnP PowerShell" -Tenant "<votre-tenant>.onmicrosoft.com"
        Notez le ClientId affiché.

.EXAMPLE
    .\Creer-Liste-TicketsMaintenance.ps1 -SiteUrl "https://contoso.sharepoint.com/sites/Maintenance" -ClientId "00000000-0000-0000-0000-000000000000"

.EXAMPLE
    .\Creer-Liste-TicketsMaintenance.ps1 -SiteUrl "https://contoso.sharepoint.com/sites/Maintenance" -ClientId "..." -SansExemples
#>
param(
    [Parameter(Mandatory = $true)] [string] $SiteUrl,
    [Parameter(Mandatory = $true)] [string] $ClientId,
    [string] $NomListe = "TicketsMaintenance",
    [switch] $SansExemples
)

$ErrorActionPreference = "Stop"

Write-Host "Connexion à $SiteUrl…" -ForegroundColor Cyan
Connect-PnPOnline -Url $SiteUrl -Interactive -ClientId $ClientId

if (Get-PnPList -Identity $NomListe -ErrorAction SilentlyContinue) {
    throw "La liste '$NomListe' existe déjà sur ce site. Supprimez-la ou choisissez un autre nom avec -NomListe."
}

Write-Host "Création de la liste $NomListe…" -ForegroundColor Cyan
$liste = New-PnPList -Title $NomListe -Template GenericList -OnQuickLaunch
Set-PnPList -Identity $NomListe -EnableVersioning $true -Description "Tickets de maintenance (application Power Apps)" | Out-Null

# --- Colonnes ---------------------------------------------------------------
# Les noms internes = noms affichés, sans accent : c'est ce qu'utilisent les formules Power Apps.
$champs = @(
    '<Field Type="Note" Name="Description" StaticName="Description" DisplayName="Description" NumLines="6" RichText="FALSE" />'
    '<Field Type="Text" Name="Equipement" StaticName="Equipement" DisplayName="Equipement" Required="TRUE" MaxLength="255" />'
    '<Field Type="Text" Name="Lieu" StaticName="Lieu" DisplayName="Lieu" MaxLength="255" />'
    '<Field Type="Choice" Name="Domaine" StaticName="Domaine" DisplayName="Domaine" Format="Dropdown" FillInChoice="FALSE"><Default>Mécanique</Default><CHOICES><CHOICE>Mécanique</CHOICE><CHOICE>Électricité</CHOICE><CHOICE>Plomberie</CHOICE><CHOICE>CVC</CHOICE><CHOICE>Informatique</CHOICE><CHOICE>Bâtiment</CHOICE><CHOICE>Préventif</CHOICE><CHOICE>Autre</CHOICE></CHOICES></Field>'
    '<Field Type="Choice" Name="Urgence" StaticName="Urgence" DisplayName="Urgence" Format="Dropdown" FillInChoice="FALSE"><Default>Moyenne</Default><CHOICES><CHOICE>Basse</CHOICE><CHOICE>Moyenne</CHOICE><CHOICE>Haute</CHOICE><CHOICE>Urgente</CHOICE></CHOICES></Field>'
    '<Field Type="Choice" Name="Statut" StaticName="Statut" DisplayName="Statut" Format="Dropdown" FillInChoice="FALSE"><Default>Ouvert</Default><CHOICES><CHOICE>Ouvert</CHOICE><CHOICE>En cours</CHOICE><CHOICE>En attente</CHOICE><CHOICE>Résolu</CHOICE><CHOICE>Clôturé</CHOICE></CHOICES></Field>'
    '<Field Type="User" Name="Technicien" StaticName="Technicien" DisplayName="Technicien" UserSelectionMode="PeopleOnly" UserSelectionScope="0" />'
    '<Field Type="DateTime" Name="DateLimite" StaticName="DateLimite" DisplayName="DateLimite" Format="DateOnly" />'
    '<Field Type="DateTime" Name="DateCloture" StaticName="DateCloture" DisplayName="DateCloture" Format="DateOnly" />'
    '<Field Type="Note" Name="Intervention" StaticName="Intervention" DisplayName="Intervention" NumLines="6" RichText="FALSE" />'
)
foreach ($xml in $champs) {
    Add-PnPFieldFromXml -List $NomListe -FieldXml $xml | Out-Null
}
Write-Host "  10 colonnes ajoutées." -ForegroundColor Green

# --- Mise en forme des colonnes dans Microsoft Lists --------------------------
$formatStatut = @'
{"$schema":"https://developer.microsoft.com/json-schemas/sp/v2/column-formatting.schema.json","elmType":"div","txtContent":"@currentField","style":{"padding":"2px 10px","border-radius":"12px","color":"white","font-weight":"600","background-color":"=if(@currentField=='Ouvert','#2563eb',if(@currentField=='En cours','#9333ea',if(@currentField=='En attente','#ca8a04',if(@currentField=='Résolu','#16a34a','#64748b'))))"}}
'@
$formatUrgence = @'
{"$schema":"https://developer.microsoft.com/json-schemas/sp/v2/column-formatting.schema.json","elmType":"div","txtContent":"@currentField","style":{"padding":"2px 10px","border-radius":"12px","color":"white","font-weight":"600","background-color":"=if(@currentField=='Urgente','#dc2626',if(@currentField=='Haute','#ea580c',if(@currentField=='Moyenne','#ca8a04','#16a34a')))"}}
'@
Set-PnPField -List $NomListe -Identity "Statut"  -Values @{ CustomFormatter = $formatStatut }  | Out-Null
Set-PnPField -List $NomListe -Identity "Urgence" -Values @{ CustomFormatter = $formatUrgence } | Out-Null

# --- Vue par défaut -----------------------------------------------------------
$vue = Get-PnPView -List $NomListe | Where-Object { $_.DefaultView } | Select-Object -First 1
Set-PnPView -List $NomListe -Identity $vue.Id -Fields "ID", "LinkTitle", "Equipement", "Lieu", "Domaine", "Urgence", "Statut", "Technicien", "DateLimite", "Author", "Created" | Out-Null
Write-Host "  Vue par défaut configurée." -ForegroundColor Green

# --- Exemples -----------------------------------------------------------------
if (-not $SansExemples) {
    $web = Get-PnPWeb -Includes CurrentUser
    $moi = $web.CurrentUser.Email
    $j = (Get-Date).Date
    $exemples = @(
        @{ Title = "Fuite d'huile presse hydraulique"; Description = "Flaque d'huile sous la presse n°2 en fin de poste."; Equipement = "Presse hydraulique P2"; Lieu = "Atelier A"; Domaine = "Mécanique"; Urgence = "Haute"; Statut = "En cours"; Technicien = $moi; DateLimite = $j.AddDays(2); Intervention = "Joint de vérin commandé." }
        @{ Title = "Éclairage HS couloir nord"; Description = "3 néons ne s'allument plus."; Equipement = "Éclairage couloir"; Lieu = "Bâtiment B - RDC"; Domaine = "Électricité"; Urgence = "Basse"; Statut = "Ouvert"; DateLimite = $j.AddDays(10) }
        @{ Title = "Climatisation salle serveurs"; Description = "Température à 29 °C, alarme déclenchée."; Equipement = "Clim CTA-03"; Lieu = "Salle serveurs"; Domaine = "CVC"; Urgence = "Urgente"; Statut = "Ouvert"; DateLimite = $j.AddDays(1) }
        @{ Title = "Porte sectionnelle bloquée"; Description = "La porte du quai 4 ne remonte plus complètement."; Equipement = "Porte quai 4"; Lieu = "Logistique"; Domaine = "Mécanique"; Urgence = "Moyenne"; Statut = "En attente"; Technicien = $moi; DateLimite = $j.AddDays(-3); Intervention = "En attente de la pièce moteur." }
        @{ Title = "Remplacement filtre compresseur"; Description = "Maintenance préventive trimestrielle."; Equipement = "Compresseur C1"; Lieu = "Local technique"; Domaine = "Préventif"; Urgence = "Moyenne"; Statut = "Résolu"; Technicien = $moi; DateLimite = $j.AddDays(-5); DateCloture = $j.AddDays(-6); Intervention = "Filtre remplacé, RAS." }
        @{ Title = "Bruit anormal convoyeur"; Description = "Grincement régulier sur la ligne 3."; Equipement = "Convoyeur L3"; Lieu = "Atelier A"; Domaine = "Mécanique"; Urgence = "Moyenne"; Statut = "Ouvert"; DateLimite = $j.AddDays(5) }
    )
    foreach ($e in $exemples) {
        Add-PnPListItem -List $NomListe -Values $e | Out-Null
    }
    Write-Host "  $($exemples.Count) tickets d'exemple ajoutés." -ForegroundColor Green
}

Write-Host ""
Write-Host "Terminé ! Liste disponible ici : $SiteUrl/Lists/$NomListe" -ForegroundColor Cyan
