import json
import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any

# Import your existing solver logic
import scheduler

app = FastAPI()

# Enable CORS so your React app on Port 80 can talk to this on Port 8000
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# DATA FILE PATHS (Absolute paths are safest on Azure)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
EMPLOYEE_FILE = os.path.join(BASE_DIR, 'example.json')
CONFIG_FILE = os.path.join(BASE_DIR, 'customization.json')
SCHEDULE_FILE = os.path.join(BASE_DIR, 'schedule.json')

@app.get("/api/schedule")
def get_schedule():
    """Returns the current generated schedule."""
    if not os.path.exists(SCHEDULE_FILE):
        return []
    with open(SCHEDULE_FILE, 'r') as f:
        return json.load(f)

@app.post("/api/solve")
def run_solver():
    """Triggers the scheduler.py solver and saves the result."""
    try:
        # Calls your existing solve_with_diagnostics function
        result = scheduler.solve_with_diagnostics(EMPLOYEE_FILE, CONFIG_FILE)
        
        # If it returned a schedule (list), save it. If an error (dict), return that.
        if isinstance(result, list):
            with open(SCHEDULE_FILE, 'w') as f:
                json.dump(result, f, indent=2)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/availability")
async def update_availability(data: Dict[Any, Any]):
    """Receives availability from a specific employee and updates example.json."""
    with open(EMPLOYEE_FILE, 'r') as f:
        db = json.load(f)
    
    # Logic to find employee and update their availability
    for emp in db['employee_data']:
        if emp['name'].lower() == data['name'].lower():
            emp['availability'] = data['availability']
            break
            
    with open(EMPLOYEE_FILE, 'w') as f:
        json.dump(db, f, indent=2)
    return {"status": "success"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)