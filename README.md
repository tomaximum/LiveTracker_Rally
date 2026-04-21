# 📡 LiveTrack Rally Pro

![Version](https://img.shields.io/badge/version-3.1.9--testing-orange)
![Platform](https://img.shields.io/badge/platform-GitHub%20Pages-black)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![PWA Ready](https://img.shields.io/badge/PWA-Ready-orange)](https://tomaximum.github.io/LiveTracker_Rally/)

**LiveTrack Rally Pro** est une application web de suivi GPS et de scoring en temps réel pour le Rallye Raid. Entièrement **Cloud Native**, elle s'exécute sur GitHub Pages sans aucun serveur ni infrastructure.

---

## 💎 Fonctionnalités

### 🗺️ Module Live (Suivi GPS)
- **Suivi temps réel** : Positions des pilotes via Bot Telegram (polling autonome)
- **Roadbook GPX** : Import et affichage des traces OpenRally (WPV, WPM, WPE, WPS, WPN, DSS, ASS, DN/FN, DT/FT…)
- **Alertes Sécurité** : Détection automatique des pilotes hors-route ou immobiles avec notification Telegram configurable
- **Traces Live** : Historique des positions de chaque pilote avec export GPX

### 🏆 Module Scoring (RallyRanking)
- **Modes de Classement** : Temps Scratch, Régularité (pénalités), Précision Rally (corridor)
- **Pénalités automatisées** : Waypoints manqués, survitesses, sorties de neutralisation
- **Export** : PDF des fiches pilotes, CSV des classements, export Drive automatique

### ⚙️ Télémétrie Double Bot
- **Bot Tracking (Paramètres)** : Votre bot habituel — reçoit les positions. Peut aussi envoyer les alertes de sécurité sur un **ID Chat Alertes** optionnel
- **Bot Système (GitHub Secrets)** : Notifie en silence du chargement des roadbooks, des stats et du démarrage de l'app

---

## 🚀 Démarrage Rapide

### 1. Déploiement
Forkez ce dépôt et activez **GitHub Pages** (Settings > Pages > `testing` ou `master`).

### 2. Secrets GitHub
Dans `Settings > Environments > github-pages > Secrets`, ajoutez :

| Secret | Description |
|--------|-------------|
| `TELEGRAM_ADMIN_BOT_TOKEN` | Token du Bot Système (télémétrie) |
| `TELEGRAM_ADMIN_CHAT_ID` | ID du chat de réception télémétrie |
| `GDRIVE_WEBHOOK_URL` | URL du Google Apps Script pour l'archivage Drive |

> ⚠️ Ces secrets sont injectés automatiquement à chaque déploiement dans `js/secrets.js`. Ne pas les commiter manuellement.

### 3. Configuration App
Dans l'application (⚙️ Paramètres) :
- **Token Telegram** : Token de votre bot de suivi pilotes (obtenu via @BotFather)
- **ID Chat Alertes Tracking** *(optionnel)* : ID du groupe où recevoir les alertes SOS/Immobilité

### 4. Action
1. Importez votre fichier GPX (OpenRally)
2. Invitez vos pilotes à partager leur position via votre Bot Telegram
3. Suivez en direct depuis la carte

---

## 📱 Installation PWA

Pour une expérience terrain optimale :
1. Ouvrez l'URL dans **Safari** (iOS) ou **Chrome** (Android)
2. **"Ajouter sur l'écran d'accueil"**
3. Application plein écran, hors-ligne capable

---

## 📂 Structure du Projet

```
LiveTracker_Rally/
├── index.html                    # App principale
├── js/
│   ├── app.js                    # Moteur principal (GPS, alertes, télémétrie)
│   ├── gpx.js                    # Parser GPX OpenRally
│   ├── rallyranking_bridge.js    # Module Scoring intégré
│   ├── scoring.js                # Moteur de calcul des pénalités
│   ├── simulation.js             # Mode simulation (test sans pilotes)
│   ├── wizard.js                 # Assistant de configuration Telegram
│   ├── map.js                    # Gestion carte Leaflet (Scoring)
│   ├── export.js                 # Export PDF/CSV
│   └── secrets.js                # ⚡ Généré automatiquement par CI — ne pas éditer
├── css/
│   └── style.css
├── .github/workflows/
│   └── deploy.yml                # CI/CD : injection secrets + déploiement Pages
└── GoogleAppsScript_Telemetry.js # Script Drive côté Google
```

---

## 🛠️ Développement

**Architecture** : 100% statique (HTML/CSS/JS vanille), aucune dépendance npm côté runtime.

**Déploiement local** :
```bash
# Serveur HTTP simple pour tester en local
python -m http.server 8080
# Puis ouvrir http://localhost:8080
```

> ⚠️ En local, `js/secrets.js` n'existe pas (généré uniquement par CI). Les fonctions Bot B et Drive sont silencieuses mais n'impactent pas les fonctionnalités de base.

---

## 📜 Licence

Ce projet est sous licence **GNU GPL v3**. Toute modification ou redistribution doit rester open-source sous les mêmes termes. Voir [LICENSE](LICENSE).

---

*Développé par Antigravity & Tomaximum — v3.1.9-testing*
