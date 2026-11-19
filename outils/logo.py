"""Dessine le logo d'Ondi (l'orbe coupée en biais) et toutes ses icônes.

    python outils/logo.py

Il faut Python et Pillow (pip install pillow) ; ce n'est utile que pour redessiner les icônes, pas pour
lancer Ondi. Le logo est décrit une seule fois ici (couleurs, angle et largeur de la coupe), puis écrit en
vecteur (public/ondi.svg, utilisé par la page et l'intro animée) et en images pour Windows, Mac, les
téléphones et les applis télé.
"""
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

RACINE = Path(__file__).resolve().parent.parent
# Dégradé du haut à gauche vers le bas à droite : cyan, bleu, violet, pourpre, magenta.
STOPS = [(0.0, '#00d8ff'), (0.2, '#1965fb'), (0.44, '#6f19fb'), (0.56, '#8f12fc'), (0.68, '#b50bf3'), (0.92, '#fd0fd1'), (1.0, '#ff10cc')]
FOND = '#05070d'
ANGLE = -29.6          # coupe : monte vers la droite (degrés)
DECALAGE = 0.035       # la coupe passe un peu sous le centre (fraction du rayon)
DEMI_COUPE = 0.042     # demi-largeur de la coupe (fraction du rayon)


def morceaux(cx, cy, r):
    """Les deux morceaux de l'orbe : liste de (point gauche, point droit, balayage) pour chaque corde."""
    u = (math.cos(math.radians(ANGLE)), math.sin(math.radians(ANGLE)))  # le long de la coupe
    n = (-u[1], u[0])  # perpendiculaire, vers le bas à droite
    sortie = []
    for s, balayage in ((DECALAGE - DEMI_COUPE, 0), (DECALAGE + DEMI_COUPE, 1)):
        d = s * r
        l = math.sqrt(r * r - d * d)
        g = (cx + d * n[0] - l * u[0], cy + d * n[1] - l * u[1])
        dr = (cx + d * n[0] + l * u[0], cy + d * n[1] + l * u[1])
        sortie.append((g, dr, balayage))
    return sortie


def chemins_svg(cx, cy, r):
    f = lambda v: f'{v:.2f}'.rstrip('0').rstrip('.')
    return [
        f'M{f(g[0])} {f(g[1])}L{f(d[0])} {f(d[1])}A{f(r)} {f(r)} 0 0 {b} {f(g[0])} {f(g[1])}Z'
        for g, d, b in morceaux(cx, cy, r)
    ]


def vecteur(cx, cy, r):
    # Comme l'image de Codex : en diagonale, du haut à gauche vers le bas à droite, sur tout le diamètre.
    k = r / math.sqrt(2)
    return cx - k, cy - k, cx + k, cy + k


def degrade_svg(ident, cx, cy, r):
    x1, y1, x2, y2 = vecteur(cx, cy, r)
    stops = ''.join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in STOPS)
    return f'<linearGradient id="{ident}" x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" gradientUnits="userSpaceOnUse">{stops}</linearGradient>'


def svg_logo():
    cx = cy = 50
    r = 48
    haut, bas = chemins_svg(cx, cy, r)
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
        f'<defs>{degrade_svg("ondi", cx, cy, r)}</defs>'
        f'<path fill="url(#ondi)" d="{haut}"/><path fill="url(#ondi)" d="{bas}"/></svg>\n'
    )


def hex_rgb(c):
    return tuple(int(c[i:i + 2], 16) for i in (1, 3, 5))


def couleur(t):
    t = max(0.0, min(1.0, t))
    for (o1, c1), (o2, c2) in zip(STOPS, STOPS[1:]):
        if t <= o2:
            k = (t - o1) / (o2 - o1)
            a, b = hex_rgb(c1), hex_rgb(c2)
            return tuple(round(a[i] + (b[i] - a[i]) * k) for i in range(3))
    return hex_rgb(STOPS[-1][1])


