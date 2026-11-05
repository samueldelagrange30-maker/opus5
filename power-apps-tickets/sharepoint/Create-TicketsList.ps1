<#
  Crée la liste SharePoint "Tickets" utilisée par l'application Power Apps.
  Prérequis : module PnP.PowerShell (Install-Module PnP.PowerShell -Scope CurrentUser)
  Usage     : .\Create-TicketsList.ps1 -SiteUrl "https://monentreprise.sharepoint.com/sites/Support" -ClientId "<id app Entra>"
#>
param(
    [Parameter(Mandatory = $true)][string]$SiteUrl,
    [Parameter(Mandatory = $true)][string]$ClientId
)

Connect-PnPOnline -Url $SiteUrl -Interactive -ClientId $ClientId

$listName = "Tickets"
if (-not (Get-PnPList -Identity $listName -ErrorAction SilentlyContinue)) {
    New-PnPList -Title $listName -Template GenericList -OnQuickLaunch | Out-Null
}

# Colonnes texte (le texte simple garde les formules Power Apps simples et délégables)
$textFields = @("Priorite", "Categorie", "Statut", "Demandeur", "DemandeurEmail", "CloturePar")
foreach ($f in $textFields) {
    Add-PnPField -List $listName -DisplayName $f -InternalName $f -Type Text -AddToDefaultView -ErrorAction SilentlyContinue | Out-Null
}

# Colonnes texte multiligne
foreach ($f in @("Description", "CommentaireCloture")) {
    Add-PnPField -List $listName -DisplayName $f -InternalName $f -Type Note -AddToDefaultView -ErrorAction SilentlyContinue | Out-Null
}

# Date de clôture
Add-PnPField -List $listName -DisplayName "DateCloture" -InternalName "DateCloture" -Type DateTime -AddToDefaultView -ErrorAction SilentlyContinue | Out-Null

# Index pour les filtres de l'application
Set-PnPField -List $listName -Identity "Statut" -Values @{ Indexed = $true }

Write-Host "Liste '$listName' prête sur $SiteUrl" -ForegroundColor Green
