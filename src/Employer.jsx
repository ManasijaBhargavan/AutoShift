import React, { useMemo, useState, useEffect } from 'react';
import { 
  Save, Download, Copy, Settings, Calendar, 
  ChevronLeft, ChevronRight, Clock, Users, 
  LayoutGrid, Sliders 
} from 'lucide-react';

const PALETTE = [
  '#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#073b4c', '#8338ec', '#ff6b6b', '#4cc9f0', '#ffd6a5', '#a0c4ff'
];

// --- LOGIC HELPER: Build Gantt Chart Rows ---
function buildShiftsForDay(day) {
  const hours = (day && day.hours) || [];
  const allShifts = [];

  for (const entry of hours) {
    if (!entry || typeof entry !== 'object') continue;
    const h = parseInt((entry.time || '00:00').split(':')[0], 10);
    const roles = entry.roles || {};
    for (const role of Object.keys(roles)) {
      const names = roles[role] || [];
      for (const name of names) {
        const existing = allShifts.find(s => s.name === name && s.role === role && s.end === h);
        if (existing) existing.end = h + 1;
        else allShifts.push({ role, name, start: h, end: h + 1 });
      }
    }
  }

  // Group and sort logic
  const roles = Array.from(new Set(allShifts.map(s => s.role))).sort();
  const finalRoles = [];
  
  for (const role of roles) {
    const roleShifts = allShifts.filter(s => s.role === role).sort((a, b) => a.start - b.start);
    const byName = {};
    
    for (const s of roleShifts) {
      if (!byName[s.name]) byName[s.name] = [];
      byName[s.name].push({ ...s });
    }

    for (const name of Object.keys(byName)) {
      byName[name].sort((a, b) => a.start - b.start);
    }

    const subLanes = [];
    for (const name of Object.keys(byName)) {
      const group = byName[name];
      let placed = false;
      for (const lane of subLanes) {
        const conflict = group.some(g => lane.some(l => l.start < g.end && g.start < l.end));
        if (!conflict) { lane.push(...group); placed = true; break; }
      }
      if (!placed) subLanes.push([...group]);
    }
    finalRoles.push({ role, lanes: subLanes });
  }

  return finalRoles;
}

