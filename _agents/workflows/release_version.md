---
description: Procédure complète pour générer une nouvelle version (release)
---

# Workflow : Nouvelle Version 

Ce workflow doit être appliqué systématiquement à chaque fois qu'on change le numéro de version de l'application.

## 1. Mise à jour de `index.html`
- [ ] Modifier la balise `<title>` en remplaçant l'ancien numéro de version.
- [ ] Modifier la balise `<meta name="description">` pour inclure la bonne version.
- [ ] Mettre à jour l'affichage de la topbar : rechercher `<div class="logo">` et mettre à jour le `span` (ex: `v2.5.0`).
- [ ] Mettre à jour le texte du pied de page : rechercher `Version Y.Y.Y (Cloud ☁️)` en bas du fichier.
- [ ] Mettre à jour tous les paramètres d'URL (cache busters) des balises `<script>` et `<link>` (ex: `js/app.js?v=2.6.0`).
- [ ] Mettre à jour la constante `APP_VERSION` dans la balise `<script>` inline d'enregistrement du Service Worker.
- [ ] Mettre à jour l'URL du fichier `sw.js` lors de l'enregistrement : `navigator.serviceWorker.register('./sw.js?v=2.6.0')`.

## 2. Mise à jour du Service Worker (`sw.js`)
**CRITIQUE (pour éviter que l'ancienne app reste en cache chez l'utilisateur)** :
- [ ] Mettre à jour la constante `CACHE_NAME` (ex: `livetiming-v2.6.0`).
- [ ] Vérifier que la liste `ASSETS` est bien à jour : elle doit contenir TOUS les fichiers nécessaires, MAIS **sans** les paramètres `?v=X.X.X` pour ne pas casser la mise en cache réseau.

## 3. Mise à jour du README et Documentation
- [ ] Mettre à jour le header du `README.md` avec le nouveau badge de version : `![Version](https://img.shields.io/badge/version-X.X.X--stable-blue)`.
- [ ] Mettre à jour le paragraphe "Points forts" avec les nouveautés de cette version.
- [ ] Mettre à jour la version dans le footer du README.

## 4. Git et Versionnage
// turbo-all
- `git status` pour vérifier que tout est commité sur la branche principale (`master` ou `testing`).
- `git commit -am "chore: prepare release vX.X.X"`
- `git checkout master` et `git merge testing`
- `git tag -a vX.X.X -m "Release vX.X.X"`
- `git push origin master --tags`
