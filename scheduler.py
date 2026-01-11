import json
import os
from ortools.sat.python import cp_model

def load_employees_from_dir(dirpath):
    files = [p for p in os.listdir(dirpath) if p.lower().endswith('.json')]
    employees = []
    for fn in sorted(files):
        try:
            full = os.path.join(dirpath, fn)
            with open(full, 'r') as f:
                data = json.load(f)
            if isinstance(data, dict) and ('role' in data or 'availability' in data):
                emp = data.copy()
            else:
                continue
            
            if 'name' not in emp or not emp['name']:
                emp['name'] = os.path.splitext(fn)[0]
            if 'availability' not in emp:
                emp['availability'] = {}
            if 'max_hours' not in emp:
                emp['max_hours'] = emp.get('max_hours', 40)
            
            employees.append(emp)
        except Exception:
            continue
    return employees

def solve_with_diagnostics(employee_file, config_file):
    # Load Data
    if os.path.isdir(employee_file):
        emp_data = load_employees_from_dir(employee_file)
    else:
        with open(employee_file, 'r') as f:
            emp_data = json.load(f).get('employee_data', [])
    
    with open(config_file, 'r') as f:
        config = json.load(f)

    c = config['constraints']
    demand_map = config.get('demand', {})
    all_roles = sorted(list(set(e['role'] for e in emp_data)))
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    
    model = cp_model.CpModel()
    work = {} 

    # 1. CREATE VARIABLES
    for i, emp in enumerate(emp_data):
        for d in range(7):
            for h in range(24):
                work[i, d, h] = model.NewBoolVar(f"w_{i}_{d}_{h}")

    # 2. DEMAND LOGIC
    for d_idx, day_name in enumerate(days):
        day_demand = demand_map.get(day_name, {})
        
        for h in range(24):
            # Only enforce demand during business hours
            if c['business_hours']['start'] <= h < c['business_hours']['end']:
                
                # Check if there is a specific override for this hour
                hourly_req = day_demand.get(str(h))
                
                # A. Specific Role Override (e.g. "18": {"Server": 3})
                if isinstance(hourly_req, dict):
                    for role, count in hourly_req.items():
                        role_vars = [work[i, d_idx, h] for i, e in enumerate(emp_data) if e['role'] == role]
                        if role_vars:
                            model.Add(sum(role_vars) >= int(count)).WithName(f"Demand_{day_name}_{h}_{role}")
                
                # B. Specific Total Override (e.g. "18": 5)
                elif isinstance(hourly_req, int):
                    total_vars = [work[i, d_idx, h] for i in range(len(emp_data))]
                    model.Add(sum(total_vars) >= hourly_req).WithName(f"Demand_{day_name}_{h}_Total")
                
                # C. GLOBAL FLOOR FALLBACK (UPDATED)
                # If no specific override, use the Global Constraints
                else:
                    global_floor = c.get('global_staff_floor', {})
                    
                    # Case 1: Global Floor is per-role ({"Server": 1})
                    if isinstance(global_floor, dict):
                        for role, count in global_floor.items():
                            role_vars = [work[i, d_idx, h] for i, e in enumerate(emp_data) if e['role'] == role]
                            if role_vars and int(count) > 0:
                                model.Add(sum(role_vars) >= int(count)).WithName(f"Demand_{day_name}_{h}_{role}_Default")

                    # Case 2: Global Floor is legacy integer (1)
                    elif isinstance(global_floor, int):
                        total_vars = [work[i, d_idx, h] for i in range(len(emp_data))]
                        model.Add(sum(total_vars) >= global_floor).WithName(f"Demand_{day_name}_{h}_Total_Default")

    # 3. SHIFT CONSTRAINTS
    for i in range(len(emp_data)):
        for d in range(7):
            for h in range(24):
                is_start = model.NewBoolVar(f"start_{i}_{d}_{h}")
                if h == 0:
                    model.Add(is_start == work[i, d, h])
                else:
                    model.Add(is_start >= work[i, d, h] - work[i, d, h-1])
                
                min_len = c['min_shift_length']
                for future_h in range(h, min(h + min_len, 24)):
                    model.Add(work[i, d, future_h] == 1).OnlyEnforceIf(is_start)

            window_size = c['max_shift_length'] + 1
            for h in range(24 - window_size + 1):
                model.Add(sum(work[i, d, h + k] for k in range(window_size)) <= c['max_shift_length'])

    # 4. AVAILABILITY & LIMITS
    for i, emp in enumerate(emp_data):
        model.Add(sum(work[i, d, h] for d in range(7) for h in range(24)) <= emp['max_hours'])
        for d in range(7):
            model.Add(sum(work[i, d, h] for h in range(24)) <= c['daily_max_hours'])
            unavail = emp['availability'].get(days[d], {}).get('unavailable', [])
            for block in unavail:
                try:
                    sh = int(block.split(':')[0])
                    eh = int(block.split('-')[1].split(':')[0])
                    if eh == 0: eh = 24
                    for h in range(sh, eh):
                        model.Add(work[i, d, h] == 0)
                except:
                    pass

    # 5. SOLVE
    model.Minimize(sum(work[i, d, h] for i in range(len(emp_data)) for d in range(7) for h in range(24)))
    
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 10.0
    status = solver.Solve(model)

    if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
        return generate_output_json(solver, work, emp_data, all_roles, days)
    else:
        return diagnose_failure(emp_data, config, all_roles, days)

