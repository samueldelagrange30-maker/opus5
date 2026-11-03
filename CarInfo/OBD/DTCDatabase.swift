import Foundation

/// Descriptions des codes défaut génériques (SAE J2012) les plus courants.
enum DTCDatabase {
    static let codes: [String: String] = [
        "P0010": "Actionneur de calage d'arbre à cames (banc 1) – circuit",
        "P0011": "Calage d'arbre à cames admission trop avancé (banc 1)",
        "P0016": "Corrélation vilebrequin / arbre à cames (banc 1, capteur A)",
        "P0030": "Chauffage sonde lambda amont (banc 1) – circuit",
        "P0087": "Pression de rampe carburant trop basse",
        "P0088": "Pression de rampe carburant trop élevée",
        "P0100": "Débitmètre d'air (MAF) – circuit",
        "P0101": "Débitmètre d'air (MAF) – plage / performance",
        "P0102": "Débitmètre d'air (MAF) – signal faible",
        "P0103": "Débitmètre d'air (MAF) – signal élevé",
        "P0106": "Capteur de pression d'admission (MAP) – plage / performance",
        "P0110": "Capteur de température d'air admission – circuit",
        "P0115": "Capteur de température liquide de refroidissement – circuit",
        "P0116": "Température liquide de refroidissement – plage / performance",
        "P0117": "Capteur température liquide de refroidissement – signal faible",
        "P0118": "Capteur température liquide de refroidissement – signal élevé",
        "P0120": "Capteur de position papillon – circuit",
        "P0121": "Capteur de position papillon – plage / performance",
        "P0128": "Thermostat : température de fonctionnement non atteinte",
        "P0130": "Sonde lambda amont (banc 1) – circuit",
        "P0131": "Sonde lambda amont (banc 1) – tension faible",
        "P0133": "Sonde lambda amont (banc 1) – réponse lente",
        "P0134": "Sonde lambda amont (banc 1) – aucune activité",
        "P0135": "Chauffage sonde lambda amont (banc 1) – circuit",
        "P0136": "Sonde lambda aval (banc 1) – circuit",
        "P0141": "Chauffage sonde lambda aval (banc 1) – circuit",
        "P0171": "Mélange trop pauvre (banc 1)",
        "P0172": "Mélange trop riche (banc 1)",
        "P0174": "Mélange trop pauvre (banc 2)",
        "P0175": "Mélange trop riche (banc 2)",
        "P0200": "Injecteurs – circuit",
        "P0201": "Injecteur cylindre 1 – circuit",
        "P0202": "Injecteur cylindre 2 – circuit",
        "P0203": "Injecteur cylindre 3 – circuit",
        "P0204": "Injecteur cylindre 4 – circuit",
        "P0234": "Suralimentation turbo excessive",
        "P0299": "Suralimentation turbo insuffisante",
        "P0300": "Ratés d'allumage aléatoires / multiples",
        "P0301": "Ratés d'allumage cylindre 1",
        "P0302": "Ratés d'allumage cylindre 2",
        "P0303": "Ratés d'allumage cylindre 3",
        "P0304": "Ratés d'allumage cylindre 4",
        "P0305": "Ratés d'allumage cylindre 5",
        "P0306": "Ratés d'allumage cylindre 6",
        "P0325": "Capteur de cliquetis 1 (banc 1) – circuit",
        "P0335": "Capteur de position vilebrequin A – circuit",
        "P0340": "Capteur de position arbre à cames A (banc 1) – circuit",
        "P0380": "Bougies de préchauffage – circuit",
        "P0400": "Recirculation des gaz d'échappement (EGR) – débit",
        "P0401": "EGR – débit insuffisant",
        "P0402": "EGR – débit excessif",
        "P0403": "EGR – circuit de commande",
        "P0420": "Efficacité du catalyseur sous le seuil (banc 1)",
        "P0430": "Efficacité du catalyseur sous le seuil (banc 2)",
        "P0440": "Système EVAP – dysfonctionnement",
        "P0441": "Système EVAP – débit de purge incorrect",
        "P0442": "Système EVAP – petite fuite détectée",
        "P0455": "Système EVAP – grosse fuite détectée",
        "P0456": "Système EVAP – très petite fuite détectée",
        "P0457": "Système EVAP – fuite (bouchon de réservoir desserré)",
        "P0470": "Capteur de pression d'échappement – circuit",
        "P0480": "Motoventilateur 1 – circuit de commande",
        "P0500": "Capteur de vitesse véhicule – dysfonctionnement",
        "P0505": "Régulation de ralenti – dysfonctionnement",
        "P0506": "Régime de ralenti trop bas",
        "P0507": "Régime de ralenti trop élevé",
        "P0520": "Capteur / contacteur de pression d'huile – circuit",
        "P0562": "Tension système trop faible",
        "P0563": "Tension système trop élevée",
        "P0600": "Liaison série calculateur – défaut",
        "P0603": "Mémoire KAM calculateur – erreur",
        "P0605": "Mémoire ROM calculateur – erreur",
        "P0700": "Système de commande de boîte de vitesses – défaut",
        "P0705": "Capteur de position du sélecteur de boîte – circuit",
        "P0715": "Capteur de vitesse turbine – circuit",
        "P0720": "Capteur de vitesse de sortie – circuit",
        "P0730": "Rapport de boîte incorrect",
        "P0741": "Embrayage de convertisseur – performance",
        "P2002": "Efficacité du filtre à particules sous le seuil (banc 1)",
        "P2135": "Corrélation capteurs de position papillon / pédale A/B",
        "P242F": "Filtre à particules – restriction (accumulation de cendres)",
        "P2463": "Filtre à particules – accumulation de suie",
        "U0100": "Perte de communication avec le calculateur moteur (ECM/PCM)",
        "U0101": "Perte de communication avec le calculateur de boîte (TCM)",
        "U0121": "Perte de communication avec le module ABS",
        "U0140": "Perte de communication avec le boîtier de servitude (BCM)",
        "U0155": "Perte de communication avec le combiné d'instruments",
        "C0035": "Capteur de vitesse de roue avant gauche – circuit",
        "C0040": "Capteur de vitesse de roue avant droite – circuit",
        "C0045": "Capteur de vitesse de roue arrière gauche – circuit",
        "C0050": "Capteur de vitesse de roue arrière droite – circuit",
        "B0001": "Commande de déploiement airbag frontal conducteur – étape 1",
        "B0100": "Airbag – défaut de circuit",
    ]

    static func describe(_ code: String) -> String {
        if let d = codes[code] { return d }
        guard code.count == 5 else { return "Code inconnu" }
        let chars = Array(code)
        let manufacturer = chars[1] == "1" || chars[1] == "3"
        if manufacturer { return "Code spécifique au constructeur – consultez la documentation de votre marque" }
        if chars[0] == "P" {
            switch chars[2] {
            case "0", "1", "2": return "Dosage air / carburant ou circuit d'injection"
            case "3": return "Système d'allumage ou ratés d'allumage"
            case "4": return "Contrôle auxiliaire des émissions"
            case "5": return "Vitesse véhicule, ralenti ou entrées auxiliaires"
            case "6": return "Calculateur ou circuits de sortie"
            case "7", "8", "9": return "Transmission / boîte de vitesses"
            case "A", "B", "C": return "Propulsion hybride / électrique"
            default: return "Groupe motopropulseur"
            }
        }
        return "Code générique"
    }
}
