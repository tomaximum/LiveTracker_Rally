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

L'application est **prête à l'emploi** — aucun déploiement requis.

**👉 [Ouvrir LiveTrack Rally](https://tomaximum.github.io/LiveTracker_Rally/)**

---

## 🤖 Étape 1 — Créer votre Bot Telegram / *Step 1 — Create your Telegram Bot*

> Un "Bot" Telegram est un compte automatique qui va recevoir les positions GPS de vos pilotes.  
> *A Telegram "Bot" is an automated account that will receive your pilots' GPS positions.*

### 1.1 Ouvrir BotFather / *Open BotFather*

Dans Telegram, tapez **`@BotFather`** dans la barre de recherche et cliquez sur le résultat officiel (il a une coche bleue ✅).  
*In Telegram, type **`@BotFather`** in the search bar and tap the official result (it has a blue checkmark ✅).*

Appuyez sur **Démarrer / Start**.  
*Press **Start**.*

---

### 1.2 Créer le bot / *Create the bot*

Envoyez la commande :
```
/newbot
```

BotFather vous demande : **"Alright, a new bot. How are you going to call it? Please choose a name for your bot."**  
→ Tapez le nom affiché de votre bot, par exemple :
```
LiveTrack Rally Moto
```

*(Ce nom peut contenir des espaces, majuscules, accents — c'est juste le nom visible)*  
**(This name can contain spaces, capitals — it's just the display name)*

---

BotFather vous demande ensuite : **"Good. Now let's choose a username for your bot."**  
→ Tapez un identifiant **unique**, **sans espaces**, qui doit **terminer par `bot`**, par exemple :
```
LiveTrackRallyMoto_bot
```

*(Si le nom est déjà pris, BotFather vous le dira — essayez avec vos initiales ou le nom du club)*  
*(If the name is already taken, BotFather will say so — try adding your initials or club name)*

---

### 1.3 Récupérer le Token / *Get the Token*

BotFather répond avec un message du type :
```
Done! Congratulations on your new bot. You will find it at t.me/LiveTrackRallyMoto_bot.
You can now add a description...

Use this token to access the HTTP API:
1234567890:ABCDefghIJKLmnopQRSTuvwxyz123456789

Keep your token secure and store it safely, it can be used by anyone to control your bot.
```

🔑 **Copiez la longue suite de caractères après le dernier `/newbot` (ligne commençant par des chiffres suivis de `:`). C'est votre Token.**  
*🔑 **Copy the long string of characters (the line starting with digits followed by `:`). That's your Token.***

> ⚠️ **Ne partagez jamais ce token** — quiconque le possède contrôle votre bot.  
> ⚠️ **Never share this token** — anyone with it can control your bot.

---

## 👥 Étape 2 — Créer le groupe de suivi / *Step 2 — Create the tracking group*

> Les pilotes vont partager leur position GPS **dans un groupe Telegram** contenant votre bot.  
> *Pilots will share their GPS position **in a Telegram group** that contains your bot.*

### 2.1 Créer le groupe / *Create the group*

Dans Telegram : **Nouveau Message → Nouveau Groupe** *(New Message → New Group)*

- Ajoutez vos pilotes comme membres
- Donnez un nom au groupe, par exemple : `LiveTrack - Rallye Sud 2026`
- **Ajoutez votre bot** (`@VotreBot_bot`) comme membre du groupe

---

### 2.2 Récupérer l'ID du groupe / *Get the group Chat ID*

> L'ID du groupe est nécessaire uniquement si vous souhaitez recevoir des **alertes de sécurité** (SOS, pilote immobile) dans ce groupe.  
> *The group ID is only needed if you want to receive **safety alerts** (SOS, pilot stopped) in this group.*

**Méthode la plus simple / Simplest method :**

1. Ajoutez **`@userinfobot`** dans votre groupe Telegram  
   *(New member → search `@userinfobot`)*
2. Il répond automatiquement avec les infos du groupe, dont l'**ID** (un nombre négatif commençant par `-100...`)
3. Copiez cet ID
4. Vous pouvez ensuite retirer `@userinfobot` du groupe

L'ID ressemble à : `-1001234567890`

---

## ⚙️ Étape 3 — Configurer LiveTrack Rally / *Step 3 — Configure LiveTrack Rally*

Ouvrez **[LiveTrack Rally](https://tomaximum.github.io/LiveTracker_Rally/)** et cliquez sur l'icône ⚙️ en haut à droite.

| Champ / *Field* | Quoi mettre / *What to enter* |
|---|---|
| **Token Telegram** | Le token copié depuis BotFather (`1234567890:ABC...`) |
| **ID Chat Alertes** *(optionnel)* | L'ID négatif du groupe (`-1001234567890`) |

Cliquez sur **🧪 Tester** à côté du Token pour vérifier que la connexion fonctionne.  
*Click **🧪 Tester** next to the Token to verify the connection works.*

Puis **Enregistrer / Save**.

---

## 📍 Étape 4 — Les pilotes partagent leur position / *Step 4 — Pilots share their position*

Dans le groupe Telegram, chaque pilote doit :

1. Appuyer sur le **trombone 📎** (pièce jointe) ou l'icône **`+`**  
   *(Press the **paperclip 📎** or **`+`** icon)*
2. Sélectionner **"Localisation" / "Location"**
3. Choisir **"Partager ma position en direct" / "Share My Live Location"**
4. Sélectionner une durée (ex: **8 heures**)

> 💡 La position se met à jour automatiquement toutes les quelques secondes tant que le partage est actif.  
> 💡 *The position updates automatically every few seconds while sharing is active.*

---

## 🗺️ Étape 5 — Lancer le suivi / *Step 5 — Start tracking*

1. Dans l'application, importez votre fichier **GPX** (format OpenRally)
2. Cliquez sur **▶ Démarrer** pour lancer le polling Telegram
3. Les pilotes apparaissent sur la carte en temps réel 🎯

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
│   └── export.js                 # Export PDF/CSV
├── css/
│   └── style.css
├── .github/workflows/
│   └── deploy.yml                # CI/CD : injection secrets + déploiement Pages
└── GoogleAppsScript_Telemetry.js # Script Drive côté Google
```


## 📜 Licence

Ce projet est sous licence **GNU GPL v3**. Toute modification ou redistribution doit rester open-source sous les mêmes termes. Voir [LICENSE](LICENSE).

---

*Développé par Antigravity & Tomaximum — v3.1.9-testing*
