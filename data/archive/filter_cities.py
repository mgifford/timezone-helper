import json
import csv
import unicodedata

# --- Configuration ---
INPUT_JSON = 'timezones-with-latlon.json'
INPUT_CSV = 'worldcities.csv'
OUTPUT_JSON = 'timezones-filtered.json'
MIN_POPULATION = 1_000_000

def normalize(text):
    """Normalize text for consistent matching (e.g. 'São Paulo' -> 'sao paulo')"""
    if not text: return ""
    return ''.join(c for c in unicodedata.normalize('NFD', text) 
                   if unicodedata.category(c) != 'Mn').lower().strip()

def load_population_map(csv_path):
    """Creates a dictionary mapping (city_name, country_code) -> population"""
    print("Loading population data...")
    pop_map = {}
    try:
        with open(csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                # Get basic info
                iso2 = row.get('iso2', '').upper()
                try:
                    pop = float(row.get('population', 0) or 0)
                except ValueError:
                    pop = 0
                
                # Normalize names
                name_ascii = normalize(row.get('city_ascii', ''))
                name_utf = normalize(row.get('city', ''))
                
                # Store max population found for this name/country combo
                # (Handles duplicates in CSV by keeping the largest entry)
                key_ascii = (name_ascii, iso2)
                if key_ascii not in pop_map or pop > pop_map[key_ascii]:
                    pop_map[key_ascii] = pop
                    
                key_utf = (name_utf, iso2)
                if key_utf not in pop_map or pop > pop_map[key_utf]:
                    pop_map[key_utf] = pop
    except FileNotFoundError:
        print(f"Error: Could not find {csv_path}. Please ensure it is in the folder.")
        return {}
        
    return pop_map

def filter_cities():
    # 1. Load Data
    pop_map = load_population_map(INPUT_CSV)
    if not pop_map: return

    print(f"Loading {INPUT_JSON}...")
    with open(INPUT_JSON, 'r', encoding='utf-8') as f:
        cities = json.load(f)

    print(f"Original count: {len(cities)} cities")

    # 2. Attach Population to each city
    for city in cities:
        name = normalize(city.get('city', ''))
        code = city.get('countryCode', '').upper()
        # Default to 0 if not found
        city['population'] = pop_map.get((name, code), 0)

    # 3. Group by Timezone
    # We want to process each timezone separately to ensure coverage
    tz_groups = {}
    for city in cities:
        tz = city.get('tz')
        if not tz: continue
        
        if tz not in tz_groups:
            tz_groups[tz] = []
        tz_groups[tz].append(city)

    # 4. Apply Logic
    final_list = []
    
    for tz, group in tz_groups.items():
        # Sort group by population (largest first)
        group.sort(key=lambda x: x['population'], reverse=True)
        
        # Strategy: Keep ALL cities > 1 Million
        majors = [c for c in group if c['population'] >= MIN_POPULATION]
        
        if majors:
            final_list.extend(majors)
        else:
            # Safety Net: If NO city in this timezone has > 1M people,
            # keep the single largest one so the timezone isn't lost.
            # (e.g. Pacific/Chatham)
            if group:
                final_list.append(group[0])

    # 5. Save
    print(f"Filtering complete. Keeping {len(final_list)} cities.")
    
    # Sort final list by name for tidiness
    final_list.sort(key=lambda x: x['city'])
    
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(final_list, f, indent=2)
    print(f"Saved to {OUTPUT_JSON}")

if __name__ == "__main__":
    filter_cities()