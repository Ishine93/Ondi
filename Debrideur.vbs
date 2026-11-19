' Lance le Débrideur sans fenêtre noire, puis ouvre la page.
' Avec l'argument --sans-navigateur : démarre seulement (utilisé au démarrage de Windows).
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dossier = fso.GetParentFolderName(WScript.ScriptFullName)
' Node.js installé par installer.bat (runtime\node), sinon celui du PC.
node = dossier & "\runtime\node\node.exe"
If Not fso.FileExists(node) Then node = "node"
args = ""
For Each a In WScript.Arguments
  args = args & " " & a
Next
sh.CurrentDirectory = dossier
sh.Run """" & node & """ """ & dossier & "\lancer.mjs""" & args, 0, False
