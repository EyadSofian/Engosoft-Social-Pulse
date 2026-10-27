"""Import public course titles/descriptions; never treat generic course tabs as verified goals.

pip install -r scripts/catalog/requirements.txt
python scripts/catalog/import-website.py [--cached-only]
"""
import argparse
import hashlib
import json
import re
import time
from datetime import date
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from urllib.request import Request, urlopen
from bs4 import BeautifulSoup

BASE = 'https://engosoft.com'
CACHE = Path('/tmp/engosoft-course-pages')
CACHE.mkdir(exist_ok=True)
options = argparse.ArgumentParser()
options.add_argument('--cached-only', action='store_true')
args = options.parse_args()


def get(url):
    path = CACHE / (hashlib.sha256(url.encode()).hexdigest() + '.html')
    if path.exists():
        return path.read_text()
    if args.cached_only:
        raise RuntimeError('Page unavailable in the saved import')
    for attempt in range(3):
        try:
            with urlopen(Request(url, headers={'User-Agent': 'Engosoft-Social-Pulse-Catalog/1'}), timeout=25) as response:
                html = response.read().decode()
            path.write_text(html)
            return html
        except Exception:
            if attempt == 2:
                raise
            time.sleep(1 + attempt)


xml = get(BASE + '/sitemap.xml')
urls = sorted({u for u in re.findall(r'<loc>(.*?)</loc>', xml) if re.search(r'/shop/[^/]+-\d+$', u) and '/category/' not in u})
# Related-product cards can verify a title even when the course's own page is offline.
linked_titles = {}
for path in CACHE.glob('*.html'):
    html = path.read_text()
    if '<!DOCTYPE html' not in html and '<html' not in html:
        continue
    soup = BeautifulSoup(html, 'html.parser')
    for link in soup.select('a[href]'):
        url = link['href'].split('?')[0]
        if url.startswith('/'):
            url = BASE + url
        text = link.get_text(' ', strip=True)
        if url in urls and text and len(text) < 300:
            linked_titles.setdefault(url, text)


def parse(url):
    course_id = 'product.template:' + re.search(r'-(\d+)$', url).group(1)
    try:
        soup = BeautifulSoup(get(url), 'html.parser')
        title = soup.select_one('h1')
        if not title:
            raise RuntimeError('No course heading')
        description = soup.select_one('meta[name="description"]')
        return {'courseId': course_id, 'courseName': title.get_text(' ', strip=True), 'description': (description.get('content', '').strip() if description else '')[:1500], 'sourceUrl': url, 'sourceQuality': 'page', 'sourceNote': ''}
    except Exception:
        title = linked_titles.get(url)
        # Keep every discovered URL visible in admin; an unverified title is clearly marked for review.
        placeholder = re.sub(r'-\d+$', '', url.rsplit('/', 1)[-1]).replace('-', ' ')
        return {'courseId': course_id, 'courseName': title or placeholder, 'description': '', 'sourceUrl': url, 'sourceQuality': 'catalog' if title else 'sitemap', 'sourceNote': 'تعذّر تحميل صفحة الدورة؛ الاسم من بطاقة الدورة بالموقع.' if title else 'تعذّر تحميل صفحة الدورة. اسم مؤقت مستنتج من الرابط؛ راجع الاسم والمحتوى قبل الاعتماد.'}


with ThreadPoolExecutor(max_workers=5) as pool:
    courses = list(pool.map(parse, urls))
result = {'source': BASE + '/shop', 'retrievedAt': date.today().isoformat(), 'discovered': len(urls), 'courses': courses}
Path('server/data').mkdir(exist_ok=True)
Path('server/data/engosoft-website-courses.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({'discovered': len(urls), 'sources': {quality: sum(c['sourceQuality'] == quality for c in courses) for quality in ['page', 'catalog', 'sitemap']}}))
