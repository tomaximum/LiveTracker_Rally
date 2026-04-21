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

## 🤖 Étape 1 — Créer votre Bot Telegram

> Un "Bot" Telegram est un compte automatique qui va recevoir les positions GPS de vos pilotes.

### 1.1 Ouvrir BotFather

Dans Telegram, tapez **`@BotFather`** dans la barre de recherche et appuyez sur le résultat officiel (il a une coche bleue ✅).

Appuyez sur **Démarrer**.

---

### 1.2 Créer le bot

Envoyez la commande :
```
/newbot
```

BotFather vous affiche :
> *"Alright, a new bot. How are you going to call it? Please choose a name for your bot."*  
> *(= "Très bien, un nouveau bot. Comment allez-vous l'appeler ? Choisissez un nom pour votre bot.")*

→ Tapez le nom affiché de votre bot, par exemple :
```
LiveTrack Rally Moto
```
Ce nom peut contenir des espaces et des majuscules — c'est simplement le nom qui sera visible dans Telegram.

---

BotFather vous demande ensuite :
> *"Good. Now let's choose a username for your bot."*  
> *(= "Bien. Choisissez maintenant un identifiant pour votre bot.")*

→ Tapez un identifiant **unique**, **sans espaces**, qui doit **terminer par `bot`**, par exemple :
```
LiveTrackRallyMoto_bot
```

Si BotFather répond :
> *"Sorry, this username is already taken."*  
> *(= "Désolé, cet identifiant est déjà utilisé.")*

→ Réessayez avec vos initiales ou le nom de votre club, ex : `LiveTrackABC_bot`

---

### 1.3 Récupérer le Token

BotFather répond avec un message contenant votre **Token**, qui ressemble à ceci :

```
Done! Congratulations on your new bot. You will find it at t.me/LiveTrackRallyMoto_bot.

Use this token to access the HTTP API:
1234567890:ABCDefghIJKLmnopQRSTuvwxyz123456789

Keep your token secure and store it safely, it can be used by anyone to control your bot.
```

*(= "Félicitations ! Votre bot est créé. Utilisez ce token pour accéder à l'API. Gardez votre token secret — quiconque le possède peut contrôler votre bot.")*

🔑 **Copiez la ligne qui commence par des chiffres suivis de `:` — c'est votre Token.**

> ⚠️ **Ne partagez jamais ce token** — quiconque le possède contrôle votre bot.

---

## 👥 Étape 2 — Créer le groupe de suivi

> Les pilotes vont partager leur position GPS **dans un groupe Telegram** qui contient votre bot.

### 2.1 Créer le groupe

Dans Telegram : **Nouveau Message → Nouveau Groupe**

- Ajoutez vos pilotes comme membres
- Donnez un nom au groupe, par exemple : `LiveTrack - Rallye Sud 2026`
- **Ajoutez votre bot** (`@VotreBot_bot`) comme membre du groupe

---

### 2.2 Récupérer l'ID du groupe (optionnel)

> L'ID du groupe est nécessaire uniquement si vous souhaitez recevoir des **alertes de sécurité** (SOS, pilote immobile) directement dans ce groupe.

**Méthode la plus simple :**

1. Ajoutez **`@userinfobot`** dans votre groupe Telegram (en tant que nouveau membre)
2. Il répond automatiquement avec les infos du groupe, dont l'**ID** — un nombre négatif commençant par `-100...`
3. Copiez cet ID
4. Vous pouvez ensuite retirer `@userinfobot` du groupe

L'ID ressemble à : `-1001234567890`

---

## ⚙️ Étape 3 — Configurer LiveTrack Rally

Ouvrez **[LiveTrack Rally](https://tomaximum.github.io/LiveTracker_Rally/)** et cliquez sur l'icône ⚙️ en haut à droite.

| Champ | Quoi mettre |
|---|---|
| **Token Telegram** | Le token copié depuis BotFather (`1234567890:ABC...`) |
| **ID Chat Alertes** *(optionnel)* | L'ID négatif du groupe (`-1001234567890`) |

Cliquez sur **🧪 Tester** à côté du Token pour vérifier que la connexion fonctionne, puis **Enregistrer**.

---

## 📍 Étape 4 — Les pilotes rejoignent le groupe et partagent leur position

### 4.1 — Inviter les pilotes dans le groupe

Avant de pouvoir partager leur position, les pilotes doivent **rejoindre le groupe Telegram** que vous avez créé.

**Option A — Via QR Code (recommandé sur le terrain) :**

1. Dans votre groupe Telegram, ouvrez les **informations du groupe** (cliquez sur le nom du groupe en haut)
2. Appuyez sur **"Inviter via lien"** ou **"Ajouter des membres"**
3. Sélectionnez **"Lien d'invitation"** puis **"Générer un QR Code"**
4. Affichez le QR Code sur votre téléphone — les pilotes le scannent avec l'appareil photo de leur téléphone et sont immédiatement ajoutés au groupe

**Option B — Via lien d'invitation :**

1. Générez un lien d'invitation depuis les infos du groupe
2. Partagez ce lien par SMS, e-mail ou imprimez-le sur la feuille de route
3. Le pilote clique sur le lien → Telegram s'ouvre → il appuie sur **"Rejoindre"**

> 💡 Une fois dans le groupe, le pilote voit les messages et peut partager sa position. S'il n'a pas encore Telegram, il doit d'abord installer l'application (gratuite, sur App Store et Google Play).

---

### 4.2 — Partager la position en direct

Une fois dans le groupe, chaque pilote doit :

1. Appuyer sur le **trombone 📎** (pièce jointe) ou l'icône **`+`**
2. Sélectionner **"Localisation"**
3. Choisir **"Partager ma position en direct"**
4. Sélectionner une durée (ex: **8 heures**)

> 💡 La position se met à jour automatiquement toutes les quelques secondes tant que le partage est actif.  
> Si le pilote arrête le partage ou que la durée est écoulée, sa position n'est plus mise à jour sur la carte.

---

## 🗺️ Étape 5 — Lancer le suivi

1. Dans l'application, assurez-vous que votre **Token Telegram** est bien enregistré (⚙️ Paramètres)
2. Importez votre fichier **GPX** (format OpenRally) via le bouton d'import
3. Le suivi démarre **automatiquement** — aucun bouton à appuyer
4. Les pilotes qui partagent leur position apparaissent sur la carte en temps réel 🎯

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
```


## 📜 Licence

Ce projet est sous licence **GNU GPL v3**. Toute modification ou redistribution doit rester open-source sous les mêmes termes. Voir [LICENSE](LICENSE).

---

*Développé par Antigravity & Tomaximum — v3.1.9-testing*
