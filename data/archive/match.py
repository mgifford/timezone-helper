import json
import csv
import unicodedata

def normalize_text(text):
    """
    Normalizes text to remove accents and handle special characters 
    (e.g., 'São Paulo' -> 'Sao Paulo') for better matching.
    """
    if not text:
        return ""
    return ''.join(
        c for c in unicodedata.normalize('NFD', text)
        if unicodedata.category(c) != 'Mn'
    ).lower().strip()

def load_city_coordinates(csv_path):
    """
    Loads city coordinates from SimpleMaps CSV into a dictionary.
    """
    coords_map = {}
    print("Loading world cities database...")
    
    try:
        with open(csv_path, mode='r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                country_code = row.get('iso2', '').upper()
                try:
                    lat = float(row['lat'])
                    lon = float(row['lng'])
                except ValueError:
                    continue 
                
                name_original = normalize_text(row['city'])
                name_ascii = normalize_text(row['city_ascii'])
                
                coords_map[(name_original, country_code)] = {'lat': lat, 'lon': lon}
                if name_ascii != name_original:
                    coords_map[(name_ascii, country_code)] = {'lat': lat, 'lon': lon}
    except FileNotFoundError:
        print("Error: 'worldcities.csv' not found. Please download it from simplemaps.com")
        return {}
                
    print(f"Loaded {len(coords_map)} locations.")
    return coords_map

def process_timezone_file(json_path, coords_map, output_path):
    print(f"Processing {json_path}...")
    
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    final_data = [] # This will store ONLY the matched cities
    matched_count = 0
    removed_count = 0
    
    for entry in data:
        city = entry.get('city')
        country_code = entry.get('countryCode')
        
        # Skip entries that are not cities (e.g. UTC, generic timezones)
        if not city or not country_code:
            removed_count += 1
            continue

        key = (normalize_text(city), country_code.upper())
        match = None
        
        # 1. Try exact match
        if key in coords_map:
            match = coords_map[key]
        else:
            # 2. Try match after removing punctuation (e.g. 'Ataq vs Ataq)
            clean_city = normalize_text(city.replace("'", "").replace("-", " "))
            key_clean = (clean_city, country_code.upper())
            if key_clean in coords_map:
                match = coords_map[key_clean]
        
        # If we found a match, add the coordinates and keep the entry
        if match:
            entry['lat'] = match['lat']
            entry['lon'] = match['lon']
            final_data.append(entry)
            matched_count += 1
        else:
            # If no match, we do NOT add it to final_data (effectively removing it)
            removed_count += 1

    # Save ONLY the valid data
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(final_data, f, indent=2)
        
    print(f"\nProcessing complete.")
    print(f"Kept (Matched): {matched_count}")
    print(f"Removed (Missing/No City): {removed_count}")
    print(f"Saved to: {output_path}")

# --- Execution ---
try:
    coordinates = load_city_coordinates('worldcities.csv')
    
    if coordinates:
        process_timezone_file(
            'timezones-simplified-without-latlon.json', 
            coordinates, 
            'timezones-with-latlon.json'
        )
    
except Exception as e:
    print(f"An error occurred: {e}")