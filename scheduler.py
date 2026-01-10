import json
from ortools.sat.python import cp_model

def solve_with_demand_mapping(employee_file, config_file):
    with open(employee_file, 'r') as f:
        emp_data = json.load(f)['employee_data']
    with open(config_file, 'r') as f:
        config = json.load(f)

    c = config['constraints']
    # New Demand Mapping
    demand_map = config.get('demand', {})
    all_roles = sorted(list(set(e['role'] for e in emp_data)))
    
    model = cp_model.CpModel()
    work = {} 

    # 1. CREATE VARIABLES
    for i, emp in enumerate(emp_data):
        for d in range(7):
            for h in range(24):
                work[i, d, h] = model.NewBoolVar(f"w_{i}_{d}_{h}")

    # 2. FLEXIBLE DEMAND LOGIC
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    for d_idx, day_name in enumerate(days):
        day_demand = demand_map.get(day_name, {})
        
        for h in range(24):
            # 1. Determine how many people are needed for this specific hour
            # Check for a specific override in demand, otherwise use global floor
            # Note: JSON keys are strings, so we convert h to string
            required_count = day_demand.get(str(h), c['global_staff_floor'])
            
            # 2. Apply requirements during business hours
            if c['business_hours']['start'] <= h < c['business_hours']['end']:
                for role in all_roles:
                    role_vars = [work[i, d_idx, h] for i, e in enumerate(emp_data) if e['role'] == role]
                    if role_vars:
                        # Now requires exactly 'required_count' for each role present
                        model.Add(sum(role_vars) >= required_count)

    # 3. SHIFT CONSTRAINTS (MIN/MAX)
    for i in range(len(emp_data)):
        for d in range(7):
            for h in range(24):
                # MIN SHIFT LENGTH
                is_start = model.NewBoolVar(f"start_{i}_{d}_{h}")
                if h == 0:
                    model.Add(is_start == work[i, d, h])
                else:
                    model.Add(is_start >= work[i, d, h] - work[i, d, h-1])
                
                for future_h in range(h, min(h + c['min_shift_length'], 24)):
                    model.Add(work[i, d, future_h] == 1).OnlyEnforceIf(is_start)

            # MAX SHIFT LENGTH (Sliding Window)
            window_size = c['max_shift_length'] + 1
            for h in range(24 - window_size + 1):
                model.Add(sum(work[i, d, h + k] for k in range(window_size)) <= c['max_shift_length'])

    # 4. AVAILABILITY & WEEKLY LIMITS
    for i, emp in enumerate(emp_data):
        model.Add(sum(work[i, d, h] for d in range(7) for h in range(24)) <= emp['max_hours'])
        for d in range(7):
            model.Add(sum(work[i, d, h] for h in range(24)) <= c['daily_max_hours'])
            
            # Parsing "HH:MM-HH:MM" availability
            unavail = emp['availability'].get(days[d], {}).get('unavailable', [])
            for block in unavail:
                start_h = int(block.split(':')[0])
                end_h = int(block.split('-')[1].split(':')[0])
                if end_h == 0: end_h = 24
                for h in range(start_h, end_h):
                    model.Add(work[i, d, h] == 0)

    # 5. OBJECTIVE: Minimize total labor while meeting demand
    model.Minimize(sum(work[i, d, h] for i in range(len(emp_data)) for d in range(7) for h in range(24)))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 10.0
    status = solver.Solve(model)

    if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
        output = []
        for d_idx, day_name in enumerate(days):
            day_json = {"day": day_name, "hours": []}
            for h in range(24):
                current_staffing = {role: [] for role in all_roles}
                anyone_working = False
                for i, emp in enumerate(emp_data):
                    if solver.Value(work[i, d_idx, h]) == 1:
                        current_staffing[emp['role']].append(emp['name'])
                        anyone_working = True
                
                if anyone_working:
                    day_json["hours"].append({"time": f"{h:02d}:00", "roles": current_staffing})
            output.append(day_json)
        return output
    else:
        return {"error": "No solution. Likely demand exceeds staff availability or max hours."}

if __name__ == "__main__":
    final_schedule = solve_with_demand_mapping('example.json', 'customization.json')
    with open('schedule.json', 'w') as f:
        json.dump(final_schedule, f, indent=2)
    print("Schedule generated in schedule.json")