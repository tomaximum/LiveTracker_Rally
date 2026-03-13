#!/bin/bash
# Un clic pour lancer LiveTrack sur Mac

cd "$(dirname "$0")"

echo "--- Démarrage de LiveTrack Rally ---"

# Chercher le token
TOKEN_FILE="telegram_token.txt"
if [ ! -f "$TOKEN_FILE" ]; then
    echo "Note: $TOKEN_FILE non trouvé. Le bot Telegram ne sera pas actif."
fi

# Lancer le serveur
if command -v python3 &> /dev/null; then
    python3 server.py
else
    echo "Erreur: Python 3 est requis pour lancer le serveur."
    read -p "Appuyez sur Entrée pour fermer..."
fi
