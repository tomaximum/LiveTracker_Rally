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
    var rootFolder = DriveApp.getFolderById(ROOT_FOLDER_ID);
    
    // -- 1. Enregistrement d'une trace GPX --
    if (type === "gpx") {
      var fileName = data.name;
      var xmlContent = data.xml;
      
      var blob = Utilities.newBlob(xmlContent, "application/gpx+xml", fileName);
      rootFolder.createFile(blob);
      return response(200, true, "Trace GPX enregistrée avec succès : " + fileName);
    }
    
    // -- 2. Enregistrement d'un Export Complet (Fiches PDF, Classement CSV...) --
    else if (type === "export") {
      var exportName = data.name;
      var b64Content = data.file_b64;
      
      // Déterminer le bon type mime pour l'extension
      var mimeType = "application/octet-stream";
      if (exportName.indexOf(".pdf") > -1) mimeType = "application/pdf";
      if (exportName.indexOf(".csv") > -1) mimeType = "text/csv";
      
      // Convertir la base64 reçue du front (Javascript btoa) en binaire/blob
      var decodedBytes = Utilities.base64Decode(b64Content);
      var blobExport = Utilities.newBlob(decodedBytes, mimeType, exportName);
      rootFolder.createFile(blobExport);
      
      return response(200, true, "Fichier d'export généré et sauvé : " + exportName);
    }
    
    // -- 3. (Optionnel) Journal de Statistiques (Qui se connecte, combien de pilotes chargés) --
    else if (type === "stats") {
      if (SPREADSHEET_ID !== "") {
        var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getActiveSheet();
        var now = new Date();
        sheet.appendRow([now, data.pilots, data.gpx_loaded, data.screen, data.ua]);
      }
      return response(200, true, "Statistiques de connexion enregistrées.");
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