def orbe(taille, diametre, fond=None, ech=4):
    """Image carrée `taille`, orbe de `diametre` pixels au centre, fond plein ou transparent."""
    T = taille * ech
    r = diametre * ech / 2
    cx = cy = T / 2
    x1, y1, x2, y2 = vecteur(cx, cy, r)
    vx, vy = x2 - x1, y2 - y1
    n2 = vx * vx + vy * vy
    # Dégradé calculé sur une petite image puis agrandi (lisse et rapide).
    p = 256
    petit = Image.new('RGB', (p, p))
    px = petit.load()
    for j in range(p):
        for i in range(p):
            x, y = i * T / p, j * T / p
            px[i, j] = couleur(((x - x1) * vx + (y - y1) * vy) / n2)
    degrade = petit.resize((T, T), Image.BICUBIC)
    masque = Image.new('L', (T, T), 0)
    d = ImageDraw.Draw(masque)
    for g, dr, balayage in morceaux(cx, cy, r):
        a0 = math.atan2(dr[1] - cy, dr[0] - cx)
        a1 = math.atan2(g[1] - cy, g[0] - cx)
        # balayage 0 : de la droite vers la gauche par le haut (angles décroissants à l'écran) ; 1 : par le bas.
        if balayage == 0:
            while a1 > a0:
                a1 -= 2 * math.pi
        else:
            while a1 < a0:
                a1 += 2 * math.pi
        pts = [g, dr] + [(cx + r * math.cos(a0 + (a1 - a0) * k / 200), cy + r * math.sin(a0 + (a1 - a0) * k / 200)) for k in range(201)]
        d.polygon(pts, fill=255)
    base = Image.new('RGBA', (T, T), hex_rgb(fond) + (255,) if fond else (0, 0, 0, 0))
    base.paste(degrade, (0, 0), masque)
    return base.resize((taille, taille), Image.LANCZOS)


def police(taille):
    for nom in ('seguibl.ttf', 'segoeuib.ttf', 'arialbd.ttf'):
        try:
            return ImageFont.truetype(nom, taille)
        except OSError:
            pass
    return ImageFont.load_default()


def avec_nom(largeur, hauteur, diametre, taille_texte, vertical=False):
    """Logo + « Ondi » sur fond sombre (bannière Android TV, écran de démarrage LG)."""
    im = Image.new('RGBA', (largeur, hauteur), hex_rgb(FOND) + (255,))
    o = orbe(diametre, diametre)
    f = police(taille_texte)
    d = ImageDraw.Draw(im)
    bx = d.textbbox((0, 0), 'Ondi', font=f)
    tw, th = bx[2] - bx[0], bx[3] - bx[1]
    if vertical:
        y0 = (hauteur - diametre - th - diametre * 0.35) / 2
        im.alpha_composite(o, (int((largeur - diametre) / 2), int(y0)))
        d.text(((largeur - tw) / 2 - bx[0], y0 + diametre * 1.35 - bx[1]), 'Ondi', font=f, fill='white')
    else:
        ecart = diametre * 0.32
        x0 = (largeur - diametre - ecart - tw) / 2
        im.alpha_composite(o, (int(x0), int((hauteur - diametre) / 2)))
        d.text((x0 + diametre + ecart - bx[0], (hauteur - th) / 2 - bx[1]), 'Ondi', font=f, fill='white')
    return im


def main():
    (RACINE / 'public' / 'ondi.svg').write_text(svg_logo(), encoding='utf-8')
    rgb = lambda im: im.convert('RGB')
    # Appli web (téléphone, PC) : icône pleine, l'orbe dans la zone sûre des icônes « maskable ».
    for t in (192, 512):
        rgb(orbe(t, round(t * 0.58), FOND)).save(RACINE / 'public' / f'icone-{t}.png')
    # Windows : fond transparent, l'orbe prend presque toute la place (lisible en 16 px).
    ico = orbe(256, 244)
    ico.save(RACINE / 'debrideur.ico', sizes=[(16, 16), (20, 20), (24, 24), (32, 32), (40, 40), (48, 48), (64, 64), (128, 128), (256, 256)])
    # Télés.
    samsung = Image.new('RGB', (512, 423), hex_rgb(FOND))
    samsung.paste(orbe(260, 260, FOND).convert('RGB'), ((512 - 260) // 2, (423 - 260) // 2))
    samsung.save(RACINE / 'tele' / 'samsung' / 'app' / 'icon.png')
    rgb(orbe(80, 50, FOND)).save(RACINE / 'tele' / 'lg' / 'app' / 'icon.png')
    rgb(orbe(130, 80, FOND)).save(RACINE / 'tele' / 'lg' / 'app' / 'largeIcon.png')
    rgb(avec_nom(1920, 1080, 300, 150, vertical=True)).save(RACINE / 'tele' / 'lg' / 'app' / 'splash.png')
    orbe(192, 112, FOND).save(RACINE / 'tele' / 'android' / 'res' / 'mipmap-xxxhdpi' / 'icone.png')
    rgb(avec_nom(320, 180, 84, 64)).save(RACINE / 'tele' / 'android' / 'res' / 'drawable-xhdpi' / 'banniere.png')
    print('Logo et icônes écrits.')


if __name__ == '__main__':
    main()
