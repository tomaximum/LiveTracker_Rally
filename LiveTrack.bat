@echo off
chcp 65001 >nul
title LiveTrack Rally - Lanceur

echo ===================================================
echo     Lanceur LiveTrack Rally - Suivi GPS local
echo ===================================================
echo.

:: Vérifier si Python est présent
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERREUR] Python n'est pas installe sur votre ordinateur.
    echo Veuillez installer Python depuis le Microsoft Store ou python.org.
    echo.
    pause
    exit /b 1
)

:: Lancer le serveur Python (bloquant, pour que Ctrl+C fonctionne)
echo Lancement du serveur...
python server.py

echo.
echo Le serveur s'est arrete avec succes.
pause
