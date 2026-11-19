@echo off
rem Installe l'application Debrideur sur une tele Android TV / Google TV / Fire TV (double-clic sur ce fichier).
rem Le travail est fait par outils\installer-tele.ps1 (PowerShell, inclus dans Windows).
if not exist "%~dp0outils\installer-tele.ps1" (
  echo Unzip the whole folder first ^(right-click the zip, "Extract All"^), then run this file again.
  echo Decompresse d'abord tout le dossier ^(clic droit sur le zip, "Extraire tout"^), puis relance ce fichier.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0outils\installer-tele.ps1"
