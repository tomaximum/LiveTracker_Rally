#!/bin/bash
# Script pour compiler LiveTrack sur Mac

set -e

echo "--- Préparation de la compilation macOS ---"

# Vérifier Python
if ! command -v python3 &> /dev/null; then
    echo "Erreur: Python 3 n'est pas installé sur ce Mac."
    exit 1
fi

# Créer un environnement virtuel propre
echo "Création de l'environnement virtuel..."
python3 -m venv venv_mac
source venv_mac/bin/activate

# Installer PyInstaller
echo "Installation de PyInstaller..."
pip install --upgrade pip
pip install pyinstaller

# Compiler
echo "Compilation en cours..."
pyinstaller LiveTrackRally_Mac.spec --noconfirm

echo "--- Compilation terminée ---"
echo "L'application se trouve dans le dossier 'dist/LiveTrackRally.app'"
echo "Vous pouvez la copier dans votre dossier Applications."
