#!/usr/bin/env python3
"""Planet Teller – kleiner lokaler Server (nur Python-Standardbibliothek).

Start im Projektordner:
    python3 server.py            -> http://127.0.0.1:4173/index.html
    python3 server.py 4173 --lan -> zusätzlich im WLAN erreichbar (z. B. fürs Handy)

Was er tut:
  1. liefert die App-Dateien aus (nur die App selbst, keine Notizen oder Sicherungen),
  2. reicht die Lebensmittelsuche an Open Food Facts weiter (/api/suche?q=...).
     Der Browser darf die schnelle Suche dort nicht direkt aufrufen, der Server schon.
     Übertragen wird nur der Suchbegriff – keine Tagebuchdaten.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
APP_FILES = {"index.html", "app.js", "foods.js", "sw.js", "manifest.webmanifest", "icon.svg", "icon-180.png", "icon-512.png"}
SEARCH_URL = "https://search.openfoodfacts.org/search"
SEARCH_FIELDS = (
    "product_name,product_name_de,brands,nutriments,categories_tags,"
    "allergens_tags,serving_quantity,ecoscore_data,countries_tags"
)
USER_AGENT = "PlanetTeller/0.2 (lokale Ernaehrungs-App)"
CACHE_SECONDS = 24 * 3600
CACHE_MAX = 300
_cache = {}


def slim_product(hit):
    """Behält nur die Felder, die die App wirklich braucht."""
    nutriments = hit.get("nutriments") or {}
    agribalyse = ((hit.get("ecoscore_data") or {}).get("agribalyse")) or {}
    return {
        "product_name": hit.get("product_name"),
        "product_name_de": hit.get("product_name_de"),
        "brands": hit.get("brands"),
        "nutriments": {
            "energy-kcal_100g": nutriments.get("energy-kcal_100g"),
            "proteins_100g": nutriments.get("proteins_100g"),
        },
        "categories_tags": (hit.get("categories_tags") or [])[:12],
        "allergens_tags": hit.get("allergens_tags") or [],
        "serving_quantity": hit.get("serving_quantity"),
        "ecoscore_data": {"agribalyse": {"co2_total": agribalyse.get("co2_total")}},
        "de": "en:germany" in (hit.get("countries_tags") or []),
    }


def search_products(query):
    key = query.strip().lower()
    cached = _cache.get(key)
    if cached and time.time() - cached[0] < CACHE_SECONDS:
        return cached[1]
    params = urllib.parse.urlencode({"q": query, "langs": "de", "page_size": 30, "fields": SEARCH_FIELDS})
    request = urllib.request.Request(f"{SEARCH_URL}?{params}", headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=10) as response:
        data = json.load(response)
    products = [slim_product(hit) for hit in data.get("hits") or []]
    products.sort(key=lambda p: not p["de"])  # in Deutschland erhältliche Produkte zuerst
    if len(_cache) >= CACHE_MAX:
        _cache.pop(next(iter(_cache)))
    _cache[key] = (time.time(), products)
    return products


class Handler(SimpleHTTPRequestHandler):
    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        if url.path == "/api/suche":
            query = (urllib.parse.parse_qs(url.query).get("q") or [""])[0].strip()[:80]
            if len(query) < 2:
                return self.send_json(400, {"error": "Suchbegriff fehlt", "products": []})
            try:
                return self.send_json(200, {"products": search_products(query)})
            except (urllib.error.URLError, TimeoutError, ValueError) as error:
                return self.send_json(502, {"error": f"Open Food Facts nicht erreichbar: {error}", "products": []})
        name = url.path.lstrip("/") or "index.html"
        if name not in APP_FILES:
            return self.send_error(404, "Nicht gefunden")
        self.path = "/" + name
        return super().do_GET()

    def do_HEAD(self):
        name = urllib.parse.urlsplit(self.path).path.lstrip("/") or "index.html"
        if name not in APP_FILES:
            return self.send_error(404, "Nicht gefunden")
        self.path = "/" + name
        return super().do_HEAD()

    def end_headers(self):
        # App-Dateien immer frisch prüfen, damit Änderungen sofort sichtbar sind.
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        # Suchbegriffe nicht ins Protokoll schreiben.
        sys.stderr.write("%s - %s\n" % (self.log_date_time_string(), (fmt % args).split("?")[0]))


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    online_port = os.environ.get("PORT")  # setzt der Hosting-Anbieter (z. B. Railway)
    port = int(args[0]) if args else int(online_port or 4173)
    host = "0.0.0.0" if ("--lan" in sys.argv or online_port) else "127.0.0.1"
    handler = partial(Handler, directory=str(ROOT))
    with ThreadingHTTPServer((host, port), handler) as httpd:
        print(f"Planet Teller läuft: http://127.0.0.1:{port}/index.html  (Beenden mit Strg+C)", flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nBeendet.")


if __name__ == "__main__":
    main()
