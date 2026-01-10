import json
import matplotlib.pyplot as plt
import matplotlib.patches as patches
import os

def draw_day_view(day_data, name_to_color):
    day_name = day_data.get('day', 'Unknown')
    hours_list = day_data.get('hours', [])
    
    if not hours_list:
        print(f"\n[!] No shifts scheduled for {day_name}")
        return

    all_shifts = []
    roles_found = set()
    
    for hour_entry in hours_list:
        if not isinstance(hour_entry, dict): continue
        
        h_str = hour_entry.get('time', '00:00').split(':')[0]
        h = int(h_str)
        roles_dict = hour_entry.get('roles', {})
        
        for role, names in roles_dict.items():
            roles_found.add(role)
            for name in names:
                existing = next((s for s in all_shifts if s['name'] == name 
                                 and s['role'] == role and s['end'] == h), None)
                if existing:
                    existing['end'] = h + 1
                else:
                    all_shifts.append({'role': role, 'name': name, 'start': h, 'end': h + 1})

    final_lanes = []
    for role in sorted(list(roles_found)):
        role_shifts = [s for s in all_shifts if s['role'] == role]
        role_shifts.sort(key=lambda x: x['start'])
        
        sub_lanes = [] 
        for shift in role_shifts:
            placed = False
            for lane in sub_lanes:
                if not any(s['start'] < shift['end'] and shift['start'] < s['end'] for s in lane):
                    lane.append(shift)
                    placed = True
                    break
            if not placed:
                sub_lanes.append([shift])
        
        for i, lane_shifts in enumerate(sub_lanes):
            label = role if i == 0 else ""
            final_lanes.append((label, lane_shifts))

    fig, ax = plt.subplots(figsize=(14, max(5, len(final_lanes) * 0.8)))
    
    for y_idx, (label, shifts) in enumerate(reversed(final_lanes)):
        ax.axhline(y_idx, color='gray', linestyle=':', alpha=0.1)
        for s in shifts:
            duration = s['end'] - s['start']
            rect = patches.Rectangle((s['start'], y_idx - 0.35), duration, 0.7, 
                                     linewidth=1, edgecolor='black', 
                                     facecolor=name_to_color.get(s['name'], 'gray'))
            ax.add_patch(rect)
            ax.text(s['start'] + duration/2, y_idx, s['name'], 
                    ha='center', va='center', fontsize=9, fontweight='bold')

    ax.set_title(f"Schedule for {day_name}", fontsize=15)
    ax.set_xlim(0, 24)
    ax.set_ylim(-1, len(final_lanes))
    ax.set_xticks(range(25))
    ax.set_yticks(range(len(final_lanes)))
    ax.set_yticklabels([lane[0] for lane in reversed(final_lanes)])
    ax.grid(axis='x', linestyle='--', alpha=0.3)
    
    plt.tight_layout()
    plt.show()

def main_menu():
    filename = 'schedule.json'
    try:
        with open(filename, 'r') as f:
            data = json.load(f)
    except Exception as e:
        print(f"Error loading {filename}: {e}")
        return

    # Check if the backend returned an error dictionary instead of a schedule list
    if isinstance(data, dict) and "error" in data:
        print(f"\n[!!!] BACKEND ERROR: {data['error']}")
        input("\nPress Enter to exit...")
        return
    
    # Ensure data is a list
    schedule = data if isinstance(data, list) else []

    all_names = set()
    for day in schedule:
        # Extra safety: check if day is a dictionary before calling .get()
        if isinstance(day, dict):
            for hour_data in day.get('hours', []):
                roles = hour_data.get('roles', {})
                for role_name in roles:
                    for n in roles[role_name]:
                        all_names.add(n)
    
    sorted_names = sorted(list(all_names))
    cmap = plt.cm.get_cmap('tab20', len(sorted_names))
    name_to_color = {name: cmap(i) for i, name in enumerate(sorted_names)}

    while True:
        os.system('cls' if os.name == 'nt' else 'clear')
        print(f"=== STAFFING VISUALIZER (Source: {filename}) ===")
        if not schedule:
            print("No valid schedule data found.")
            break

        for i, day in enumerate(schedule):
            print(f"{i + 1}. {day.get('day', 'Unknown')}")
        print("q. Quit")
        
        choice = input("\nSelect Day (1-7): ").lower()
        if choice == 'q': break
        if choice.isdigit() and 1 <= int(choice) <= len(schedule):
            draw_day_view(schedule[int(choice)-1], name_to_color)

if __name__ == "__main__":
    main_menu()