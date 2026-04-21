# 📡 LiveTrack Rally

![Version](https://img.shields.io/badge/version-3.1.9--testing-orange)
![Platform](https://img.shields.io/badge/platform-GitHub%20Pages-black)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![PWA Ready](https://img.shields.io/badge/PWA-Ready-orange)](https://tomaximum.github.io/LiveTracker_Rally/)

**LiveTrack Rally** est une application web de suivi GPS et de scoring en temps réel pour le Rallye Raid. Entièrement **Cloud Native**, elle s'exécute sur GitHub Pages sans aucun serveur ni infrastructure.

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

---

## 🚀 Démarrage Rapide

L'application est **prête à l'emploi** — aucun déploiement requis. Ouvrez simplement l'URL et configurez votre bot.

**👉 [Ouvrir LiveTrack Rally](https://tomaximum.github.io/LiveTracker_Rally/)**

### 1. Créer un Bot Telegram
Contactez **@BotFather** sur Telegram et créez un nouveau bot. Copiez le token fourni.

### 2. Configurer l'application
Dans l'application (⚙️ Paramètres) :
- **Token Telegram** : collez votre token de bot
- **ID Chat Alertes** *(optionnel)* : ID du groupe où recevoir les alertes SOS/Immobilité

### 3. Lancer le suivi
1. Importez votre fichier GPX (format OpenRally)
2. Vos pilotes partagent leur position en live avec votre Bot Telegram
3. Suivez en temps réel depuis la carte


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
