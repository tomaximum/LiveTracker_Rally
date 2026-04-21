# 🚀 Journal des Modifications (CHANGELOG)

## [3.1.9] - 2026-04-21 (testing)

### Télémétrie Double Bot (Architecture Refonte)
- **Bot Tracking (Bot A)** : Nouveau champ **"ID Chat Alertes Tracking"** dans les Paramètres. Si renseigné, les alertes de sécurité (SOS, immobilité) sont envoyées directement via votre bot de suivi.
- **Bot Système (Bot B)** : Dédié exclusivement à la télémétrie technique (démarrage app, chargement roadbook Live et Ranking). Opère via les Secrets GitHub, invisible dans l'interface.
- **Suppression du mode manuel** : La configuration manuelle des secrets Bot B (formulaire localStorage) a été supprimée. Les secrets sont désormais uniquement injectés par GitHub Actions.

### Fix Critique : Déploiement des Secrets
- **Correction `deploy.yml`** : Remplacement du heredoc bash (bug d'indentation YAML) par un `printf` propre passant les secrets via variables d'environnement.
- **Résultat** : Les secrets `TELEGRAM_ADMIN_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID` et `GDRIVE_WEBHOOK_URL` sont désormais correctement injectés dans `js/secrets.js` à chaque déploiement.
- **Logs CI explicites** : Le workflow affiche le statut de chaque secret (OK / MISSING) dans les logs Actions.

### UI Paramètres
- Bouton **🧪 Tester** inline sur la ligne du Token Telegram (comme pour Chat ID)
- Bouton **🧪 Tester** inline sur le Chat ID Alertes
- Bouton **✖️ Supprimer** sur le Chat ID Alertes (homogène avec le Token)
- Suppression de la section debug "Télémétrie Système (Bot B)" (secrets validés)

### Notifications Télémétrie
- Notification Bot B au chargement d'un roadbook dans le module **Live**
- Notification Bot B au chargement d'un roadbook dans le module **Ranking/Scoring**
- Notification Bot B au démarrage de l'application (avec numéro de version)

---

## [3.1.8] - 2026-04-21 (testing)
- **Fix Telegram Admin** : Correction bug de portée de variable (`SECRETS` → `secrets`) dans `sendTelegramAdmin` empêchant l'envoi avec les secrets manuels.
- **Normalisation Drive** : Correction du nommage des dossiers Google Drive (espaces → underscores dans `sendToDev`).
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
*Dernière mise à jour : 21/04/2026 — v3.1.9-testing*
