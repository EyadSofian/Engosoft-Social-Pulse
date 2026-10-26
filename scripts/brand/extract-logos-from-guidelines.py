"""Extract the four approved Engosoft logo artworks, as exact vector paths, from
the official "Brand Guidelines for UI-UX" PDF ("Correct Logo Usage — Approved").

Nothing is redrawn: every path, fill and fill rule comes from the PDF content
stream. Background panels and circle containers are excluded so each SVG has a
transparent background.

Requires PyMuPDF:  python3 -m pip install --target <dir> pymupdf
Usage: PYTHONPATH=<dir> python3 scripts/brand/extract-logos-from-guidelines.py <guidelines.pdf> brand/logos
"""
import hashlib, json, sys
import fitz

# Drawing indices inside the single 595x7603pt guidelines page, verified by
# inspecting fills and positions. Ranges are inclusive.
VARIANTS = {
    # White bars, white wordmark, white tagline, orange dot. Shown on #0046FF panels.
    'lockup-reversed': range(235, 274),
    # #0046FF bars and wordmark, #1A1A1A tagline, orange dot. Shown on a white panel.
    'lockup-positive': range(314, 353),
    # White symbol + orange dot. Shown inside the blue circle badge (353 is the circle).
    'symbol-reversed': range(354, 358),
    # #0046FF symbol + orange dot. Shown standalone on the light guideline page.
    'symbol-positive': range(368, 372),
}

def hexcolor(c):
    return '#%02X%02X%02X' % tuple(int(round(v * 255)) for v in c[:3])

def path_data(drawing, ox, oy):
    f = lambda p: f'{p.x - ox:.3f} {p.y - oy:.3f}'
    parts, last = [], None
    for item in drawing['items']:
        kind = item[0]
        if kind == 'l':
            a, b = item[1], item[2]
            if last is None or abs(last.x - a.x) > 1e-3 or abs(last.y - a.y) > 1e-3: parts.append(f'M{f(a)}')
            parts.append(f'L{f(b)}'); last = b
        elif kind == 'c':
            a, c1, c2, b = item[1:5]
            if last is None or abs(last.x - a.x) > 1e-3 or abs(last.y - a.y) > 1e-3: parts.append(f'M{f(a)}')
            parts.append(f'C{f(c1)} {f(c2)} {f(b)}'); last = b
        elif kind == 're':
            r = item[1]
            parts.append(f'M{r.x0 - ox:.3f} {r.y0 - oy:.3f}H{r.x1 - ox:.3f}V{r.y1 - oy:.3f}H{r.x0 - ox:.3f}Z'); last = None
        elif kind == 'qu':
            q = item[1]
            parts.append(f'M{f(q.ul)}L{f(q.ur)}L{f(q.lr)}L{f(q.ll)}Z'); last = None
        else:
            raise ValueError(f'unsupported path item {kind}')
    if drawing.get('closePath'): parts.append('Z')
    return ''.join(parts)

def main(pdf_path, out_dir):
    pdf_bytes = open(pdf_path, 'rb').read()
    page = fitz.open(pdf_path)[0]
    drawings = page.get_drawings()
    report = {'sourcePdfSha256': hashlib.sha256(pdf_bytes).hexdigest(), 'variants': {}}
    for name, indices in VARIANTS.items():
        group = [drawings[i] for i in indices]
        for d in group:
            if d['type'] != 'f' or d.get('fill') is None or (d.get('fill_opacity') or 1) != 1:
                raise ValueError(f'{name}: unexpected drawing style {d["type"]}')
        box = fitz.Rect(group[0]['rect'])
        for d in group[1:]: box |= d['rect']
        evenodd = ' fill-rule="evenodd"'
        paths = ''.join(
            f'<path fill="{hexcolor(d["fill"])}"{evenodd if d.get("even_odd") else ""} d="{path_data(d, box.x0, box.y0)}"/>'
            for d in group)
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {box.width:.3f} {box.height:.3f}" '
               f'width="{box.width:.3f}" height="{box.height:.3f}">{paths}</svg>\n')
        with open(f'{out_dir}/engosoft-{name}.svg', 'w') as fh: fh.write(svg)
        report['variants'][name] = {
            'file': f'engosoft-{name}.svg', 'sha256': hashlib.sha256(svg.encode()).hexdigest(),
            'sourceBoxPt': [round(v, 3) for v in (box.x0, box.y0, box.x1, box.y1)],
            'widthPt': round(box.width, 3), 'heightPt': round(box.height, 3),
            'fills': sorted({hexcolor(d['fill']) for d in group}), 'pathCount': len(group),
        }
    with open(f'{out_dir}/extraction-report.json', 'w') as fh: json.dump(report, fh, indent=2)
    print(json.dumps(report, indent=2))

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
