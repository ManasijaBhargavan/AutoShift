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
                # If file contents are the full employee record, use it. Otherwise, build a record.
                if isinstance(data, dict) and ('role' in data or 'availability' in data or 'max_hours' in data):
                    emp = data.copy()
                else:
                    # Unexpected shape: skip
                    continue
                # Ensure name exists (use file base name if not present)
                if 'name' not in emp or not emp['name']:
                    emp['name'] = os.path.splitext(fn)[0]
                # Ensure availability exists
                if 'availability' not in emp:
                    emp['availability'] = {}
                # Ensure max_hours default
                if 'max_hours' not in emp:
                    emp['max_hours'] = emp.get('max_hours', 40)
                employees.append(emp)
            except Exception as e:
                # skip invalid files
                continue
        return employees

def solve_with_diagnostics(employee_file, config_file):
    # employee_file may be a path to a single JSON (legacy) or a directory
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

    # 2. DEMAND LOGIC WITH NAMED CONSTRAINTS
    # We name these so we can identify them if the solver fails
    for d_idx, day_name in enumerate(days):
        day_demand = demand_map.get(day_name, {})
        for h in range(24):
            required_count = day_demand.get(str(h), c['global_staff_floor'])
            if c['business_hours']['start'] <= h < c['business_hours']['end']:
                for role in all_roles:
                    role_vars = [work[i, d_idx, h] for i, e in enumerate(emp_data) if e['role'] == role]
                    if role_vars:
                        # Adding a name to the constraint for debugging
                        model.Add(sum(role_vars) >= required_count).WithName(f"Demand_{day_name}_{h}_{role}")

    # 3. SHIFT CONSTRAINTS
    for i in range(len(emp_data)):
        for d in range(7):
            for h in range(24):
                # Min Shift
                is_start = model.NewBoolVar(f"start_{i}_{d}_{h}")
                if h == 0:
                    model.Add(is_start == work[i, d, h])
                else:
                    model.Add(is_start >= work[i, d, h] - work[i, d, h-1])
                for future_h in range(h, min(h + c['min_shift_length'], 24)):
                    model.Add(work[i, d, future_h] == 1).OnlyEnforceIf(is_start)

            # Max Shift Window
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
                sh = int(block.split(':')[0])
                eh = int(block.split('-')[1].split(':')[0])
                if eh == 0: eh = 24
                for h in range(sh, eh):
                    model.Add(work[i, d, h] == 0)

    # 5. SOLVE
    model.Minimize(sum(work[i, d, h] for i in range(len(emp_data)) for d in range(7) for h in range(24)))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 5.0
    status = solver.Solve(model)

    if status == cp_model.OPTIMAL or status == cp_model.FEASIBLE:
        # (Standard JSON output generation as before...)
        return generate_output_json(solver, work, emp_data, all_roles, days)
    else:
        # --- DIAGNOSTIC MODE ---
        return diagnose_failure(emp_data, config, all_roles, days)

def diagnose_failure(emp_data, config, all_roles, days):
    """Identifies specifically which demand requirement is impossible."""
    c = config['constraints']
    demand_map = config.get('demand', {})
    
    # Check 1: Simple Capacity Check
    for d_idx, day_name in enumerate(days):
        day_demand = demand_map.get(day_name, {})
        for role in all_roles:
            available_staff = [e for e in emp_data if e['role'] == role]
            for h in range(24):
                required = day_demand.get(str(h), c['global_staff_floor'])
                if c['business_hours']['start'] <= h < c['business_hours']['end']:
                    # Count how many of these role-specific staff are actually available at this hour
                    actually_available = 0
                    for emp in available_staff:
                        unavail = emp['availability'].get(day_name, {}).get('unavailable', [])
                        is_busy = False
                        for block in unavail:
                            sh, eh = int(block.split(':')[0]), int(block.split('-')[1].split(':')[0])
                            if eh == 0: eh = 24
                            if sh <= h < eh: is_busy = True
                        if not is_busy: actually_available += 1
                    
                    if actually_available < required:
                        return {"error": f"Infeasible: On {day_name} at {h:02d}:00, you require {required} {role}(s), but only {actually_available} are available due to individual availability constraints."}

    return {"error": "Infeasible: The schedule cannot be built. This is likely due to 'Max Hours' or 'Min Shift Length' conflicts. Try reducing demand or increasing employee max hours."}

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
    # Prefer directory 'avalibility' (per-person files). Fall back to example.json for compatibility.
    employee_source = 'avalibility' if os.path.isdir('avalibility') else 'example.json'
    result = solve_with_diagnostics(employee_source, 'customization.json')
    with open('schedule.json', 'w') as f:
        json.dump(result, f, indent=2)