/**
 * ------------------------------------------------------------------
 * LIVETRACKER RALLY - TELEMETRY RECEIVER (Google Apps Script)
 * ------------------------------------------------------------------
 * Ce script est le "backend" de l'application web LiveTracker_Rally.
 * Il intercepte la télémétrie et enregistre les PDF, GPX et CSV
 * directement dans votre Google Drive de manière totalement
 * transparente et sans pop-up pour l'utilisateur.
 * 
 * INSTRUCTIONS:
 * 1. Créer un "Nouveau Projet" sur https://script.google.com/
 * 2. Coller tout ce code.
 * 3. Ajouter l'ID de votre dossier cible dans `ROOT_FOLDER_ID`.
 * 4. Déployer -> Nouvelle application Web -> Accès : "Tout le monde"
 * 5. Coller l'URL générée dans `TELEMETRY_URL` de `js/app.js`.
 */

// === CONFIGURATION ===
// Mot de passe secret (doit correspondre à TELEMETRY_SECRET dans app.js)
var EXPECTED_KEY = "RallyTrack_Secure_V2"; 
// L'ID du dossier racine dans votre Google Drive où on va stocker les exports
var ROOT_FOLDER_ID = "REMPLACEZ_PAR_VOTRE_ID_DE_DOSSIER"; 
// (Optionnel) ID d'un Google Sheet pour logger les "stats" de connexion. Laissez vide si inutile.
var SPREADSHEET_ID = "";
// =====================

