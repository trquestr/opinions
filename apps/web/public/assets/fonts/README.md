# Untesis Display

Original architectural display capitals, generated specifically for UNTESIS.

- `Untesis-Display.ttf` / `Untesis-Display.woff2`: family `Untesis Display`, weight `200`.
- `Untesis.ttf` / `Untesis.woff2`: identical copy used by the site as family `Untesis`
  (see `landing.css`; the `.woff2` is preloaded in `index.html`).
- Character set: 26 Latin capitals, 33 Russian capitals including Ё and Й,
  10 digits, period, comma, colon, en/em dash, hyphen, slash, ampersand,
  ordinary/nonbreaking space. No lowercase or automatic uppercase conversion.
- 1000 UPM, nominal cap height 720, nominal stroke 11 units; wide round
  letters and M/W/Ж/Ш, narrow E/F/S/B/З/В/Р, generous I sidebearings.
- Use for large headings, ideally 80 CSS px and above. At 80 px the nominal
  stroke is only 0.88 px; small text and low-contrast rendering need another
  text face. Rasterization varies by display. This draft is unhinted.

## Rebuild

Install Python packages `fonttools[woff]` and `skia-pathops`, then run
`python scripts/build_final_untesis_font.py` from the project root.
The source contains all original geometry and a small GPOS kerning table.
No existing font outlines are copied or required.

## Geometry and draft scope

Curves use cubic Beziers, with true circular/elliptical constructions where
appropriate. Cubics are converted to TrueType quadratics within 0.25 UPM;
font coordinates are integer units. S/З and U are optically shaped compound
curves, not literal circles. Rounded forms overshoot baseline/cap height.
У retains its recognizable diagonal fork; З remains distinct from S.
Flat ends and sharp polygonal A/M/N/V/W/И extrema are deliberate. Stroke
unions remove overlapping contours before export. A compact set of kerning
pairs is included; comprehensive manual spacing, print proofs, hinting and
all-platform QA remain future refinement work. Version 0.2 is a reviewable
first design, not a claim of a production-complete commercial type family.


## Revision 0.2

P/B/R and their Cyrillic relatives now have straight horizontal shoulders
with tangent half-oval bowls; the former full-width swollen curves are removed.
Я mirrors R structurally. Ь/Ы/Ъ share the same bowl proportions. M/W/Ж are
more compact; Л/Д use a clear diagonal left leg. N/И have constant-width
stroked diagonals, and K/Ж have balanced junction heights. Ч has a level bowl.
S is slightly wider; 6/9 return tangentially to their stems; 8 uses one smooth
figure-eight curve. Sidebearings vary by round, straight and diagonal classes.
