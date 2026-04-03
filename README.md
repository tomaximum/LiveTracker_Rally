# 📡 LiveTrack Rally

![Version](https://img.shields.io/badge/version-1.2.0--cloud-blue)
![Platform](https://img.shields.io/badge/platform-GitHub%20Pages-orange)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**LiveTrack Rally** est une solution de suivi GPS 100% Web et Cloud, optimisée pour un usage mobile via **GitHub Pages**. Elle permet de visualiser la progression de pilotes en temps réel sans nécessiter d'installation de serveur local complexe.

---

## ✨ Points forts (Cloud Only)
La version **v1.2.0** est 100% statique. Tout se passe directement dans votre navigateur :
- **Pas de serveur** : Aucune installation Python (PC/Mac) n'est requise.
- **Autonomie** : Utilisation directe de l'API Telegram pour le suivi.
- **Persistance** : Conserve vos roadbooks et **l'historique complet des pilotes** (positions) même après un rafraîchissement.
- **Contrôle Écran (Wake Lock)** : Bouton 📱🔒 pour empêcher la mise en veille du téléphone.

---

## 🚀 Utilisation (GitHub Pages)

1. **Accédez à l'URL** de votre projet (ex: `https://votre-nom.github.io/LiveTracker_Rally/`).
2. **Paramètres** : Cliquez sur ⚙️ et saisissez votre **Token Telegram** (obtenu via @BotFather).
3. **GPX** : Importez votre trace de référence. La couleur et l'état de chaque trace sont sauvegardés.
4. **Partage** : Demandez à vos pilotes de lancer le bot et de partager leur position en direct.

---

## 🤖 Tutoriel Telegram Bot

L'intégration de Telegram permet de suivre les pilotes en temps réel sans serveur intermédiaire.

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
*Développé par Antigravity, Gemini et Tomaximum — Version 1.2.0 Cloud Only*
