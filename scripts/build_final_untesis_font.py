import sys
from pathlib import Path
import math
import shutil

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

import pathops
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.transformPen import TransformPen
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets' / 'fonts'
K = 0.5522847498307936


class Shape:
    def __init__(self, width, side=35):
        self.width = width
        self.side = side
        self.path = pathops.Path()

    def stroke(self, commands, stroke_w=11.5, cap=pathops.LineCap.BUTT_CAP, join=pathops.LineJoin.MITER_JOIN, miter=12):
        p = pathops.Path()
        for cmd, pts in commands:
            getattr(p, cmd)(*pts)
        p.stroke(stroke_w, cap, join, miter)
        self.path = pathops.op(self.path, p, pathops.PathOp.UNION)
        return self

    def line(self, *points, stroke_w=11.5):
        return self.stroke([('moveTo', points[0])] + [('lineTo', p) for p in points[1:]], stroke_w=stroke_w)

    def curve(self, start, *segments, stroke_w=11.5):
        return self.stroke([('moveTo', start)] + [('cubicTo', s) for s in segments], stroke_w=stroke_w)

    def polygon(self, *points):
        p = pathops.Path()
        p.moveTo(*points[0])
        for pt in points[1:]:
            p.lineTo(*pt)
        p.close()
        self.path = pathops.op(self.path, p, pathops.PathOp.UNION)
        return self

    def oval(self, cx, cy, rx, ry, stroke_w=11.5):
        return self.stroke([
            ('moveTo', (cx + rx, cy)),
            ('cubicTo', (cx + rx, cy + K * ry, cx + K * rx, cy + ry, cx, cy + ry)),
            ('cubicTo', (cx - K * rx, cy + ry, cx - rx, cy + K * ry, cx - rx, cy)),
            ('cubicTo', (cx - rx, cy - K * ry, cx - K * rx, cy - ry, cx, cy - ry)),
            ('cubicTo', (cx + K * rx, cy - ry, cx + rx, cy - K * ry, cx + rx, cy)),
            ('close', ())
        ], stroke_w=stroke_w)


def make_b_bowl(s, x, top, bottom, right, shoulder=None, stroke_w=11.5):
    cy = (top + bottom) / 2
    ry = (top - bottom) / 2
    shoulder = x + (right - x) * 0.52 if shoulder is None else shoulder
    rx = right - shoulder
    s.line((x, top), (shoulder, top), stroke_w=stroke_w)
    s.curve((shoulder, top),
            (shoulder + K * rx, top, right, cy + K * ry, right, cy),
            (right, cy - K * ry, shoulder + K * rx, bottom, shoulder, bottom),
            stroke_w=stroke_w)
    return s.line((shoulder, bottom), (x, bottom), stroke_w=stroke_w)


