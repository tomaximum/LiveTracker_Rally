# 📡 LiveTrack Rally

![Version](https://img.shields.io/badge/version-2.8.2--stable-blue)
![Platform](https://img.shields.io/badge/platform-GitHub%20Pages-orange)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**LiveTrack Rally** est une solution de suivi GPS 100% Web et Cloud, optimisée pour un usage mobile via **GitHub Pages**. Elle permet de visualiser la progression de pilotes en temps réel sans nécessiter d'installation de serveur local complexe.

---

## ✨ Points forts (v2.8.2)
La version **v2.8.2** renforce la sécurité des transferts de données et améliore l'interface :
- **Sécurité Télémétrie** : Ajout d'une clé API secrète pour protéger votre compte Google contre les abus.
- **Mobile First** : Panneau escamotable et prise en compte des "Safe Areas" (Otb/Encoche) sur les écrans tactiles.
- **Persistance Live** : Vos traces pilotes sont sauvegardées localement dans le navigateur (IndexedDB). Un rafraîchissement ou une coupure réseau ne fait plus perdre l'historique !
- **Extraction GPX** : Exportez d'un clic les parcours réels effectués par vos pilotes suivis en direct pour les archiver ou alimenter le classement.
- **RallyRanking V2** : Système de classement avec panneau de configuration unifié.
- **Fiches Pilotes interactives** : Zoom automatique sur les infractions au clic.
- **Autonomie** : Utilisation directe de l'API Telegram pour le suivi.
- **Focus Intelligent** : Nouveau système de focus unifié évitant les conflits visuels entre les pilotes et les traces GPX.
- **Contrôle Écran (Wake Lock)** : Bouton 📱🔒 pour empêcher la mise en veille du téléphone.

---

## 🚀 Utilisation (GitHub Pages)

1. **Accédez à l'URL** de votre projet (ex: `https://votre-nom.github.io/LiveTracker_Rally/`).
2. **Paramètres** : Cliquez sur ⚙️ et saisissez votre **Token Telegram** (obtenu via @BotFather).
3. **GPX** : Importez votre trace de référence. La couleur et l'état de chaque trace sont sauvegardés localement.
4. **Partage** : Demandez à vos pilotes de lancer le bot et de partager leur position en direct.

---

## 🤖 Tutoriel Telegram Bot

L'intégration de Telegram permet de suivre les pilotes en temps réel sans serveur intermédiaire.

[![App Store](https://img.shields.io/badge/App_Store-iOS-black?logo=apple&style=for-the-badge)](https://apps.apple.com/app/telegram-messenger/id686449807) 
[![Google Play](https://img.shields.io/badge/Google_Play-Android-black?logo=google-play&style=for-the-badge)](https://play.google.com/store/apps/details?id=org.telegram.messenger)

---

### 1️⃣ Création du Bot (via @BotFather)
1.  Ouvrez **Telegram** et cherchez le contact **@BotFather**.
2.  Envoyez la commande `/newbot`.
3.  Choisissez un **Nom affichable** pour votre bot (ex: *Mon Rallye Tracker*).
4.  Choisissez un **Username** unique se terminant par `bot` (ex: *MonRallye2026_bot*).
5.  **@BotFather** vous donnera alors un **API Token** (série de chiffres et lettres).

### 2️⃣ Configuration dans LiveTrack Rally
1.  Ouvrez l'application (sur PC ou Mobile).
2.  Cliquez sur le bouton **⚙️ Paramètres** en haut à droite.
3.  Collez votre **API Token** dans le champ prévu à cet effet.
4.  Enregistrez. L'application est maintenant connectée à votre bot.

### 3️⃣ Instructions pour les Pilotes
Pour que les pilotes apparaissent sur la carte :
1.  Ils doivent chercher votre bot sur Telegram (par son *username*).
2.  Cliquer sur **Démarrer** (`/start`).
3.  Utiliser l'icône 📎 (trombone) > **Lieu** > **Partager ma position en direct**.
4.  Choisir la durée la plus longue (8 heures).

> [!TIP]
> L'administrateur peut scanner le **QR Code** (bouton 👤 dans l'app) pour envoyer le lien direct du bot aux pilotes.

---

## ☁️ Télémétrie Sécurisée (Vers Google Drive)

Le LiveTracker est capable d'envoyer automatiquement en tâche de fond les GPX enregistrés et les PDFs générés vers votre Google Drive personnel. Pour activer cette fonction sans risquer de bloquer votre compte Google, nous utilisons un **Bouclier Google Apps Script**.

1. Connectez-vous sur [Google Apps Script](https://script.google.com/) et créez un **Nouveau Projet**.
2. Dans les fichiers de ce dépôt, ouvrez le fichier `GoogleAppsScript_Telemetry.js` et copiez tout son contenu.
3. Collez-le dans l'éditeur Google et mettez *votre propre ID de dossier Google Drive* dans la variable `ROOT_FOLDER_ID`.
4. Cliquez sur **Déployer > Nouveau déploiement > Application Web**.
5. Autorisez l'accès à "Tout le monde" (indispensable pour que votre navigateur puisse y envoyer les requêtes silencieusement).
6. Copiez l'URL de votre App Web générée (elle finit par `/exec`).
7. Modifiez la ligne 39 du fichier `js/app.js` dans GitHub pour y coller votre URL : `const TELEMETRY_URL = 'VOTRE_URL_ICI'`.

Désormais, tout clic sur un bouton d'export dans l'application enverra une copie de sauvegarde PDF, GPX ou CSV instantanément dans votre Drive !

---

## 📱 Installation Mobile (PWA)
Sur iOS (Safari) ou Android (Chrome) :
1. Ouvrez l'URL.
2. Choisissez **"Ajouter sur l'écran d'accueil"**.
3. L'application se lancera en plein écran, comme une app native, sans barre d'adresse.

---

## 🛠️ Développement
Cette application est purement statique (HTML/CSS/JS). Pour contribuer :
1. Clonez le dépôt.
2. Modifiez les fichiers dans `js/` ou `css/`.
3. Poussez sur `master` pour une mise à jour automatique via GitHub Pages.

---

## ⚖️ Licence
Ce projet est sous licence **MIT**. Voir le fichier [LICENSE](LICENSE) pour plus de détails.

---
*Développé par Antigravity et Tomaximum — Version 2.6.6*
