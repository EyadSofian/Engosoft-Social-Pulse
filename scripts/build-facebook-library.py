"""Normalize the visible Engosoft Facebook sample into traceable design references.

The source JSON is a browser-visible sample, not a complete Page archive. Captions
may be shortened by Facebook. This script deliberately stores links and metadata,
not copies of the Page's image files.
"""
import csv
import json
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse

ROOT = Path(__file__).resolve().parents[1]
rows = json.loads((ROOT / 'data/facebook-posts-raw.json').read_text())

def canonical(url):
    parsed = urlparse(url)
    if '/reel/' in parsed.path:
        return f'https://www.facebook.com{parsed.path}'
    if '/photo/' in parsed.path:
        query = parse_qs(parsed.query)
        if not query.get('fbid'):
            return ''
        return 'https://www.facebook.com/photo/?' + urlencode({'fbid': query['fbid'][0]})
    return ''

def family(caption, media_type, count):
    c = caption.lower()
    if any(x in c for x in ['ويبينار', 'webinar']): return 'webinar'
    if any(x in c for x in ['نشارككم دوراتنا', 'دوراتنا الـ', 'شهر سبتمب']): return 'monthly-schedule'
    if any(x in c for x in ['اسأل ماجد', 'ماجد ليس', 'مع ماجد']): return 'ask-majed'
    if any(x in c for x in ['تهنّي', 'نهنئكم', 'عيدنا الوطني', 'يومنا الوطني', 'يوم المعلم']): return 'occasion'
    if any(x in c for x in ['فريق engosoft', 'كل الشكر والتقدير']): return 'team-spotlight'
    if any(x in c for x in ['شهادة', 'اختبار', 'pmp', 'cmrp', 'cfm']): return 'certification'
    if media_type == 'reel': return 'video-hook'
    if count >= 3: return 'carousel'
    if any(x in c for x in ['ابدأ', 'سجل', 'دورة', 'تدريب']): return 'course-offer'
    return 'insight'

seen = set()
out = []
for row in rows:
    caption = ' '.join(row.get('caption', '').split())
    url = canonical(row.get('url', ''))
    if not url or url in seen or not caption or caption.startswith('Faraj Alanazi') or caption.startswith('انا مقيم مهنه'):
        continue
    seen.add(url)
    out.append({
        'reference_id': f'FB-{len(out)+1:03d}',
        'post_url': url,
        'media_type': row.get('mediaType', ''),
        'visible_media_count': row.get('mediaCount', 0),
        'design_family': family(caption, row.get('mediaType', ''), row.get('mediaCount', 0)),
        'caption_excerpt': caption[:280],
        'image_alt_excerpt': row.get('alt', '')[:180],
        'source': 'Engosoft Facebook Page, browser-visible sample, 2026-10-26',
        'review_status': 'needs_visual_review',
    })

dest = ROOT / 'public/data'
dest.mkdir(parents=True, exist_ok=True)
with (dest / 'facebook-design-references.csv').open('w', newline='') as fh:
    writer = csv.DictWriter(fh, fieldnames=out[0].keys(), lineterminator='\n')
    writer.writeheader()
    writer.writerows(out)
(dest / 'facebook-design-references.json').write_text(json.dumps(out, ensure_ascii=False, indent=2))
print(f'{len(out)} unique post references, {len(set(x["design_family"] for x in out))} families')