const Employer = () => {
  const [dayIndex, setDayIndex] = useState(0);
  const [activeTab, setActiveTab] = useState('visualizer'); // 'visualizer' or 'settings'
  const [draftCustomization, setDraftCustomization] = useState({});
  const [savedCustomization, setSavedCustomization] = useState({});
  const [schedule, setSchedule] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const days = Array.isArray(schedule) ? schedule : [];

  // --- 1. Fetch Data on Mount ---
  useEffect(() => {
    let mounted = true;
    
    // Fetch Settings
    fetch('/api/customization')
      .then(r => r.json())
      .then(j => {
        if (!mounted) return;
        if (j && !j.error) {
          setSavedCustomization(j);
          setDraftCustomization(j);
        }
      })
      .catch(console.error);

    // Fetch Schedule
    fetch('/api/schedule')
      .then(r => r.json())
      .then(j => {
        if (!mounted) return;
        if (j.ok && j.schedule) setSchedule(j.schedule);
      })
      .catch(console.error);
      
    return () => { mounted = false };
  }, []);

  // --- 2. Derived State ---
  const allNames = useMemo(() => {
    const s = new Set();
    for (const d of days) {
      for (const h of (d.hours || [])) {
        for (const role of Object.keys(h.roles || {})) for (const n of h.roles[role]) s.add(n);
      }
    }
    return Array.from(s).sort();
  }, [days]);

  const nameToColor = useMemo(() => {
    const map = {};
    allNames.forEach((n, i) => map[n] = PALETTE[i % PALETTE.length]);
    return map;
  }, [allNames]);

  const businessStart = savedCustomization.constraints?.business_hours?.start ?? 0;
  const businessEnd = savedCustomization.constraints?.business_hours?.end ?? 24;
  const businessSpan = Math.max(1, businessEnd - businessStart);

  const lanes = useMemo(() => {
    const day = days[dayIndex] || { day: 'No data', hours: [] };
    return buildShiftsForDay(day);
  }, [days, dayIndex]);


  // --- 3. Actions ---
  function applyStructuredChange(path, value) {
    const next = JSON.parse(JSON.stringify(draftCustomization || {}));
    const parts = path.split('.');
    let cur = next;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (cur[p] == null) cur[p] = {};
      cur = cur[p];
    }
    cur[parts[parts.length - 1]] = value;
    setDraftCustomization(next);
  }

  function downloadJson() {
    const blob = new Blob([JSON.stringify(draftCustomization, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'customization.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(draftCustomization, null, 2));
      alert('Customization copied to clipboard');
    } catch (e) {
      alert('Copy failed: ' + e.message);
    }
  }

  async function saveToServer() {
    try {
      setIsGenerating(true); // Start loading spinner

      // 1. Send Save Request
      const res = await fetch('api/customization', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(draftCustomization)
      });

      if (!res.ok) throw new Error("Server failed to save");

      // 2. The server says "OK, I'm working on it". 
      // We now wait a bit and then reload the schedule.
      alert('Settings saved! Regenerating schedule (this may take a moment)...');

      // 3. Wait 4 seconds (approx time for python to run) then fetch the new schedule
      // You can increase this delay if your python script is very slow
      setTimeout(async () => {
        try {
          const schedRes = await fetch('/api/schedule');
          const schedData = await schedRes.json();
          
          if (schedData.schedule) {
            setSchedule(schedData.schedule);
            setDayIndex(0);
            console.log("Schedule updated from background job");
          }
        } catch (err) {
          console.error("Could not auto-refresh schedule", err);
        } finally {
          setIsGenerating(false); // Stop loading
        }
      }, 4000); // Wait 4000ms (4 seconds)

    } catch (e) {
      setIsGenerating(false);
      alert('Save failed: ' + e.message);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-8">
      
      {/* --- HEADER --- */}
      <div className="max-w-6xl mx-auto mb-8 flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold">
            <LayoutGrid size={20} />
          </div>
          <div>
            <h2 className="font-bold text-slate-800">Manager Dashboard</h2>
            <span className="text-xs text-slate-500 uppercase tracking-wider">Admin View</span>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('visualizer')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-md transition-all ${
              activeTab === 'visualizer' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Calendar size={16} /> Schedule
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-md transition-all ${
              activeTab === 'settings' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Sliders size={16} /> Configuration
          </button>
        </div>
      </div>

      {/* --- TAB CONTENT --- */}
      <div className="max-w-6xl mx-auto">
        
        {/* ================= VISUALIZER TAB ================= */}
        {activeTab === 'visualizer' && (
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden p-6">
            
            {/* Toolbar */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setDayIndex(Math.max(0, dayIndex - 1))}
                  disabled={dayIndex === 0}
                  className="p-2 rounded-full hover:bg-slate-100 disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft size={20} />
                </button>
                
                <div className="text-center">
                  <h2 className="text-xl font-bold text-slate-800">
                    {days[dayIndex]?.day || "Loading Schedule..."}
                  </h2>
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                    Business Hours: {businessStart}:00 - {businessEnd}:00
                  </p>
                </div>

                <button 
                  onClick={() => setDayIndex(Math.min(days.length - 1, dayIndex + 1))}
                  disabled={dayIndex >= days.length - 1}
                  className="p-2 rounded-full hover:bg-slate-100 disabled:opacity-30 transition-colors"
                >
                  <ChevronRight size={20} />
                </button>
              </div>

              <div className="flex gap-2">
                 {/* Legend or Filters could go here */}
              </div>
            </div>

            {/* Gantt Chart Container */}
            <div className="w-full overflow-x-auto border border-slate-100 rounded-lg">
              <div className="relative w-full min-w-[800px] p-4">
                
                {/* Time Axis */}
                <div className="relative h-8 mb-4 border-b border-slate-200">
                  <div className="absolute left-40 right-0 top-0 h-full">
                    {Array.from({ length: businessSpan + 1 }).map((_, idx) => {
                      const hour = businessStart + idx;
                      const leftPct = ((hour - businessStart) / businessSpan) * 100;
                      return (
                        <div key={hour} style={{ left: `${leftPct}%` }} className="absolute transform -translate-x-1/2 top-0 flex flex-col items-center">
                          <span className="text-xs text-slate-400 font-medium">{hour}:00</span>
                          <div className="h-2 w-px bg-slate-200 mt-1"></div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Lanes */}
                <div className="space-y-4">
                  {lanes.length === 0 && (
                    <div className="text-center py-10 text-slate-400 italic bg-slate-50 rounded-lg">
                      No shifts assigned for this day.
                    </div>
                  )}
                  
                  {lanes.map((roleObj, idx) => (
                    <div key={idx} className="flex">
                      {/* Role Label */}
                      <div className="w-40 pr-4 flex items-center">
                        <div className="font-semibold text-sm text-slate-700 bg-slate-50 px-3 py-2 rounded w-full border border-slate-100">
                          {roleObj.role}
                        </div>
                      </div>
                      
                      {/* Shifts Area */}
                      <div className="flex-1 relative">
                        {/* Background Grid Lines */}
                        <div className="absolute inset-0 pointer-events-none">
                          {Array.from({ length: businessSpan + 1 }).map((_, idx) => {
                            const leftPct = (idx / businessSpan) * 100;
                            return <div key={idx} style={{ left: `${leftPct}%` }} className="absolute top-0 bottom-0 w-px bg-slate-50 border-r border-dashed border-slate-200"></div>
                          })}
                        </div>

                        {roleObj.lanes.map((subLane, laneIdx) => {
                          const laneHeight = 40;
                          return (
                            <div key={laneIdx} style={{ height: laneHeight }} className="relative mb-2">
                              {subLane.map((s, j) => {
                                const sStart = Math.max(s.start, businessStart);
                                const sEnd = Math.min(s.end, businessEnd);
                                if (sEnd <= sStart) return null;
                                
                                const left = ((sStart - businessStart) / businessSpan) * 100;
                                const width = ((sEnd - sStart) / businessSpan) * 100;
                                const bg = nameToColor[s.name] || '#94a3b8';
                                
                                return (
                                  <div
                                    key={j}
                                    title={`${s.name} (${s.start}:00 - ${s.end}:00)`}
                                    style={{
                                      left: `${left}%`,
                                      width: `${width}%`,
                                      backgroundColor: bg
                                    }}
                                    className="absolute top-0 bottom-0 rounded-md shadow-sm border border-white/20 flex items-center justify-center text-white text-xs font-bold px-2 overflow-hidden whitespace-nowrap hover:brightness-110 transition-all cursor-default z-10"
                                  >
                                    {s.name}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= SETTINGS TAB ================= */}
        {activeTab === 'settings' && (
          <div className="bg-white rounded-2xl shadow-xl border border-slate-100 p-8">
            <div className="flex items-center justify-between mb-8 pb-6 border-b border-slate-100">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">System Configuration</h2>
                <p className="text-slate-500 mt-1">Define global constraints for the scheduling algorithm.</p>
              </div>
              
              <div className="flex gap-3">
                <button onClick={copyJson} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors">
                  <Copy size={16} /> Copy JSON
                </button>
                <button onClick={downloadJson} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50 font-medium transition-colors">
                  <Download size={16} /> Download
                </button>
                <button onClick={saveToServer} className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium shadow-md shadow-indigo-200 transition-all">
                  <Save size={18} /> Save & Regenerate
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
              {/* Constraints Column */}
              <div className="md:col-span-2 space-y-8">
                <div>
                  <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800 mb-4">
                    <Clock className="text-indigo-500" size={20}/> Shift Constraints
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-slate-50 p-6 rounded-xl border border-slate-100">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Min Shift Length (Hrs)</label>
                      <input 
                        type="number" 
                        value={draftCustomization.constraints?.min_shift_length || ''} 
                        onChange={e => applyStructuredChange('constraints.min_shift_length', Number(e.target.value))} 
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Max Shift Length (Hrs)</label>
                      <input 
                        type="number" 
                        value={draftCustomization.constraints?.max_shift_length || ''} 
                        onChange={e => applyStructuredChange('constraints.max_shift_length', Number(e.target.value))} 
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Daily Max Hours</label>
                      <input 
                        type="number" 
                        value={draftCustomization.constraints?.daily_max_hours || ''} 
                        onChange={e => applyStructuredChange('constraints.daily_max_hours', Number(e.target.value))} 
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Min Staff Floor</label>
                      <input 
                        type="number" 
                        value={draftCustomization.constraints?.global_staff_floor || ''} 
                        onChange={e => applyStructuredChange('constraints.global_staff_floor', Number(e.target.value))} 
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800 mb-4">
                    <Calendar className="text-indigo-500" size={20}/> Business Hours
                  </h3>
                  <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 flex items-center gap-4">
                    <div className="flex-1">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Open Time (24h)</label>
                      <input 
                        type="number" 
                        value={draftCustomization.constraints?.business_hours?.start ?? ''} 
                        onChange={e => applyStructuredChange('constraints.business_hours.start', Number(e.target.value))} 
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      />
                    </div>
                    <div className="pt-6 text-slate-400 font-bold">TO</div>
                    <div className="flex-1">
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Close Time (24h)</label>
                      <input 
                        type="number" 
                        value={draftCustomization.constraints?.business_hours?.end ?? ''} 
                        onChange={e => applyStructuredChange('constraints.business_hours.end', Number(e.target.value))} 
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Sidebar Column */}
              <div>
                <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800 mb-4">
                  <Users className="text-indigo-500" size={20}/> Staff Legend
                </h3>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 max-h-[400px] overflow-y-auto">
                  <div className="space-y-2">
                    {allNames.length === 0 && <p className="text-slate-400 text-sm">No employees found.</p>}
                    {allNames.map((n) => (
                      <div key={n} className="flex items-center gap-3 bg-white p-2 rounded border border-slate-100 shadow-sm">
                        <div style={{ backgroundColor: nameToColor[n] || '#999' }} className="w-4 h-4 rounded-full shadow-sm"></div>
                        <span className="text-sm font-semibold text-slate-700">{n}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-3 text-center">
                  Colors are auto-assigned for visualization only.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Employer;
