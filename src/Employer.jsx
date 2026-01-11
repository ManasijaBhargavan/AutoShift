import React, {useMemo, useState} from 'react';
import scheduleData from '../schedule.json';

const PALETTE = [
  '#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#073b4c', '#8338ec', '#ff6b6b', '#4cc9f0', '#ffd6a5', '#a0c4ff'
];

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
        else allShifts.push({role, name, start: h, end: h + 1});
      }
    }
  }

  // group by role and create sub-lanes to avoid overlaps
  const roles = Array.from(new Set(allShifts.map(s => s.role))).sort();
  const finalRoles = [];
  for (const role of roles) {
    const roleShifts = allShifts.filter(s => s.role === role).sort((a,b) => a.start - b.start);

    // Group shifts by employee name so discontinuous shifts stay together
    const byName = {};
    for (const s of roleShifts) {
      if (!byName[s.name]) byName[s.name] = [];
      byName[s.name].push({...s});
    }

    // Ensure each name's shifts are sorted (and contiguous hours were merged earlier)
    for (const name of Object.keys(byName)) {
      byName[name].sort((a,b) => a.start - b.start);
    }

    const subLanes = [];
    // place each employee (all their shifts) into a single lane when possible
    for (const name of Object.keys(byName)) {
      const group = byName[name];
      let placed = false;
      for (const lane of subLanes) {
        // check if ANY shift in group conflicts with ANY shift in lane
        const conflict = group.some(g => lane.some(l => l.start < g.end && g.start < l.end));
        if (!conflict) { lane.push(...group); placed = true; break; }
      }
      if (!placed) subLanes.push([...group]);
    }

    finalRoles.push({role, lanes: subLanes});
  }

  return finalRoles;
}

const Employer = () => {
  const [dayIndex, setDayIndex] = useState(0);

  const days = Array.isArray(scheduleData) ? scheduleData : [];

  const allNames = useMemo(() => {
    const s = new Set();
    for (const d of days) {
      for (const h of (d.hours||[])) {
        for (const role of Object.keys(h.roles||{})) for (const n of h.roles[role]) s.add(n);
      }
    }
    return Array.from(s).sort();
  }, [days]);

  const nameToColor = useMemo(() => {
    const map = {};
    allNames.forEach((n,i)=> map[n] = PALETTE[i % PALETTE.length]);
    return map;
  }, [allNames]);

  const lanes = useMemo(() => {
    const day = days[dayIndex] || {day: 'No data', hours: []};
    return buildShiftsForDay(day);
  }, [days, dayIndex]);

  return (
    <div className="min-h-screen flex items-start justify-center bg-slate-50 p-6">
      <div className="w-full max-w-5xl bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Schedule Visualizer</h1>
          <div>
            <select value={dayIndex} onChange={e=>setDayIndex(Number(e.target.value))} className="border rounded-md p-2">
              {days.map((d,i)=> <option key={d.day||i} value={i}>{d.day || `Day ${i+1}`}</option>)}
            </select>
          </div>
        </div>

        <div className="w-full overflow-auto border rounded-md p-4 bg-white">
          <div className="mb-2 text-sm text-slate-500">Hours (0–24)</div>
          <div className="relative w-full" style={{minWidth: '800px'}}>
            {/* timeline ticks aligned to right content area */}
            <div className="relative h-6">
              <div style={{position:'absolute', left:'10rem', right:0, top:0, height:'100%'}}>
                {Array.from({length:25}).map((_,i)=> (
                  <div key={i} style={{position:'absolute', left:`${(i/24)*100}%`, transform:'translateX(-50%)', top:0}} className="text-xs text-slate-400">{i}</div>
                ))}
              </div>
            </div>

            <div className="mt-2 space-y-2">
              {lanes.length === 0 && <div className="text-sm text-slate-500 p-4">No shifts for this day.</div>}
              {lanes.map((roleObj, idx) => (
                <div key={idx} className="flex border rounded bg-slate-50 p-2">
                  <div className="w-40 pr-2 flex items-center text-sm font-semibold text-slate-700">{roleObj.role}</div>
                  <div className="flex-1 pr-2">
                    {roleObj.lanes.map((subLane, laneIdx) => {
                      const laneHeight = 44;
                      const isLast = laneIdx === roleObj.lanes.length - 1;
                      return (
                        <div key={laneIdx} style={{position:'relative', height:laneHeight, marginBottom: isLast ? 0 : 6}}>
                          {subLane.map((s, j)=> {
                            const dur = Math.max(0.5, s.end - s.start);
                            const left = (s.start/24)*100;
                            const width = (dur/24)*100;
                            const bg = nameToColor[s.name] || '#999';
                            return (
                              <div key={j} title={`${s.name} (${s.start}:00-${s.end}:00)`}
                                style={{position:'absolute', left:`${left}%`, width:`${width}%`, top:0, bottom:0, background:bg, color:'#fff', borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:600, fontSize:12, padding:'0 6px', boxShadow:'0 1px 2px rgba(0,0,0,0.1)'}}>
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
    </div>
  );
};

export default Employer;
