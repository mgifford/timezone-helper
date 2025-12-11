import json
import csv
import unicodedata

# --- Configuration ---
INPUT_JSON = 'timezones-with-latlon.json'
INPUT_CSV = 'worldcities.csv'
OUTPUT_JSON = 'timezones-filtered-capitals.json'
MIN_POPULATION = 1_000_000

def normalize(text):
    """Normalize text for consistent matching (e.g. 'São Paulo' -> 'sao paulo')"""
    if not text: return ""
    return ''.join(c for c in unicodedata.normalize('NFD', text) 
                   if unicodedata.category(c) != 'Mn').lower().strip()

def load_city_metadata(csv_path):
    """
    Creates a dictionary mapping:
    (city_name, country_code) -> {'pop': int, 'capital': str}
    """
    print("Loading world cities metadata...")
    meta_map = {}
    
    try:
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                iso2 = row.get('iso2', '').upper()
                
                # Parse Population
                try:
                    pop = float(row.get('population', 0) or 0)
                except ValueError:
                    pop = 0
                
                # Parse Capital Status
                # 'primary' = National Capital
                # 'admin' = State/Province Capital
                capital = row.get('capital', '').strip().lower()

                # Store metadata for both ASCII and UTF8 names
                names_to_map = [
                    normalize(row.get('city', '')), 
                    normalize(row.get('city_ascii', ''))
                ]
                
                data = {'pop': pop, 'capital': capital}

                for name in names_to_map:
                    if not name: continue
                    key = (name, iso2)
                    
                    # If duplicate exists (rare in basic set), prefer the one with higher population
                    if key not in meta_map or pop > meta_map[key]['pop']:
                        meta_map[key] = data

    except FileNotFoundError:
        print(f"Error: Could not find {csv_path}. Please ensure it is in the folder.")
        return {}
        
    return meta_map

def filter_cities():
    # 1. Load Metadata
    meta_map = load_city_metadata(INPUT_CSV)
    if not meta_map: return

    # 2. Load JSON Data
    print(f"Loading {INPUT_JSON}...")
    with open(INPUT_JSON, 'r', encoding='utf-8') as f:
        cities = json.load(f)

    print(f"Original count: {len(cities)} cities")

    # 3. Attach Data to JSON objects
    for city in cities:
        name = normalize(city.get('city', ''))
        code = city.get('countryCode', '').upper()
        
        # Default values if not found in CSV
        metadata = meta_map.get((name, code), {'pop': 0, 'capital': ''})
        
        city['population'] = metadata['pop']
        city['capital'] = metadata['capital']

    # 4. Group by Timezone
    tz_groups = {}
    for city in cities:
        tz = city.get('tz')
        if not tz: continue
        if tz not in tz_groups:
            tz_groups[tz] = []
        tz_groups[tz].append(city)

    # 5. Apply Filtering Logic
    final_list = []
    
    for tz, group in tz_groups.items():
        # Sort group by population (largest first)
        group.sort(key=lambda x: x['population'], reverse=True)
        
        selected_cities = []
        
        for city in group:
            is_large = city['population'] >= MIN_POPULATION
            is_capital = city['capital'] in ['primary', 'admin'] # National or State capital
            
            if is_large or is_capital:
                selected_cities.append(city)
        
        if selected_cities:
            final_list.extend(selected_cities)
        else:
            # SAFETY NET: If this timezone has NO major cities or capitals,
            # keep the single largest one available.
            if group:
                final_list.append(group[0])

    # 6. Save Result
    # Clean up temporary fields before saving
    for city in final_list:
        city.pop('population', None)
        city.pop('capital', None)

    # Sort by name for neatness
    final_list.sort(key=lambda x: x['city'])
    
    print(f"Filtering complete. Keeping {len(final_list)} cities.")
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(final_list, f, indent=2)
        
    print(f"Saved to {OUTPUT_JSON}")

if __name__ == "__main__":
    filter_cities()