def build_final_designs():
    """Compiles the final approved master design:
    - High-Couture waist in A (y=440), E/H (y=450)
    - Squircle Chamfer in S and З (waist at y=450)
    - Noble circular arc in C (780 UPM)
    - Full 78-glyph set
    """
    SW = 11.5
    designs = {}

    def mk(char, width, side=35):
        designs[char] = s = Shape(width, side)
        return s

    def alias(char, src):
        orig = designs[src]
        cp = Shape(orig.width, orig.side)
        cp.path = pathops.Path(orig.path)
        designs[char] = cp

    # A: High Couture pyramid, crossbar y=440
    s = mk('A', 820, side=15)
    s.polygon((0, 0), (410, 720), (820, 0), (808, 0), (410, 693), (12, 0))
    s.line((155, 440), (665, 440), stroke_w=SW)

    # B: High waist
    s = mk('B', 400, side=35).line((6, 0), (6, 720), stroke_w=SW)
    make_b_bowl(s, 6, 714, 450, 394, 210, stroke_w=SW)
    make_b_bowl(s, 6, 450, 6, 394, 210, stroke_w=SW)

    # C: Noble circular arc 780 UPM
    s = mk('C', 780, side=20)
    s.curve((710, 560), (660, 670, 540, 726, 390, 726),
            (170, 726, 6, 560, 6, 360),
            (6, 160, 170, -6, 390, -6),
            (540, -6, 660, 50, 710, 160), stroke_w=SW)

    # D
    s = mk('D', 480, side=35).line((6, 0), (6, 720), stroke_w=SW)
    s.line((6, 714), (200, 714), stroke_w=SW)
    s.curve((200, 714), (370, 714, 474, 560, 474, 360),
            (474, 160, 370, 6, 200, 6), stroke_w=SW)
    s.line((200, 6), (6, 6), stroke_w=SW)

    # E: High waist y=450
    s = mk('E', 360, side=35).line((360, 714), (6, 714), (6, 6), (360, 6), stroke_w=SW)
    s.line((6, 450), (290, 450), stroke_w=SW)

    # F
    s = mk('F', 350, side=35).line((6, 0), (6, 714), (350, 714), stroke_w=SW)
    s.line((6, 450), (280, 450), stroke_w=SW)

    # G
    s = mk('G', 800, side=20)
    s.curve((730, 560), (680, 670, 550, 726, 400, 726),
            (170, 726, 6, 560, 6, 360),
            (6, 160, 170, -6, 400, -6),
            (600, -6, 720, 50, 794, 160), stroke_w=SW)
    s.line((794, 160), (794, 350), (520, 350), stroke_w=SW)

    # H: High waist y=450
    s = mk('H', 400, side=35).line((6, 0), (6, 720), stroke_w=SW).line((394, 0), (394, 720), stroke_w=SW)
    s.line((6, 450), (394, 450), stroke_w=SW)

    # I
    mk('I', 12, side=65).line((6, 0), (6, 720), stroke_w=SW)

    # J
    s = mk('J', 340, side=30).line((334, 720), (334, 200), stroke_w=SW)
    s.curve((334, 200), (334, 60, 250, -6, 170, -6), (70, -6, 6, 60, 6, 170), stroke_w=SW)

    # K
    s = mk('K', 480, side=35).line((6, 0), (6, 720), stroke_w=SW)
    s.line((470, 720), (6, 320), stroke_w=SW).line((170, 460), (474, 0), stroke_w=SW)

    # L
    mk('L', 360, side=35).line((6, 720), (6, 6), (360, 6), stroke_w=SW)

    # M
    s = mk('M', 740, side=25)
    s.polygon((0, 0), (0, 720), (370, 22), (740, 720), (740, 0), (728, 0),
              (728, 670), (370, 0), (12, 670), (12, 0))

    # N: Razor columns
    s = mk('N', 380, side=35).line((6, 0), (6, 720), stroke_w=SW).line((374, 0), (374, 720), stroke_w=SW)
    s.line((6, 714), (374, 6), stroke_w=SW)

    # O: Circular oval
    mk('O', 820, side=20).oval(410, 360, 404, 366, stroke_w=SW)

    # P: High waist
    s = mk('P', 400, side=35).line((6, 0), (6, 720), stroke_w=SW)
    make_b_bowl(s, 6, 714, 450, 394, 210, stroke_w=SW)

    # Q
    s = mk('Q', 820, side=20).oval(410, 360, 404, 366, stroke_w=SW)
    s.line((530, 150), (800, -90), stroke_w=SW)

    # R: High waist
    s = mk('R', 440, side=35).line((6, 0), (6, 720), stroke_w=SW)
    make_b_bowl(s, 6, 714, 450, 394, 210, stroke_w=SW)
    s.line((220, 450), (434, 0), stroke_w=SW)

    # =========================================================
    # S: APPROVED SQUIRCLE CHAMFER GEOMETRY
    # 45-degree chamfers, straight shelves, brutalist sculpture
    # =========================================================
    s = mk('S', 460, side=25)
    s.stroke([
        ('moveTo', (430, 560)),
        ('lineTo', (430, 684)),
        ('lineTo', (400, 714)),
        ('lineTo', (50, 714)),
        ('lineTo', (20, 684)),
        ('lineTo', (20, 490)),
        ('lineTo', (440, 310)),
        ('lineTo', (440, 36)),
        ('lineTo', (410, 6)),
        ('lineTo', (60, 6)),
        ('lineTo', (30, 36)),
        ('lineTo', (30, 160))
    ], stroke_w=SW)

    # =========================================================
    # З: APPROVED SQUIRCLE CHAMFER WITH HIGH COUTURE WAIST (y=450)
    # =========================================================
    s = mk('З', 460, side=25)
    s.stroke([
        ('moveTo', (30, 714)),
        ('lineTo', (410, 714)),
        ('lineTo', (440, 684)),
        ('lineTo', (440, 510)),
        ('lineTo', (370, 450)),  # high waist at y=450!
        ('lineTo', (440, 390)),
        ('lineTo', (440, 36)),
        ('lineTo', (410, 6)),
        ('lineTo', (30, 6)),
        ('lineTo', (10, 36)),
        ('lineTo', (10, 100))
    ], stroke_w=SW)

    # T: Crossbar
    mk('T', 480, side=20).line((0, 714), (480, 714), stroke_w=SW).line((240, 714), (240, 0), stroke_w=SW)

    # U: Circular expansive bowl
    s = mk('U', 820, side=20).line((6, 720), (6, 300), stroke_w=SW)
    s.curve((6, 300), (6, 120, 180, -6, 410, -6),
            (640, -6, 814, 120, 814, 300), stroke_w=SW)
    s.line((814, 300), (814, 720), stroke_w=SW)

    # V
    mk('V', 600, side=25).polygon((0, 720), (12, 720), (300, 26), (588, 720), (600, 720), (300, 0))

    # W
    s = mk('W', 880, side=20)
    s.polygon((0, 720), (12, 720), (220, 25), (440, 720), (660, 25), (868, 720), (880, 720),
              (660, 0), (440, 680), (220, 0))

    # X
    mk('X', 520, side=25).line((6, 714), (514, 6), stroke_w=SW).line((514, 714), (6, 6), stroke_w=SW)

    # Y
    mk('Y', 520, side=25).line((6, 714), (260, 360), (514, 714), stroke_w=SW).line((260, 360), (260, 0), stroke_w=SW)

    # Z (Latin)
    alias('Z', 'З')

    # CYRILLIC
    for c, l in {'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O',
                'Р': 'P', 'С': 'C', 'Т': 'T', 'Х': 'X'}.items():
        alias(c, l)

    s = mk('Б', 400, side=35).line((380, 714), (6, 714), (6, 0), stroke_w=SW)
    make_b_bowl(s, 6, 450, 6, 394, 210, stroke_w=SW)

    mk('Г', 350, side=35).line((6, 0), (6, 714), (350, 714), stroke_w=SW)

    # Д
    s = mk('Д', 520, side=30)
    s.line((6, -130), (6, 6), (514, 6), (514, -130), stroke_w=SW)
    s.line((60, 6), (220, 714), (440, 714), (440, 6), stroke_w=SW)

    # Ё
    s = mk('Ё', 360, side=35)
    s.path = pathops.Path(designs['E'].path)
    s.polygon((100, 800), (116, 800), (116, 816), (100, 816))
    s.polygon((244, 800), (260, 800), (260, 816), (244, 816))

    # Ж
    s = mk('Ж', 740, side=25)
    s.line((370, 0), (370, 720), stroke_w=SW)
    s.line((0, 720), (370, 310), (740, 720), stroke_w=SW)
    s.line((240, 450), (0, 0), stroke_w=SW).line((500, 450), (740, 0), stroke_w=SW)

    # И: Razor columns
    s = mk('И', 380, side=35).line((6, 0), (6, 720), stroke_w=SW).line((374, 0), (374, 720), stroke_w=SW)
    s.line((6, 6), (374, 714), stroke_w=SW)

    # Й
    s = mk('Й', 380, side=35)
    s.path = pathops.Path(designs['И'].path)
    s.curve((110, 835), (140, 765, 240, 765, 270, 835), stroke_w=SW)

    mk('Л', 500, side=30).line((0, 0), (200, 714), (494, 714), (494, 0), stroke_w=SW)
    mk('П', 380, side=35).line((6, 0), (6, 714), (374, 714), (374, 0), stroke_w=SW)

    # У
    s = mk('У', 500, side=30)
    s.line((6, 714), (270, 240), (494, 714), stroke_w=SW)
    s.curve((270, 240), (200, 80, 170, 6, 70, 6), stroke_w=SW).line((70, 6), (30, 6), stroke_w=SW)

    # Ф
    s = mk('Ф', 860, side=25).oval(430, 360, 424, 260, stroke_w=SW)
    s.line((430, -40), (430, 760), stroke_w=SW)

    # Ц
    s = mk('Ц', 440, side=30)
    s.line((6, 720), (6, 6), (380, 6), (380, 720), stroke_w=SW)
    s.line((380, 6), (434, 6), (434, -130), stroke_w=SW)

    # Ч
    s = mk('Ч', 420, side=30).line((6, 720), (6, 450), stroke_w=SW)
    s.curve((6, 450), (6, 350, 80, 340, 190, 340), stroke_w=SW)
    s.line((190, 340), (414, 340), stroke_w=SW)
    s.line((414, 0), (414, 720), stroke_w=SW)

    # Ш
    s = mk('Ш', 720, side=25)
    s.line((6, 720), (6, 6), (714, 6), (714, 720), stroke_w=SW)
    s.line((360, 6), (360, 720), stroke_w=SW)

    # Щ
    s = mk('Щ', 780, side=25)
    s.path = pathops.Path(designs['Ш'].path)
    s.line((714, 6), (774, 6), (774, -130), stroke_w=SW)

    # Ъ, Ы, Ь
    s = mk('Ъ', 480, side=30).line((0, 714), (120, 714), (120, 0), stroke_w=SW)
    make_b_bowl(s, 120, 450, 6, 474, 300, stroke_w=SW)

    s = mk('Ы', 620, side=35).line((6, 0), (6, 720), stroke_w=SW).line((614, 0), (614, 720), stroke_w=SW)
    make_b_bowl(s, 6, 450, 6, 394, 210, stroke_w=SW)

    s = mk('Ь', 400, side=35).line((6, 0), (6, 720), stroke_w=SW)
    make_b_bowl(s, 6, 450, 6, 394, 210, stroke_w=SW)

    # Э: Noble circular arc matching new C
    s = mk('Э', 780, side=20)
    s.curve((70, 560), (120, 670, 240, 726, 390, 726),
            (610, 726, 774, 560, 774, 360),
            (774, 160, 610, -6, 390, -6),
            (240, -6, 120, 50, 70, 160), stroke_w=SW)
    s.line((774, 450), (320, 450), stroke_w=SW)

    # Ю: Condensed stem + Circular bowl
    s = mk('Ю', 940, side=25).line((6, 0), (6, 720), stroke_w=SW).line((6, 450), (220, 450), stroke_w=SW)
    s.oval(580, 360, 354, 366, stroke_w=SW)

    # Я: Mirror of R
    s = mk('Я', 440, side=35)
    designs['R'].path.draw(TransformPen(s.path.getPen(), (-1, 0, 0, 1, 440, 0)))

    # Digits
    mk('0', 480, side=30).oval(240, 360, 234, 366, stroke_w=SW)
    mk('1', 200, side=90).line((0, 590), (194, 714), (194, 0), stroke_w=SW)
    s = mk('2', 440, side=30)
    s.curve((6, 560), (25, 670, 100, 726, 220, 726),
            (340, 726, 434, 640, 434, 520),
            (434, 410, 370, 340, 290, 270), stroke_w=SW)
    s.line((290, 270), (10, 6), (440, 6), stroke_w=SW)
    alias('3', 'З')
    mk('4', 460, side=30).line((350, 0), (350, 720), (6, 210), (460, 210), stroke_w=SW)
    s = mk('5', 420, side=30).line((400, 714), (45, 714), (18, 390), stroke_w=SW)
    s.curve((18, 390), (70, 430, 130, 450, 210, 450),
            (330, 450, 414, 350, 414, 210),
            (414, 70, 320, -6, 210, -6),
            (110, -6, 45, 35, 6, 110), stroke_w=SW)
    s = mk('6', 440, side=30)
    s.curve((400, 650), (350, 700, 300, 726, 230, 726),
            (90, 726, 6, 540, 6, 280), (6, 90, 90, -6, 220, -6),
            (340, -6, 434, 90, 434, 230), (434, 370, 340, 460, 220, 460),
            (100, 460, 6, 390, 6, 280), stroke_w=SW)
    mk('7', 440, side=30).line((0, 714), (430, 714), (130, 0), stroke_w=SW)
    s = mk('8', 440, side=30)
    s.curve((220, 365), (100, 430, 22, 470, 22, 560),
            (22, 665, 105, 726, 220, 726), (335, 726, 418, 665, 418, 560),
            (418, 470, 340, 430, 220, 365), (85, 290, 6, 250, 6, 160),
            (6, 55, 90, -6, 220, -6), (350, -6, 434, 55, 434, 160),
            (434, 250, 355, 290, 220, 365), stroke_w=SW)
    s = mk('9', 440, side=30)
    s.curve((45, 70), (90, 20, 140, -6, 210, -6),
            (350, -6, 434, 180, 434, 440), (434, 630, 350, 726, 220, 726),
            (100, 726, 6, 630, 6, 490), (6, 350, 100, 260, 220, 260),
            (340, 260, 434, 330, 434, 440), stroke_w=SW)

    for c in ['.', ',', ':']:
        s = mk(c, 20, side=50)
        s.polygon((0, 0), (20, 0), (20, 20), (0, 20))
        if c == ',':
            s.line((15, 5), (0, -65), stroke_w=SW)
        if c == ':':
            s.polygon((0, 365), (20, 365), (20, 385), (0, 385))
    mk('–', 420, side=35).line((0, 340), (420, 340), stroke_w=SW)
    mk('—', 740, side=35).line((0, 340), (740, 340), stroke_w=SW)
    mk('-', 260, side=35).line((0, 340), (260, 340), stroke_w=SW)
    mk('/', 320, side=35).line((0, -50), (320, 770), stroke_w=SW)

    return designs


