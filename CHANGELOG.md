# 📝 Journal des Modifications (CHANGELOG)

## [1.3.6] - 2026-04-03
Version stable de référence après correctifs critiques.
- **UI & Traces** : Correction du bug d'invisibilité de la liste des roadbooks (fix flex-shrink).
- **Focus Unifié** : Nouveau système de focus intelligent. Cliquer sur un roadbook désélectionne le pilote (et vice-versa) pour éviter les conflits de centrage.
- **Alertes Interactives** : Les alertes dans le panneau latéral sont maintenant cliquables pour centrer instantanément le pilote concerné.
- **Stabilité** : Nettoyage des écouteurs d'événements et renforcement de l'initialisation de l'interface.

## [1.3.5] - 2026-04-03
Séparation de la gestion du Token Telegram et de la base de données.
- **Paramètres** : Ajout d'un bouton "✖️" pour supprimer uniquement le Token Telegram.
- **Maintenance** : La fonction "Vider la base de données" préserve désormais le Token Telegram par défaut.
- **Sécurité** : Ajout de confirmations avant la suppression du Token.

## [1.3.4] - 2026-04-03
Nouvelle version de stabilité 1.3.4.
- **Scroll** : Correction du défilement global de la barre latérale.
- **Participants** : Correction d'une erreur (ReferenceError: existingP) qui masquait les icônes sur la carte et dans la liste.
- **Centrage** : Correction du centrage sur la carte lors d'un clic sur un participant.
- **Résilience** : Gestion sécurisée des éléments d'interface dynamiques.
- **Service Worker** : Mise à jour forcée (`skipWaiting`) pour une application instantanée des correctifs.

## [1.3.3] - 2026-04-03
Dernière version stable optimisée.
- **Filtrage GPS** : Ajout de `movementThresh` pour filtrer les imprécisions du GPS à l'arrêt.
- **Santé des Pilotes** : Détection automatique des pilotes hors ligne (configurable).
- **Stabilité** : Correction des bugs de rafraîchissement de la liste des participants.

## [1.1.0] - 2026-04-03
Version majeure de nettoyage ("Cloud Only").
- **100% Statique** : Suppression complète du serveur Python et des dépendances PC/Mac.
- **Support GitHub Pages Natif** : L'application est maintenant conçue pour être servie directement via GitHub Pages.

## [1.0.0-stable] - 2026-04-03
Version de référence sanctuarisée (avant refonte).

---
*Dernière mise à jour : 03/04/2026 (Stable 1.3.6)*
