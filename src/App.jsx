import React, { useState, useEffect } from 'react';
import { Check, X, Star, ChevronRight, Clock } from 'lucide-react';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Status Configuration
const STATUS_CONFIG = {
  unavailable: {
    label: 'Unavailable',
    color: 'bg-red-50 text-red-700 border-red-200 hover:border-red-300',
    icon: <X size={14} />
  },
  available: {
    label: 'Available',
    color: 'bg-gray-100 text-gray-400 border-gray-200 hover:border-gray-300',
    icon: <Check size={14} />
  },
  preferred: {
    label: 'Preferred',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:border-emerald-300',
    icon: <Star size={14} fill="currentColor" />
  }
};

const App = () => {
  // State for Dynamic Time Slots
  const [timeSlots, setTimeSlots] = useState([]);
  
  // Existing State
  const [schedule, setSchedule] = useState({});
  const [assignedShifts, setAssignedShifts] = useState({});
  const [viewMode, setViewMode] = useState('input');
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartStatus, setDragStartStatus] = useState(null);
  const [user, setCurrentUser] = useState(null);
  const [maxHours, setMaxHours] = useState(40);

  // --- 1. NEW: Fetch Business Hours from Server API ---
  useEffect(() => {
    // UPDATED: Now fetches from the API endpoint, not the file directly
    fetch('http://localhost:3001/api/customization')
      .then(res => res.json())
      .then(data => {
        // Safe check in case data is missing
        if (!data.constraints || !data.constraints.business_hours) throw new Error("Invalid config");
        
        const { start, end } = data.constraints.business_hours;
        
        // Generate slots
        const generatedSlots = [];
        let current = new Date();
        current.setHours(start, 0, 0, 0);
        
        const closeTime = new Date();
        closeTime.setHours(end, 0, 0, 0);

        while (current <= closeTime) {
          const timeString = current.toLocaleTimeString('en-GB', { 
            hour: '2-digit', minute: '2-digit' 
          });
          generatedSlots.push(timeString);
          current.setMinutes(current.getMinutes() + 30);
        }
        
        setTimeSlots(generatedSlots);
      })
      .catch(err => {
        console.error("Could not load customization:", err);
        // Fallback slots
        setTimeSlots(["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00"]); 
      });
  }, []);

  // --- 2. Existing User & Availability Logic ---
  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    window.addEventListener('mouseup', handleGlobalMouseUp);

    const storedUser = localStorage.getItem('currentUser');

    if (storedUser) {
      const currentUserObj = JSON.parse(storedUser);
      setCurrentUser(currentUserObj);
      const myName = currentUserObj.name;
      const safeName = myName.replace(/[^a-z0-9-_.]/gi, '_');

      // Fetch Assigned Shifts
      fetchSchedule(myName);

      // Load Cached Availability (Fast Load)
      try {
        const cached = localStorage.getItem(`lastSavedAvailability_${safeName}`);
        if (cached) applyAvailabilityData(JSON.parse(cached));
      } catch (e) { /* ignore */ }

      // Fetch Saved Availability from Server (Authoritative Load)
      // UPDATED URL: matches server.js
      fetch(`http://localhost:3001/api/availability/${safeName}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => { if(data) applyAvailabilityData(data); })
        .catch(() => console.log("No saved availability found."));
    }

    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  // Helper Functions
  const getNextStatus = (currentStatus) => {
    if (currentStatus === 'unavailable') return 'preferred';
    if (currentStatus === 'available') return 'unavailable';
    return 'preferred';
  };

  const handleMouseDown = (day, time) => {
    if (viewMode === 'view') return;
    const key = `${day}-${time}`;
    const currentStatus = schedule[key] || 'available';
    const nextStatus = getNextStatus(currentStatus);
    setIsDragging(true);
    setDragStartStatus(nextStatus);
    setSchedule(prev => ({ ...prev, [key]: nextStatus }));
  };

  const handleMouseEnter = (day, time) => {
    if (!isDragging || viewMode === 'view') return;
    const key = `${day}-${time}`;
    setSchedule(prev => ({ ...prev, [key]: dragStartStatus }));
  };

  const preventDragHandler = (e) => e.preventDefault();

  const fetchSchedule = async (name) => {
    try {
      // UPDATED URL: matches server.js
      const res = await fetch('http://localhost:3001/api/schedule'); 
      if (!res.ok) return; 
      const payload = await res.json();
      
      // server.js returns { ok: true, schedule: [...] }
      const data = payload.schedule || [];
      
      const myName = name || (user && user.name);
      if (!myName) return;
      const myShifts = {};
      
      // Since schedule structure might be a direct array or wrapped
      // Check if data is array first
      const daysArray = Array.isArray(data) ? data : (data.days || []);
      
      daysArray.forEach(dayBlock => {
        const dayName = dayBlock.day;
        if (dayBlock.hours) {
          dayBlock.hours.forEach(hourBlock => {
            const time = hourBlock.time;
            if (hourBlock.roles) {
              Object.values(hourBlock.roles).forEach(employeeList => {
                if (employeeList.includes(myName)) {
                  myShifts[`${dayName}-${time}`] = true;
                  const [h, m] = time.split(':');
                  if (m === '00') myShifts[`${dayName}-${h}:30`] = true;
                }
              });
            }
          });
        }
      });
      setAssignedShifts(myShifts);
    } catch (err) {
      console.error('Error loading schedule:', err);
    }
  };

  const fillSlots = (startStr, endStr) => {
    const slots = [];
    const [startH, startM] = startStr.split(':').map(Number);
    const [endH, endM] = endStr.split(':').map(Number);
    let current = new Date();
    current.setHours(startH, startM, 0);
    const end = new Date();
    end.setHours(endH, endM, 0);
    while (current < end) {
      slots.push(current.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
      current.setMinutes(current.getMinutes() + 30);
    }
    return slots;
  };

  const applyAvailabilityData = (data) => {
    const loadedSchedule = {};
    if (!data) return;
    if (data.availability) {
      Object.entries(data.availability).forEach(([day, categories]) => {
        if (categories.unavailable) {
          categories.unavailable.forEach(range => {
            const [start, end] = range.split('-');
            const slots = fillSlots(start, end);
            slots.forEach(time => loadedSchedule[`${day}-${time}`] = 'unavailable');
          });
        }
        if (categories.preferred) {
          categories.preferred.forEach(range => {
            const [start, end] = range.split('-');
            const slots = fillSlots(start, end);
            slots.forEach(time => loadedSchedule[`${day}-${time}`] = 'preferred');
          });
        }
      });
    }
    setSchedule(loadedSchedule);
    if (data.max_hours) setMaxHours(data.max_hours);
  };

  const handleSubmit = async () => {
    const addMinutes = (timeStr, minsToAdd) => {
      const [hours, minutes] = timeStr.split(':').map(Number);
      const date = new Date();
      date.setHours(hours, minutes + minsToAdd);
      return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    };

    const getRangesForStatus = (day, targetStatus) => {
      const ranges = [];
      let startTime = null;
      let lastSlotTime = null;

      for (let i = 0; i < timeSlots.length; i++) {
        const time = timeSlots[i];
        const key = `${day}-${time}`;
        const currentStatus = schedule[key] || 'available';

        if (currentStatus === targetStatus) {
          if (!startTime) startTime = time;
          lastSlotTime = time;
        } else {
          if (startTime) {
            const endTime = addMinutes(lastSlotTime, 30);
            ranges.push(`${startTime}-${endTime}`);
            startTime = null;
            lastSlotTime = null;
          }
        }
      }
      if (startTime) {
        const endTime = addMinutes(lastSlotTime, 30);
        ranges.push(`${startTime}-${endTime}`);
      }
      return ranges;
    };

    const availabilityData = {};
    DAYS.forEach(day => {
      availabilityData[day] = {
        unavailable: getRangesForStatus(day, 'unavailable'),
        preferred: getRangesForStatus(day, 'preferred')
      };
    });

    const finalData = {
      name: user ? user.name : "Unknown Employee",
      role: user && user.role ? user.role : "Server",
      max_hours: maxHours,
      availability: availabilityData
    };

    try {
      const response = await fetch('/api/save-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalData),
      });
      
      if (response.ok) {
        const resData = await response.json(); // Wait for server to confirm scheduler ran
        console.log("Scheduler Output:", resData.stdout);
        
        alert("✅ Availability saved & Schedule updated!");
        
        try {
          const safe = (finalData.name || 'unknown').replace(/[^a-z0-9-_.]/gi, '_');
          localStorage.setItem(`lastSavedAvailability_${safe}`, JSON.stringify(finalData));
        } catch (e) { }
        
        applyAvailabilityData(finalData);
        await fetchSchedule(); // Refresh the grid with new assignments immediately!
      } else {
        alert("❌ Failed to save.");
      }
    } catch (error) {
      console.error("Error submitting:", error);
      alert("❌ Could not connect to the server.");
    }
  };

  if (!user) return <div className="p-10 flex justify-center text-slate-500">Loading User...</div>;
  if (timeSlots.length === 0) return <div className="p-10 flex justify-center text-slate-500">Loading Business Hours...</div>;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-8">

      {/* Header & Nav */}
      <div className="max-w-6xl mx-auto mb-8 flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold">
            {user.name.charAt(0)}
          </div>
          <div>
            <h2 className="font-bold text-slate-800">{user.name}</h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500 uppercase tracking-wider">{user.role || 'Employee'}</span>
              <label className="text-xs text-slate-500 flex items-center gap-2">
                <span className="text-xs">Max hrs</span>
                <input type="number" value={maxHours} onChange={e=>setMaxHours(Number(e.target.value))} className="w-16 border rounded p-1 text-sm" />
              </label>
            </div>
          </div>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-lg">
          <button onClick={() => setViewMode('input')} className={`px-4 py-2 text-sm font-semibold rounded-md transition-all ${viewMode === 'input' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Set Availability</button>
          <button onClick={() => setViewMode('view')} className={`px-4 py-2 text-sm font-semibold rounded-md transition-all ${viewMode === 'view' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>View My Shifts</button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">{viewMode === 'input' ? 'Select Your Preferences' : 'Your Upcoming Shifts'}</h1>
          <p className="text-slate-500">{viewMode === 'input' ? 'Click or drag across slots to change their status.' : 'These are the shifts assigned to you by your manager.'}</p>
        </div>
        {viewMode === 'input' && (
          <div className="flex gap-4 bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm">
            {Object.entries(STATUS_CONFIG).map(([key, config]) => (
              <div key={key} className="flex items-center gap-2">
                <div className={`w-5 h-5 rounded flex items-center justify-center border ${config.color}`}>{config.icon}</div>
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{config.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main Grid Card */}
      <div className="max-w-6xl mx-auto bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
        
        {/* Scrollable Wrapper */}
        <div className="overflow-x-auto">
          <div className="p-8 min-w-max">
            
            <div className="grid gap-4" style={{ gridTemplateColumns: `80px repeat(${timeSlots.length}, minmax(60px, 1fr))` }}>

              {/* Header Row */}
              <div className="font-bold text-slate-400 uppercase text-xs tracking-wider self-center"></div>
              {timeSlots.map((time) => (
                <div key={time} className="text-center font-semibold text-xs text-slate-400 pb-2 border-b border-slate-100 rotate-0">{time}</div>
              ))}

              {/* Rows */}
              {DAYS.map((day) => (
                <React.Fragment key={day}>
                  <div className="font-bold text-slate-700 text-sm self-center">{day}</div>

                  {timeSlots.map((time) => {
                    const key = `${day}-${time}`;

                    // View Mode
                    if (viewMode === 'view') {
                      const isAssigned = assignedShifts[key];
                      return (
                        <div key={key} className={`h-12 rounded border transition-all duration-200 flex items-center justify-center ${isAssigned ? 'bg-indigo-600 border-indigo-700 shadow-sm' : 'bg-slate-50 border-slate-100 opacity-50'}`}>
                          {isAssigned && <Clock size={14} className="text-white" />}
                        </div>
                      );
                    }

                    // Input Mode
                    const status = schedule[key] || 'available';
                    const config = STATUS_CONFIG[status];
                    return (
                      <div key={key} onDragStart={preventDragHandler} onMouseDown={() => handleMouseDown(day, time)} onMouseEnter={() => handleMouseEnter(day, time)} className={`h-12 rounded border transition-all duration-100 cursor-pointer select-none flex items-center justify-center ${config.color} ${isDragging ? 'hover:scale-95' : 'hover:scale-105'}`}>
                        {status !== 'available' && <div className="opacity-50">{config.icon}</div>}
                      </div>
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        {viewMode === 'input' && (
          <div className="bg-slate-50 p-6 flex justify-end items-center border-t border-slate-100">
            <button
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition-colors shadow-lg shadow-indigo-200"
              onClick={handleSubmit}
            >
              Submit Availability <ChevronRight size={18} />
            </button>
          </div>
        )}

      </div>
    </div>
  );
};

export default App;