OPTICAL_KERNING_PAIRS = {
    # Latin UNTESIS
    'UN': -18, 'NT': -24, 'TE': -28, 'ES': -16, 'SI': -12, 'IS': -12,
    # Cyrillic АНТЕЗИС
    'АН': -48, 'НТ': -26, 'ТЕ': -30, 'ЕЗ': -18, 'ЗИ': -16, 'ИС': -38,
    'ТА': -45, 'АТ': -45, 'СА': -30, 'АС': -30,
    # General
    'AV': -45, 'VA': -45, 'AW': -35, 'WA': -35, 'AY': -45, 'YA': -45,
    'LT': -35, 'LY': -40, 'TO': -25, 'OT': -25, 'PA': -30, 'FA': -30
}


def compile_final_font():
    designs = build_final_designs()
    OUT.mkdir(parents=True, exist_ok=True)
    names = {c: f'uni{ord(c):04X}' for c in designs}
    glyphs = {}
    metrics = {}

    for c, s in designs.items():
        p = pathops.simplify(s.path, clockwise=True)
        pen = TTGlyphPen(None)
        p.draw(TransformPen(Cu2QuPen(pen, max_err=0.25, reverse_direction=False),
                            (1, 0, 0, 1, s.side, 0)))
        glyphs[names[c]] = pen.glyph()
        metrics[names[c]] = (round(s.width + 2 * s.side), s.side)

    # space
    pen = TTGlyphPen(None)
    glyphs['space'] = pen.glyph()
    metrics['space'] = (320, 0)

    # .notdef
    pen = TTGlyphPen(None)
    for contour in [[(50, 0), (50, 720), (410, 720), (410, 0)],
                    [(62, 12), (398, 12), (398, 708), (62, 708)]]:
        pen.moveTo(contour[0])
        for pt in contour[1:]:
            pen.lineTo(pt)
        pen.closePath()
    glyphs['.notdef'] = pen.glyph()
    metrics['.notdef'] = (460, 50)

    order = ['.notdef', 'space'] + list(names.values())
    fb = FontBuilder(1000, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap({32: 'space', 160: 'space', **{ord(c): n for c, n in names.items()}})
    fb.setupGlyf(glyphs)

    for n, g in glyphs.items():
        if g.numberOfContours:
            metrics[n] = (metrics[n][0], g.xMin)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=900, descent=-220, lineGap=0)
    fb.setupNameTable({
        'familyName': 'Untesis Display',
        'styleName': 'Regular',
        'uniqueFontIdentifier': 'Untesis Display 2.500;UNTESIS',
        'fullName': 'Untesis Display Regular',
        'psName': 'UntesisDisplay-Regular',
        'version': 'Version 2.500',
        'copyright': 'Original bespoke typography for UNTESIS / АНТЕЗИС, 2026.',
        'description': 'Untesis Display: Couture high-fashion architecture with squircle brutalist S and З.'
    })
    fb.setupOS2(sTypoAscender=900, sTypoDescender=-220, sTypoLineGap=0,
                usWinAscent=900, usWinDescent=220, usWeightClass=200, usWidthClass=5,
                sxHeight=0, sCapHeight=720, fsSelection=0x40, fsType=0)
    fb.setupPost()
    fb.setupMaxp()

    valid_pairs = {k: v for k, v in OPTICAL_KERNING_PAIRS.items() if k[0] in designs and k[1] in designs}
    if valid_pairs:
        feature = 'languagesystem DFLT dflt; languagesystem latn dflt; languagesystem cyrl dflt;\nfeature kern {\n'
        feature += '\n'.join(f'pos {names[a]} {names[b]} {v};' for (a, b), v in valid_pairs.items())
        feature += '\n} kern;'
        addOpenTypeFeaturesFromString(fb.font, feature)

    fb.font['head'].fontRevision = 2.5

    ttf_path = OUT / 'Untesis-Display.ttf'
    woff2_path = OUT / 'Untesis-Display.woff2'
    fb.save(ttf_path)

    font = TTFont(ttf_path)
    font.flavor = 'woff2'
    font.save(woff2_path)

    print(f'✅ Compiled Untesis Display: TTF ({ttf_path.stat().st_size} B), WOFF2 ({woff2_path.stat().st_size} B), Glyphs: {len(glyphs)}')

    # Also save as Untesis.woff2 and Untesis.ttf (primary master font)
    shutil.copy(woff2_path, OUT / 'Untesis.woff2')
    shutil.copy(ttf_path, OUT / 'Untesis.ttf')
    print('✅ Saved primary master font: assets/fonts/Untesis.woff2 & assets/fonts/Untesis.ttf')


if __name__ == '__main__':
    compile_final_font()
