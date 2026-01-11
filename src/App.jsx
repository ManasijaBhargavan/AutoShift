import React, { useState, useEffect } from 'react';
import { Check, X, Star, Calendar, ChevronRight } from 'lucide-react';

// --- Constants ---
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const TIME_SLOTS = [
  "08:00", "08:30",
  "09:00", "09:30",
  "10:00", "10:30",
  "11:00", "11:30",
  "12:00", "12:30",
  "13:00", "13:30",
  "14:00", "14:30",
  "15:00", "15:30",
  "16:00", "16:30",
  "17:00", "17:30",
  "18:00", "18:30",
  "19:00", "19:30",
  "20:00"
];

// Status Definitions
const STATUS_CONFIG = {
  unavailable: {
    label: 'Unavailable',
    color: 'bg-red-50 text-red-700 border-red-200 hover:border-red-300',
    icon: <X size={16} />
  },
  available: {
    label: 'Available',
    color: 'bg-gray-100 text-gray-400 border-gray-200 hover:border-gray-300',
    icon: <Check size={16} />
  },
  preferred: {
    label: 'Preferred',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:border-emerald-300',
    icon: <Star size={16} fill="currentColor" />
  }
};

const App = () => {
  // State to hold the grid data
  // Structure: { "Mon-Morning (8-12)": "available", ... }
  const [schedule, setSchedule] = useState({});
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartStatus, setDragStartStatus] = useState(null); // What status are we applying?
  const [user, setCurrentUser] = useState(null);

  // Stop dragging if user releases mouse anywhere on the screen
  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  // Inside App.jsx
  useEffect(() => {
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
      const userObj = JSON.parse(storedUser);
      setCurrentUser(userObj);
      // Now you can set this to state: setCurrentUser(user);
    } else {
      // If they bypass login, kick them out
      //window.location.href = '/';
    }
  }, []);

  const getNextStatus = (currentStatus) => {
    if (currentStatus === 'unavailable') return 'available';
    if (currentStatus === 'available') return 'preferred';
    return 'unavailable';
  };

  const handleMouseDown = (day, time) => {
    const key = `${day}-${time}`;
    const currentStatus = schedule[key] || 'available';
    const nextStatus = getNextStatus(currentStatus);

    setIsDragging(true);
    setDragStartStatus(nextStatus); // "Lock in" the intention of this drag

    // Update the first cell immediately
    setSchedule(prev => ({ ...prev, [key]: nextStatus }));
  };

  const handleMouseEnter = (day, time) => {
    if (!isDragging) return;

    const key = `${day}-${time}`;
    // Only apply the status determined at the start of the drag
    setSchedule(prev => ({ ...prev, [key]: dragStartStatus }));
  };

  // Prevent default drag behavior (like selecting text)
  const preventDragHandler = (e) => {
    e.preventDefault();
  };

  const handleDownload = () => {
    // 1. Helper to add minutes
    const addMinutes = (timeStr, minsToAdd) => {
      const [hours, minutes] = timeStr.split(':').map(Number);
      const date = new Date();
      date.setHours(hours, minutes + minsToAdd);
      return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    };

    // 2. Logic to merge consecutive slots
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
            const endTime = addMinutes(lastSlotTime, 30); // Use 30 since that's your slot interval
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

    // 3. Build the availability object first
    const availabilityData = {};
    DAYS.forEach(day => {
      availabilityData[day] = {
        unavailable: getRangesForStatus(day, 'unavailable'),
        preferred: getRangesForStatus(day, 'preferred')
      };
    });

    // 4. Construct the Final JSON Object with User Info
    const finalData = {
      name: user ? user.name : "Unknown Employee",
      role: user && user.role ? user.role : "Server", // Default to 'Server' if missing
      max_hours: 40, // Default value as requested
      availability: availabilityData
    };

    // 5. Download
    const fileData = JSON.stringify(finalData, null, 2);
    const blob = new Blob([fileData], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;

    // Create a filename like "Anthony_preferences.json"
    const safeName = user ? user.name.replace(/\s+/g, '_') : 'employee';
    link.download = `${safeName}_preferences.json`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-8">

      {/* Header Section */}
      <div className="max-w-4xl mx-auto mb-10">
        <div className="flex items-center gap-3 mb-2 text-indigo-600">
          <Calendar className="w-6 h-6" />
          <span className="font-semibold tracking-wide uppercase text-sm">Scheduler 1.0</span>
        </div>
        <h1 className="text-4xl font-bold mb-4 text-slate-900">
          {user ? `Welcome, ${user.name}.` : 'Welcome'}
        </h1>
        <p className="text-slate-500 text-lg">
          Click the slots below to indicate when you can work.
        </p>

        {/* Legend */}
        <div className="flex gap-6 mt-6 text-sm font-medium">
          {Object.entries(STATUS_CONFIG).map(([key, config]) => (
            <div key={key} className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded flex items-center justify-center border ${config.color}`}>
                {config.icon}
              </div>
              <span className="capitalize">{config.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Main Grid Card */}
      <div className="max-w-5xl mx-auto bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
        <div className="p-8">

          {/* Grid Layout */}
          <div className="grid grid-cols-[80px_repeat(7,1fr)] gap-4">

            {/* Header Row */}
            <div className="font-bold text-slate-400 uppercase text-xs tracking-wider self-center">Day</div>
            {DAYS.map((day) => (
              <div key={day} className="text-center font-semibold text-slate-700 pb-2 border-b border-slate-100">
                {day}
              </div>
            ))}

            {/* Rows */}
            {TIME_SLOTS.map((time) => (
              <React.Fragment key={time}>
                {/* Day Label */}
                <div className="font-bold text-slate-600 self-center">{time}</div>

                {/* Time Slots */}
                {DAYS.map((day) => {
                  const key = `${day}-${time}`;
                  const status = schedule[key] || 'available';
                  const config = STATUS_CONFIG[status];

                  return (
                    <div
                      key={key}

                      onDragStart={preventDragHandler}

                      onMouseDown={() => handleMouseDown(day, time)}
                      onMouseEnter={() => handleMouseEnter(day, time)}

                      className={`
                        h-16 rounded-lg border-2 transition-all duration-100 cursor-pointer
                        flex flex-col items-center justify-center gap-1 select-none
                        ${config.color}
                        ${isDragging ? 'hover:scale-95' : 'hover:scale-105'}
                      `}
                    >
                      <div className="opacity-80 pointer-events-none">{config.icon}</div>
                      <span className="text-xs font-semibold uppercase tracking-wider pointer-events-none">
                        {status}
                      </span>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="bg-slate-50 p-6 flex justify-between items-center border-t border-slate-100">
          <div className="text-slate-500 text-sm">
            {(DAYS.length * TIME_SLOTS.length) - Object.values(schedule).filter(s => s === 'unavailable').length} shifts selected
          </div>
          <button
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition-colors shadow-lg shadow-indigo-200"
            onClick={handleDownload}
          >
            Submit Availability <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;