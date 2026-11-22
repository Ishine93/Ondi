' Démarre Ondi sans fenêtre ni navigateur, hors de toute appli « empaquetée ».
' lancer.mjs le fait ouvrir par l'Explorateur quand Ondi est (re)démarré depuis l'appli de bureau Claude :
' le serveur voit alors le vrai dossier %APPDATA%\Debrideur (profils, historique), pas une copie privée.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
racine = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
node = racine & "\runtime\node\node.exe"
If Not fso.FileExists(node) Then node = "node"
sh.Environment("PROCESS")("DEBRIDEUR_HORS_BULLE") = "1"
sh.CurrentDirectory = racine
sh.Run """" & node & """ """ & racine & "\lancer.mjs"" --sans-navigateur", 0, False
