import json
from ortools.sat.python import cp_model

# --- CONFIGURATION ---
DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
HOURS = list(range(24))

# Example Demand: We need 1 person for each role between 09:00 and 21:00
REQUIRED_STAFF = {}
for h in range(9, 21):
    REQUIRED_STAFF[h] = {"Server": 1, "Cook": 1, "Manager": 1, "Busser": 1}

def parse_range_list(range_list):
    """Converts ["08:00-10:00", "14:00-15:00"] into a set of integer hours {8, 9, 14}"""
    hours = set()
    for r in range_list:
        start_str, end_str = r.split('-')
        s = int(start_str.split(':')[0])
        e = int(end_str.split(':')[0])
        # Handle overnight wraps or full day
        if e <= s and e != 0: e = 24
        if s == 0 and e == 23: e = 24 # Handle 00:00-23:59 as full day
        
        for h in range(s, e):
            hours.add(h)
    return hours

def solve_from_json(json_file):
    # Load data
    with open(json_file, 'r') as f:
        data = json.load(f)
    employees = data['employee_data']

    model = cp_model.CpModel()
    work = {} # (emp_index, day_index, hour) -> BoolVar

    # 1. CREATE VARIABLES & UNAVAILABILITY CONSTRAINTS
    for i, emp in enumerate(employees):
        for d_idx, day in enumerate(DAYS):
            # Extract unavailability from JSON
            day_data = emp['availability'].get(day, {"unavailable": [], "preferred": []})
            unavail_hours = parse_range_list(day_data['unavailable'])
            
            for h in HOURS:
                work[i, d_idx, h] = model.NewBoolVar(f"{emp['name']}_{day}_{h}")
                
                if h in unavail_hours:
                    model.Add(work[i, d_idx, h] == 0)

    # 2. MAX HOURS CONSTRAINT
    for i, emp in enumerate(employees):
        model.Add(sum(work[i, d, h] for d in range(7) for h in HOURS) <= emp['max_hours'])

    # 3. DEMAND CONSTRAINTS
    for d_idx in range(7):
        for h, reqs in REQUIRED_STAFF.items():
            for role, count in reqs.items():
                relevant_vars = [work[i, d_idx, h] for i, e in enumerate(employees) if e['role'] == role]
                if relevant_vars:
                    model.Add(sum(relevant_vars) >= count)

    # 4. PREFERENCE OPTIMIZATION
    objective_terms = []
    for i, emp in enumerate(employees):
        for d_idx, day in enumerate(DAYS):
            day_data = emp['availability'].get(day, {"unavailable": [], "preferred": []})
            pref_hours = parse_range_list(day_data['preferred'])
            for h in HOURS:
                if h in pref_hours:
                    objective_terms.append(work[i, d_idx, h])
    
    model.Maximize(sum(objective_terms))

    # 5. SOLVE & FORMAT OUTPUT
    solver = cp_model.CpSolver()
    status = solver.Solve(model)

    if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
        final_schedule = []
        for d_idx, day in enumerate(DAYS):
            day_schedule = {"day": day, "shifts": []}
            for h in HOURS:
                workers = [employees[i]['name'] for i in range(len(employees)) if solver.Value(work[i, d_idx, h]) == 1]
                if workers:
                    day_schedule["shifts"].append({"hour": f"{h:02d}:00", "staff": workers})
            final_schedule.append(day_schedule)
        
        return final_schedule
    else:
        return None

# Execution
result = solve_from_json('example.json')
if result:
    print(json.dumps(result, indent=2))
else:
    print("No feasible schedule found.")