function doPost(e) {
  try {
    // Parser le corps de la requête envoyée par le LiveTracker
    var data = JSON.parse(e.postData.contents);
    
    // Vérification stricte Anti-Spam
    if (data.key !== EXPECTED_KEY) {
      return response(401, false, "Accès refusé : Clé de télémétrie incorrecte.");
    }

    var type = data.type;
    // -- Aide utilitaire : Chercher ou créer un sous-dossier (Sécurisé pour la concurrence) --
    function getOrCreateFolder(parent, name) {
      if (!name || name === "") name = "Sans_Nom";
      // Nettoyage: retirer les slashs pour ne pas casser le Drive
      name = name.replace(/[\\\\\\/]/g, "_").trim();
      
      // On utilise un verrou (Lock) pour éviter que 50 fichiers envoyés en même temps
      // ne créent 50 dossiers parallèles identiques
      var lock = LockService.getScriptLock();
      lock.waitLock(15000); // Attendre max 15 secondes
      try {
          var folders = parent.searchFolders("title = '" + name + "' and trashed = false");
          if (folders.hasNext()) {
              return folders.next();
          }
          return parent.createFolder(name);
      } finally {
          lock.releaseLock();
      }
    }
    
    var rootFolder = DriveApp.getFolderById(ROOT_FOLDER_ID);
    
    // -- Routage et Structure de Dossiers --
    var fName = data.name || "fichier_inconnu";
    var isLiveTracking = false;
    var isRanking = false;
    
    if (fName.indexOf("LIVE_") === 0 || fName.indexOf("ROADBOOK_LIVE_") === 0) {
       isLiveTracking = true;
    } else if (fName.indexOf("ROADBOOK_REF_") === 0 || fName.indexOf("PILOTE_") === 0 || fName.indexOf("Classement_") === 0 || fName.indexOf("Fiche_") === 0 || fName.indexOf("Toutes_Les_Fiches_") === 0) {
       isRanking = true;
    }
    
    var eventName = (data.event_name && data.event_name.trim() !== "") ? data.event_name.replace(/[\\\\\\/]/g, "_").trim() : "Event_Inconnu";
    var targetFolder = rootFolder;
    
    if (isLiveTracking) {
        var liveFolder = getOrCreateFolder(rootFolder, "LiveTracking");
        if (fName.indexOf("ROADBOOK_LIVE_") === 0) {
            targetFolder = getOrCreateFolder(liveFolder, "Roadbook");
            fName = fName.replace("ROADBOOK_LIVE_", ""); 
        } else {
            targetFolder = getOrCreateFolder(liveFolder, "Traces LiveTracker");
            // on conserve LIVE_XXX.gpx pour différencier
        }
    } else if (isRanking) {
        var rankingFolder = getOrCreateFolder(rootFolder, "Ranking");
        var eventFolder = getOrCreateFolder(rankingFolder, eventName);
        
        if (fName.indexOf("ROADBOOK_REF_") === 0) {
            targetFolder = getOrCreateFolder(eventFolder, "Roadbook");
            fName = fName.replace("ROADBOOK_REF_", "");
        } else if (fName.indexOf("PILOTE_") === 0) {
            targetFolder = getOrCreateFolder(eventFolder, "Traces Concurents");
            fName = fName.replace("PILOTE_", "");
        } else if (fName.indexOf("Fiche_") === 0 || fName.indexOf("Toutes_Les_Fiches_") === 0) {
            targetFolder = getOrCreateFolder(eventFolder, "Fiches Pilotes");
        } else {
            targetFolder = eventFolder; // Les classements globaux restent à la racine de l'event
        }
    }
    
    // Préparation du contenu binaire ou texte selon le type
    var mimeType = "application/octet-stream";
    var fileBytesOrString;
    var isText = false;
    
    if (type === "gpx") {
      mimeType = "application/gpx+xml";
      fileBytesOrString = data.xml; // C'est un string brut
      isText = true;
    } else if (type === "export") {
      if (fName.indexOf(".pdf") > -1) mimeType = "application/pdf";
      if (fName.indexOf(".csv") > -1) {
          mimeType = "text/csv";
          isText = true;
      }
      if (isText) {
          // data.file_b64 contient en fait du Base64 qu'il faut décoder
          fileBytesOrString = Utilities.newBlob(Utilities.base64Decode(data.file_b64)).getDataAsString();
      } else {
          fileBytesOrString = Utilities.base64Decode(data.file_b64); // raw bytes
      }
    }
    
    // 3. (Optionnel) Journal de Statistiques (Qui se connecte, combien de pilotes chargés)
    if (type === "stats") {
      if (SPREADSHEET_ID !== "") {
        var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getActiveSheet();
        var now = new Date();
        sheet.appendRow([now, data.version || "N/A", data.pilots, data.gpx_loaded, data.screen, data.ua]);
      }
      return response(200, true, "Statistiques de connexion enregistrées.");
    }
    
    // -- Sauvegarde & Traitement des Doublons --
    // Nous déduisons le nom "de base" sans extension pour chercher
    var baseNameMatch = fName.match(/^(.*?)\\.(gpx|pdf|csv)$/i);
    var baseName = baseNameMatch ? baseNameMatch[1] : fName;
    var ext = baseNameMatch ? "." + baseNameMatch[2] : "";
    
    var existingFiles = targetFolder.searchFiles("title contains '" + baseName + "' and trashed = false");
    var latestFile = null;
    var latestDate = 0;
    
    while (existingFiles.hasNext()) {
        var f = existingFiles.next();
        var t = f.getLastUpdated().getTime();
        // Vérification stricte pour éviter que "Etape 1" accroche "Etape 10"
        if (f.getName().indexOf(baseName) === 0) {
            if (t > latestDate) {
              latestDate = t;
              latestFile = f;
            }
        }
    }
    
    if (latestFile) {
        var originalContentBinary = latestFile.getBlob().getBytes();
        var isIdentical = false;
        
        if (isText) {
             var originalStr = Utilities.newBlob(originalContentBinary).getDataAsString();
             if (originalStr === fileBytesOrString) isIdentical = true;
        } else {
             // Binary comparison: compare length, if equal, we assume identical for our scope (PDFs change length when re-generated anyway due to timestamps)
             if (originalContentBinary.length === fileBytesOrString.length) isIdentical = true;
        }
        // -- Helper pour journaliser les uploads côté Sheet --
        function logUpload(status, actionName) {
             if (SPREADSHEET_ID !== "") {
                  try {
                       var wb = SpreadsheetApp.openById(SPREADSHEET_ID);
                       var upSheet = wb.getSheetByName("Uploads");
                       if (!upSheet) {
                            upSheet = wb.insertSheet("Uploads");
                            upSheet.appendRow(["Horodatage", "Activité", "Événement", "Fichier", "Statut"]);
                       }
                       var ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
                       upSheet.appendRow([ts, type, eventName, actionName, status]);
                  } catch(e) {}
             }
        }
        
        if (isIdentical) {
             var msg = "[SKIP] Fichier 100% identique déjà présent, ignoré : " + fName;
             logUpload("Ignoré (Doublon Exact)", fName);
             return response(200, true, msg);
        } else {
             // Fichier différent -> on appose un timestamp
             var ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd-MM_HH'h'mm");
             var uniqueName = baseName + " (MAJ " + ts + ")" + ext;
             var b = isText ? Utilities.newBlob(fileBytesOrString, mimeType, uniqueName) : Utilities.newBlob(fileBytesOrString, mimeType, uniqueName);
             targetFolder.createFile(b);
             var msg = "[NOUVELLE VERSION] Fichier différent, sauvé sous : " + uniqueName;
             logUpload("Sauvegardé (Mise à Jour)", uniqueName);
             return response(200, true, msg);
        }
    } else {
        // Le fichier n'existe pas, création simple
        var b = isText ? Utilities.newBlob(fileBytesOrString, mimeType, fName) : Utilities.newBlob(fileBytesOrString, mimeType, fName);
        targetFolder.createFile(b);
        var msg = "[CREATION] Nouveau fichier créé : " + fName;
        logUpload("Sauvegardé (Nouveau)", fName);
        return response(200, true, msg);
    }
    
    return response(400, false, "Type de télémétrie inconnu.");

  } catch (err) {
    return response(500, false, "Panne du serveur de télémétrie : " + err.message);
  }
}

// Gérer occasionnellement les requêtes 'Options' préalables (CORS) envoyées par les navigateurs web avant le POST
function doOptions(e) {
  return response(200, true, "CORS OK");
}

function response(code, success, msg) {
  var payload = { success: success, message: msg };
  var output = ContentService.createTextOutput(JSON.stringify(payload));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