def diagnose_failure(emp_data, config, all_roles, days):
    """
    Diagnoses why the schedule failed. 
    Updated to handle both Role-Specific overrides and Global Role Defaults.
    """
    c = config['constraints']
    demand_map = config.get('demand', {})
    global_floor = c.get('global_staff_floor', 1)
    
    for d_idx, day_name in enumerate(days):
        day_demand = demand_map.get(day_name, {})
        
        for h in range(c['business_hours']['start'], c['business_hours']['end']):
            # Determine exactly what is needed for this hour
            hourly_req = day_demand.get(str(h))
            
            requirements = {} # { "Role": count }

            # 1. Determine Requirements
            if isinstance(hourly_req, dict):
                # Specific Role Override found
                requirements = hourly_req
            elif isinstance(hourly_req, int):
                # Specific Total Override found (Legacy)
                requirements = {"_TOTAL_": hourly_req}
            else:
                # Fallback to Globals
                if isinstance(global_floor, dict):
                    requirements = global_floor
                else:
                    requirements = {"_TOTAL_": global_floor}

            # 2. Check Capacity for each Requirement
            for role_key, needed_count in requirements.items():
                needed = int(needed_count)
                if needed <= 0: continue

                # Calculate available staff
                available_count = 0
                for emp in emp_data:
                    # Filter by role if needed
                    if role_key != "_TOTAL_" and emp['role'] != role_key:
                        continue
                        
                    # Check Availability
                    unavail = emp['availability'].get(day_name, {}).get('unavailable', [])
                    is_blocked = False
                    for block in unavail:
                        sh = int(block.split(':')[0])
                        eh = int(block.split('-')[1].split(':')[0])
                        if eh == 0: eh = 24
                        if sh <= h < eh: is_blocked = True
                    
                    if not is_blocked:
                        available_count += 1
                
                if available_count < needed:
                    role_label = "total staff" if role_key == "_TOTAL_" else f"{role_key}(s)"
                    return {"error": f"Infeasible: On {day_name} at {h}:00, you need {needed} {role_label}, but only {available_count} are available."}

    return {"error": "Infeasible: Likely due to shift length constraints (Min/Max Shift Length) or Max Hours limits."}

def generate_output_json(solver, work, emp_data, all_roles, days):
    output = []
    for d_idx, day_name in enumerate(days):
        day_json = {"day": day_name, "hours": []}
        for h in range(24):
            current_staffing = {role: [] for role in all_roles}
            anyone = False
            for i, emp in enumerate(emp_data):
                if solver.Value(work[i, d_idx, h]) == 1:
                    current_staffing[emp['role']].append(emp['name'])
                    anyone = True
            if anyone:
                day_json["hours"].append({"time": f"{h:02d}:00", "roles": current_staffing})
        output.append(day_json)
    return output

if __name__ == "__main__":
    source_dir = 'availability'
    if not os.path.exists(source_dir):
        os.makedirs(source_dir, exist_ok=True)
        
    result = solve_with_diagnostics(source_dir, 'customization.json')
    
    if "error" in result:
        print("Scheduler Error:", result['error'])
        with open('schedule.json', 'w') as f:
            json.dump({"error": result['error']}, f, indent=2)
    else:
        with open('schedule.json', 'w') as f:
            json.dump(result, f, indent=2)
        print("Schedule generated successfully.")