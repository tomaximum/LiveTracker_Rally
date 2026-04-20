# 📝 Journal des Modifications (CHANGELOG)

## [2.7.6] - 2026-04-20 (Fix Priorité des Points)
- **Parseur GPX** : Un waypoint comportant de multiples attributs OpenRally (ex: `DT` combiné à une zone vitesse `DZ`) n'écrase plus son type principal. Priorité imposée sur les tags de scoring (`DSS`, `ASS`, `DN`, `DT`, `FN`, `FT`) face aux zones de vitesse simples.

## [2.7.5] - 2026-04-20 (Fix Unité de temps)
- **Parseur GPX** : L'attribut `time=` envoyé par Rally Navigator est en secondes, le parseur le convertit à présent correctement en minutes pour le moteur interne.

## [2.7.4] - 2026-04-20 (Hotfix GPX Parser)
- **Parseur GPX** : Prise en charge de la durée de neutralisation présente dans l'attribut `time=` au sein des balises `<openrally:dt>` (export Rally Navigator).
- **Rétrocompatibilité** : Prise en charge du type de waypoint défini dans la balise `<sym>` ou `<type>` (export Garmin / Tripy / RN).

## [2.7.3] - 2026-04-20 (Scoring Neutra)
- **Scoring Neutralisation** : Ajout de pénalités paramétrables pour la sortie des zones de neutralisation ou de transfert.
- **Parseur GPX** : Support étendu pour extraire le temps d'une neutra directement via `T=` ou `N=` depuis la description du waypoint.

## [2.7.1] - 2026-04-06 (Correctif Traces & Unités)
- **Correction des Tracés** : Réparation du bug qui exigeait 1km de déplacement pour afficher les pointillés.
- **Intervalle de Log** : Les traces respectent désormais le paramètre "Intervalle Log position" (ex: 10s).
- **Normalisation des Unités** : Correction de l'incohérence Mètres/Kilomètres affectant la vitesse et les alertes.
- **Précision** : Les vitesses affichées sont désormais exactes (km/h réels).
- **Maintenance** : Nettoyage du code et montée de version globale.

## [2.7.0] - Stable (Telemetry V2 & Mobile)
- **Sécurité Télémétrie** : Ajout d'une clé API secrète.
- **Mobile First** : Panneau escamotable et Safe Areas.
- **Persistance** : Sauvegarde locale IndexedDB.


## [2.0.2] - 2026-04-04
- **Optimisation Test Bot** : Remplacement de l'envoi de message par une vérification `@getMe` (plus de `chat_id` requis pour tester le Token).
- **Liberté Bot** : Suppression des IDs de chat de développement codés en dur pour permettre l'utilisation de n'importe quel Bot.
- **Version** : Passage en v2.0.2.

## [2.0.1] - 2026-04-04
- **Correctif Alertes** : Les pilotes "Hors Ligne" sont désormais visibles dans le journal des alertes.
- **Polissage UI** : Amélioration des "Empty States" et alignement des badges de statut.

## [2.0.0] - 2026-04-04
Version majeure "Cloud Native" finalisée.
- **UI/UX** : Thème Premium Dark V2 complet.
- **Waypoints** : Nouveau système d'étiquettes transparentes et gestion de visibilité.
- **Architecture** : 100% statique, sans serveur, optimisé pour GitHub Pages.
- **Stabilité** : Restauration robuste via IndexedDB.

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
