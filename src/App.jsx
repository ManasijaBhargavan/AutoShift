import React, { useState, useEffect } from 'react';
import { Check, X, Star, ChevronRight, Clock } from 'lucide-react';

// --- Constants ---
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TIME_SLOTS = [
  "08:00", "08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
  "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30",
  "16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00"
];

// Configuration for the Input Mode
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
  const [schedule, setSchedule] = useState({});
  const [assignedShifts, setAssignedShifts] = useState({});
  const [viewMode, setViewMode] = useState('input'); // 'input' or 'view'

  const [isDragging, setIsDragging] = useState(false);
  const [dragStartStatus, setDragStartStatus] = useState(null);
  const [user, setCurrentUser] = useState(null);

  useEffect(() => {
    // 1. Handle Dragging Logic
    const handleGlobalMouseUp = () => setIsDragging(false);
    window.addEventListener('mouseup', handleGlobalMouseUp);

    // 2. Load User from Login
    const storedUser = localStorage.getItem('currentUser');

    if (storedUser) {
      const currentUserObj = JSON.parse(storedUser);
      setCurrentUser(currentUserObj);
      const myName = currentUserObj.name; // e.g., "Vince" or "Mona"

      // 3. FETCH AND PARSE THE SCHEDULE
      fetch('/schedule.json')
        .then(res => res.json())
        .then(data => {
          const myShifts = {};

          // Loop through every Day in the JSON
          data.forEach(dayBlock => {
            const dayName = dayBlock.day; // e.g., "Monday"

            // Loop through every Hour block
            if (dayBlock.hours) {
              dayBlock.hours.forEach(hourBlock => {
                const time = hourBlock.time; // e.g., "09:00"

                // Check all roles in this hour (Busser, Server, etc.)
                // hourBlock.roles is { Busser: ["Vince"], Cook: ["Jack"] }
                Object.values(hourBlock.roles).forEach(employeeList => {

                  // If my name is in this list, mark the grid!
                  if (employeeList.includes(myName)) {

                    // Add the exact time slot (e.g., "Monday-09:00")
                    myShifts[`${dayName}-${time}`] = true;

                    // OPTIONAL: If your JSON only has hourly slots (9:00, 10:00) 
                    // but you want to fill the half-hour slots (9:30) visually:
                    const [h, m] = time.split(':');
                    if (m === '00') {
                      myShifts[`${dayName}-${h}:30`] = true;
                    }
                  }
                });
              });
            }
          });

          // Update the state with the found shifts
          setAssignedShifts(myShifts);
        })
        .catch(err => console.error("Error loading schedule:", err));

      // We try to find the file based on the user's name
      // If you are just testing, you can hardcode this to fetch('/availability.json')
      const safeName = myName.replace(/\s+/g, '_');
      fetch(`/schedules/${safeName}_preferences.json`)
        .then(res => {
          if (!res.ok) throw new Error("No previous preferences found");
          return res.json();
        })
        .then(data => {
          const loadedSchedule = {};

          // Helper to generate time slots between two times
          // Input: "08:00", "10:00" -> Output: ["08:00", "08:30", "09:00", "09:30"]
          const fillSlots = (startStr, endStr) => {
            const slots = [];
            const [startH, startM] = startStr.split(':').map(Number);
            const [endH, endM] = endStr.split(':').map(Number);

            let current = new Date();
            current.setHours(startH, startM, 0);

            const end = new Date();
            end.setHours(endH, endM, 0);

            // Loop until we reach the end time
            while (current < end) {
              const timeString = current.toLocaleTimeString('en-GB', {
                hour: '2-digit', minute: '2-digit'
              });
              slots.push(timeString);
              current.setMinutes(current.getMinutes() + 30); // Add 30 mins
            }
            return slots;
          };

          // Iterate through the JSON structure
          // data.availability is { "Monday": { "unavailable": ["08:00-12:00"], ... }, ... }
          if (data.availability) {
            Object.entries(data.availability).forEach(([day, categories]) => {

              // 1. Process Unavailable Ranges
              if (categories.unavailable) {
                categories.unavailable.forEach(range => {
                  const [start, end] = range.split('-');
                  const slots = fillSlots(start, end);
                  slots.forEach(time => {
                    loadedSchedule[`${day}-${time}`] = 'unavailable';
                  });
                });
              }

              // 2. Process Preferred Ranges
              if (categories.preferred) {
                categories.preferred.forEach(range => {
                  const [start, end] = range.split('-');
                  const slots = fillSlots(start, end);
                  slots.forEach(time => {
                    loadedSchedule[`${day}-${time}`] = 'preferred';
                  });
                });
              }
            });
          }

          // Update the grid state!
          setSchedule(loadedSchedule);
        })
        .catch(err => {
          console.log("No previous preferences file found (this is normal for new users).");
        });
    }

    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  const getNextStatus = (currentStatus) => {
    if (currentStatus === 'unavailable') return 'available';
    if (currentStatus === 'available') return 'preferred';
    return 'unavailable';
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

      for (let i = 0; i < TIME_SLOTS.length; i++) {
        const time = TIME_SLOTS[i];
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
      max_hours: 40,
      availability: availabilityData
    };

    try {
      const response = await fetch('http://localhost:5000/save-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalData),
      });
      if (response.ok) alert("✅ Schedule submitted successfully!");
      else alert("❌ Failed to save schedule.");
    } catch (error) {
      console.error("Error submitting schedule:", error);
      alert("❌ Could not connect to the server.");
    }
  };

  if (!user) return <div className="p-10 flex justify-center text-slate-500">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-8">

      {/* --- Top Navigation --- */}
      <div className="max-w-6xl mx-auto mb-8 flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-700 font-bold">
            {user.name.charAt(0)}
          </div>
          <div>
            <h2 className="font-bold text-slate-800">{user.name}</h2>
            <span className="text-xs text-slate-500 uppercase tracking-wider">{user.role || 'Employee'}</span>
          </div>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => setViewMode('input')}
            className={`px-4 py-2 text-sm font-semibold rounded-md transition-all ${viewMode === 'input' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
          >
            Set Availability
          </button>
          <button
            onClick={() => setViewMode('view')}
            className={`px-4 py-2 text-sm font-semibold rounded-md transition-all ${viewMode === 'view' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
          >
            View My Shifts
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto mb-6 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            {viewMode === 'input' ? 'Select Your Preferences' : 'Your Upcoming Shifts'}
          </h1>
          <p className="text-slate-500">
            {viewMode === 'input'
              ? 'Click or drag across slots to change their status.'
              : 'These are the shifts assigned to you by your manager.'}
          </p>
        </div>

        {/* --- LEGEND (Only visible in Input Mode) --- */}
        {viewMode === 'input' && (
          <div className="flex gap-4 bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-sm">
            {Object.entries(STATUS_CONFIG).map(([key, config]) => (
              <div key={key} className="flex items-center gap-2">
                {/* The colored box */}
                <div className={`w-5 h-5 rounded flex items-center justify-center border ${config.color}`}>
                  {config.icon}
                </div>
                <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                  {config.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main Grid */}
      <div className="max-w-6xl mx-auto bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden overflow-x-auto">
        <div className="p-8">
          <div className="grid gap-4" style={{ gridTemplateColumns: `80px repeat(${TIME_SLOTS.length}, minmax(60px, 1fr))` }}>

            {/* Header Row */}
            <div className="font-bold text-slate-400 uppercase text-xs tracking-wider self-center"></div>
            {TIME_SLOTS.map((time) => (
              <div key={time} className="text-center font-semibold text-xs text-slate-400 pb-2 border-b border-slate-100 rotate-0">
                {time}
              </div>
            ))}

            {/* Rows */}
            {DAYS.map((day) => (
              <React.Fragment key={day}>
                <div className="font-bold text-slate-700 text-sm self-center">{day}</div>

                {TIME_SLOTS.map((time) => {
                  const key = `${day}-${time}`;

                  // --- VIEW MODE LOGIC ---
                  if (viewMode === 'view') {
                    const isAssigned = assignedShifts[key];
                    return (
                      <div
                        key={key}
                        className={`
                          h-12 rounded border transition-all duration-200 flex items-center justify-center
                          ${isAssigned
                            ? 'bg-indigo-600 border-indigo-700 shadow-sm'
                            : 'bg-slate-50 border-slate-100 opacity-50'}
                        `}
                      >
                        {isAssigned && <Clock size={14} className="text-white" />}
                      </div>
                    );
                  }

                  // --- INPUT MODE LOGIC ---
                  const status = schedule[key] || 'available';
                  const config = STATUS_CONFIG[status];
                  return (
                    <div
                      key={key}
                      onDragStart={preventDragHandler}
                      onMouseDown={() => handleMouseDown(day, time)}
                      onMouseEnter={() => handleMouseEnter(day, time)}
                      className={`
                        h-12 rounded border transition-all duration-100 cursor-pointer select-none
                        flex items-center justify-center
                        ${config.color}
                        ${isDragging ? 'hover:scale-95' : 'hover:scale-105'}
                      `}
                    >
                      {/* Only show icon if cell is NOT available (to keep UI clean) */}
                      {status !== 'available' && (
                        <div className="opacity-50">{config.icon}</div>
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Footer Actions (Only show in Input Mode) */}
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