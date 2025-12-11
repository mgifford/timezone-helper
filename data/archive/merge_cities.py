import json
import unicodedata

# --- Configuration ---
FILES_TO_MERGE = [
    'timezones-filtered.json',          # The >1 Million population list
    'timezones-filtered-capitals.json'  # The Capitals list
]
OUTPUT_FILE = 'timezones-complete.json'

def normalize(text):
    """
    Normalize text to ensure 'Sao Paulo' matches 'São Paulo'.
    """
    if not text: return ""
    return ''.join(
        c for c in unicodedata.normalize('NFD', text)
        if unicodedata.category(c) != 'Mn'
    ).lower().strip()

def merge_files():
    final_list = []
    seen_keys = set()
    
    print(f"Starting merge...")

    for filename in FILES_TO_MERGE:
        try:
            with open(filename, 'r', encoding='utf-8') as f:
                data = json.load(f)
                
            print(f"Processing {filename} ({len(data)} entries)...")
            
            duplicates_in_file = 0
            new_entries = 0
            
            for entry in data:
                city = entry.get('city')
                code = entry.get('countryCode')
                
                # Create a unique key for this city
                # Example key: ('paris', 'fr')
                key = (normalize(city), code)
                
                if key not in seen_keys:
                    seen_keys.add(key)
                    final_list.append(entry)
                    new_entries += 1
                else:
                    duplicates_in_file += 1
            
            print(f"  -> Added {new_entries} new cities.")
            print(f"  -> Skipped {duplicates_in_file} duplicates.")
            
        except FileNotFoundError:
            print(f"Error: Could not find {filename}")

    # Sort alphabetically by City Name for the final file
    final_list.sort(key=lambda x: x.get('city', ''))

    print(f"\nMerge complete.")
    print(f"Total unique cities: {len(final_list)}")
    
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(final_list, f, indent=2)
    
    print(f"Saved to {OUTPUT_FILE}")

if __name__ == "__main__":
    merge_files()