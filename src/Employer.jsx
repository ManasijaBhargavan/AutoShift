import React, { useMemo, useState, useEffect } from 'react';

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

  const roles = Array.from(new Set(allShifts.map(s => s.role))).sort();
  const finalRoles = [];
  for (const role of roles) {
    const roleShifts = allShifts.filter(s => s.role === role).sort((a,b) => a.start - b.start);

    const byName = {};
    for (const s of roleShifts) {
      if (!byName[s.name]) byName[s.name] = [];
      byName[s.name].push({...s});
    }

    for (const name of Object.keys(byName)) {
      byName[name].sort((a,b) => a.start - b.start);
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

    finalRoles.push({role, lanes: subLanes});
  }

  return finalRoles;
}

const Employer = () => {
  // ✅ ALL HOOKS MUST BE HERE, INSIDE THE COMPONENT
  const [dayIndex, setDayIndex] = useState(0);
  const [draftCustomization, setDraftCustomization] = useState({});
  const [savedCustomization, setSavedCustomization] = useState({});
  const [schedule, setSchedule] = useState([]);

  const days = Array.isArray(schedule) ? schedule : [];

  // ✅ useEffect INSIDE component
  useEffect(() => {
    let mounted = true;
    
    // Fetch customization
    fetch('/api/customization')
      .then(r => r.json())
      .then(j => { 
        if (!mounted) return; 
        if (j && !j.error) {
          setSavedCustomization(j);
          setDraftCustomization(j);
        }
      })
      .catch(() => {});

    // Fetch schedule
    fetch('/api/schedule')
      .then(r => r.json())
      .then(j => { 
        if (!mounted) return; 
        if (j.ok && j.schedule) setSchedule(j.schedule); 
      })
      .catch(() => {});

    return () => { mounted = false };
  }, []);

  const allNames = useMemo(() => {
    const s = new Set();
    for (const d of days) {
      for (const h of (d.hours || [])) {
        for (const role of Object.keys(h.roles || {})) {
          for (const n of h.roles[role]) s.add(n);
        }
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
    const day = days[dayIndex] || {day: 'No data', hours: []};
    return buildShiftsForDay(day);
  }, [days, dayIndex]);

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
    const blob = new Blob([JSON.stringify(draftCustomization, null, 2)], {type: 'application/json'});
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
      const res = await fetch('/api/customization', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(draftCustomization)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({error: res.statusText}));
        throw new Error(err.error || res.statusText);
      }
      const body = await res.json().catch(() => null);
      if (body && body.schedule) {
        setSchedule(body.schedule);
        setDayIndex(0);
        setSavedCustomization(draftCustomization);
        alert('Saved and schedule regenerated.');
      } else if (body && body.ok) {
        const poll = await fetch('/api/schedule').then(r => r.json()).catch(() => null);
        if (poll && poll.ok && poll.schedule) {
          setSchedule(poll.schedule); 
          setDayIndex(0); 
          setSavedCustomization(draftCustomization); 
          alert('Saved and schedule regenerated.');
        } else alert('Saved but schedule not available yet.');
      } else {
        alert('Saved but unexpected server response');
      }
    } catch (e) {
      alert('Save failed: ' + e.message);
    }
  }

  return (
    <div className="min-h-screen flex items-start justify-center bg-slate-50 p-6">
      <div className="w-full max-w-5xl bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold">Schedule Visualizer</h1>
          <div>
            <select value={dayIndex} onChange={e => setDayIndex(Number(e.target.value))} className="border rounded-md p-2">
              {days.map((d, i) => <option key={d.day || i} value={i}>{d.day || `Day ${i + 1}`}</option>)}
            </select>
          </div>
        </div>

        <div className="w-full overflow-auto border rounded-md p-4 bg-white">
          <div className="mb-2 text-sm text-slate-500">Hours ({businessStart}–{businessEnd})</div>
          <div className="relative w-full" style={{minWidth: '800px'}}>
            <div className="relative h-6">
              <div style={{position: 'absolute', left: '10rem', right: 0, top: 0, height: '100%'}}>
                {Array.from({length: businessSpan + 1}).map((_, idx) => {
                  const hour = businessStart + idx;
                  const leftPct = ((hour - businessStart) / businessSpan) * 100;
                  return (
                    <div key={hour} style={{position: 'absolute', left: `${leftPct}%`, transform: 'translateX(-50%)', top: 0}} className="text-xs text-slate-400">{hour}</div>
                  );
                })}
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
                        <div key={laneIdx} style={{position: 'relative', height: laneHeight, marginBottom: isLast ? 0 : 6}}>
                          {subLane.map((s, j) => {
                            const sStart = Math.max(s.start, businessStart);
                            const sEnd = Math.min(s.end, businessEnd);
                            if (sEnd <= sStart) return null;
                            const dur = Math.max(0.25, sEnd - sStart);
                            const left = ((sStart - businessStart) / businessSpan) * 100;
                            const width = (dur / businessSpan) * 100;
                            const bg = nameToColor[s.name] || '#999';
                            return (
                              <div key={j} title={`${s.name} (${s.start}:00-${s.end}:00)`}
                                style={{position: 'absolute', left: `${left}%`, width: `${width}%`, top: 0, bottom: 0, background: bg, color: '#fff', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 12, padding: '0 6px', boxShadow: '0 1px 2px rgba(0,0,0,0.1)'}}>
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

        <div className="w-full mt-6 border rounded-md p-4 bg-white">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Customization</h2>
            <div className="space-x-2">
              <button onClick={saveToServer} className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md">Save</button>
              <button onClick={downloadJson} className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md">Download</button>
              <button onClick={copyJson} className="px-3 py-1 bg-slate-600 hover:bg-slate-700 text-white rounded-md">Copy</button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="text-sm font-medium mb-2">Constraints</div>
              <div className="space-y-3">
                <label className="flex items-center justify-between">
                  <span className="text-sm">Min shift length</span>
                  <input type="number" value={draftCustomization.constraints?.min_shift_length || ''} onChange={e => applyStructuredChange('constraints.min_shift_length', Number(e.target.value))} className="w-32 border rounded p-2" />
                </label>
                <label className="flex items-center justify-between">
                  <span className="text-sm">Max shift length</span>
                  <input type="number" value={draftCustomization.constraints?.max_shift_length || ''} onChange={e => applyStructuredChange('constraints.max_shift_length', Number(e.target.value))} className="w-32 border rounded p-2" />
                </label>
                <label className="flex items-center justify-between">
                  <span className="text-sm">Daily max hours</span>
                  <input type="number" value={draftCustomization.constraints?.daily_max_hours || ''} onChange={e => applyStructuredChange('constraints.daily_max_hours', Number(e.target.value))} className="w-32 border rounded p-2" />
                </label>
                <label className="flex items-center justify-between">
                  <span className="text-sm">Global staff floor</span>
                  <input type="number" value={draftCustomization.constraints?.global_staff_floor || ''} onChange={e => applyStructuredChange('constraints.global_staff_floor', Number(e.target.value))} className="w-32 border rounded p-2" />
                </label>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Business hours</span>
                  <div className="flex items-center space-x-2">
                    <input type="number" value={draftCustomization.constraints?.business_hours?.start ?? ''} onChange={e => applyStructuredChange('constraints.business_hours.start', Number(e.target.value))} className="w-20 border rounded p-2" />
                    <span className="text-sm">to</span>
                    <input type="number" value={draftCustomization.constraints?.business_hours?.end ?? ''} onChange={e => applyStructuredChange('constraints.business_hours.end', Number(e.target.value))} className="w-20 border rounded p-2" />
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div className="text-sm font-medium mb-2">Name Colors</div>
              <div className="flex flex-wrap gap-2 max-h-40 overflow-auto p-2 border rounded bg-white">
                {allNames.map((n) => (
                  <div key={n} className="flex items-center space-x-2 bg-slate-50 rounded px-2 py-1 shadow-sm">
                    <div style={{width: 14, height: 14, background: nameToColor[n] || '#999', borderRadius: 4}} />
                    <div className="text-sm">{n}</div>
                  </div>
                ))}
              </div>
              <div className="text-xs text-slate-500 mt-2">Colors assigned automatically. Download to save custom settings.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Employer;