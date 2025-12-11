#!/usr/bin/env python3
import json
import sys
import time
import pathlib
import urllib.parse
import urllib.request

# IMPORTANT: replace with your email or contact info per Nominatim usage policy
USER_AGENT = "global-meeting-helper/0.1 (you@example.com)"
BASE_URL = "https://nominatim.openstreetmap.org/search"


def geocode(city, country_code=None):
  """Return (lat, lon) or (None, None) if not found."""
  if not city:
    return None, None

  params = {
    "q": city,
    "format": "json",
    "limit": 1,
  }
  if country_code:
    params["countrycodes"] = country_code.lower()

  url = BASE_URL + "?" + urllib.parse.urlencode(params)
  req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
  with urllib.request.urlopen(req, timeout=10) as resp:
    data = json.loads(resp.read().decode("utf-8"))

  if not data:
    return None, None

  first = data[0]
  try:
    lat = float(first["lat"])
    lon = float(first["lon"])
  except (KeyError, ValueError):
    return None, None

  return lat, lon


def main():
  if len(sys.argv) < 2:
    print("Usage: python3 latt-long.py path/to/timezones-simplified-without-latlon.json")
    sys.exit(1)

  input_path = pathlib.Path(sys.argv[1])
  if not input_path.is_file():
    print(f"Input file not found: {input_path}")
    sys.exit(1)

  # Output file: same directory, "-with-latlon" suffix
  output_path = input_path.with_name(input_path.stem + "-with-latlon.json")

  print(f"Input:  {input_path}")
  print(f"Output: {output_path}")

  with input_path.open("r", encoding="utf-8") as f:
    rows = json.load(f)

  out = []
  total = len(rows)

  for i, row in enumerate(rows, 1):
    city = row.get("city")
    cc = row.get("countryCode")
    print(f"[{i}/{total}] Geocoding {city!r} ({cc})...")

    lat, lon = row.get("lat"), row.get("lon")

    # Only geocode if lat/lon are missing or null
    if lat is None or lon is None:
      try:
        lat, lon = geocode(city, cc)
      except Exception as e:
        print(f"  ERROR: {e}")
        lat, lon = None, None

      # be polite to the API
      time.sleep(1.0)

    row["lat"] = lat
    row["lon"] = lon
    out.append(row)

  with output_path.open("w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)

  print("Done.")


if __name__ == "__main__":
  main()