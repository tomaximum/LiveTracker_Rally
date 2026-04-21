# 🚀 Journal des Modifications (CHANGELOG)

## [3.1.10] - 2026-04-21 (Stable)
- **GPX Parser** : Fallback dynamique — si le GPX ne contient pas de tracé (`<trk>`), une route est automatiquement générée en reliant les waypoints.
- **Scoring Engine** : Autorise le calcul de corridor sur les tracés générés (avec avertissement sur la précision).

---

## [3.1.9] - 2026-04-21 (Final)

### Alertes de Sécurité
- Nouveau champ **"ID Chat Alertes Tracking"** dans les Paramètres. Si renseigné, les alertes de sécurité (SOS, immobilité) sont envoyées directement via votre bot Telegram.

### Fix Critique : Déploiement
- **Correction `deploy.yml`** : Correction d'un bug d'injection des secrets au déploiement (heredoc YAML mal indenté → remplacé par `printf`).

### UI Paramètres
- Bouton **🧪 Tester** inline sur la ligne du Token Telegram
- Bouton **🧪 Tester** inline sur le Chat ID Alertes
- Bouton **✖️ Supprimer** sur le Chat ID Alertes (homogène avec le Token)

---

## [3.1.8] - 2026-04-21 (testing)
- **Fix Telegram** : Correction d'un bug empêchant l'envoi des alertes dans certains cas.
- **Normalisation Drive** : Correction du nommage des dossiers Google Drive.
- **Nom Événement** : Initialisation dynamique du nom par défaut à `Classement_du_YYYY-MM-DD` dans le module Scoring.

---

## [3.0.0] - 2026-04-21 (Stable Release)
- **Release Majeure** : Passage officiel en version 3.0 Stable.
- **Licence** : Migration officielle vers la licence **GNU GPL v3**.
- **Scoring Engine** : Finalisation du mode "Précision Rally" avec gestion affinée des corridors et waypoints.
- **Scoring Engine** : Suppression des faux-positifs hors-piste en début et fin de roadbook.
- **Interface** : Refonte des étiquettes de waypoints avec nomenclature officielle (WPM, WPE, WPV, WPS, WPN, WPP…).
- **Cartographie** : Intégration du type WPP avec couleur magenta distinctive.
- **UI** : Optimisation de la hauteur de carte pour lisibilité terrain.
- **Documentation** : README professionnel orienté utilisateur final.

---

## [2.9.x] - 2026-04-20
- **Scoring Engine** : Correction bug activation corridor en mode Précision.
- **Scoring Engine** : Fallback intelligent — si le GPX Roadbook n'a pas de trace `<trk>`, les waypoints sont reliés pour former le corridor.
- **Versioning** : Passage au versioning incrémental pour garantir le cache-busting.

---

## [2.8.x] - 2026-04-20
- **GPX Parser** : Support étendu des tags OpenRally (`openrally:neutralization`, `openrally:dt`, priorité `DN/DT > DZ`).
- **Scoring Neutra** : Pénalités paramétrables pour sortie des zones de neutralisation/transfert.
- **Corrections Parseur** : Unités temps (secondes→minutes), priorité balises symboles, multi-attributs.

---

## [2.7.0] - Stable (Telemetry V2 & Mobile)
- **Télémétrie** : Clé API secrète, envoi GPX vers Drive.
- **Mobile First** : Panneau escamotable, Safe Areas iOS/Android.
- **Persistance** : Sauvegarde locale IndexedDB.

---

## [2.0.0] - 2026-04-04
- Version majeure "Cloud Native" finalisée.
- Thème Premium Dark V2, 100% statique, optimisé GitHub Pages.

---

## [1.3.x] - 2026-04-03
- Alertes interactives, filtrage GPS (`movementThresh`), détection hors-ligne.
- Séparation token/BDD, bouton suppression token.

---

## [1.1.0] - 2026-04-03
- Suppression complète du serveur Python, passage 100% Cloud Only.

---

## [1.0.0] - 2026-04-03
- Version de référence initiale.

---
*Dernière mise à jour : 21/04/2026 — v3.1.10*
