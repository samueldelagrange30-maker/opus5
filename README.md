# Calculatrice Android

Application Android de calculatrice (APK), écrite en Java sans dépendance externe.

## Fonctionnalités
- Opérations : addition, soustraction, multiplication, division
- Pourcentage (`200 × 10%` = 20), parenthèses, nombres décimaux (virgule)
- Aperçu du résultat en direct pendant la saisie
- Priorité des opérations respectée, calcul précis (pas d'erreur du type 0,1 + 0,2 = 0,30000000004)
- ⌫ efface le dernier caractère, appui long sur ⌫ ou **C** efface tout

## Obtenir l'APK
L'APK est compilé automatiquement par GitHub Actions à chaque push :
1. Onglet **Releases** du dépôt → télécharger `Calculatrice.apk`
2. Sur le téléphone, autoriser l'installation d'applications de sources inconnues, puis ouvrir le fichier.

## Compiler soi-même
Avec le SDK Android installé : `./gradlew assembleRelease`
→ `app/build/outputs/apk/release/app-release.apk`
