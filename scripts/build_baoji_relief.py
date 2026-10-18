"""Build a compact offline Baoji elevation grid. Requires Pillow (build time only)."""
import io
import json
import math
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'frontend/src/assets'
geo = json.loads((OUT / 'baoji.json').read_text(encoding='utf-8'))
coords = [p for f in geo['features'] for poly in f['geometry']['coordinates'] for ring in poly for p in ring]
west, east = min(p[0] for p in coords), max(p[0] for p in coords)
south, north = min(p[1] for p in coords), max(p[1] for p in coords)
ZOOM, N = 9, 161

def pixel(lon, lat):
    scale = 256 * 2 ** ZOOM
    return (lon + 180) / 360 * scale, (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * scale

left, top = pixel(west, north)
right, bottom = pixel(east, south)
keys = [(x, y) for x in range(int(left // 256), int(right // 256) + 1) for y in range(int(top // 256), int(bottom // 256) + 1)]

def fetch(key):
    x, y = key
    url = f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{ZOOM}/{x}/{y}.png'
    with urllib.request.urlopen(url, timeout=45) as response:
        img = Image.open(io.BytesIO(response.read())).convert('RGB')
    return key, img

with ThreadPoolExecutor(max_workers=6) as pool:
    tiles = dict(pool.map(fetch, keys))
heights = []
for row in range(N):
    lat = north + (south - north) * row / (N - 1)
    for col in range(N):
        lon = west + (east - west) * col / (N - 1)
        px, py = pixel(lon, lat)
        r, g, b = tiles[int(px // 256), int(py // 256)].getpixel((int(px) % 256, int(py) % 256))
        heights.append(round(r * 256 + g + b / 256 - 32768))
data = {'bbox': [west, south, east, north], 'width': N, 'height': N, 'elevations': heights,
        'source': 'Mapzen / Tilezen terrain tiles (Terrarium), AWS Open Data', 'zoom': ZOOM,
        'attribution': 'https://github.com/tilezen/joerd/blob/master/docs/attribution.md'}
(OUT / 'baoji-relief.json').write_text(json.dumps(data, separators=(',', ':')), encoding='utf-8')
print(f'Built {N}x{N} measured elevation grid from {len(keys)} tiles; range {min(heights)}..{max(heights)} m')
