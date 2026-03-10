# 🤖 Guide : Comment créer le Bot Telegram (pour les nuls)

Ce guide vous explique étape par étape comment créer le bot Telegram qui servira de relais GPS pour vos pilotes. **C'est 100% gratuit et ça prend 3 minutes.**

## Étape 1 : Créer le bot sur Telegram

1. Ouvrez l'application **Telegram** sur votre téléphone ou ordinateur.
2. Dans la barre de recherche en haut, tapez **BotFather** (c'est le bot officiel de Telegram qui crée d'autres bots).
3. Assurez-vous qu'il a le petit badge bleu certifié (✅) à côté de son nom, puis cliquez dessus.
4. Appuyez sur le bouton **Démarrer** (ou tapez `/start`).
5. Tapez la commande `/newbot` et envoyez le message.
6. BotFather vous demande un **nom** pour votre bot. Tapez par exemple `Rallye LiveTrack` et envoyez.
7. Il vous demande ensuite un **nom d'utilisateur** (username), qui doit obligatoirement se terminer par le mot `bot` (ex: `MonRallye2026Bot` ou `LiveTrackDupont_bot`). Tapez-le et envoyez.

## Étape 2 : Récupérer le "Token" (le code secret)

Une fois le nom d'utilisateur validé, BotFather vous envoie un long message de félicitations.
Au milieu de ce message, il y a une ligne qui ressemble à ça :

`Use this token to access the HTTP API:`
`1234567890:ABCdefGhIJKlmNopQrStUvwXyz`

Ce long code bizarre est votre **Token**. C'est la clé de votre application.
👉 **Copiez ce texte.**

## Étape 3 : Configurer l'application LiveTrack

1. Dans le dossier `livetracking` sur votre ordinateur, créez un nouveau fichier texte vide.
2. Nommez ce fichier exactement `telegram_token.txt`
3. Ouvrez ce fichier, **collez** le fameux token copié à l'étape 2, et enregistrez le fichier (Ctrl+S).
4. C'est tout ! Double-cliquez maintenant sur `LiveTrack.bat` pour lancer l'application.

## Étape 4 : Comment les pilotes se connectent

Une fois que l'application tourne sur votre ordi :

1. Les pilotes cherchent le nom de votre bot (`@LeNomQueVousAvezChoisiBot`) dans leur propre application Telegram.
2. Ils cliquent sur **Démarrer**.
3. En bas à gauche, ils cliquent sur le trombone (Joindre 📎).
4. Ils choisissent **Position** (ou Location).
5. Ils choisissent **Partager ma position en direct** (Share My Live Location) et valident "Pendant 8 heures".

Dès qu'ils font ça, **pouf !** leur petite moto apparaîtra comme par magie sur votre carte LiveTrack Rally sur votre ordinateur.

---

*Astuce de grand-mère : Vous n'avez à faire cette manipulation de création de bot qu'une seule fois dans votre vie. Le token reste valable pour toujours !*
