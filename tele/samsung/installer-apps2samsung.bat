@echo off
chcp 65001 >nul
title Apps2Samsung
echo Installing Apps2Samsung (free tool that sends the app to the TV)...
echo Installation d'Apps2Samsung (outil gratuit qui envoie l'appli sur la télé)...
where winget >nul 2>nul
if %errorlevel%==0 (
  winget install --id Apps2Samsung.Apps2Samsung -e --source winget --accept-package-agreements --accept-source-agreements
  if not errorlevel 1 (
    echo.
    echo Done: open Apps2Samsung from the Start menu, then follow README.md (step 2).
    echo C'est fait : ouvre Apps2Samsung depuis le menu Démarrer, puis suis README.md (étape 2).
    pause
    exit /b 0
  )
)
echo winget is not available: opening the download page.
echo winget n'est pas disponible : ouverture de la page de téléchargement.
start "" "https://github.com/Apps2Samsung/Apps2Samsung/releases/latest"
pause
