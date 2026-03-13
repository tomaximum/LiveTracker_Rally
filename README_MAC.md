# 🍎 Guide de Compilation macOS - LiveTrack Rally

Ce guide explique comment transformer le code source en une application macOS native (`.app`).

## Prérequis
1. Un ordinateur tournant sous macOS.
2. **Python 3** installé (souvent présent par défaut, sinon téléchargeable sur [python.org](https://www.python.org/)).

## Étape 1 : Préparer les scripts
Ouvrez le **Terminal** sur votre Mac et déplacez-vous dans le dossier du projet :
```bash
cd /chemin/vers/votre/dossier/livetiming_rally
```

Donnez les permissions d'exécution aux scripts :
```bash
chmod +x build_mac.sh LiveTrack_Mac.command
```

## Étape 2 : Lancer la compilation
Lancez le script de construction. Il va automatiquement créer un environnement virtuel, installer les dépendances (PyInstaller) et compiler l'application :
```bash
./build_mac.sh
```

## Étape 3 : Utiliser l'application
Une fois terminé :
- L'application se trouve dans le dossier **`dist/LiveTrackRally.app`**.
- Vous pouvez la déplacer dans votre dossier **Applications**.
- Pour que le bot Telegram fonctionne, assurez-vous de copier votre fichier `telegram_token.txt` dans le même dossier que l'application après l'avoir déplacée.

---

## Alternative : Lancer sans compiler (Mode Démo/Dev)
Si vous voulez simplement lancer le serveur sans créer d'application :
1. Double-cliquez sur le fichier **`LiveTrack_Mac.command`**.
2. Cela ouvrira une fenêtre Terminal et démarrera le serveur localement.
