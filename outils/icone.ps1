# Génère debrideur.ico (dégradé violet → bleu de Jellyfin, flèche de téléchargement).
Add-Type -AssemblyName System.Drawing
$racine = Split-Path -Parent $PSScriptRoot
$taille = 256
$bmp = New-Object System.Drawing.Bitmap $taille, $taille
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.Clear([System.Drawing.Color]::Transparent)

$rayon = 64
$chemin = New-Object System.Drawing.Drawing2D.GraphicsPath
$chemin.AddArc(0, 0, $rayon, $rayon, 180, 90)
$chemin.AddArc($taille - $rayon - 1, 0, $rayon, $rayon, 270, 90)
$chemin.AddArc($taille - $rayon - 1, $taille - $rayon - 1, $rayon, $rayon, 0, 90)
$chemin.AddArc(0, $taille - $rayon - 1, $rayon, $rayon, 90, 90)
$chemin.CloseFigure()
$degrade = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.Point 0, 0), (New-Object System.Drawing.Point $taille, $taille),
  [System.Drawing.Color]::FromArgb(170, 92, 195), [System.Drawing.Color]::FromArgb(0, 164, 220))
$g.FillPath($degrade, $chemin)

$stylo = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), 24
$stylo.StartCap = 'Round'; $stylo.EndCap = 'Round'; $stylo.LineJoin = 'Round'
$g.DrawLine($stylo, 128, 56, 128, 160)
$g.DrawLines($stylo, [System.Drawing.Point[]]@((New-Object System.Drawing.Point 80, 112), (New-Object System.Drawing.Point 128, 160), (New-Object System.Drawing.Point 176, 112)))
$g.DrawLine($stylo, 72, 200, 184, 200)
$g.Dispose()

$png = New-Object System.IO.MemoryStream
$bmp.Save($png, [System.Drawing.Imaging.ImageFormat]::Png)
$donnees = $png.ToArray()
$ico = New-Object System.IO.MemoryStream
$w = New-Object System.IO.BinaryWriter $ico
$w.Write([UInt16]0); $w.Write([UInt16]1); $w.Write([UInt16]1)          # en-tête ICO, 1 image
$w.Write([Byte]0); $w.Write([Byte]0); $w.Write([Byte]0); $w.Write([Byte]0) # 256x256, pas de palette
$w.Write([UInt16]1); $w.Write([UInt16]32)                                  # plans, bits par pixel
$w.Write([UInt32]$donnees.Length); $w.Write([UInt32]22)                    # taille, position
$w.Write($donnees)
[System.IO.File]::WriteAllBytes((Join-Path $racine 'debrideur.ico'), $ico.ToArray())
$bmp.Save((Join-Path $racine 'outils\apercu-icone.png'), [System.Drawing.Imaging.ImageFormat]::Png)
"Icône écrite : $(Join-Path $racine 'debrideur.ico')"
