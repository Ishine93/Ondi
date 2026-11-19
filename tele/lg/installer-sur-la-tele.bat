@echo off
rem Installe l'application Debrideur sur une tele LG : lance installer-sur-la-tele.ps1, qui est a cote.
rem (Fichier sans accents expres : l'invite de commandes de Windows les afficherait mal.)
if not exist "%~dp0installer-sur-la-tele.ps1" (
  echo Please extract the whole zip first ^(right-click on it, "Extract All"^), then run this file again.
  echo Decompresse d'abord tout le zip ^(clic droit dessus, "Extraire tout"^), puis relance ce fichier.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0installer-sur-la-tele.ps1"
pause
