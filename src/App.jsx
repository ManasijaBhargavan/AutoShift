import React, { useState , useEffect } from 'react';
import { Check, X, Star, Calendar, ChevronRight } from 'lucide-react';

// --- Constants ---
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TIME_SLOTS = [
  "8:00 AM",
  "8:30 AM",
  "9:00 AM",
  "9:30 AM",
  "10:00 AM",
  "10:30 AM",
  "11:00 AM",
  "11:30 AM",
  "12:00 PM",
  "12:30 PM",
  "1:00 PM",
  "1:30 PM",
  "2:00 PM",
  "2:30 PM",
  "3:00 PM",
  "3:30 PM",
  "4:00 PM",
  "4:30 PM",
  "5:00 PM",
  "5:30 PM",
  "6:00 PM",
  "6:30 PM",
  "7:00 PM",
  "7:30 PM",
  "8:00 PM"
]
;

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

  // Stop dragging if user releases mouse anywhere on the screen
  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

const getNextStatus = (currentStatus) => {
    if (currentStatus === 'unavailable') return 'available';
    if (currentStatus === 'available') return 'preferred';
    return 'unavailable';
  };

  const handleMouseDown = (day, time) => {
    const key = `${day}-${time}`;
    const currentStatus = schedule[key] || 'unavailable';
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

  // Helper to toggle status: Unavailable -> Available -> Preferred -> Unavailable
  /*const toggleStatus = (day, time) => {
    const key = `${day}-${time}`;
    const currentStatus = schedule[key] || 'available';
    
    let nextStatus;
    if (currentStatus === 'unavailable') nextStatus = 'preferred';
    else if (currentStatus === 'available') nextStatus = 'unavailable';
    else nextStatus = 'available';

    setSchedule({ ...schedule, [key]: nextStatus });
  };*/

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-8">
      
      {/* Header Section */}
      <div className="max-w-4xl mx-auto mb-10">
        <div className="flex items-center gap-3 mb-2 text-indigo-600">
          <Calendar className="w-6 h-6" />
          <span className="font-semibold tracking-wide uppercase text-sm">Scheduler 1.0</span>
        </div>
        <h1 className="text-4xl font-bold mb-4 text-slate-900">Set Your Shift Preferences</h1>
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
            {Object.values(schedule).filter(s => s !== 'unavailable').length} shifts selected
          </div>
          <button 
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition-colors shadow-lg shadow-indigo-200"
            onClick={() => console.log(schedule)}
          >
            Submit Availability <ChevronRight size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;