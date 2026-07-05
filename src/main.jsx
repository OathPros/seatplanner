import React, { useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const STORAGE_KEY = 'wedding-seating-plan-v1';
const palette = ['#d97706','#0891b2','#7c3aed','#16a34a','#dc2626','#db2777','#4f46e5','#0f766e','#9333ea','#ca8a04'];
const emptyPlan = { guests: [], tables: [], selectedTableId: null, selectedGuestId: null };
const uid = (p) => `${p}-${Math.random().toString(36).slice(2, 9)}`;
const inches = 2.6;

function splitCsvLine(line) {
  const out = []; let cur = ''; let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i], n = line[i + 1];
    if (c === '"' && quoted && n === '"') { cur += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (c === ',' && !quoted) { out.push(cur.trim()); cur = ''; }
    else cur += c;
  }
  out.push(cur.trim()); return out;
}
function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]).map(h => h.toLowerCase().trim());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line); const row = Object.fromEntries(headers.map((h, i) => [h, cells[i] || '']));
    return { id: uid('guest'), name: row.name || 'Unnamed Guest', group: row.group || '', tags: (row.tags || '').split(',').map(t => t.trim()).filter(Boolean), side: row.side || '', meal: row.meal || '', notes: row.notes || '' };
  });
}
function csvEscape(v='') { const s = String(v); return /[",\n]/.test(s) ? `"${s.replaceAll('"','""')}"` : s; }
function download(name, data, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name; a.click(); URL.revokeObjectURL(a.href); }
function firstName(name) { return name.trim().split(/\s+/)[0] || name; }

function App() {
  const [plan, setPlan] = useState(emptyPlan);
  const [drag, setDrag] = useState(null);
  const [dragGuest, setDragGuest] = useState(null);
  const svgRef = useRef(null);
  const seated = useMemo(() => new Set(plan.tables.flatMap(t => t.seats.map(s => s.guestId).filter(Boolean))), [plan.tables]);
  const tagColors = useMemo(() => { const tags = [...new Set(plan.guests.flatMap(g => g.tags))]; return Object.fromEntries(tags.map((t,i)=>[t,palette[i%palette.length]])); }, [plan.guests]);
  const selectedTable = plan.tables.find(t => t.id === plan.selectedTableId);
  const selectedGuest = plan.guests.find(g => g.id === plan.selectedGuestId);

  const updateTable = (id, patch) => setPlan(p => ({...p, tables: p.tables.map(t => t.id === id ? {...t, ...patch, seats: patch.seatCount ? resizeSeats(t.seats, Number(patch.seatCount)) : t.seats} : t)}));
  const resizeSeats = (seats, count) => Array.from({length: count}, (_, i) => seats[i] || { index: i, guestId: null });
  const addTable = (type) => setPlan(p => { const id = uid('table'); const seatCount = type === 'round' ? 8 : 10; return {...p, selectedTableId: id, selectedGuestId: null, tables: [...p.tables, { id, type, name: type === 'round' ? 'Round Table' : 'Rectangle Table', x: 360, y: 220, rotation: 0, diameterInches: 60, widthInches: 96, depthInches: 36, seatCount, seats: resizeSeats([], seatCount) }]}; });
  const assignGuest = (guestId, tableId, seatIndex) => setPlan(p => {
    const current = p.tables.flatMap(t => t.seats.map(s => ({ tableId:t.id, index:s.index, guestId:s.guestId }))).find(s => s.guestId === guestId);
    const targetTable = p.tables.find(t => t.id === tableId); const displaced = targetTable?.seats[seatIndex]?.guestId || null;
    return {...p, selectedGuestId: guestId, tables: p.tables.map(t => ({...t, seats: t.seats.map(s => {
      if (t.id === tableId && s.index === seatIndex) return {...s, guestId};
      if (current && t.id === current.tableId && s.index === current.index) return {...s, guestId: displaced};
      return s;
    })}))};
  });
  const unseat = (guestId) => setPlan(p => ({...p, tables: p.tables.map(t => ({...t, seats: t.seats.map(s => s.guestId === guestId ? {...s, guestId:null} : s)}))}));
  const chairPositions = (t) => t.type === 'round' ? t.seats.map((_,i)=>{ const a = (Math.PI*2*i/t.seatCount) + Math.PI/2; const r = t.diameterInches*inches/2 + 25; return {x: Math.cos(a)*r, y: Math.sin(a)*r}; }) : rectChairs(t);
  function rectChairs(t) { const w=t.widthInches*inches, h=t.depthInches*inches, c=t.seatCount, arr=[]; for(let i=0;i<c;i++){ const q=i/c*4; if(q<1) arr.push({x:-w/2+w*q,y:-h/2-25}); else if(q<2) arr.push({x:w/2+25,y:-h/2+h*(q-1)}); else if(q<3) arr.push({x:w/2-w*(q-2),y:h/2+25}); else arr.push({x:-w/2-25,y:h/2-h*(q-3)}); } return arr; }
  const pointer = e => { const r=svgRef.current.getBoundingClientRect(); return {x:e.clientX-r.left,y:e.clientY-r.top}; };
  const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
  const load = () => setPlan(JSON.parse(localStorage.getItem(STORAGE_KEY) || JSON.stringify(emptyPlan)));
  const importJson = async e => { const f=e.target.files[0]; if(f) setPlan(JSON.parse(await f.text())); e.target.value=''; };
  const uploadCsv = async e => { const f=e.target.files[0]; if(f) setPlan(p => ({...p, guests: parseCsv(await f.text()), tables: p.tables.map(t=>({...t,seats:t.seats.map(s=>({...s,guestId:null}))}))})); e.target.value=''; };
  const exportSeating = () => download('seating.csv', ['name,group,tags,side,meal,notes,table,seat', ...plan.guests.map(g => { const loc = plan.tables.flatMap(t=>t.seats.map(s=>({t,s}))).find(x=>x.s.guestId===g.id); return [g.name,g.group,g.tags.join('|'),g.side,g.meal,g.notes,loc?.t.name||'',loc? loc.s.index+1 : ''].map(csvEscape).join(','); })].join('\n'), 'text/csv');
  const shuffleSelected = () => { if(!selectedTable) return; const ids=[...selectedTable.seats.map(s=>s.guestId).filter(Boolean)].sort(()=>Math.random()-.5); updateTable(selectedTable.id, { seats: selectedTable.seats.map((s,i)=>({...s,guestId:ids[i]||null})) }); };

  return <div className="app"><aside className="sidebar left"><h1>Seating Planner</h1><label className="button">Upload CSV<input type="file" accept=".csv,text/csv" onChange={uploadCsv}/></label><h2>Unseated Guests</h2><div className="guest-list">{plan.guests.filter(g=>!seated.has(g.id)).map(g=><Guest key={g.id} g={g} tagColors={tagColors} onClick={()=>setPlan(p=>({...p,selectedGuestId:g.id,selectedTableId:null}))} onDragStart={()=>setDragGuest(g.id)}/>)}</div><Legend tagColors={tagColors}/></aside>
  <main><div className="toolbar"><button onClick={()=>addTable('round')}>Add Round Table</button><button onClick={()=>addTable('rectangle')}>Add Rectangle Table</button><button onClick={save}>Save</button><button onClick={load}>Load</button><button onClick={()=>download('seating-plan.json',JSON.stringify(plan,null,2),'application/json')}>Export JSON</button><label className="button">Import JSON<input type="file" accept="application/json" onChange={importJson}/></label><button onClick={exportSeating}>Export Seating CSV</button><button onClick={shuffleSelected}>Shuffle Selected Table</button></div>
  <svg ref={svgRef} className="canvas" onPointerMove={e=>{ if(!drag) return; const p=pointer(e); updateTable(drag.id,{x:Math.round((p.x-drag.dx)/20)*20,y:Math.round((p.y-drag.dy)/20)*20}); }} onPointerUp={()=>setDrag(null)} onDragOver={e=>e.preventDefault()}><defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e9e2d7" strokeWidth="1"/></pattern></defs><rect width="100%" height="100%" fill="url(#grid)"/>{plan.tables.map(t=><Table key={t.id} t={t} guests={plan.guests} tagColors={tagColors} selected={t.id===plan.selectedTableId} positions={chairPositions(t)} onDown={e=>{const p=pointer(e); setDrag({id:t.id,dx:p.x-t.x,dy:p.y-t.y}); setPlan(pl=>({...pl,selectedTableId:t.id,selectedGuestId:null}));}} onSeat={(i)=> dragGuest && (assignGuest(dragGuest,t.id,i), setDragGuest(null))} onSeatClick={(i)=>{const gid=dragGuest || plan.selectedGuestId; if(gid) assignGuest(gid,t.id,i);}} onGuestClick={(gid)=>setPlan(p=>({...p,selectedGuestId:gid,selectedTableId:null}))}/>)}</svg></main><aside className="sidebar right"><Inspector table={selectedTable} guest={selectedGuest} updateTable={updateTable} setPlan={setPlan} unseat={unseat}/></aside></div>;
}
function Guest({g,tagColors,onClick,onDragStart}){return <div className="guest" draggable onDragStart={onDragStart} onClick={onClick}><span className="dot" style={{background:tagColors[g.tags[0]]||'#bbb'}}/> <b>{g.name}</b><small>{[g.group,g.meal].filter(Boolean).join(' · ')}</small></div>}
function Legend({tagColors}){return <div className="legend"><h2>Tags</h2>{Object.entries(tagColors).map(([t,c])=><span key={t}><i style={{background:c}}/> {t}</span>)}</div>}
function Table({t,guests,tagColors,selected,positions,onDown,onSeat,onSeatClick,onGuestClick}){ const w=t.widthInches*inches,h=t.depthInches*inches,d=t.diameterInches*inches; return <g transform={`translate(${t.x} ${t.y}) rotate(${t.rotation})`}><g onPointerDown={onDown} className={selected?'selected table':'table'}>{t.type==='round'?<circle r={d/2}/>:<rect x={-w/2} y={-h/2} width={w} height={h} rx="10"/>}<text y="5" textAnchor="middle">{t.name}</text></g>{positions.map((p,i)=>{const g=guests.find(x=>x.id===t.seats[i]?.guestId); return <g key={i} transform={`translate(${p.x} ${p.y})`} onDrop={()=>onSeat(i)} onDragOver={e=>e.preventDefault()} onClick={(e)=>{e.stopPropagation(); g?onGuestClick(g.id):onSeatClick(i)}}><circle className="chair" r="19" fill={g?(tagColors[g.tags[0]]||'#9ca3af'):'#fff'}/><text textAnchor="middle" y="4" className="chair-name">{g?(firstName(g.name).length<8?firstName(g.name):g.name.slice(0,10)):i+1}</text></g>})}</g>}
function Inspector({table,guest,updateTable,setPlan,unseat}){ if(guest) return <div><h2>Guest Settings</h2>{['name','group','meal','notes'].map(k=><label key={k}>{k}<input value={guest[k]} onChange={e=>setPlan(p=>({...p,guests:p.guests.map(g=>g.id===guest.id?{...g,[k]:e.target.value}:g)}))}/></label>)}<label>tags<input value={guest.tags.join(', ')} onChange={e=>setPlan(p=>({...p,guests:p.guests.map(g=>g.id===guest.id?{...g,tags:e.target.value.split(',').map(t=>t.trim()).filter(Boolean)}:g)}))}/></label><button onClick={()=>unseat(guest.id)}>Unseat</button></div>;
 if(table) return <div><h2>Table Settings</h2><label>table name<input value={table.name} onChange={e=>updateTable(table.id,{name:e.target.value})}/></label>{table.type==='round'?<label>diameter inches<input type="number" value={table.diameterInches} onChange={e=>updateTable(table.id,{diameterInches:+e.target.value})}/></label>:<><label>width inches<input type="number" value={table.widthInches} onChange={e=>updateTable(table.id,{widthInches:+e.target.value})}/></label><label>depth inches<input type="number" value={table.depthInches} onChange={e=>updateTable(table.id,{depthInches:+e.target.value})}/></label></>}<label>seat count<input type="number" min="1" value={table.seatCount} onChange={e=>updateTable(table.id,{seatCount:+e.target.value})}/></label><label>rotation<input type="number" value={table.rotation} onChange={e=>updateTable(table.id,{rotation:+e.target.value})}/></label><button className="danger" onClick={()=>setPlan(p=>({...p,selectedTableId:null,tables:p.tables.filter(t=>t.id!==table.id)}))}>Delete table</button></div>;
 return <p className="hint">Select a table or guest to edit details.</p> }
createRoot(document.getElementById('root')).render(<App />);
