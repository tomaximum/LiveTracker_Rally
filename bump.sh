#!/bin/bash
# Script de mise à jour automatique des versions
# Utilisation: ./bump.sh 2.6.7

if [ -z "$1" ]; then
  echo "❌ Erreur : Veuillez spécifier la nouvelle version."
  echo "Usage: ./bump.sh <nouvelle_version>"
  echo "Exemple: ./bump.sh 2.6.7"
  exit 1
fi

NEW_VER=$1

echo "📦 Mise à jour de LiveTracker vers la version $NEW_VER..."

# 1. Mettre à jour les Cache Busters HTML & Service Worker (?v=X.X.X)
sed -i '' -E "s/\?v=[0-9]+\.[0-9]+\.[0-9]+/\?v=$NEW_VER/g" index.html
sed -i '' -E "s/\?v=[0-9]+\.[0-9]+\.[0-9]+/\?v=$NEW_VER/g" sw.js

# 2. Mettre à jour la variable globale JS (APP_VERSION = 'X.X.X')
sed -i '' -E "s/APP_VERSION = '[0-9]+\.[0-9]+\.[0-9]+'/APP_VERSION = '$NEW_VER'/g" index.html
sed -i '' -E "s/APP_VERSION = '[0-9]+\.[0-9]+\.[0-9]+'/APP_VERSION = '$NEW_VER'/g" js/app.js

# 3. Mettre à jour les mentions textuelles "Version X.X.X"
sed -i '' -E "s/Version [0-9]+\.[0-9]+\.[0-9]+/Version $NEW_VER/g" index.html

# 4. Mettre à jour les tags préfixés par 'v' (vX.X.X)
sed -i '' -E "s/v[0-9]+\.[0-9]+\.[0-9]+/v$NEW_VER/g" index.html
sed -i '' -E "s/v[0-9]+\.[0-9]+\.[0-9]+/v$NEW_VER/g" README.md
sed -i '' -E "s/v[0-9]+\.[0-9]+\.[0-9]+/v$NEW_VER/g" sw.js

echo "✅ Tous les fichiers (index.html, app.js, sw.js, README.md) sont maintenant synchronisés avec la version v$NEW_VER !"
echo "Indication : N'oubliez pas d'ajouter cette version au CHANGELOG.md si nécessaire."
