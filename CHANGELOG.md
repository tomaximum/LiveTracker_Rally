# 📝 Journal des Modifications (CHANGELOG)

## [1.1.0] - 2026-04-03
Version majeure de nettoyage ("Cloud Only").

### ✨ Nouveautés (Refonte)
- **100% Statique** : Suppression complète du serveur Python et des dépendances PC/Mac.
- **Support GitHub Pages Natif** : L'application est maintenant conçue pour être servie directement via GitHub Pages.
- **Mode Autonome par Défaut** : L'API Telegram est désormais gérée directement par le navigateur.
- **PWA Optimisée** : Toutes les ressources relatives sont maintenant gérées silencieusement pour éviter les erreurs de réseau (404/Mixed Content).

### 🧹 Nettoyage Radical
- Suppression de `server.py`, `livetiming.db`, et de tous les scripts de build PC/Mac.
- Retrait des mentions de fichiers locaux (`telegram_token.txt`) dans l'interface.
- Suppression des appels WebSockets et API locales.

---

## [1.0.0-stable] - 2026-04-03
Version de référence sanctuarisée (avant refonte).

---
*Dernière mise à jour : 03/04/2026*
