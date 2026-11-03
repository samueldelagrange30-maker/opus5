# Mon Auto — application iOS (IPA)

Application iPhone/iPad (SwiftUI, iOS 17+) qui regroupe **toutes les informations de votre voiture** :

| Onglet | Fonctionnalités |
|---|---|
| **Garage** | Plusieurs véhicules, fiche complète (marque, modèle, année, motorisation, immatriculation, VIN, kilométrage), échéances (contrôle technique, assurance, révision par date ou au compteur) avec alertes de couleur, coût total et coût au km, export/sauvegarde JSON |
| **Carnet d'entretien** | Vidange, freins, pneus, distribution, CT… avec date, kilométrage, coût, garage, notes ; résumé « dernière vidange / révision / pneus » |
| **Carburant** | Saisie des pleins, consommation réelle L/100 km calculée entre pleins complets, graphique d'évolution, prix moyen au litre |
| **Temps réel (OBD-II)** | Connexion Bluetooth LE à un adaptateur ELM327 : régime, vitesse, températures (eau, huile, admission, extérieure), charge moteur, papillon, niveau carburant, débit d'air, consommation instantanée, pression turbo/admission, corrections carburant, tension batterie, **compteur kilométrique** (si supporté), VIN lu dans le calculateur. Détection automatique des PIDs supportés |
| **Portières** | Alerte (notification + vibration, renforcée au-dessus de 5 km/h) quand une portière, le coffre ou le capot s'ouvre. Un assistant d'apprentissage lit le boîtier de carrosserie (UCH Renault/Dacia à l'adresse 745/765, ou tableau de bord 743/763) portes fermées puis chaque porte ouverte, et isole automatiquement le bit correspondant |
| **Diagnostic** | Voyant moteur (MIL), lecture des codes défaut confirmés et en attente avec description en français, effacement des codes, terminal ELM327, journal exportable |
| **VIN** | Décodage de n'importe quel VIN (base NHTSA vPIC, ~150 champs : usine, carrosserie, cylindrée, puissance, boîte, équipements de sécurité, aides à la conduite…) et ajout direct au garage |
| **Rappels** | Campagnes de rappel de sécurité du constructeur (NHTSA) + lien Rappel Conso France |

Un **mode démo** permet d'essayer l'écran temps réel et le diagnostic sans adaptateur.

## Matériel OBD compatible

L'application fonctionne avec les adaptateurs ELM327 **Bluetooth Low Energy (BLE)** (les modèles Wi‑Fi ne sont pas gérés). Exemples :
Vgate iCar Pro **BLE 4.0**, Veepeak OBDCheck **BLE**/BLE+, OBDLink CX / MX+, Konnwei KW902 BLE, vLinker MC+/FS (mode BLE).
Les adaptateurs « Bluetooth 2.0 / classique » ne sont **pas** visibles par iOS.

## Récupérer l'IPA

Le dépôt n'a pas besoin d'un Mac : GitHub Actions compile l'application à chaque push.

1. Onglet **Actions** du dépôt → workflow **Build IPA** → dernier run réussi → artefact **MonAuto-ipa** (zip contenant `MonAuto.ipa`).
2. Pour une version publiée : créer un tag `v1.0.0` → l'IPA est attachée à la **Release**.

L'IPA est **non signée**. Pour l'installer sur votre iPhone, signez‑la avec votre identifiant Apple (gratuit) via :

- **Sideloadly** (Windows/macOS) : glisser l'IPA, saisir l'Apple ID, *Start*. Sur l'iPhone : Réglages › Général › VPN et gestion de l'appareil › faire confiance au développeur ; activer le **Mode développeur** (Réglages › Confidentialité et sécurité).
- **AltStore** / **SideStore** : *My Apps* › `+` › choisir l'IPA.
- **TrollStore** (si votre version d'iOS le permet) : installation permanente sans resignature.

Avec un compte Apple gratuit, l'application doit être re‑signée tous les 7 jours (AltStore/SideStore le font automatiquement).

## Compiler sur un Mac

```bash
brew install xcodegen
xcodegen generate
open CarInfo.xcodeproj
```

Choisissez votre équipe de signature dans *Signing & Capabilities* et lancez sur votre iPhone.

## Structure

```
project.yml                 # définition XcodeGen du projet
CarInfo/
  App/        point d'entrée et onglets
  Models/     Vehicle, entretien, pleins
  Store/      persistance locale (JSON dans Documents)
  Services/   API NHTSA (décodage VIN, rappels)
  OBD/        OBDManager (CoreBluetooth + ELM327), PIDs, base de codes défaut
  Views/      écrans SwiftUI
.github/workflows/build-ipa.yml   # compilation + empaquetage IPA
```

## Confidentialité

Toutes les données restent sur l'appareil. Seules les requêtes de décodage VIN et de rappels sont envoyées aux API publiques de la NHTSA.
