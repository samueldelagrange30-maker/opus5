<#
.SYNOPSIS
    Crée (ou complète) les deux Microsoft Lists utilisées par l'app Power Apps « Centre de support ».

.DESCRIPTION
    - Liste « Tickets »             : les demandes de support
    - Liste « CommentairesTickets » : le fil de discussion / historique de chaque ticket

    Le script est idempotent : il peut être relancé sans risque, il n'ajoute que ce qui manque.

.PREREQUIS
    PowerShell 7+ et le module PnP.PowerShell :
        Install-Module PnP.PowerShell -Scope CurrentUser
    Une inscription d'application Entra ID pour PnP (obligatoire depuis 2024) :
        Register-PnPEntraIDAppForInteractiveLogin -ApplicationName "PnP Helpdesk" -Tenant contoso.onmicrosoft.com

.EXEMPLE
    ./Creer-Listes.ps1 -SiteUrl "https://contoso.sharepoint.com/sites/Support" -ClientId "00000000-0000-0000-0000-000000000000"
#>
param(
    [Parameter(Mandatory = $true)] [string] $SiteUrl,
    [Parameter(Mandatory = $true)] [string] $ClientId
)

$ErrorActionPreference = "Stop"
Import-Module PnP.PowerShell

Connect-PnPOnline -Url $SiteUrl -Interactive -ClientId $ClientId

function Get-OuCreerListe([string] $Titre, [string] $Url) {
    $liste = Get-PnPList -Identity $Titre -ErrorAction SilentlyContinue
    if (-not $liste) {
        Write-Host "Création de la liste '$Titre'..." -ForegroundColor Cyan
        $liste = New-PnPList -Title $Titre -Url $Url -Template GenericList -OnQuickLaunch -EnableVersioning
    } else {
        Write-Host "La liste '$Titre' existe déjà." -ForegroundColor Yellow
    }
    return $liste
}

function Ajouter-Colonne([string] $Liste, [string] $NomInterne, [string] $Xml) {
    $champ = Get-PnPField -List $Liste -Identity $NomInterne -ErrorAction SilentlyContinue
    if (-not $champ) {
        Add-PnPFieldFromXml -List $Liste -FieldXml $Xml | Out-Null
        Write-Host "  + $NomInterne" -ForegroundColor Green
    } else {
        Write-Host "  = $NomInterne (déjà présente)"
    }
}

function Choix([string[]] $Valeurs) {
    ($Valeurs | ForEach-Object { "<CHOICE>$_</CHOICE>" }) -join ""
}

# ---------------------------------------------------------------------------
# 1. Liste Tickets
# ---------------------------------------------------------------------------
$tickets = "Tickets"
Get-OuCreerListe -Titre $tickets -Url "Lists/Tickets" | Out-Null

$categories = Choix @("Matériel", "Logiciel", "Réseau", "Accès / Compte", "Messagerie", "Autre")
$priorites  = Choix @("Basse", "Normale", "Haute", "Critique")
$statuts    = Choix @("Nouveau", "En cours", "En attente", "Résolu", "Fermé")

Ajouter-Colonne $tickets "Details" '<Field Type="Note" Name="Details" StaticName="Details" DisplayName="Details" NumLines="8" RichText="FALSE" />'
Ajouter-Colonne $tickets "Categorie" "<Field Type=""Choice"" Name=""Categorie"" StaticName=""Categorie"" DisplayName=""Categorie"" Format=""Dropdown"" FillInChoice=""FALSE""><Default>Autre</Default><CHOICES>$categories</CHOICES></Field>"
Ajouter-Colonne $tickets "Priorite" "<Field Type=""Choice"" Name=""Priorite"" StaticName=""Priorite"" DisplayName=""Priorite"" Format=""Dropdown"" FillInChoice=""FALSE""><Default>Normale</Default><CHOICES>$priorites</CHOICES></Field>"
Ajouter-Colonne $tickets "Statut" "<Field Type=""Choice"" Name=""Statut"" StaticName=""Statut"" DisplayName=""Statut"" Format=""Dropdown"" FillInChoice=""FALSE""><Default>Nouveau</Default><CHOICES>$statuts</CHOICES></Field>"
Ajouter-Colonne $tickets "Demandeur" '<Field Type="User" Name="Demandeur" StaticName="Demandeur" DisplayName="Demandeur" List="UserInfo" ShowField="ImnName" UserSelectionMode="PeopleOnly" UserSelectionScope="0" />'
Ajouter-Colonne $tickets "AssigneA" '<Field Type="User" Name="AssigneA" StaticName="AssigneA" DisplayName="AssigneA" List="UserInfo" ShowField="ImnName" UserSelectionMode="PeopleOnly" UserSelectionScope="0" />'
Ajouter-Colonne $tickets "Echeance" '<Field Type="DateTime" Name="Echeance" StaticName="Echeance" DisplayName="Echeance" Format="DateOnly" />'
Ajouter-Colonne $tickets "DateResolution" '<Field Type="DateTime" Name="DateResolution" StaticName="DateResolution" DisplayName="DateResolution" Format="DateTime" />'
Ajouter-Colonne $tickets "Resolution" '<Field Type="Note" Name="Resolution" StaticName="Resolution" DisplayName="Resolution" NumLines="6" RichText="FALSE" />'

# Index : indispensables pour que les filtres restent performants au-delà de 5 000 éléments
foreach ($col in @("Statut", "Priorite", "Demandeur", "AssigneA")) {
    Set-PnPField -List $tickets -Identity $col -Values @{ Indexed = $true } | Out-Null
}

# Mise en forme de la colonne Statut dans l'interface Lists (pastilles colorées)
$formatStatut = Get-Content -Raw -Path (Join-Path $PSScriptRoot "format-statut.json")
Set-PnPField -List $tickets -Identity "Statut" -Values @{ CustomFormatter = $formatStatut } | Out-Null

# Vue par défaut
$vue = Get-PnPView -List $tickets -Identity "Tous les éléments" -ErrorAction SilentlyContinue
if (-not $vue) { $vue = Get-PnPView -List $tickets | Where-Object { $_.DefaultView } }
Set-PnPView -List $tickets -Identity $vue.Id -Fields "ID", "LinkTitle", "Statut", "Priorite", "Categorie", "Demandeur", "AssigneA", "Echeance", "Created" | Out-Null

# ---------------------------------------------------------------------------
# 2. Liste CommentairesTickets
# ---------------------------------------------------------------------------
$comments = "CommentairesTickets"
Get-OuCreerListe -Titre $comments -Url "Lists/CommentairesTickets" | Out-Null

Ajouter-Colonne $comments "TicketId" '<Field Type="Number" Name="TicketId" StaticName="TicketId" DisplayName="TicketId" Decimals="0" Min="1" />'
Ajouter-Colonne $comments "Message" '<Field Type="Note" Name="Message" StaticName="Message" DisplayName="Message" NumLines="6" RichText="FALSE" />'
Ajouter-Colonne $comments "Interne" '<Field Type="Boolean" Name="Interne" StaticName="Interne" DisplayName="Interne"><Default>0</Default></Field>'
Set-PnPField -List $comments -Identity "TicketId" -Values @{ Indexed = $true } | Out-Null

Write-Host ""
Write-Host "Terminé. Les listes 'Tickets' et 'CommentairesTickets' sont prêtes sur $SiteUrl" -ForegroundColor Green
