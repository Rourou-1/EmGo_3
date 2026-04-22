// ══════════════════════════════════════════
// STATE
// ══════════════════════════════════════════
let currentTool='select', currentColor='#5b5bd6';
let canvasObjects=[], dragging=null, dragOffX=0, dragOffY=0;
let currentWeekOffset=0, canvasBgImage=null;
let schedShowDate=true;
let selectedEditActColor='#5b5bd6';
let ceShape='rounded', ceImgData=null;
let selectedEvType='professional', selectedEvColor='#5b5bd6';
let selectedEditEvType='professional', selectedEditEvColor='#5b5bd6';
let selectedLocColor='#5b5bd6';
let selectedActColor='#5b5bd6';
let currentEvFilter='all', currentEvSubTab='grid';
let zoom=1, panX=0, panY=0;
let isPanning=false, panMoved=false, panStartX=0, panStartY=0, panStartPX=0, panStartPY=0;
let recentlyUsed=[];

// Grid
let gridEnabled=false, gridSize=32, snapToGrid=true;

// Selection state
let selectedIds=new Set(); // multi-select
let selectionBox=null; // {startX,startY,endX,endY} in world coords for rubber-band
let isSelecting=false, selStartX=0, selStartY=0; // screen coords for rubber-band start

// Active element for handles (MS Word style)
let activeHandleId=null; // id of element showing handles
let draggingHandle=null; // 'rotate'|'nw'|'ne'|'se'|'sw'|'n'|'s'|'e'|'w'
let handleDragStart=null; // {mx,my,ox,oy,ow,oh,cx,cy,angle}

// Clipboard
let clipboard=[];

// Group transform state (multi-select handles)
let groupTransformState=null; // {type:'resize'|'rotate', handleId, initBBox, initObjs}

// Undo/Redo
let undoStack=[], redoStack=[];
const UNDO_LIMIT=50;

// Active event id (null = show all / no event selected)
let activeEventId=1; // start with first event selected

// Per-event data stores
let eventVenueObjects={}; // eventId -> canvasObjects[]
let eventSchedule={}; // eventId -> schedEvents[]
let eventAttendees={}; // eventId -> attendees[]
let eventMapPins={}; // eventId -> mapPins[]
let eventSharePins={}; // eventId -> sharePins[]
let eventLayers={}; // eventId -> layers[]

// Map pins
let mapPins=[
  {id:1,name:'Convention Center',address:'Pasay, Metro Manila',lat:14.5351,lng:121.0170,color:'#5b5bd6',event:'Annual Tech Summit'},
  {id:2,name:'Skyline Venue',address:'BGC, Taguig',lat:14.5547,lng:121.0510,color:'#f59e0b',event:'Birthday Bash'},
  {id:3,name:'City Hall',address:'Ermita, Manila',lat:14.5832,lng:120.9822,color:'#8b5cf6',event:'Community Workshop'},
];
let activeMapPin=null;
let mapType='roadmap';
let pendingActivity=null;

// Custom shape maker
let csTool='poly', csPoints=[], csDrawing=false, csMousePos={x:0,y:0};
let csFillStyle='filled', csRectStart=null, csLineStart=null;
let csCircleStart=null;

// Layers
let layers=[
  {id:1,name:'Floor 1',color:'#5b5bd6',visible:true},
  {id:2,name:'Floor 2',color:'#8b5cf6',visible:true},
];
let activeLayerId=1;

// Schedule — events now store actual dateStr (YYYY-MM-DD) so they are week-specific
let schedEvents=[];

// Events (populated from Supabase on load)
let eventsData=[];

// Attendees
let attendees=[
  {id:1,first:'Maria',last:'Santos',email:'m.santos@email.com',role:'Speaker',status:'Confirmed'},
  {id:2,first:'Jose',last:'Reyes',email:'j.reyes@email.com',role:'Organizer',status:'Confirmed'}
];

const ACCENTS=['#5b5bd6','#f59e0b','#8b5cf6','#ef4444','#38bdf8','#22c55e'];
const DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
// Dynamic schedule hours — user can adjust range 0–24
let schedStartHour=6, schedEndHour=24;
function getSchedHours(){return Array.from({length:schedEndHour-schedStartHour},(_,i)=>i+schedStartHour);}
function fmt12(h){if(h===0||h===24)return'12AM';const ampm=h<12?'AM':'PM';const h12=h%12===0?12:h%12;return`${h12}${ampm}`;}
function fmt12full(h){if(h===0)return'12 AM';if(h===12)return'12 PM';if(h===24)return'12 AM';const ampm=h<12?'AM':'PM';const h12=h%12===0?12:h%12;return`${h12} ${ampm}`;}

// Custom library
let customLibrary=[]; // {id, name, label, icon, color, shape, type, w, h, data, createdAt, favorite}
let libSortMode='date'; // 'date'|'name'|'fav'
const TOOL_SIZES={room:{w:130,h:85,label:'Room'},table:{w:65,h:65,label:'Table'},stage:{w:190,h:65,label:'Stage'},wall:{w:120,h:12,label:'Wall'},entrance:{w:55,h:45,label:'Entry'},restroom:{w:55,h:45,label:'WC'},exit:{w:55,h:45,label:'Exit'}};
const TOOL_ICONS={stage:'🎤',table:'⊞',room:'▭',wall:'━',entrance:'🚪',exit:'🚪',restroom:'🚻'};

// ══════════════════════════════════════════
// THEME
// ══════════════════════════════════════════
// ══════════════════════════════════════════
// PANELS
// ══════════════════════════════════════════
function switchPanel(name,el){
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('panel-'+name).classList.add('active');
  if(el&&el.classList)el.classList.add('active');
  else document.querySelector(`[onclick*="'${name}'"]`)?.classList.add('active');
  if(name==='schedule')renderSchedule();
  if(name==='events'){renderEvents();updateSidebarSearchVisibility();}
  if(name==='venue')setTimeout(()=>{resizeCanvas();render();},50);
  if(name==='attendees')renderAttendees(attendees);
  updateReadOnlyMode();
}

// ══ READ-ONLY MODE (finished events) ══
function isActiveEventFinished(){
  const ev=eventsData.find(e=>e.id===activeEventId);
  return ev&&ev.status==='finished';
}

function updateReadOnlyMode(){
  const finished=isActiveEventFinished();
  // Desktop panels
  ['venue','schedule','map','attendees'].forEach(name=>{
    const panel=document.getElementById('panel-'+name);
    if(!panel)return;
    let banner=panel.querySelector('.readonly-banner');
    if(finished){
      panel.classList.add('event-readonly');
      if(!banner){
        banner=document.createElement('div');
        banner.className='readonly-banner';
        banner.innerHTML=`<span>🔒 This event is <strong>Finished</strong> — view only. <button onclick="markEventFinished(${activeEventId})" style="margin-left:8px;background:var(--primary);color:#fff;border:none;border-radius:6px;padding:2px 10px;font-size:11px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;">↩ Mark as Upcoming</button> to edit.</span>`;
        panel.insertBefore(banner,panel.firstChild);
      } else {
        // update event id in button
        const btn=banner.querySelector('button');
        if(btn) btn.setAttribute('onclick',`markEventFinished(${activeEventId})`);
      }
    } else {
      panel.classList.remove('event-readonly');
      if(banner)banner.remove();
    }
  });
  // Mobile panels
  ['schedule','map','attendees'].forEach(name=>{
    const panel=document.getElementById('m-panel-'+name);
    if(!panel)return;
    let banner=panel.querySelector('.readonly-banner');
    if(finished){
      panel.classList.add('event-readonly');
      if(!banner){
        banner=document.createElement('div');
        banner.className='readonly-banner';
        banner.innerHTML=`<span>🔒 <strong>Finished</strong> — view only. <button onclick="markEventFinished(${activeEventId})" style="margin-left:6px;background:var(--primary);color:#fff;border:none;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;">↩ Upcoming</button></span>`;
        panel.insertBefore(banner,panel.firstChild);
      } else {
        const btn=banner.querySelector('button');
        if(btn) btn.setAttribute('onclick',`markEventFinished(${activeEventId})`);
      }
    } else {
      panel.classList.remove('event-readonly');
      if(banner)banner.remove();
    }
  });
}

// ══ ACTIVE EVENT SELECTION ══
function selectEvent(el){
  document.querySelectorAll('.event-card').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
  const evId=parseInt(el.dataset.evid);
  if(evId)loadEventData(evId);
}

function loadEventData(evId){
  // Save current data to old active event
  if(activeEventId){
    eventVenueObjects[activeEventId]=JSON.parse(JSON.stringify(canvasObjects));
    eventSchedule[activeEventId]=JSON.parse(JSON.stringify(schedEvents));
    eventAttendees[activeEventId]=JSON.parse(JSON.stringify(attendees));
    eventMapPins[activeEventId]=JSON.parse(JSON.stringify(mapPins));
    eventLayers[activeEventId]=JSON.parse(JSON.stringify(layers));
  }
  activeEventId=evId;
  if(eventVenueObjects[evId]){canvasObjects=JSON.parse(JSON.stringify(eventVenueObjects[evId]));}
  else{canvasObjects=evId===1?getDefaultCanvasObjects():[];}
  if(eventSchedule[evId]){schedEvents=JSON.parse(JSON.stringify(eventSchedule[evId]));}
  else{schedEvents=evId===1?getDefaultSchedule():[];}
  if(eventAttendees[evId]){attendees=JSON.parse(JSON.stringify(eventAttendees[evId]));}
  else{attendees=evId===1?getDefaultAttendees():[];}
  if(eventMapPins[evId]){mapPins=JSON.parse(JSON.stringify(eventMapPins[evId]));}
  else{mapPins=evId===1?getDefaultMapPins():[];}
  if(eventLayers[evId]){layers=JSON.parse(JSON.stringify(eventLayers[evId]));}
  else{layers=evId===1?getDefaultLayers():[{id:1,name:'Floor 1',color:'#5b5bd6',visible:true}];}
  activeLayerId=layers[0]?.id||1;
  selectedIds.clear();activeHandleId=null;undoStack=[];redoStack=[];
  updateSidebarCards();
  updateSidebarScrollVisibility();
  renderSchedule();
  renderAttendees(attendees);
  renderLayers();
  render();
  renderMapPins();
  updateOverview();
  updateReadOnlyMode();
  const ev=eventsData.find(e=>e.id===evId);
  if(ev)showToast(`📋 Loaded: ${ev.name}`,'info');
}

function updateOverview(){
  const ev=eventsData.find(e=>e.id===activeEventId);
  // Event name label
  const nameEl=document.getElementById('overviewEvName');
  if(nameEl)nameEl.textContent=ev?ev.name:'';
  // Attendees for this event
  const evAtts=activeEventId?(eventAttendees[activeEventId]||attendees):attendees;
  const attEl=document.getElementById('statAttCount');
  if(attEl)attEl.textContent=evAtts.length;
  // Layers for this event
  const layerEl=document.getElementById('statLayerCount');
  if(layerEl)layerEl.textContent=layers.length;
  // Activities count
  const evSched=activeEventId?(eventSchedule[activeEventId]||schedEvents):schedEvents;
  const actEl=document.getElementById('statActCount');
  if(actEl)actEl.textContent=evSched.length;
  // Conflicts: overlapping schedule items
  let conflicts=0;
  for(let i=0;i<evSched.length;i++)for(let j=i+1;j<evSched.length;j++){
    const a=evSched[i],b=evSched[j];
    if(a.dateStr===b.dateStr&&a.startH<b.endH&&b.startH<a.endH)conflicts++;
  }
  const confEl=document.getElementById('statConflictCount');
  if(confEl){confEl.textContent=conflicts;confEl.style.color=conflicts>0?'var(--danger)':'var(--success)';}
}

function updateSidebarCards(query=''){
  const listEl=document.getElementById('sidebarEvList');
  const colMap={professional:'c-indigo',social:'c-amber',community:'c-violet',personal:'c-teal',family:'c-teal',other:'c-amber'};
  const q=(query||document.getElementById('sidebarSearch')?.value||'').toLowerCase().trim();
  const filtered=q?eventsData.filter(ev=>(ev.name+ev.venue+ev.type).toLowerCase().includes(q)):eventsData;
  if(!filtered.length){
    listEl.innerHTML=`<div style="padding:16px 8px;text-align:center;color:var(--text-lo);font-size:11px;font-style:italic">No events found</div>`;
    return;
  }
  // Active events first, then finished
  const active=filtered.filter(ev=>ev.status!=='finished');
  const finished=filtered.filter(ev=>ev.status==='finished');
  const renderCard=(ev)=>`
    <div class="event-card ${colMap[ev.type]||'c-indigo'}${ev.id===activeEventId?' active':''}${ev.status==='finished'?' finished-sidebar-card':''}" data-evid="${ev.id}" onclick="selectEvent(this)" style="${ev.status==='finished'?'opacity:.6':''}">
      <div class="ev-card-name">${ev.status==='finished'?'✅ ':''}${ev.name}</div>
      <div class="ev-card-meta">${ev.date} · ${ev.venue}</div>
      ${typeTagHTML(ev.type,ev.status)}
    </div>`;
  listEl.innerHTML=[...active,...finished].map(renderCard).join('');
  updateSidebarScrollVisibility();
}

function filterSidebarEvents(q){updateSidebarCards(q);}

function updateSidebarScrollVisibility(){
  const listEl=document.getElementById('sidebarEvList');
  if(!listEl)return;
  // Always allow scrolling — sidebar is fixed height, list fills remaining space
  listEl.style.overflowY='auto';
  listEl.style.maxHeight='none';
}

function getDefaultCanvasObjects(){
  return [
    {id:1,type:'stage',shape:'rounded',x:270,y:36,w:260,h:68,origW:260,origH:68,color:'#8b5cf6',label:'Main Stage',icon:'🎤',layerId:1},
    {id:2,type:'room',shape:'rounded',x:36,y:154,w:140,h:88,origW:140,origH:88,color:'#5b5bd6',label:'Room A',icon:'▭',layerId:1},
    {id:3,type:'room',shape:'rounded',x:192,y:154,w:140,h:88,origW:140,origH:88,color:'#5b5bd6',label:'Room B',icon:'▭',layerId:1},
    {id:4,type:'room',shape:'rounded',x:348,y:154,w:140,h:88,origW:140,origH:88,color:'#5b5bd6',label:'Room C',icon:'▭',layerId:1},
    {id:5,type:'room',shape:'rounded',x:504,y:154,w:140,h:88,origW:140,origH:88,color:'#5b5bd6',label:'Room D',icon:'▭',layerId:1},
    {id:6,type:'table',shape:'rect',x:54,y:292,w:68,h:68,origW:68,origH:68,color:'#f59e0b',label:'T1',icon:'⊞',layerId:1},
    {id:7,type:'table',shape:'rect',x:140,y:292,w:68,h:68,origW:68,origH:68,color:'#f59e0b',label:'T2',icon:'⊞',layerId:1},
    {id:8,type:'table',shape:'rect',x:226,y:292,w:68,h:68,origW:68,origH:68,color:'#f59e0b',label:'T3',icon:'⊞',layerId:1},
    {id:9,type:'table',shape:'rect',x:312,y:292,w:68,h:68,origW:68,origH:68,color:'#f59e0b',label:'T4',icon:'⊞',layerId:1},
    {id:10,type:'table',shape:'rect',x:398,y:292,w:68,h:68,origW:68,origH:68,color:'#f59e0b',label:'T5',icon:'⊞',layerId:1},
    {id:11,type:'table',shape:'rect',x:484,y:292,w:68,h:68,origW:68,origH:68,color:'#f59e0b',label:'T6',icon:'⊞',layerId:1},
    {id:12,type:'entrance',shape:'rounded',x:316,y:398,w:62,h:48,origW:62,origH:48,color:'#22c55e',label:'Entry',icon:'🚪',layerId:1},
    {id:13,type:'exit',shape:'rounded',x:392,y:398,w:62,h:48,origW:62,origH:48,color:'#ef4444',label:'Exit',icon:'🚪',layerId:1},
    {id:14,type:'room',shape:'rounded',x:50,y:60,w:160,h:100,origW:160,origH:100,color:'#8b5cf6',label:'Suite A',icon:'▭',layerId:2},
    {id:15,type:'room',shape:'rounded',x:230,y:60,w:160,h:100,origW:160,origH:100,color:'#8b5cf6',label:'Suite B',icon:'▭',layerId:2},
    {id:16,type:'stage',shape:'rounded',x:420,y:60,w:200,h:80,origW:200,origH:80,color:'#ec4899',label:'Rooftop Stage',icon:'🎤',layerId:2},
  ];
}
function getDefaultSchedule(){
  // Build default schedule anchored to actual current-week dates
  const dates=getWeekDates(0);
  const fmt=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return [
    {id:1,title:'Opening Ceremony',dateStr:fmt(dates[0]),startH:8,endH:9,color:'#5b5bd6',venue:'Main Hall'},
    {id:2,title:'Keynote Speech',dateStr:fmt(dates[0]),startH:9,endH:11,color:'#8b5cf6',venue:'Main Stage'},
    {id:3,title:'Panel Discussion',dateStr:fmt(dates[0]),startH:11,endH:12,color:'#f59e0b',venue:'Room A'},
    {id:4,title:'Lunch Break',dateStr:fmt(dates[0]),startH:12,endH:13,color:'#22c55e',venue:'Cafeteria'},
    {id:5,title:'Workshop A',dateStr:fmt(dates[1]),startH:9,endH:11,color:'#38bdf8',venue:'Room B'},
    {id:6,title:'Workshop B',dateStr:fmt(dates[1]),startH:10,endH:12,color:'#ef4444',venue:'Room C'},
    {id:7,title:'Closing Remarks',dateStr:fmt(dates[2]),startH:16,endH:17,color:'#5b5bd6',venue:'Main Stage'},
  ];
}
function getDefaultAttendees(){return JSON.parse(JSON.stringify([{id:1,first:'Maria',last:'Santos',email:'m.santos@email.com',role:'Speaker',status:'Confirmed'},{id:2,first:'Jose',last:'Reyes',email:'j.reyes@email.com',role:'Organizer',status:'Confirmed'},{id:3,first:'Ana',last:'Cruz',email:'a.cruz@email.com',role:'Guest',status:'Pending'},{id:4,first:'Carlo',last:'Bautista',email:'c.bautista@email.com',role:'Sponsor',status:'Confirmed'},{id:5,first:'Lea',last:'Diaz',email:'l.diaz@email.com',role:'Staff',status:'Confirmed'},{id:6,first:'Miguel',last:'Tan',email:'m.tan@email.com',role:'Friend',status:'Pending'}]));}
function getDefaultLayers(){return JSON.parse(JSON.stringify([{id:1,name:'Floor 1',color:'#5b5bd6',visible:true},{id:2,name:'Floor 2',color:'#8b5cf6',visible:true}]));}
function getDefaultMapPins(){return JSON.parse(JSON.stringify([{id:1,name:'Convention Center',address:'Pasay, Metro Manila',lat:14.5351,lng:121.0170,color:'#5b5bd6',event:'Annual Tech Summit'}]));}

// ══════════════════════════════════════════
// LAYERS
// ══════════════════════════════════════════
function renderLayers(){
  const list=document.getElementById('layersList');
  list.innerHTML='';
  layers.forEach(l=>{
    const d=document.createElement('div');
    d.className='layer-item'+(l.id===activeLayerId?' active-layer':'');
    d.innerHTML=`
      <div class="layer-dot" style="background:${l.color}"></div>
      <input class="layer-name-input" value="${l.name}" title="Double-click to rename"
        onblur="renameLayer(${l.id},this.value)"
        onkeydown="if(event.key==='Enter')this.blur()"
        ondblclick="this.removeAttribute('readonly');this.focus()"
        onclick="setActiveLayer(${l.id})" readonly>
      <button class="layer-vis" onclick="event.stopPropagation();toggleLayerVis(${l.id})" title="Toggle visibility">${l.visible?'👁':'🙈'}</button>
      <button class="layer-del" onclick="event.stopPropagation();deleteLayer(${l.id})" title="Delete">✕</button>
    `;
    d.addEventListener('click',e=>{if(e.target.tagName!=='BUTTON'&&e.target.tagName!=='INPUT')setActiveLayer(l.id);});
    list.appendChild(d);
  });
  document.getElementById('activeLayerLabel').textContent=layers.find(l=>l.id===activeLayerId)?.name||'—';
  document.getElementById('statLayerCount').textContent=layers.length;
}
function setActiveLayer(id){
  activeLayerId=id;
  renderLayers();render();
  showToast('📐 Floor: '+layers.find(l=>l.id===id)?.name,'info');
}
function addLayer(){
  const cols=['#5b5bd6','#f59e0b','#8b5cf6','#ef4444','#14b8a6','#ec4899'];
  const newId=Date.now();
  layers.push({id:newId,name:`Floor ${layers.length+1}`,color:cols[layers.length%cols.length],visible:true});
  activeLayerId=newId;if(activeEventId)eventLayers[activeEventId]=JSON.parse(JSON.stringify(layers));renderLayers();updateOverview();showToast('📐 Layer added','success');
}
function renameLayer(id,name){const l=layers.find(l=>l.id===id);if(l&&name.trim()){l.name=name.trim();renderLayers();updateOverview();if(typeof dbSaveCanvas==='function')dbSaveCanvas(activeEventId,canvasObjects,layers);}}
function toggleLayerVis(id){const l=layers.find(l=>l.id===id);if(l){l.visible=!l.visible;renderLayers();render();if(typeof dbSaveCanvas==='function')dbSaveCanvas(activeEventId,canvasObjects,layers);}}
function deleteLayer(id){
  if(layers.length<=1){showToast('⚠ Need at least one layer','warn');return;}
  if(!confirm('Delete this layer and all its elements?'))return;
  layers=layers.filter(l=>l.id!==id);
  canvasObjects=canvasObjects.filter(o=>o.layerId!==id);
  if(activeLayerId===id)activeLayerId=layers[0].id;
  if(activeEventId)eventLayers[activeEventId]=JSON.parse(JSON.stringify(layers));renderLayers();render();updateOverview();showToast('🗑 Layer deleted','info');
}

// ══════════════════════════════════════════
// CANVAS — ZOOM & PAN
// ══════════════════════════════════════════
function zoomIn(){zoom=Math.min(5,zoom+0.15);clampPan();updateZoomUI();render();}
function zoomOut(){zoom=Math.max(0.2,zoom-0.15);clampPan();updateZoomUI();render();}
function zoomFit(){zoom=1;panX=0;panY=0;updateZoomUI();render();}
function clampPan(){
  if(zoom<=1){panX=0;panY=0;return;}
  const canvas=document.getElementById('venueCanvas');
  const maxPX=canvas.width*(zoom-1)/zoom, maxPY=canvas.height*(zoom-1)/zoom;
  panX=Math.max(-maxPX,Math.min(maxPX,panX));
  panY=Math.max(-maxPY,Math.min(maxPY,panY));
}
function updateZoomUI(){
  const p=Math.round(zoom*100)+'%';
  document.getElementById('zoomLabel').textContent=p;
  document.getElementById('zoomIndicator').textContent=p;
}
function toWorld(sx,sy){return{x:(sx-panX)/zoom,y:(sy-panY)/zoom};}

// ══════════════════════════════════════════
// CANVAS INIT
// ══════════════════════════════════════════
function initCanvas(){
  resizeCanvas();
  canvasObjects=getDefaultCanvasObjects();
  const canvas=document.getElementById('venueCanvas');
  canvas.addEventListener('click',onCanvasClick);
  canvas.addEventListener('mousedown',onMouseDown);
  canvas.addEventListener('mousemove',onMouseMove);
  canvas.addEventListener('mouseup',onMouseUp);
  canvas.addEventListener('contextmenu',onRightClick);
  canvas.addEventListener('wheel',onWheel,{passive:false});
  window.addEventListener('resize',resizeCanvas);
  renderLayers();render();
}

function resizeCanvas(){
  const canvas=document.getElementById('venueCanvas');
  const wrap=canvas.parentElement;
  canvas.width=wrap.clientWidth||800;
  canvas.height=wrap.clientHeight||500;
  render();
}

// ══ UNDO/REDO ══
function saveUndo(){
  undoStack.push(JSON.stringify(canvasObjects));
  if(undoStack.length>UNDO_LIMIT)undoStack.shift();
  redoStack=[];
}
function undo(){
  if(!undoStack.length){showToast('Nothing to undo','warn');return;}
  redoStack.push(JSON.stringify(canvasObjects));
  canvasObjects=JSON.parse(undoStack.pop());
  selectedIds.clear();activeHandleId=null;
  render();showToast('↩ Undo','info');
}
function redo(){
  if(!redoStack.length){showToast('Nothing to redo','warn');return;}
  undoStack.push(JSON.stringify(canvasObjects));
  canvasObjects=JSON.parse(redoStack.pop());
  selectedIds.clear();activeHandleId=null;
  render();showToast('↪ Redo','info');
}

// ══ GRID ══
function toggleGrid(){
  gridEnabled=!gridEnabled;
  const btn=document.getElementById('tool-grid');
  if(btn){btn.classList.toggle('active',gridEnabled);}
  render();showToast(gridEnabled?'⊞ Grid ON':'⊞ Grid OFF','info');
}
function snapVal(v){return snapToGrid&&gridEnabled?Math.round(v/gridSize)*gridSize:v;}

// ══ SELECTION HELPERS ══
function getObjBBox(o){
  if(o.shape==='polygon'||o.shape==='line-shape'){return o.bbox||{x:o.x,y:o.y,w:10,h:10};}
  if(o.shape==='circle'){return{x:o.x-o.w/2,y:o.y-o.h/2,w:o.w,h:o.h};}
  return{x:o.x,y:o.y,w:o.w||10,h:o.h||10};
}
function hitTestObj(o,wx,wy){
  if(o.shape==='circle'){const cx=o.x,cy=o.y,r=Math.min(o.w,o.h)/2;return(wx-cx)**2+(wy-cy)**2<=r**2;}
  if(o.shape==='polygon'||o.shape==='line-shape'){return o.bbox&&wx>=o.bbox.x&&wx<=o.bbox.x+o.bbox.w&&wy>=o.bbox.y&&wy<=o.bbox.y+o.bbox.h;}
  return wx>=o.x&&wx<=o.x+o.w&&wy>=o.y&&wy<=o.y+o.h;
}
function getVisibleLayerObjects(){
  return canvasObjects.filter(o=>{
    if(o.layerId!==activeLayerId)return false;
    const layer=layers.find(l=>l.id===o.layerId);
    return layer&&layer.visible;
  });
}

// ══ HANDLE HIT TEST ══
const HANDLE_R=6; // radius in screen px
function getHandles(o){
  // returns array of {id,x,y} in world coords
  const bb=getObjBBox(o);
  const cx=bb.x+bb.w/2, cy=bb.y+bb.h/2;
  const rot=(o.rotation||0)*Math.PI/180;
  function rotPt(dx,dy){return{x:cx+dx*Math.cos(rot)-dy*Math.sin(rot),y:cy+dx*Math.sin(rot)+dy*Math.cos(rot)};}
  // corner handles
  const h=[];
  h.push({id:'nw',...rotPt(-bb.w/2,-bb.h/2)});
  h.push({id:'ne',...rotPt( bb.w/2,-bb.h/2)});
  h.push({id:'se',...rotPt( bb.w/2, bb.h/2)});
  h.push({id:'sw',...rotPt(-bb.w/2, bb.h/2)});
  // edge handles
  h.push({id:'n',...rotPt(0,-bb.h/2)});
  h.push({id:'s',...rotPt(0, bb.h/2)});
  h.push({id:'e',...rotPt( bb.w/2,0)});
  h.push({id:'w',...rotPt(-bb.w/2,0)});
  // rotate handle (above top-center)
  h.push({id:'rotate',...rotPt(0,-bb.h/2-30)});
  return h;
}
// ── Group handle helpers ──
function getGroupHandles(gx,gy,gw,gh){
  const cx=gx+gw/2, cy=gy+gh/2;
  return [
    {id:'nw',x:gx,     y:gy},      {id:'n',x:cx,y:gy},     {id:'ne',x:gx+gw,y:gy},
    {id:'e', x:gx+gw,  y:cy},      {id:'se',x:gx+gw,y:gy+gh},
    {id:'s', x:cx,     y:gy+gh},   {id:'sw',x:gx,   y:gy+gh},{id:'w',x:gx,y:cy},
    {id:'rotate',x:cx,y:gy-30},
  ];
}
function hitGroupHandle(wx,wy){
  if(selectedIds.size<2||currentTool!=='select')return null;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  selectedIds.forEach(id=>{
    const o=canvasObjects.find(ob=>ob.id===id);if(!o)return;
    const bb=getObjBBox(o);
    minX=Math.min(minX,bb.x);minY=Math.min(minY,bb.y);
    maxX=Math.max(maxX,bb.x+bb.w);maxY=Math.max(maxY,bb.y+bb.h);
  });
  if(minX===Infinity)return null;
  const pad=10,gx=minX-pad,gy=minY-pad,gw=(maxX-minX)+pad*2,gh=(maxY-minY)+pad*2;
  const handles=getGroupHandles(gx,gy,gw,gh);
  const thresh=HANDLE_R*2/zoom;
  for(const h of handles){if(Math.hypot(wx-h.x,wy-h.y)<=thresh)return h.id;}
  return null;
}

function hitHandle(o,wx,wy){
  const handles=getHandles(o);
  const thresh=HANDLE_R*1.5/zoom;
  for(const h of handles){
    if(Math.hypot(wx-h.x,wy-h.y)<=thresh)return h.id;
  }
  return null;
}

// ══ CANVAS EVENTS ══
function onCanvasClick(e){
  if(panMoved||isSelecting||draggingHandle)return;
  if(currentTool==='select')return;
  const rect=e.target.getBoundingClientRect();
  const{x,y}=toWorld(e.clientX-rect.left,e.clientY-rect.top);
  const def=TOOL_SIZES[currentTool]||TOOL_SIZES.room;
  const sx=snapVal(x-def.w/2), sy=snapVal(y-def.h/2);
  saveUndo();
  const newObj={id:Date.now(),type:currentTool,shape:currentTool==='wall'?'wall':'rounded',x:sx,y:sy,w:def.w,h:def.h,origW:def.w,origH:def.h,color:currentColor,label:def.label,icon:TOOL_ICONS[currentTool]||'▭',layerId:activeLayerId};
  canvasObjects.push(newObj);
  activeHandleId=newObj.id;selectedIds=new Set([newObj.id]);
  addToRecent(newObj);
  render();showToast('✅ '+def.label+' placed','success');
}

function onMouseDown(e){
  panMoved=false;isSelecting=false;draggingHandle=null;
  const rect=e.target.getBoundingClientRect();
  const sx=e.clientX-rect.left, sy=e.clientY-rect.top;
  const{x,y}=toWorld(sx,sy);

  // Middle mouse button — always pan
  if(e.button===1){
    e.preventDefault();
    isPanning=true;panStartX=e.clientX;panStartY=e.clientY;panStartPX=panX;panStartPY=panY;
    return;
  }

  // Space held — pan mode
  if(spaceHeld){
    isPanning=true;panStartX=e.clientX;panStartY=e.clientY;panStartPX=panX;panStartPY=panY;
    return;
  }

  if(currentTool==='select'){
    // Pan sub-mode: treat all drags as pan
    if(selectSubMode==='pan'){
      isPanning=true;panStartX=e.clientX;panStartY=e.clientY;panStartPX=panX;panStartPY=panY;
      e.target.style.cursor='grabbing';
      return;
    }
    // 0) Check group handles for multi-selection
    if(selectedIds.size>1){
      const ghit=hitGroupHandle(x,y);
      if(ghit){
        // Capture initial group bbox and each object's initial state
        let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
        selectedIds.forEach(id=>{
          const o=canvasObjects.find(ob=>ob.id===id);if(!o)return;
          const bb=getObjBBox(o);
          minX=Math.min(minX,bb.x);minY=Math.min(minY,bb.y);
          maxX=Math.max(maxX,bb.x+bb.w);maxY=Math.max(maxY,bb.y+bb.h);
        });
        const initObjs={};
        selectedIds.forEach(id=>{
          const o=canvasObjects.find(ob=>ob.id===id);if(!o)return;
          const bb=getObjBBox(o);
          initObjs[id]={x:o.x,y:o.y,w:o.w||bb.w,h:o.h||bb.h,rotation:o.rotation||0};
        });
        groupTransformState={handleId:ghit,mx:x,my:y,
          initBBox:{minX,minY,maxX,maxY},initObjs};
        saveUndo();
        return;
      }
    }
    // 1) Check if clicking on a handle of active object
    if(activeHandleId){
      const o=canvasObjects.find(ob=>ob.id===activeHandleId);
      if(o){
        const hid=hitHandle(o,x,y);
        if(hid){
          draggingHandle=hid;
          const bb=getObjBBox(o);
          handleDragStart={mx:x,my:y,ox:o.x,oy:o.y,ow:o.w||bb.w,oh:o.h||bb.h,cx:bb.x+bb.w/2,cy:bb.y+bb.h/2,angle:o.rotation||0};
          return;
        }
      }
    }
    // 2) Hit-test objects for selection/drag
    const objs=getVisibleLayerObjects();
    for(let i=objs.length-1;i>=0;i--){
      const o=objs[i];
      if(hitTestObj(o,x,y)){
        if(e.shiftKey){
          if(selectedIds.has(o.id))selectedIds.delete(o.id);
          else selectedIds.add(o.id);
          if(selectedIds.size===1)activeHandleId=[...selectedIds][0];
          else activeHandleId=null;
        } else {
          if(!selectedIds.has(o.id)){selectedIds=new Set([o.id]);activeHandleId=o.id;}
          else activeHandleId=o.id;
        }
        dragging={ids:[...selectedIds],starts:{}};
        for(const id of selectedIds){
          const obj=canvasObjects.find(ob=>ob.id===id);
          if(obj){dragging.starts[id]={x:obj.x,y:obj.y};}
        }
        dragging.startWX=x;dragging.startWY=y;
        saveUndo();
        render();return;
      }
    }
    // 3) Clicked empty space — start rubber-band or deselect
    if(!e.shiftKey){selectedIds.clear();activeHandleId=null;}
    isSelecting=true;selStartX=sx;selStartY=sy;
    selectionBox={startX:x,startY:y,endX:x,endY:y};
    render();
    // (do NOT start panning here — rubber-band takes priority)
  } else {
    // Non-select tools: pan on drag
    isPanning=true;
    panStartX=e.clientX;panStartY=e.clientY;
    panStartPX=panX;panStartPY=panY;
    e.target.style.cursor='grabbing';
  }
}

function onMouseMove(e){
  const canvas=document.getElementById('venueCanvas');
  const rect=canvas.getBoundingClientRect();
  const sx=e.clientX-rect.left, sy=e.clientY-rect.top;
  const{x,y}=toWorld(sx,sy);

  // Handle group transform (resize/rotate for multi-select)
  if(groupTransformState){
    e.preventDefault();
    const gs=groupTransformState;
    const{minX,minY,maxX,maxY}=gs.initBBox;
    const gcx=(minX+maxX)/2, gcy=(minY+maxY)/2;
    const gw=maxX-minX, gh=maxY-minY;
    if(gs.handleId==='rotate'){
      const initAngle=Math.atan2(gs.my-gcy,gs.mx-gcx);
      const curAngle=Math.atan2(y-gcy,x-gcx);
      const deltaRad=curAngle-initAngle;
      const deltaDeg=deltaRad*180/Math.PI;
      selectedIds.forEach(id=>{
        const o=canvasObjects.find(ob=>ob.id===id);if(!o)return;
        const io=gs.initObjs[id];
        // Rotate object position around group center
        const dx=io.x-gcx+(io.w||0)/2, dy=io.y-gcy+(io.h||0)/2;
        const r=Math.hypot(dx,dy), ang=Math.atan2(dy,dx)+deltaRad;
        const hw=(io.w||0)/2, hh=(io.h||0)/2;
        o.x=gcx+Math.cos(ang)*r-hw;
        o.y=gcy+Math.sin(ang)*r-hh;
        o.rotation=(io.rotation+deltaDeg+360)%360;
      });
    } else {
      // Resize: compute scale from initial bbox
      const dx=x-gs.mx, dy=y-gs.my;
      let sx=1, sy=1, ox=0, oy=0;
      const hid=gs.handleId;
      if(hid.includes('e')){sx=Math.max(0.05,(gw+dx)/Math.max(1,gw));}
      if(hid.includes('s')){sy=Math.max(0.05,(gh+dy)/Math.max(1,gh));}
      if(hid.includes('w')){const nw=Math.max(10,gw-dx);sx=nw/Math.max(1,gw);ox=gw-nw;}
      if(hid.includes('n')){const nh=Math.max(10,gh-dy);sy=nh/Math.max(1,gh);oy=gh-nh;}
      selectedIds.forEach(id=>{
        const o=canvasObjects.find(ob=>ob.id===id);if(!o)return;
        const io=gs.initObjs[id];
        // Scale position relative to group origin
        const relX=io.x-minX+ox, relY=io.y-minY+oy;
        o.x=snapVal(minX+relX*sx);
        o.y=snapVal(minY+relY*sy);
        if(io.w!=null)o.w=Math.max(10,snapVal(io.w*sx));
        if(io.h!=null)o.h=Math.max(10,snapVal(io.h*sy));
      });
    }
    render();return;
  }

  // Handle drag (resize/rotate)
  if(draggingHandle&&activeHandleId){
    e.preventDefault();
    const o=canvasObjects.find(ob=>ob.id===activeHandleId);
    if(!o){draggingHandle=null;return;}
    const s=handleDragStart;
    if(draggingHandle==='rotate'){
      const angle=Math.atan2(y-s.cy,x-s.cx)*180/Math.PI+90;
      o.rotation=snapToGrid&&gridEnabled?Math.round(angle/15)*15:angle;
      document.getElementById('dialReadout').textContent=Math.round(o.rotation)+'°';
      drawDial(((o.rotation%360)+360)%360);
    } else {
      // Resize handles — axis-aligned resize
      const dx=x-s.mx, dy=y-s.my;
      const hid=draggingHandle;
      let nx=s.ox,ny=s.oy,nw=s.ow,nh=s.oh;
      if(hid.includes('e'))nw=Math.max(20,s.ow+dx);
      if(hid.includes('s'))nh=Math.max(20,s.oh+dy);
      if(hid.includes('w')){nx=s.ox+dx;nw=Math.max(20,s.ow-dx);}
      if(hid.includes('n')){ny=s.oy+dy;nh=Math.max(20,s.oh-dy);}
      o.x=snapVal(nx);o.y=snapVal(ny);o.w=snapVal(nw);o.h=snapVal(nh);
    }
    render();return;
  }

  // Multi-element drag
  if(dragging&&dragging.ids){
    const dx=x-dragging.startWX, dy=y-dragging.startWY;
    for(const id of dragging.ids){
      const obj=canvasObjects.find(ob=>ob.id===id);
      if(!obj)continue;
      const start=dragging.starts[id];
      const nx=snapVal(start.x+dx), ny=snapVal(start.y+dy);
      if(obj.shape==='polygon'||obj.shape==='line-shape'){
        const ddx=nx-obj.x, ddy=ny-obj.y;
        obj.points=obj.points.map(p=>({x:p.x+ddx,y:p.y+ddy}));
        calcBBox(obj);
      }
      obj.x=nx;obj.y=ny;
    }
    if(Math.abs(x-dragging.startWX)>2||Math.abs(y-dragging.startWY)>2)panMoved=true;
    render();return;
  }

  // Rubber-band selection
  if(isSelecting&&selectionBox){
    selectionBox.endX=x;selectionBox.endY=y;
    // Pan too if mouse near edge? skip for simplicity
    // Just update selection box
    const minX=Math.min(selectionBox.startX,selectionBox.endX);
    const maxX=Math.max(selectionBox.startX,selectionBox.endX);
    const minY=Math.min(selectionBox.startY,selectionBox.endY);
    const maxY=Math.max(selectionBox.startY,selectionBox.endY);
    selectedIds=new Set();
    getVisibleLayerObjects().forEach(o=>{
      const bb=getObjBBox(o);
      if(bb.x+bb.w>=minX&&bb.x<=maxX&&bb.y+bb.h>=minY&&bb.y<=maxY)selectedIds.add(o.id);
    });
    if(selectedIds.size===1)activeHandleId=[...selectedIds][0];
    else activeHandleId=null;
    panMoved=true;
    render();return;
  }

  if(isPanning){
    const dx=e.clientX-panStartX, dy=e.clientY-panStartY;
    if(Math.abs(dx)>2||Math.abs(dy)>2)panMoved=true;
    panX=panStartPX+dx;panY=panStartPY+dy;
    render();
  }

  // Cursor style based on hover
  if(currentTool==='select'&&activeHandleId){
    const o=canvasObjects.find(ob=>ob.id===activeHandleId);
    if(o){
      const hid=hitHandle(o,x,y);
      if(hid==='rotate')canvas.style.cursor='grab';
      else if(hid)canvas.style.cursor='nwse-resize';
      else if(hitTestObj(o,x,y))canvas.style.cursor='move';
      else canvas.style.cursor='default';
    }
  }
}

function onMouseUp(e){
  const wasDragging=!!(dragging||draggingHandle||groupTransformState);
  dragging=null;draggingHandle=null;groupTransformState=null;
  if(isSelecting){
    isSelecting=false;selectionBox=null;
    if(selectedIds.size===1)activeHandleId=[...selectedIds][0];
  }
  if(isPanning){isPanning=false;document.getElementById('venueCanvas').style.cursor=currentTool==='select'?'default':'crosshair';}
  handleDragStart=null;
  // Flush canvas save immediately after any canvas mutation
  if(wasDragging&&typeof _flushCanvasSave==='function') _flushCanvasSave();
}

function onRightClick(e){
  e.preventDefault();
  if(currentTool!=='select'){hideCtxMenu();return;}
  const rect=e.target.getBoundingClientRect();
  const{x,y}=toWorld(e.clientX-rect.left,e.clientY-rect.top);
  const objs=getVisibleLayerObjects();
  for(let i=objs.length-1;i>=0;i--){
    const o=objs[i];
    if(hitTestObj(o,x,y)){
      ctxTargetId=o.id;
      // Also select it
      if(!selectedIds.has(o.id)){selectedIds=new Set([o.id]);activeHandleId=o.id;}
      showCtxMenu(e.clientX,e.clientY);
      return;
    }
  }
  hideCtxMenu();
}

let ctxTargetId=null;

function showCtxMenu(px,py){
  const menu=document.getElementById('ctxMenu');
  menu.style.display='block';
  // Reset dial and scale slider
  const o=getCtxObj();
  dialAngle=o?(o.rotation||0):0;
  dialAngle=((dialAngle%360)+360)%360;
  setTimeout(()=>{drawDial(dialAngle);},0);
  document.getElementById('dialReadout').textContent=Math.round(dialAngle)+'°';
  document.getElementById('ctxScaleSlider').value=100;
  document.getElementById('ctxScaleReadout').textContent='100%';
  ctxScaleValue=100;
  // Keep menu inside viewport
  const mw=220,mh=menu.scrollHeight||460;
  const vw=window.innerWidth,vh=window.innerHeight;
  menu.style.left=Math.min(px,vw-mw-8)+'px';
  menu.style.top=Math.min(py,vh-mh-8)+'px';
}
function hideCtxMenu(){
  document.getElementById('ctxMenu').style.display='none';
  ctxTargetId=null;
}

function getCtxObj(){return canvasObjects.find(o=>o.id===ctxTargetId)||null;}

function ctxDelete(){
  saveUndo();
  const idx=canvasObjects.findIndex(o=>o.id===ctxTargetId);
  if(idx>=0){canvasObjects.splice(idx,1);selectedIds.delete(ctxTargetId);if(activeHandleId===ctxTargetId)activeHandleId=null;render();showToast('🗑 Element deleted','info');}
  hideCtxMenu();
}

function ctxDuplicate(){
  const o=getCtxObj();if(!o)return hideCtxMenu();
  saveUndo();
  const clone=JSON.parse(JSON.stringify(o));
  clone.id=Date.now();
  if(clone.points){clone.points=clone.points.map(p=>({x:p.x+20,y:p.y+20}));}
  clone.x=(clone.x||0)+20;clone.y=(clone.y||0)+20;
  canvasObjects.push(clone);
  selectedIds=new Set([clone.id]);activeHandleId=clone.id;
  render();showToast('⧉ Duplicated','success');
  hideCtxMenu();
}

function ctxRename(){
  const o=getCtxObj();if(!o)return hideCtxMenu();
  const name=prompt('Rename element:',o.label||'');
  if(name!==null&&name.trim()){saveUndo();o.label=name.trim();render();showToast('✏️ Renamed','success');}
  hideCtxMenu();
}

function ctxRotate(deg){
  const o=getCtxObj();if(!o)return hideCtxMenu();
  saveUndo();
  o.rotation=(o.rotation||0)+deg;
  render();showToast('↻ Rotated '+deg+'°','info');
  hideCtxMenu();
}

function ctxFlipH(){
  const o=getCtxObj();if(!o)return hideCtxMenu();
  saveUndo();
  o.flipH=!o.flipH;render();showToast('↔ Flipped','info');
  hideCtxMenu();
}

function ctxResizePct(factor){
  const o=getCtxObj();if(!o)return hideCtxMenu();
  saveUndo();
  if(o.points){
    const cx=o.points.reduce((a,p)=>a+p.x,0)/o.points.length;
    const cy=o.points.reduce((a,p)=>a+p.y,0)/o.points.length;
    o.points=o.points.map(p=>({x:cx+(p.x-cx)*factor,y:cy+(p.y-cy)*factor}));
    calcBBox(o);
  } else {
    const cx=o.x+o.w/2, cy=o.y+o.h/2;
    o.w*=factor;o.h*=factor;
    o.x=cx-o.w/2;o.y=cy-o.h/2;
  }
  render();showToast(factor>1?'⊕ Scaled up':'⊖ Scaled down','info');
  hideCtxMenu();
}

function ctxBringToFront(){
  const idx=canvasObjects.findIndex(o=>o.id===ctxTargetId);
  if(idx>=0){const [o]=canvasObjects.splice(idx,1);canvasObjects.push(o);render();showToast('⬆ Brought to front','info');}
  hideCtxMenu();
}

function ctxSendToBack(){
  const idx=canvasObjects.findIndex(o=>o.id===ctxTargetId);
  if(idx>=0){const [o]=canvasObjects.splice(idx,1);canvasObjects.unshift(o);render();showToast('⬇ Sent to back','info');}
  hideCtxMenu();
}

// ══ ROTARY DIAL ══
let dialAngle=0, dialDragging=false, dialLastAngle=0;

function initDial(){
  const canvas=document.getElementById('dialCanvas');
  if(!canvas)return;
  drawDial(0);
  canvas.addEventListener('mousedown',dialMouseDown);
  canvas.addEventListener('touchstart',dialTouchStart,{passive:true});
}

function drawDial(angle){
  const canvas=document.getElementById('dialCanvas');
  if(!canvas)return;
  const ctx=canvas.getContext('2d');
  const W=60,H=60,cx=30,cy=30,r=26;
  ctx.clearRect(0,0,W,H);
  // Track ring
  ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);
  ctx.strokeStyle='rgba(91,91,214,.2)';ctx.lineWidth=4;ctx.stroke();
  // Filled arc
  const startA=-Math.PI/2;
  const endA=startA+(angle*Math.PI/180);
  ctx.beginPath();ctx.arc(cx,cy,r,startA,endA,angle<0);
  ctx.strokeStyle='#5b5bd6';ctx.lineWidth=4;ctx.lineCap='round';ctx.stroke();
  // Knob dot
  const kx=cx+r*Math.cos(endA), ky=cy+r*Math.sin(endA);
  ctx.beginPath();ctx.arc(kx,ky,5,0,Math.PI*2);
  ctx.fillStyle='#7c7ce8';ctx.shadowColor='#5b5bd6';ctx.shadowBlur=8;ctx.fill();
  ctx.shadowBlur=0;
  // Center dot
  ctx.beginPath();ctx.arc(cx,cy,3,0,Math.PI*2);ctx.fillStyle='rgba(91,91,214,.5)';ctx.fill();
}

function dialGetAngleFromEvent(e,canvas){
  const rect=canvas.getBoundingClientRect();
  const cx=rect.left+rect.width/2, cy=rect.top+rect.height/2;
  const dx=(e.touches?e.touches[0].clientX:e.clientX)-cx;
  const dy=(e.touches?e.touches[0].clientY:e.clientY)-cy;
  return Math.atan2(dy,dx)*(180/Math.PI)+90;
}

function dialMouseDown(e){
  e.preventDefault();e.stopPropagation();
  dialDragging=true;
  dialLastAngle=dialGetAngleFromEvent(e,e.currentTarget);
  const mm=ev=>{if(!dialDragging)return;
    let a=dialGetAngleFromEvent(ev,document.getElementById('dialCanvas'));
    let delta=a-dialLastAngle;
    if(delta>180)delta-=360;if(delta<-180)delta+=360;
    dialAngle=(dialAngle+delta+360)%360;
    dialLastAngle=a;
    drawDial(dialAngle);
    document.getElementById('dialReadout').textContent=Math.round(dialAngle)+'°';
  };
  const mu=()=>{dialDragging=false;document.removeEventListener('mousemove',mm);document.removeEventListener('mouseup',mu);};
  document.addEventListener('mousemove',mm);
  document.addEventListener('mouseup',mu);
}

function dialTouchStart(e){
  e.stopPropagation();
  dialLastAngle=dialGetAngleFromEvent(e,e.currentTarget);
  const tm=ev=>{ev.preventDefault();
    let a=dialGetAngleFromEvent(ev,document.getElementById('dialCanvas'));
    let delta=a-dialLastAngle;
    if(delta>180)delta-=360;if(delta<-180)delta+=360;
    dialAngle=(dialAngle+delta+360)%360;
    dialLastAngle=a;
    drawDial(dialAngle);
    document.getElementById('dialReadout').textContent=Math.round(dialAngle)+'°';
  };
  const te=()=>{document.removeEventListener('touchmove',tm);document.removeEventListener('touchend',te);};
  document.addEventListener('touchmove',tm,{passive:false});
  document.addEventListener('touchend',te);
}

function ctxApplyDial(){
  const o=getCtxObj();if(!o){hideCtxMenu();return;}
  saveUndo();
  o.rotation=dialAngle;
  render();showToast(`↻ Rotated to ${Math.round(dialAngle)}°`,'info');
  hideCtxMenu();
}

// ══ SCALE SLIDER ══
let ctxScaleValue=100;
function onScaleSlider(v){
  ctxScaleValue=parseFloat(v);
  document.getElementById('ctxScaleReadout').textContent=Math.round(ctxScaleValue)+'%';
}
function ctxApplyScale(){
  const factor=ctxScaleValue/100;
  const o=getCtxObj();if(!o){hideCtxMenu();return;}
  saveUndo();
  if(o.points){
    const cx=o.points.reduce((a,p)=>a+p.x,0)/o.points.length;
    const cy=o.points.reduce((a,p)=>a+p.y,0)/o.points.length;
    o.points=o.points.map(p=>({x:cx+(p.x-cx)*factor,y:cy+(p.y-cy)*factor}));
    calcBBox(o);
  } else {
    const cx=o.x+o.w/2, cy=o.y+o.h/2;
    o.w*=factor;o.h*=factor;o.x=cx-o.w/2;o.y=cy-o.h/2;
  }
  render();showToast(`⊕ Scaled to ${Math.round(ctxScaleValue)}%`,'info');
  hideCtxMenu();
}

function ctxRevertSize(){
  const o=getCtxObj();if(!o){hideCtxMenu();return;}
  saveUndo();
  if(o.origPoints&&o.origPoints.length>=2){
    o.points=o.origPoints.map(p=>({...p}));
    calcBBox(o);
    o.rotation=0;
    render();showToast('↩ Reverted to original size','success');
  } else if(o.origW&&o.origH){
    const cx=o.x+(o.w||0)/2, cy=o.y+(o.h||0)/2;
    o.w=o.origW;o.h=o.origH;
    o.x=cx-o.w/2;o.y=cy-o.h/2;
    o.rotation=0;
    render();showToast('↩ Reverted to original size','success');
  } else {
    // No originals recorded yet — record current as baseline and inform user
    o.origW=o.w;o.origH=o.h;
    if(o.points)o.origPoints=o.points.map(p=>({...p}));
    showToast('📐 Current size saved as original — resize it and revert again','info');
  }
  hideCtxMenu();
}

// Close context menu on click elsewhere (but not when interacting with dial/slider)
document.addEventListener('click',e=>{
  if(!e.target.closest('#ctxMenu'))hideCtxMenu();
});

// ══════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ══════════════════════════════════════════
let spaceHeld=false;
document.addEventListener('keydown',e=>{
  if(e.key===' '&&!spaceHeld){
    const tag=e.target.tagName;
    if(tag!=='INPUT'&&tag!=='TEXTAREA'&&tag!=='SELECT'){
      spaceHeld=true;
      const canvas=document.getElementById('venueCanvas');
      if(canvas)canvas.style.cursor='grab';
      e.preventDefault();
      return;
    }
  }
  // Skip if typing in an input/textarea
  const tag=e.target.tagName;
  const inInput=tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT'||e.target.isContentEditable;
  const venueActive=document.getElementById('panel-venue')?.classList.contains('active');

  // Escape — close help/modals/deselect
  if(e.key==='Escape'){
    closeHelp();
    document.querySelectorAll('.modal-overlay.open').forEach(m=>m.classList.remove('open'));
    if(venueActive){selectedIds.clear();activeHandleId=null;setTool('select');render();}
    return;
  }

  if(inInput)return;

  // G — toggle grid
  if(e.key==='g'||e.key==='G'){if(venueActive){toggleGrid();return;}}

  // Ctrl/Cmd shortcuts
  if(e.ctrlKey||e.metaKey){
    switch(e.key.toLowerCase()){
      case 'z':
        e.preventDefault();
        if(e.shiftKey)redo();else undo();
        return;
      case 'y':
        e.preventDefault();redo();return;
      case 'c':
        e.preventDefault();
        if(venueActive)copySelected();
        return;
      case 'x':
        e.preventDefault();
        if(venueActive)cutSelected();
        return;
      case 'v':
        e.preventDefault();
        if(venueActive)pasteClipboard();
        return;
      case 'd':
        e.preventDefault();
        if(venueActive)duplicateSelected();
        return;
      case 'a':
        e.preventDefault();
        if(venueActive){selectAll();return;}
        return;
      case 'r':
        e.preventDefault();
        if(venueActive&&selectedIds.size){
          saveUndo();
          selectedIds.forEach(id=>{
            const o=canvasObjects.find(ob=>ob.id===id);
            if(o)o.rotation=((o.rotation||0)+90)%360;
          });
          if(activeHandleId){const o=canvasObjects.find(ob=>ob.id===activeHandleId);if(o)o.rotation=((o.rotation||0));}
          render();showToast('↻ Rotated +90°','info');
        }
        return;
    }
  }

  if(!venueActive)return;

  // Tool shortcuts (no modifier)
  switch(e.key){
    case 'v':case 'V':setTool('select');selectSubMode='elements';{const b=document.getElementById('tool-select');if(b)b.textContent='↖ Select';}return;
    case 'q':case 'Q':if(currentTool==='select'){toggleSelectMode();}else{setTool('select');}return;
    case 'p':case 'P':if(currentTool==='select')toggleSelectMode();return;
    case 'r':case 'R':setTool('room');return;  // unmodified R = Room tool
    case 't':case 'T':setTool('table');return;
    case 's':case 'S':setTool('stage');return;
    case 'w':case 'W':setTool('wall');return;
    case 'Delete':case 'Backspace':
      e.preventDefault();
      deleteSelected();
      return;
  }

  // Arrow keys — nudge selected elements
  if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){
    e.preventDefault();
    if(!selectedIds.size)return;
    const step=e.shiftKey?(gridSize*4):(e.altKey?1:gridSize);
    const dx=e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0;
    const dy=e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0;
    saveUndo();
    selectedIds.forEach(id=>{
      const o=canvasObjects.find(ob=>ob.id===id);
      if(!o)return;
      if(o.shape==='polygon'||o.shape==='line-shape'){
        o.points=o.points.map(p=>({x:p.x+dx,y:p.y+dy}));calcBBox(o);
      }
      o.x=(o.x||0)+dx;o.y=(o.y||0)+dy;
    });
    render();
  }
});

// ── Clipboard operations ──
function copySelected(){
  if(!selectedIds.size){showToast('Nothing selected to copy','warn');return;}
  clipboard=canvasObjects.filter(o=>selectedIds.has(o.id)).map(o=>JSON.parse(JSON.stringify(o)));
  showToast(`📋 Copied ${clipboard.length} element${clipboard.length>1?'s':''}`, 'info');
}

function cutSelected(){
  if(!selectedIds.size){showToast('Nothing selected to cut','warn');return;}
  copySelected();
  deleteSelected();
  showToast(`✂️ Cut ${clipboard.length} element${clipboard.length>1?'s':''}`, 'info');
}

function pasteClipboard(){
  if(!clipboard.length){showToast('Clipboard is empty','warn');return;}
  saveUndo();
  const offset=20;
  const newIds=new Set();
  clipboard.forEach(orig=>{
    const clone=JSON.parse(JSON.stringify(orig));
    clone.id=Date.now()+Math.random();
    clone.x=(clone.x||0)+offset;clone.y=(clone.y||0)+offset;
    if(clone.points)clone.points=clone.points.map(p=>({x:p.x+offset,y:p.y+offset}));
    clone.layerId=activeLayerId;
    canvasObjects.push(clone);
    newIds.add(clone.id);
  });
  selectedIds=newIds;
  activeHandleId=newIds.size===1?[...newIds][0]:null;
  render();showToast(`📌 Pasted ${clipboard.length} element${clipboard.length>1?'s':''}`, 'success');
}

function duplicateSelected(){
  if(!selectedIds.size){showToast('Nothing selected','warn');return;}
  saveUndo();
  const newIds=new Set();
  canvasObjects.filter(o=>selectedIds.has(o.id)).forEach(orig=>{
    const clone=JSON.parse(JSON.stringify(orig));
    clone.id=Date.now()+Math.random();
    clone.x=(clone.x||0)+20;clone.y=(clone.y||0)+20;
    if(clone.points)clone.points=clone.points.map(p=>({x:p.x+20,y:p.y+20}));
    canvasObjects.push(clone);
    newIds.add(clone.id);
  });
  selectedIds=newIds;
  activeHandleId=newIds.size===1?[...newIds][0]:null;
  render();showToast(`⧉ Duplicated ${newIds.size} element${newIds.size>1?'s':''}`, 'success');
}

function deleteSelected(){
  if(!selectedIds.size){showToast('Nothing selected','warn');return;}
  saveUndo();
  const count=selectedIds.size;
  canvasObjects=canvasObjects.filter(o=>!selectedIds.has(o.id));
  selectedIds.clear();activeHandleId=null;
  render();showToast(`🗑 Deleted ${count} element${count>1?'s':''}`, 'info');
}

function selectAll(){
  const objs=getVisibleLayerObjects();
  selectedIds=new Set(objs.map(o=>o.id));
  activeHandleId=null;
  render();showToast(`✔ Selected all ${selectedIds.size} elements`, 'info');
}

document.addEventListener('keyup',e=>{
  if(e.key===' '){
    spaceHeld=false;
    isPanning=false;
    const canvas=document.getElementById('venueCanvas');
    if(canvas)canvas.style.cursor=currentTool==='select'?'default':'crosshair';
  }
});

function onWheel(e){
  e.preventDefault();
  const canvas=document.getElementById('venueCanvas');
  const rect=canvas.getBoundingClientRect();
  const mx=e.clientX-rect.left, my=e.clientY-rect.top;
  const factor=e.deltaY<0?1.12:0.9;
  const newZoom=Math.max(0.2,Math.min(5,zoom*factor));
  panX=mx-(mx-panX)*(newZoom/zoom);
  panY=my-(my-panY)*(newZoom/zoom);
  zoom=newZoom;clampPan();updateZoomUI();render();
}

// ══ RENDER ══
function render(){
  const canvas=document.getElementById('venueCanvas');
  const ctx=canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // ── Grid ──
  if(gridEnabled){
    const gs=gridSize*zoom;
    const offX=((panX%gs)+gs)%gs;
    const offY=((panY%gs)+gs)%gs;
    ctx.save();
    ctx.strokeStyle='rgba(91,91,214,0.18)';
    ctx.lineWidth=1;
    for(let x=offX;x<canvas.width;x+=gs){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,canvas.height);ctx.stroke();}
    for(let y=offY;y<canvas.height;y+=gs){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);ctx.stroke();}
    // Dot crossings
    ctx.fillStyle='rgba(91,91,214,0.35)';
    for(let x=offX;x<canvas.width;x+=gs)for(let y=offY;y<canvas.height;y+=gs){ctx.beginPath();ctx.arc(x,y,1.5,0,Math.PI*2);ctx.fill();}
    ctx.restore();
  }

  ctx.save();
  ctx.translate(panX,panY);
  ctx.scale(zoom,zoom);
  if(canvasBgImage){ctx.globalAlpha=.18;ctx.drawImage(canvasBgImage,0,0,canvas.width/zoom,canvas.height/zoom);ctx.globalAlpha=1;}

  layers.forEach(layer=>{
    if(!layer.visible)return;
    const isActive=layer.id===activeLayerId;
    canvasObjects.filter(o=>o.layerId===layer.id).forEach(o=>{
      ctx.save();
      ctx.globalAlpha=isActive?1:.28;
      drawObject(ctx,o);
      // Selection highlight for multi-selected (non-active-handle)
      if(isActive&&selectedIds.has(o.id)&&o.id!==activeHandleId){
        const bb=getObjBBox(o);
        ctx.strokeStyle='rgba(91,91,214,0.9)';
        ctx.lineWidth=2/zoom;
        ctx.setLineDash([6/zoom,4/zoom]);
        ctx.strokeRect(bb.x-4/zoom,bb.y-4/zoom,bb.w+8/zoom,bb.h+8/zoom);
        ctx.setLineDash([]);
      }
      ctx.restore();
    });
  });

  // ── MS Word-style handles for activeHandleId (single selection) ──
  if(activeHandleId&&currentTool==='select'&&selectedIds.size===1){
    const o=canvasObjects.find(ob=>ob.id===activeHandleId);
    if(o){
      const bb=getObjBBox(o);
      const rot=(o.rotation||0)*Math.PI/180;
      const cx=bb.x+bb.w/2, cy=bb.y+bb.h/2;
      ctx.save();
      ctx.translate(cx,cy);
      ctx.rotate(rot);
      // Selection border
      ctx.strokeStyle='rgba(91,91,214,1)';
      ctx.lineWidth=1.5/zoom;
      ctx.setLineDash([]);
      ctx.strokeRect(-bb.w/2-3/zoom,-bb.h/2-3/zoom,bb.w+6/zoom,bb.h+6/zoom);
      // Resize handles (white squares with blue border)
      const hr=HANDLE_R/zoom;
      const handlePositions=[
        [-bb.w/2,-bb.h/2,'nw'],[0,-bb.h/2,'n'],[bb.w/2,-bb.h/2,'ne'],
        [bb.w/2,0,'e'],[bb.w/2,bb.h/2,'se'],[0,bb.h/2,'s'],
        [-bb.w/2,bb.h/2,'sw'],[-bb.w/2,0,'w']
      ];
      handlePositions.forEach(([dx,dy])=>{
        ctx.fillStyle='#fff';
        ctx.strokeStyle='#5b5bd6';
        ctx.lineWidth=1.5/zoom;
        ctx.shadowColor='rgba(91,91,214,0.4)';ctx.shadowBlur=4;
        ctx.fillRect(dx-hr,dy-hr,hr*2,hr*2);
        ctx.strokeRect(dx-hr,dy-hr,hr*2,hr*2);
        ctx.shadowBlur=0;
      });
      // Rotate handle (circle above top-center)
      const rotHandleY=-bb.h/2-30/zoom;
      ctx.strokeStyle='rgba(91,91,214,0.5)';ctx.lineWidth=1/zoom;
      ctx.beginPath();ctx.moveTo(0,-bb.h/2);ctx.lineTo(0,rotHandleY);ctx.stroke();
      ctx.fillStyle='#5b5bd6';
      ctx.strokeStyle='#fff';ctx.lineWidth=1.5/zoom;
      ctx.shadowColor='rgba(91,91,214,0.6)';ctx.shadowBlur=8;
      ctx.beginPath();ctx.arc(0,rotHandleY,HANDLE_R*1.2/zoom,0,Math.PI*2);
      ctx.fill();ctx.stroke();ctx.shadowBlur=0;
      ctx.fillStyle='#fff';
      ctx.font=`bold ${Math.max(6,10/zoom)}px sans-serif`;
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText('↻',0,rotHandleY);
      ctx.restore();
    }
  }

  // ── Group bounding box for multi-selection (MS Word-style handles) ──
  if(selectedIds.size>1&&currentTool==='select'){
    let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
    selectedIds.forEach(id=>{
      const o=canvasObjects.find(ob=>ob.id===id);
      if(!o)return;
      const bb=getObjBBox(o);
      minX=Math.min(minX,bb.x);minY=Math.min(minY,bb.y);
      maxX=Math.max(maxX,bb.x+bb.w);maxY=Math.max(maxY,bb.y+bb.h);
    });
    if(minX<Infinity){
      const pad=10/zoom;
      const gx=minX-pad,gy=minY-pad,gw=(maxX-minX)+pad*2,gh=(maxY-minY)+pad*2;
      // Border
      ctx.strokeStyle='rgba(91,91,214,0.9)';ctx.lineWidth=1.5/zoom;ctx.setLineDash([]);
      ctx.strokeRect(gx,gy,gw,gh);
      // Resize handles at 8 positions (like single-select)
      const hr=HANDLE_R/zoom;
      const grpHandles=getGroupHandles(gx,gy,gw,gh);
      grpHandles.filter(h=>h.id!=='rotate').forEach(h=>{
        ctx.fillStyle='#fff';ctx.strokeStyle='#5b5bd6';ctx.lineWidth=1.5/zoom;
        ctx.shadowColor='rgba(91,91,214,0.4)';ctx.shadowBlur=4;
        ctx.fillRect(h.x-hr,h.y-hr,hr*2,hr*2);
        ctx.strokeRect(h.x-hr,h.y-hr,hr*2,hr*2);
        ctx.shadowBlur=0;
      });
      // Rotate handle
      const rotH=grpHandles.find(h=>h.id==='rotate');
      if(rotH){
        ctx.strokeStyle='rgba(91,91,214,0.5)';ctx.lineWidth=1/zoom;
        ctx.beginPath();ctx.moveTo(gx+gw/2,gy);ctx.lineTo(rotH.x,rotH.y);ctx.stroke();
        ctx.fillStyle='#5b5bd6';ctx.strokeStyle='#fff';ctx.lineWidth=1.5/zoom;
        ctx.shadowColor='rgba(91,91,214,0.6)';ctx.shadowBlur=8;
        ctx.beginPath();ctx.arc(rotH.x,rotH.y,HANDLE_R*1.2/zoom,0,Math.PI*2);
        ctx.fill();ctx.stroke();ctx.shadowBlur=0;
        ctx.fillStyle='#fff';
        ctx.font=`bold ${Math.max(6,10/zoom)}px sans-serif`;
        ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillText('↻',rotH.x,rotH.y);
      }
      // Label
      ctx.fillStyle='rgba(91,91,214,0.9)';
      ctx.font=`bold ${Math.max(8,10/zoom)}px 'Syne',sans-serif`;
      ctx.textAlign='left';ctx.textBaseline='bottom';
      ctx.fillText(`${selectedIds.size} selected`,gx,gy-2/zoom);
    }
  }

  // ── Rubber-band selection box ──
  if(isSelecting&&selectionBox){
    const{startX,startY,endX,endY}=selectionBox;
    const sx=Math.min(startX,endX),sy=Math.min(startY,endY);
    const sw=Math.abs(endX-startX),sh=Math.abs(endY-startY);
    ctx.fillStyle='rgba(91,91,214,0.07)';
    ctx.fillRect(sx,sy,sw,sh);
    ctx.strokeStyle='rgba(91,91,214,0.7)';
    ctx.lineWidth=1/zoom;
    ctx.setLineDash([5/zoom,3/zoom]);
    ctx.strokeRect(sx,sy,sw,sh);
    ctx.setLineDash([]);
  }

  ctx.restore();
}

function drawObject(ctx,o){
  const shape=o.shape||'rounded';
  // Apply rotation/flip transforms
  const hasTransform=(o.rotation||o.flipH);
  if(hasTransform){
    const cx=(shape==='circle'?o.x:o.x+(o.w||0)/2);
    const cy=(shape==='circle'?o.y:o.y+(o.h||0)/2);
    ctx.save();
    ctx.translate(cx,cy);
    if(o.rotation)ctx.rotate(o.rotation*Math.PI/180);
    if(o.flipH)ctx.scale(-1,1);
    ctx.translate(-cx,-cy);
  }
  if(shape==='polygon'){drawPolygonObj(ctx,o);if(hasTransform)ctx.restore();return;}
  if(shape==='line-shape'){drawLineObj(ctx,o);if(hasTransform)ctx.restore();return;}
  if(shape==='ellipse-shape'){drawEllipseObj(ctx,o);if(hasTransform)ctx.restore();return;}
  const lw=1.5/zoom;
  const r=shape==='circle'?Math.min(o.w,o.h)/2:shape==='wall'?2:8;
  ctx.shadowColor=o.color+'55';ctx.shadowBlur=10;
  // fill
  if(shape==='wall'){
    ctx.fillStyle=o.color+'cc';
    ctx.fillRect(o.x,o.y,o.w,o.h);
    ctx.shadowBlur=0;
    ctx.strokeStyle=o.color;ctx.lineWidth=lw;
    ctx.strokeRect(o.x,o.y,o.w,o.h);
  } else {
    ctx.fillStyle=o.color+'22';
    drawShapePath(ctx,o,shape,r);ctx.fill();
    ctx.shadowBlur=0;
    ctx.strokeStyle=o.color+'cc';ctx.lineWidth=lw;
    drawShapePath(ctx,o,shape,r);ctx.stroke();
    // icon + label
    const cx=shape==='circle'?o.x:o.x+o.w/2;
    const cy=shape==='circle'?o.y:o.y+o.h/2;
    const fs=Math.max(8,Math.min(13,Math.min(o.w,o.h)*0.19));
    ctx.shadowBlur=0;
    ctx.font=`${fs+2}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillStyle='rgba(255,255,255,.88)';
    ctx.fillText(o.icon||'',cx,cy-fs*.7);
    ctx.font=`700 ${Math.max(8,fs*.85)}px 'Syne',sans-serif`;
    ctx.fillStyle=o.color;
    ctx.fillText(o.label,cx,cy+fs*.55);
  }
  // image overlay
  if(o.imgData){
    const img=new Image();img.src=o.imgData;
    if(img.complete){
      ctx.save();drawShapePath(ctx,o,shape,r);ctx.clip();
      ctx.globalAlpha=.35;ctx.drawImage(img,o.x,o.y,o.w,o.h);
      ctx.globalAlpha=1;ctx.restore();
    }
  }
  if(hasTransform)ctx.restore();
}

function drawPolygonObj(ctx,o){
  if(!o.points||o.points.length<2)return;
  const lw=1.8/zoom;
  ctx.beginPath();
  ctx.moveTo(o.points[0].x,o.points[0].y);
  for(let i=1;i<o.points.length;i++)ctx.lineTo(o.points[i].x,o.points[i].y);
  if(o.closed)ctx.closePath();
  ctx.shadowColor=o.color+'55';ctx.shadowBlur=8;
  if(o.closed&&o.fillStyle!=='outline'&&o.fillStyle!=='dashed'){ctx.fillStyle=o.color+'25';ctx.fill();}
  ctx.shadowBlur=0;
  ctx.strokeStyle=o.color;ctx.lineWidth=lw;
  if(o.fillStyle==='dashed')ctx.setLineDash([6/zoom,4/zoom]);
  else ctx.setLineDash([]);
  ctx.stroke();ctx.setLineDash([]);
  // label at centroid
  if(o.label){
    const cx=o.points.reduce((a,p)=>a+p.x,0)/o.points.length;
    const cy=o.points.reduce((a,p)=>a+p.y,0)/o.points.length;
    ctx.font=`700 ${Math.max(9,11/zoom)}px 'Syne',sans-serif`;
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillStyle=o.color;ctx.fillText(o.label,cx,cy);
  }
}

function drawLineObj(ctx,o){
  if(!o.points||o.points.length<2)return;
  const lw=3/zoom;
  ctx.beginPath();
  ctx.moveTo(o.points[0].x,o.points[0].y);
  ctx.lineTo(o.points[1].x,o.points[1].y);
  ctx.strokeStyle=o.color;ctx.lineWidth=lw;ctx.lineCap='round';
  if(o.fillStyle==='dashed')ctx.setLineDash([8/zoom,5/zoom]);
  ctx.stroke();ctx.setLineDash([]);
}

function drawEllipseObj(ctx,o){
  ctx.beginPath();
  ctx.ellipse(o.x+o.w/2,o.y+o.h/2,o.w/2,o.h/2,0,0,Math.PI*2);
  ctx.shadowColor=o.color+'55';ctx.shadowBlur=8;
  if(o.fillStyle!=='outline'&&o.fillStyle!=='dashed'){ctx.fillStyle=o.color+'22';ctx.fill();}
  ctx.shadowBlur=0;
  ctx.strokeStyle=o.color;ctx.lineWidth=1.5/zoom;
  if(o.fillStyle==='dashed')ctx.setLineDash([6/zoom,4/zoom]);
  ctx.stroke();ctx.setLineDash([]);
  if(o.label){
    ctx.font=`700 ${Math.max(9,11/zoom)}px 'Syne',sans-serif`;
    ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillStyle=o.color;ctx.fillText(o.label,o.x+o.w/2,o.y+o.h/2);
  }
}

function drawShapePath(ctx,o,shape,r){
  const{x,y,w,h}=o;
  ctx.beginPath();
  if(shape==='circle'){ctx.arc(x,y,r,0,Math.PI*2);}
  else if(shape==='diamond'){ctx.moveTo(x+w/2,y);ctx.lineTo(x+w,y+h/2);ctx.lineTo(x+w/2,y+h);ctx.lineTo(x,y+h/2);ctx.closePath();}
  else if(shape==='rect'){ctx.rect(x,y,w,h);}
  else{ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();}
}

function calcBBox(o){
  if(!o.points)return;
  const xs=o.points.map(p=>p.x), ys=o.points.map(p=>p.y);
  o.bbox={x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs)||10,h:Math.max(...ys)-Math.min(...ys)||10};
  o.x=o.bbox.x;o.y=o.bbox.y;
}

function clearCanvas(){if(!confirm('Clear elements on active layer?'))return;saveUndo();canvasObjects=canvasObjects.filter(o=>o.layerId!==activeLayerId);selectedIds.clear();activeHandleId=null;render();showToast('🗑 Layer cleared','info');}
function exportLayout(){
  const canvas=document.getElementById('venueCanvas');
  const link=document.createElement('a');link.download='emgo-layout.png';link.href=canvas.toDataURL();link.click();
  showToast('⬇ Exported as PNG','success');
}

// ── Select sub-mode: 'elements' = drag to select/move elements, 'pan' = drag to pan ──
let selectSubMode='elements'; // 'elements' | 'pan'

function handleSelectBtnClick(){
  if(currentTool!=='select'){setTool('select');}
  else{toggleSelectMode();}
}

function toggleSelectMode(){
  selectSubMode=selectSubMode==='elements'?'pan':'elements';
  const btn=document.getElementById('tool-select');
  const canvas=document.getElementById('venueCanvas');
  if(selectSubMode==='pan'){
    if(btn){btn.textContent='✋ Pan';btn.title='Click to switch to Select mode (P)';btn.classList.add('pan-mode');}
    if(canvas)canvas.style.cursor='grab';
    showToast('✋ Pan mode — drag canvas freely (P to toggle back)','info');
  } else {
    if(btn){btn.textContent='↖ Select';btn.title='Click sets Select tool · P to toggle pan mode';btn.classList.remove('pan-mode');}
    if(canvas)canvas.style.cursor='default';
    showToast('↖ Select mode — click/drag to select elements','info');
  }
}
function setTool(t){
  currentTool=t;
  // Reset select sub-mode when switching to non-select tool
  if(t!=='select'){selectSubMode='elements';}
  document.querySelectorAll('.tool-btn').forEach(b=>{b.classList.remove('active');b.classList.remove('pan-mode');});
  if(document.getElementById('tool-'+t))document.getElementById('tool-'+t).classList.add('active');
  document.querySelectorAll('.pal-item').forEach(p=>p.classList.remove('active-tool'));
  if(document.getElementById('pi-'+t))document.getElementById('pi-'+t).classList.add('active-tool');
  const canvas=document.getElementById('venueCanvas');
  canvas.style.cursor=t==='select'?(selectSubMode==='pan'?'grab':'default'):'crosshair';
  const selBtn=document.getElementById('tool-select');
  if(selBtn&&t==='select'){selBtn.textContent=selectSubMode==='pan'?'✋ Pan':'↖ Select';}
  else if(selBtn){selBtn.textContent='↖ Select';}
  const hints={select:selectSubMode==='pan'?'Pan mode — drag to pan · P to toggle select mode':'Select: click/drag to select · Drag empty area to rubber-band select · P to toggle pan',room:'Room: click canvas to place',table:'Table: click canvas to place',stage:'Stage: click canvas to place',wall:'Wall: click canvas to place a wall segment',entrance:'Entry: click to place',exit:'Exit: click to place',restroom:'Restroom: click to place'};
  document.getElementById('canvasHint').textContent=hints[t]||'Click to place element';
}

function setColor(el){document.querySelectorAll('#colorPicker .csw').forEach(s=>s.classList.remove('sel'));el.classList.add('sel');currentColor=el.dataset.color;document.getElementById('customColorInput').value=currentColor;}
function setCustomColor(v){currentColor=v;document.querySelectorAll('#colorPicker .csw').forEach(s=>s.classList.remove('sel'));}

// ══ RECENTLY USED ══
function addToRecent(obj){
  // Remove if already in list
  recentlyUsed=recentlyUsed.filter(r=>!(r.type===obj.type&&r.color===obj.color&&r.label===obj.label));
  recentlyUsed.unshift({type:obj.type,color:obj.color,label:obj.label,icon:obj.icon,shape:obj.shape,w:obj.w,h:obj.h});
  if(recentlyUsed.length>8)recentlyUsed=recentlyUsed.slice(0,8);
  renderRecents();
}

function renderRecents(){
  const list=document.getElementById('recentsList');
  if(!recentlyUsed.length){list.innerHTML='<div class="recents-empty">Nothing placed yet</div>';return;}
  list.innerHTML=recentlyUsed.map((r,i)=>`
    <div class="recent-item" onclick="placeRecentItem(${i})" title="Click to place ${r.label}">
      <div class="recent-dot" style="background:${r.color}"></div>
      <span class="recent-icon" style="font-size:11px">${r.icon||'▭'}</span>
      <span class="recent-label">${r.label}</span>
      <span class="recent-type">${r.type}</span>
    </div>
  `).join('');
}

function placeRecentItem(idx){
  const r=recentlyUsed[idx];
  if(!r)return;
  const canvas=document.getElementById('venueCanvas');
  const cx=canvas.width/zoom/2-panX/zoom;
  const cy=canvas.height/zoom/2-panY/zoom;
  const newObj={id:Date.now(),type:r.type,shape:r.shape||'rounded',x:cx-r.w/2,y:cy-r.h/2,w:r.w,h:r.h,color:r.color,label:r.label,icon:r.icon,layerId:activeLayerId};
  canvasObjects.push(newObj);
  render();showToast('✅ '+r.label+' placed from recent','success');
}
function setCanvasBg(e){
  const f=e.target.files[0];if(!f)return;
  const r=new FileReader();r.onload=ev=>{const img=new Image();img.onload=()=>{canvasBgImage=img;render();showToast('🖼 Background applied','success');};img.src=ev.target.result;document.getElementById('bgLayer').style.backgroundImage=`url(${ev.target.result})`;document.getElementById('bgLayer').style.opacity='.07';};r.readAsDataURL(f);
}
function clearCanvasBg(){canvasBgImage=null;document.getElementById('bgLayer').style.opacity='0';document.getElementById('bgUpload').value='';render();showToast('✕ Background cleared','info');}

// ══════════════════════════════════════════
// CUSTOM SHAPE MAKER
// ══════════════════════════════════════════
let csCanvas, csCtx;
function initCSCanvas(){
  csCanvas=document.getElementById('customShapeCanvas');
  csCtx=csCanvas.getContext('2d');
  // scale to display size
  const dpr=window.devicePixelRatio||1;
  const rect=csCanvas.getBoundingClientRect();
  csCanvas.width=rect.width*dpr||520;
  csCanvas.height=280*dpr||280;
  csCtx.scale(dpr,dpr);
  csCanvas.style.height='280px';
  csCanvas.removeEventListener('click',csOnClick);
  csCanvas.removeEventListener('dblclick',csOnDblClick);
  csCanvas.removeEventListener('mousemove',csOnMouseMove);
  csCanvas.addEventListener('click',csOnClick);
  csCanvas.addEventListener('dblclick',csOnDblClick);
  csCanvas.addEventListener('mousemove',csOnMouseMove);
  csPoints=[];csDrawing=false;csRectStart=null;csLineStart=null;csCircleStart=null;
  renderCS();
}

function renderCS(){
  if(!csCtx)return;
  const W=parseFloat(csCanvas.style.width)||520;
  const H=parseFloat(csCanvas.style.height)||280;
  csCtx.clearRect(0,0,W,H);
  const isDark=document.documentElement.getAttribute('data-theme')==='dark';
  // grid
  csCtx.strokeStyle=isDark?'rgba(91,91,214,.1)':'rgba(79,70,229,.07)';
  csCtx.lineWidth=.5;
  for(let x=0;x<W;x+=20){csCtx.beginPath();csCtx.moveTo(x,0);csCtx.lineTo(x,H);csCtx.stroke();}
  for(let y=0;y<H;y+=20){csCtx.beginPath();csCtx.moveTo(0,y);csCtx.lineTo(W,y);csCtx.stroke();}
  const col=document.getElementById('cs-color').value||'#9896c8';
  const fs=csFillStyle;
  // draw completed polygon
  if(csPoints.length>0){
    csCtx.beginPath();
    csCtx.moveTo(csPoints[0].x,csPoints[0].y);
    for(let i=1;i<csPoints.length;i++)csCtx.lineTo(csPoints[i].x,csPoints[i].y);
    // live preview line to mouse
    if(csDrawing&&csMousePos&&csTool==='poly'){csCtx.lineTo(csMousePos.x,csMousePos.y);}
    csCtx.strokeStyle=col;csCtx.lineWidth=2;
    if(fs==='dashed')csCtx.setLineDash([7,4]);else csCtx.setLineDash([]);
    csCtx.stroke();csCtx.setLineDash([]);
    if(fs==='filled'&&csPoints.length>2){
      const tmp=csCtx.strokeStyle;
      csCtx.beginPath();csCtx.moveTo(csPoints[0].x,csPoints[0].y);
      csPoints.forEach(p=>csCtx.lineTo(p.x,p.y));csCtx.closePath();
      csCtx.fillStyle=col+'28';csCtx.fill();
    }
    // dots at points
    csPoints.forEach((p,i)=>{
      csCtx.beginPath();csCtx.arc(p.x,p.y,i===0?5:3,0,Math.PI*2);
      csCtx.fillStyle=i===0?col:col+'aa';csCtx.fill();
    });
  }
  // rect preview
  if(csRectStart&&csMousePos&&csTool==='rect'){
    const rx=Math.min(csRectStart.x,csMousePos.x), ry=Math.min(csRectStart.y,csMousePos.y);
    const rw=Math.abs(csMousePos.x-csRectStart.x), rh=Math.abs(csMousePos.y-csRectStart.y);
    csCtx.strokeStyle=col;csCtx.lineWidth=2;
    if(fs==='dashed')csCtx.setLineDash([7,4]);else csCtx.setLineDash([]);
    csCtx.strokeRect(rx,ry,rw,rh);csCtx.setLineDash([]);
    if(fs==='filled'){csCtx.fillStyle=col+'28';csCtx.fillRect(rx,ry,rw,rh);}
  }
  // line preview
  if(csLineStart&&csMousePos&&csTool==='line'){
    csCtx.beginPath();csCtx.moveTo(csLineStart.x,csLineStart.y);csCtx.lineTo(csMousePos.x,csMousePos.y);
    csCtx.strokeStyle=col;csCtx.lineWidth=3;csCtx.lineCap='round';
    if(fs==='dashed')csCtx.setLineDash([8,5]);else csCtx.setLineDash([]);
    csCtx.stroke();csCtx.setLineDash([]);
  }
  // circle preview
  if(csCircleStart&&csMousePos&&csTool==='circle'){
    const cx=(csCircleStart.x+csMousePos.x)/2, cy=(csCircleStart.y+csMousePos.y)/2;
    const rx=Math.abs(csMousePos.x-csCircleStart.x)/2, ry=Math.abs(csMousePos.y-csCircleStart.y)/2;
    csCtx.beginPath();csCtx.ellipse(cx,cy,rx||5,ry||5,0,0,Math.PI*2);
    csCtx.strokeStyle=col;csCtx.lineWidth=2;
    if(fs==='dashed')csCtx.setLineDash([6,4]);else csCtx.setLineDash([]);
    csCtx.stroke();csCtx.setLineDash([]);
    if(fs==='filled'){csCtx.fillStyle=col+'28';csCtx.fill();}
  }
}

function getCSPos(e){
  const rect=csCanvas.getBoundingClientRect();
  return{x:e.clientX-rect.left,y:e.clientY-rect.top};
}

function csOnMouseMove(e){csMousePos=getCSPos(e);renderCS();}

function csOnClick(e){
  const pos=getCSPos(e);
  if(csTool==='poly'){
    // check if clicking near first point to close
    if(csPoints.length>2){
      const dx=pos.x-csPoints[0].x, dy=pos.y-csPoints[0].y;
      if(Math.sqrt(dx*dx+dy*dy)<12){csDrawing=false;renderCS();return;}
    }
    csPoints.push({...pos});csDrawing=true;renderCS();
  } else if(csTool==='rect'){
    if(!csRectStart){csRectStart={...pos};}
    else{
      csPoints=[csRectStart,{x:csMousePos.x,y:csRectStart.y},{x:csMousePos.x,y:csMousePos.y},{x:csRectStart.x,y:csMousePos.y}];
      csRectStart=null;csDrawing=false;renderCS();
    }
  } else if(csTool==='line'){
    if(!csLineStart){csLineStart={...pos};}
    else{
      csPoints=[csLineStart,{...csMousePos}];
      csLineStart=null;csDrawing=false;renderCS();
    }
  } else if(csTool==='circle'){
    if(!csCircleStart){csCircleStart={...pos};}
    else{csCircleStart=null;csDrawing=false;renderCS();}
  }
}

function csOnDblClick(e){if(csTool==='poly'){csDrawing=false;renderCS();}}

function setCSTool(t,el){
  csTool=t;csPoints=[];csRectStart=null;csLineStart=null;csCircleStart=null;csDrawing=false;
  document.querySelectorAll('.stool[id^="cst-"]').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');renderCS();
}

function setFillStyle(fs,el){
  csFillStyle=fs;
  document.querySelectorAll('.stool[id^="fill-"]').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');renderCS();
}

function undoCSPoint(){if(csPoints.length>0){csPoints.pop();renderCS();}}
function clearCS(){csPoints=[];csRectStart=null;csLineStart=null;csCircleStart=null;csDrawing=false;renderCS();}

function placeCustomShape(){
  if(csPoints.length<2){showToast('⚠ Draw a shape first','warn');return;}
  const label=document.getElementById('cs-label').value.trim()||'Shape';
  const color=document.getElementById('cs-color').value||'#9896c8';
  // convert canvas coords to world: center the shape on screen
  const canvas=document.getElementById('venueCanvas');
  const xs=csPoints.map(p=>p.x), ys=csPoints.map(p=>p.y);
  const minX=Math.min(...xs), minY=Math.min(...ys);
  // offset to center of viewport
  const cx=canvas.width/2/zoom-panX/zoom, cy=canvas.height/2/zoom-panY/zoom;
  const shapeW=Math.max(...xs)-minX, shapeH=Math.max(...ys)-minY;
  const scaleX=(shapeW>10?150/shapeW:1), scaleY=(shapeH>10?120/shapeH:1);
  const sc=Math.min(scaleX,scaleY,2);
  const worldPts=csPoints.map(p=>({x:(p.x-minX)*sc+cx-shapeW*sc/2,y:(p.y-minY)*sc+cy-shapeH*sc/2}));
  const isSingle=csTool==='line'&&csPoints.length===2;
  const obj={
    id:Date.now(),type:'custom-shape',
    shape:isSingle?'line-shape':(csTool==='circle'?'ellipse-shape':'polygon'),
    points:worldPts,
    origPoints:worldPts.map(p=>({...p})),
    color,label,fillStyle:csFillStyle,
    layerId:activeLayerId
  };
  if(csTool==='circle'){
    const cxW=(worldPts[0].x+worldPts[1].x)/2, cyW=(worldPts[0].y+worldPts[1].y)/2;
    obj.x=cxW-60;obj.y=cyW-40;obj.w=120;obj.h=80;
  }
  calcBBox(obj);
  canvasObjects.push(obj);
  render();
  closeModal('custom-shape-modal');
  // Save to custom library
  saveToCustomLibrary({
    label,color,icon:'✏',type:'custom-shape',subType:csTool,
    fillStyle:csFillStyle,
    points:csPoints.map(p=>({...p})), // save raw canvas points for re-use
  });
  csPoints=[];csDrawing=false;renderCS();
  showToast('✏ Custom shape added!','success');
  setTool('select');
}

// ══════════════════════════════════════════
// CUSTOM ELEMENT
// ══════════════════════════════════════════
function selectCeShape(el){document.querySelectorAll('#ceShapePicker .shape-opt').forEach(s=>s.classList.remove('active'));el.classList.add('active');ceShape=el.dataset.shape;}
function previewCeImg(e){const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=ev=>{ceImgData=ev.target.result;const p=document.getElementById('ceImgPreview');p.src=ev.target.result;p.style.display='block';};r.readAsDataURL(f);}
function updateCePreview(){document.getElementById('ce-prev-icon').textContent=document.getElementById('ce-icon').value||'⭐';document.getElementById('ce-prev-label').textContent=document.getElementById('ce-label').value||'My Element';}
function placeCustomElement(){
  const label=document.getElementById('ce-label').value.trim()||'Custom';
  const icon=document.getElementById('ce-icon').value.trim()||'⭐';
  const color=document.getElementById('ce-color').value;
  const w=parseInt(document.getElementById('ce-w').value)||100;
  const h=parseInt(document.getElementById('ce-h').value)||70;
  const canvas=document.getElementById('venueCanvas');
  canvasObjects.push({id:Date.now(),type:'custom',shape:ceShape,x:canvas.width/zoom/2-panX/zoom-w/2,y:canvas.height/zoom/2-panY/zoom-h/2,w,h,origW:w,origH:h,color,label,icon,imgData:ceImgData||null,layerId:activeLayerId});
  const ceObj={id:Date.now(),type:'custom',shape:ceShape,x:0,y:0,w,h,color,label,icon};
  addToRecent(ceObj);
  // Save to custom library
  saveToCustomLibrary({label,color,icon,type:'custom-element',subType:ceShape,w,h,imgData:ceImgData||null});
  render();closeModal('custom-element-modal');
  ceImgData=null;document.getElementById('ceImgPreview').style.display='none';document.getElementById('ceImgInput').value='';
  showToast('🖼 Custom element placed!','success');setTool('select');
}

// ══════════════════════════════════════════
// CUSTOM LIBRARY
// ══════════════════════════════════════════
function saveToCustomLibrary(data){
  const entry={
    id:Date.now(),
    label:data.label||'Custom',
    icon:data.icon||'✏',
    color:data.color||'#9896c8',
    type:data.type,       // 'custom-shape'|'custom-element'
    subType:data.subType, // 'poly','rect','line','circle' or ceShape
    w:data.w,h:data.h,
    fillStyle:data.fillStyle||'filled',
    points:data.points||null,
    imgData:data.imgData||null,
    createdAt:Date.now(),
    favorite:false,
    name:data.label||'Custom',
  };
  customLibrary.unshift(entry);
  renderCustomLibrary();
}

function setLibSort(mode,el){
  libSortMode=mode;
  document.querySelectorAll('.lib-sort-btn').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  renderCustomLibrary();
}

function getSortedLibrary(){
  const search=(document.getElementById('libSearch')?.value||'').toLowerCase();
  let arr=[...customLibrary];
  // type filter
  if(_libTypeFilter!=='all') arr=arr.filter(i=>i.type===_libTypeFilter);
  // search
  if(search) arr=arr.filter(i=>(i.label||'').toLowerCase().includes(search));
  // sort
  if(libSortMode==='name') arr.sort((a,b)=>a.label.localeCompare(b.label));
  else if(libSortMode==='fav') arr.sort((a,b)=>(b.favorite?1:0)-(a.favorite?1:0));
  else arr.sort((a,b)=>b.createdAt-a.createdAt);
  return arr;
}

function renderCustomLibrary(){
  const list=document.getElementById('customLibList');
  if(!list) return;
  const sorted=getSortedLibrary();

  // Update badge on palette button
  const badge=document.getElementById('libCountBadge');
  if(badge){
    badge.style.display=customLibrary.length>0?'inline':'none';
    badge.textContent=customLibrary.length;
  }
  // Update modal footer count
  const countEl=document.getElementById('libModalCount');
  if(countEl) countEl.textContent=`${sorted.length} item${sorted.length!==1?'s':''}`;

  if(!sorted.length){
    list.innerHTML=`<div class="recents-empty" style="padding:28px;text-align:center">
      ${customLibrary.length===0?'No saved items yet.<br>Create a Custom Shape or Element to save it here.':'No items match your search.'}
    </div>`;
    return;
  }
  list.innerHTML=sorted.map(item=>`
    <div class="cli-item">
      <div class="cli-dot" style="background:${item.color}"></div>
      <div class="cli-icon">${item.icon||'✏'}</div>
      <div class="cli-info">
        <div class="cli-name" title="${item.label}">${item.label}</div>
        <div class="cli-type">${item.type==='custom-shape'?'✏ Shape':'🖼 Element'} · ${item.subType||''} · ${new Date(item.createdAt).toLocaleDateString()}</div>
      </div>
      <div class="cli-actions">
        <button class="cli-btn${item.favorite?' fav-on':''}" title="${item.favorite?'Unfavorite':'Favorite'}" onclick="toggleLibFav(${item.id})">⭐</button>
        <button class="cli-btn" title="Place on canvas" onclick="placeLibItem(${item.id});closeModal('custom-library-modal')">📌 Place</button>
        <button class="cli-btn" title="Edit & replace" onclick="editLibItem(${item.id})">✏ Edit</button>
        <button class="cli-btn danger" title="Delete" onclick="deleteLibItem(${item.id})">🗑</button>
      </div>
    </div>
  `).join('');
}

function toggleLibFav(id){
  const item=customLibrary.find(i=>i.id===id);
  if(!item)return;
  item.favorite=!item.favorite;
  renderCustomLibrary();
  showToast(item.favorite?'⭐ Marked as favorite':'Removed from favorites','info');
}

function deleteLibItem(id){
  customLibrary=customLibrary.filter(i=>i.id!==id);
  renderCustomLibrary();
  showToast('🗑 Removed from library','info');
}

function placeLibItem(id){
  const item=customLibrary.find(i=>i.id===id);
  if(!item)return;
  const canvas=document.getElementById('venueCanvas');
  const cx=canvas.width/2/zoom-panX/zoom;
  const cy=canvas.height/2/zoom-panY/zoom;
  if(item.type==='custom-element'){
    const w=item.w||100,h=item.h||70;
    canvasObjects.push({id:Date.now(),type:'custom',shape:item.subType||'rounded',x:cx-w/2,y:cy-h/2,w,h,origW:w,origH:h,color:item.color,label:item.label,icon:item.icon,imgData:item.imgData||null,layerId:activeLayerId});
    render();showToast(`🖼 "${item.label}" placed`,'success');setTool('select');
  } else if(item.type==='custom-shape'&&item.points){
    // Rebuild points scaled to center of viewport
    const pts=item.points;
    const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);
    const minX=Math.min(...xs),minY=Math.min(...ys);
    const shapeW=Math.max(...xs)-minX||10,shapeH=Math.max(...ys)-minY||10;
    const sc=Math.min(150/shapeW,120/shapeH,2);
    const worldPts=pts.map(p=>({x:(p.x-minX)*sc+cx-shapeW*sc/2,y:(p.y-minY)*sc+cy-shapeH*sc/2}));
    const isSingle=item.subType==='line'&&pts.length===2;
    const obj={id:Date.now(),type:'custom-shape',shape:isSingle?'line-shape':(item.subType==='circle'?'ellipse-shape':'polygon'),points:worldPts,origPoints:worldPts.map(p=>({...p})),color:item.color,label:item.label,fillStyle:item.fillStyle||'filled',layerId:activeLayerId};
    if(item.subType==='circle'){const cxW=(worldPts[0].x+worldPts[1].x)/2,cyW=(worldPts[0].y+worldPts[1].y)/2;obj.x=cxW-60;obj.y=cyW-40;obj.w=120;obj.h=80;}
    calcBBox(obj);
    canvasObjects.push(obj);
    render();showToast(`✏ "${item.label}" placed`,'success');setTool('select');
  }
}

function editLibItem(id){
  const item=customLibrary.find(i=>i.id===id);
  if(!item)return;
  if(item.type==='custom-element'){
    // Pre-fill the custom element modal
    document.getElementById('ce-label').value=item.label;
    document.getElementById('ce-icon').value=item.icon||'⭐';
    document.getElementById('ce-color').value=item.color;
    document.getElementById('ce-w').value=item.w||100;
    document.getElementById('ce-h').value=item.h||70;
    ceShape=item.subType||'rounded';
    ceImgData=item.imgData||null;
    document.querySelectorAll('#ceShapePicker .shape-opt').forEach(s=>{s.classList.toggle('active',s.dataset.shape===ceShape);});
    updateCePreview();
    // Remove old entry when user places it again
    customLibrary=customLibrary.filter(i=>i.id!==id);
    openModal('custom-element-modal');
    showToast('✏ Edit and re-place to update','info');
  } else if(item.type==='custom-shape'){
    // Pre-fill the custom shape modal
    document.getElementById('cs-label').value=item.label;
    document.getElementById('cs-color').value=item.color;
    csTool=item.subType||'poly';
    csFillStyle=item.fillStyle||'filled';
    document.querySelectorAll('.stool[id^="cst-"]').forEach(b=>b.classList.remove('active'));
    const stoolEl=document.getElementById('cst-'+csTool);
    if(stoolEl)stoolEl.classList.add('active');
    document.querySelectorAll('.stool[id^="fill-"]').forEach(b=>b.classList.remove('active'));
    const fillEl=document.getElementById('fill-'+csFillStyle);
    if(fillEl)fillEl.classList.add('active');
    // Remove old entry
    customLibrary=customLibrary.filter(i=>i.id!==id);
    openModal('custom-shape-modal');
    // Load points back
    setTimeout(()=>{
      initCSCanvas();
      csPoints=item.points?item.points.map(p=>({...p})):[];
      csDrawing=false;renderCS();
    },50);
    showToast('✏ Edit shape and place again to update','info');
  }
  renderCustomLibrary();
}

// ══════════════════════════════════════════
// SCHEDULE
// ══════════════════════════════════════════
function getWeekDates(off){
  const now=new Date(),day=now.getDay();
  const mon=new Date(now);mon.setDate(now.getDate()-day+1+off*7);
  return Array.from({length:7},(_,i)=>{const d=new Date(mon);d.setDate(mon.getDate()+i);return d;});
}
function changeWeek(dir){currentWeekOffset+=dir;renderSchedule();}
function jumpToWeekContaining(dateStr){
  const target=new Date(dateStr);
  const now=new Date();
  const nowDay=now.getDay();
  const mon=new Date(now);mon.setDate(now.getDate()-nowDay+1);
  const diff=Math.round((target-mon)/(7*86400000));
  currentWeekOffset=diff;renderSchedule();closeCalendarPicker();
}

// ── Calendar Picker ──
let calPickerYear=new Date().getFullYear(), calPickerMonth=new Date().getMonth();
let calPickerOpen=false;

function toggleCalendarPicker(){
  calPickerOpen=!calPickerOpen;
  const picker=document.getElementById('calPickerPanel');
  if(!picker)return;
  if(calPickerOpen){
    picker.style.display='block';
    calPickerYear=new Date().getFullYear();
    calPickerMonth=new Date().getMonth();
    renderCalPicker();
  } else {picker.style.display='none';}
}

function closeCalendarPicker(){
  calPickerOpen=false;
  const picker=document.getElementById('calPickerPanel');
  if(picker)picker.style.display='none';
}

function renderCalPicker(){
  const picker=document.getElementById('calPickerPanel');
  if(!picker)return;
  const monthNames=['January','February','March','April','May','June','July','August','September','October','November','December'];
  // clamp month
  if(calPickerMonth<0){calPickerMonth=11;calPickerYear--;}
  if(calPickerMonth>11){calPickerMonth=0;calPickerYear++;}
  const firstDay=new Date(calPickerYear,calPickerMonth,1).getDay();
  const daysInMonth=new Date(calPickerYear,calPickerMonth+1,0).getDate();
  const today=new Date();
  // Compute which days have scheduled events so we can highlight them
  const eventDays=new Set();
  schedEvents.forEach(e=>{if(e.dateStr)eventDays.add(e.dateStr);});
  let cells='';
  for(let i=0;i<firstDay;i++)cells+=`<div></div>`;
  for(let d=1;d<=daysInMonth;d++){
    const date=new Date(calPickerYear,calPickerMonth,d);
    const isToday=date.toDateString()===today.toDateString();
    const mm=String(calPickerMonth+1).padStart(2,'0');
    const dd=String(d).padStart(2,'0');
    const dateStr=`${calPickerYear}-${mm}-${dd}`;
    const hasSched=eventDays.has(dateStr);
    cells+=`<div class="cal-day${isToday?' cal-today':''}${hasSched&&!isToday?' cal-has-event':''}" onclick="jumpToWeekContaining('${dateStr}')" title="${dateStr}">${d}</div>`;
  }
  picker.innerHTML=`
    <div class="cal-header" style="flex-direction:column;gap:4px;padding:10px 10px 6px">
      <div style="display:flex;align-items:center;justify-content:space-between;width:100%">
        <button class="cal-nav" onclick="event.stopPropagation();calPickerMonth--;renderCalPicker()">‹</button>
        <span class="cal-month-label">${monthNames[calPickerMonth]} ${calPickerYear}</span>
        <button class="cal-nav" onclick="event.stopPropagation();calPickerMonth++;renderCalPicker()">›</button>
      </div>
      <div style="display:flex;align-items:center;justify-content:center;gap:4px;width:100%">
        <button class="cal-nav" style="font-size:11px;width:20px;height:20px" onclick="event.stopPropagation();calPickerYear--;renderCalPicker()" title="Previous year">«</button>
        <input type="number" value="${calPickerYear}" min="1900" max="2200"
          style="width:62px;text-align:center;background:var(--sys-surface3);border:1px solid var(--sys-border);border-radius:5px;color:var(--text-hi);font-family:'Syne',sans-serif;font-size:11px;font-weight:700;padding:2px 4px;outline:none;"
          onchange="calPickerYear=Math.max(1900,Math.min(2200,parseInt(this.value)||calPickerYear));renderCalPicker()"
          onclick="event.stopPropagation()"
          oninput="event.stopPropagation()">
        <button class="cal-nav" style="font-size:11px;width:20px;height:20px" onclick="event.stopPropagation();calPickerYear++;renderCalPicker()" title="Next year">»</button>
      </div>
    </div>
    <div class="cal-grid">
      ${['S','M','T','W','T','F','S'].map(d=>`<div class="cal-dow">${d}</div>`).join('')}
      ${cells}
    </div>
    <div style="padding:6px 8px;border-top:1px solid var(--sys-border);display:flex;gap:4px">
      <button style="flex:1;padding:5px;border-radius:6px;border:1px solid var(--sys-border);background:none;color:var(--text-lo);font-size:10px;font-family:'Syne',sans-serif;font-weight:700;cursor:pointer;transition:all .15s;" onclick="event.stopPropagation();calPickerYear=new Date().getFullYear();calPickerMonth=new Date().getMonth();renderCalPicker()">Today's Month</button>
      <button style="flex:1;padding:5px;border-radius:6px;border:1px solid var(--primary);background:var(--primary-dim);color:var(--primary-light);font-size:10px;font-family:'Syne',sans-serif;font-weight:700;cursor:pointer;transition:all .15s;" onclick="event.stopPropagation();currentWeekOffset=0;renderSchedule();closeCalendarPicker()">This Week</button>
    </div>
  `;
}

// Close calendar on outside click
document.addEventListener('click',e=>{
  if(calPickerOpen&&!e.target.closest('#calPickerPanel')&&!e.target.closest('#calPickerBtn')){
    closeCalendarPicker();
  }
},true);

function renderSchedule(){
  const HOURS=getSchedHours();
  const grid=document.getElementById('timeGrid');
  const dates=getWeekDates(currentWeekOffset);
  const opts={month:'short',day:'numeric'};
  document.getElementById('weekLabel').textContent=dates[0].toLocaleDateString('en-US',opts)+' – '+dates[6].toLocaleDateString('en-US',opts);
  // Show active event name in schedule title
  const ev=eventsData.find(e=>e.id===activeEventId);
  const titleEl=document.querySelector('.sched-title');
  if(titleEl)titleEl.textContent=ev?`Schedule — ${ev.name}`:'Schedule Planner';
  const overlaps=new Set();
  for(let i=0;i<schedEvents.length;i++)for(let j=i+1;j<schedEvents.length;j++){
    const a=schedEvents[i],b=schedEvents[j];
    if(a.dateStr===b.dateStr&&a.startH<b.endH&&b.startH<a.endH){overlaps.add(a.id);overlaps.add(b.id);}
  }
  let html=`<div class="tg-head"></div>`;
  dates.forEach(d=>{
    const isToday=d.toDateString()===new Date().toDateString();
    const dateNum=schedShowDate?`<span class="dn">${d.getDate()}</span>`:'';
    html+=`<div class="tg-head${isToday?' today':''}">${dateNum}${DAYS[d.getDay()]}</div>`;
  });
  HOURS.forEach(h=>{
    html+=`<div class="tg-time">${fmt12(h)}</div>`;
    dates.forEach(d=>{
      const dStr=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const evs=schedEvents.filter(e=>e.dateStr===dStr&&e.startH===h);
      let cells='';
      evs.forEach(ev=>{
        const ht=Math.max(1,ev.endH-ev.startH);
        const clampedHt=Math.min(ht,schedEndHour-h);
        cells+=`<div class="sched-ev" onclick="event.stopPropagation()" style="background:${ev.color}18;border-color:${ev.color};color:${ev.color};top:2px;height:${clampedHt*50-4}px;cursor:default" title="${ev.title} · ${ev.venue}">
          <div class="et">${ev.title}</div>
          <div class="es">${fmt12(ev.startH)}–${fmt12(ev.endH)} · ${ev.venue}</div>
          ${overlaps.has(ev.id)?'<span class="ov-badge">⚠</span>':''}
          <div style="position:absolute;bottom:2px;right:2px;display:none;gap:2px" class="sched-ev-actions">
            <button style="background:var(--primary);color:#fff;font-size:9px;border:none;border-radius:4px;padding:1px 5px;cursor:pointer;font-family:'DM Sans',sans-serif;" onclick="openEditActivity(${ev.id},event)">✏</button>
            <button class="sched-ev-del" style="display:block;position:static;margin:0;" onclick="deleteSchedEvent(${ev.id},event)">🗑</button>
          </div>
        </div>`;
      });
      html+=`<div class="tg-slot" onclick="quickAddSlot('${dStr}',${h})">${cells}</div>`;
    });
  });
  grid.innerHTML=html;
  // Show action buttons on hover
  grid.querySelectorAll('.sched-ev').forEach(el=>{
    el.addEventListener('mouseenter',()=>el.querySelector('.sched-ev-actions').style.display='flex');
    el.addEventListener('mouseleave',()=>el.querySelector('.sched-ev-actions').style.display='none');
  });
}

function deleteSchedEvent(id,e){
  e.stopPropagation();
  schedEvents=schedEvents.filter(ev=>ev.id!==id);
  if(activeEventId)eventSchedule[activeEventId]=JSON.parse(JSON.stringify(schedEvents));
  renderSchedule();updateOverview();showToast('🗑 Activity deleted','info');
}

function quickAddSlot(dateStr,h){
  if(typeof isActiveEventFinished==='function'&&isActiveEventFinished()){
    showToast('🔒 Event is finished — view only. Mark as Upcoming to edit.','warn');
    return;
  }
  const slotTaken=schedEvents.some(e=>e.dateStr===dateStr&&e.startH<=h&&e.endH>h);
  if(slotTaken){
    const existing=schedEvents.filter(e=>e.dateStr===dateStr&&e.startH<=h&&e.endH>h);
    const names=existing.map(e=>`"${e.title}" (${fmt12(e.startH)}–${fmt12(e.endH)})`).join(', ');
    showToast(`⛔ Slot occupied by ${names}. Pick a different time.`,'error');
    return;
  }
  document.getElementById('act-date').value=dateStr;
  document.getElementById('act-start').value=h<10?'0'+h+':00':h+':00';
  document.getElementById('act-end').value=(h+1)<10?'0'+(h+1)+':00':(h+1)+':00';
  openModal('sched-modal');
}

// Activity color pickers
function pickActColor(el){
  el.closest('.form-group').querySelectorAll('.csw').forEach(e=>e.classList.remove('sel'));
  el.classList.add('sel');
  selectedActColor=el.dataset.color;
  document.getElementById('act-color-custom').value=selectedActColor;
}
function setActCustomColor(v){selectedActColor=v;document.querySelectorAll('#sched-modal .csw').forEach(e=>e.classList.remove('sel'));}

function addActivity(){
  const name=document.getElementById('act-name').value.trim();
  if(!name){showToast('⚠ Enter activity name','warn');return;}
  const dateStr=document.getElementById('act-date').value;
  if(!dateStr){showToast('⚠ Pick a date','warn');return;}
  const startVal=document.getElementById('act-start').value;
  const endVal=document.getElementById('act-end').value;
  const [shH,shM]=(startVal||'0:0').split(':').map(Number);
  const [ehH,ehM]=(endVal||'1:0').split(':').map(Number);
  // Use decimal hours for sub-hour support
  const sh=shH+(shM||0)/60;
  const eh=ehH+(ehM||0)/60;
  if(eh<=sh){showToast('⚠ End must be after start','warn');return;}
  // Store as integer hours for grid (snap to nearest hour)
  const startH=shH,endH=ehH+(ehM>0?1:0);
  const venue=document.getElementById('act-venue').value||'TBD';
  const conflicts=schedEvents.filter(e=>e.dateStr===dateStr&&startH<e.endH&&e.startH<endH);

  if(conflicts.length>0){
  const names=conflicts.map(c=>`"${c.title}" (${fmt12(c.startH)}–${fmt12(c.endH)})`);
  pendingActivity={id:Date.now(),title:name,dateStr,startH,endH,color:selectedActColor,venue};
  const cl=document.getElementById('owConflictList');
  if(cl) cl.innerHTML=names.map(n=>`<div class="ow-conflict-item">⚠ ${n}</div>`).join('');
  document.getElementById('overlapWarnModal').classList.add('open');
  return; // wait for user choice (Force Add / Cancel)
}

  const newAct={id:Date.now(),title:name,dateStr,startH,endH,color:selectedActColor,venue};
  schedEvents.push(newAct);
  if(activeEventId)eventSchedule[activeEventId]=JSON.parse(JSON.stringify(schedEvents));
  closeModal('sched-modal');renderSchedule();updateOverview();
  showToast('✅ Activity added','success');
  document.getElementById('act-name').value='';document.getElementById('act-venue').value='';
}

function cancelOverlapAdd(){
  pendingActivity=null;
  document.getElementById('overlapWarnModal').classList.remove('open');
}

function forceAddActivity(){
  if(pendingActivity){
    pendingActivity.id=Date.now();
    schedEvents.push(pendingActivity);
    if(activeEventId)eventSchedule[activeEventId]=JSON.parse(JSON.stringify(schedEvents));
    pendingActivity=null;
    renderSchedule();updateOverview();
    showToast('⚠️ Activity added with overlap','warn');
    document.getElementById('act-name').value='';document.getElementById('act-venue').value='';
  }
  document.getElementById('overlapWarnModal').classList.remove('open');
}

function saveSchedule(){
  localStorage.setItem('emgo_schedule',JSON.stringify(schedEvents));
  showToast('💾 Schedule saved!','success');
}

function toggleSchedDate(btn){
  schedShowDate=!schedShowDate;
  if(schedShowDate){
    btn.textContent='📅 Hide Date';
    btn.classList.add('active');
  } else {
    btn.textContent='📅 Show Date';
    btn.classList.remove('active');
  }
  renderSchedule();
}

function openEditActivity(id,e){
  e.stopPropagation();
  const ev=schedEvents.find(x=>x.id===id);
  if(!ev)return;
  document.getElementById('edit-act-id').value=id;
  document.getElementById('edit-act-name').value=ev.title;
  document.getElementById('edit-act-date').value=ev.dateStr||'';
  const pad=n=>String(n).padStart(2,'0');
  document.getElementById('edit-act-start').value=pad(ev.startH)+':00';
  document.getElementById('edit-act-end').value=pad(ev.endH)+':00';
  document.getElementById('edit-act-venue').value=ev.venue||'';
  selectedEditActColor=ev.color||'#5b5bd6';
  // Update color swatches
  document.querySelectorAll('#editActColorRow .csw').forEach(sw=>{
    sw.classList.toggle('sel',sw.dataset.color===selectedEditActColor);
  });
  document.getElementById('edit-act-color-custom').value=selectedEditActColor;
  openModal('edit-sched-modal');
}

function saveEditActivity(){
  const id=parseInt(document.getElementById('edit-act-id').value);
  const ev=schedEvents.find(x=>x.id===id);
  if(!ev){closeModal('edit-sched-modal');return;}
  const name=document.getElementById('edit-act-name').value.trim();
  if(!name){showToast('⚠ Enter activity name','warn');return;}
  const dateStr=document.getElementById('edit-act-date').value||ev.dateStr;
  const startVal=document.getElementById('edit-act-start').value;
  const endVal=document.getElementById('edit-act-end').value;
  const [shH,shM]=(startVal||'0:0').split(':').map(Number);
  const [ehH,ehM]=(endVal||'1:0').split(':').map(Number);
  const sh=shH,eh=ehH+(ehM>0?1:0);
  if(eh<=sh){showToast('⚠ End must be after start','warn');return;}
  const editConflicts=schedEvents.filter(e=>e.id!==id&&e.dateStr===dateStr&&sh<e.endH&&e.startH<eh);
  /*if(editConflicts.length>0){
    const names=editConflicts.map(c=>`"${c.title}" (${fmt12(c.startH)}–${fmt12(c.endH)})`).join(', ');
    showToast(`⛔ Time conflicts with ${names}. Adjust the time.`,'error');
    return;
  }*/

function _showNoEventOverlay(panelName) {
  const panelNames = ['venue','map','schedule','attendees'];
  if (!panelNames.includes(panelName)) return;
  const panel = document.getElementById('panel-'+panelName);
  if (!panel) return;
  const activeEv = eventsData.find(e => e.id === activeEventId);
  if (activeEv) {
    const existing = panel.querySelector('.no-event-overlay');
    if (existing) existing.remove();
    return;
  }
  if (panel.querySelector('.no-event-overlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'no-event-overlay';
  overlay.innerHTML = `<div class="nee-box">
    <div style="font-size:40px">📋</div>
    <div class="nee-title">No Event Selected</div>
    <div class="nee-sub">Select or create an event first to use ${panelName}.</div>
    <button onclick="switchPanel('events',null)" class="nee-btn">Go to Events</button>
  </div>`;
  panel.style.position = 'relative';
  panel.appendChild(overlay);
}


  ev.title=name;ev.dateStr=dateStr;ev.startH=sh;ev.endH=eh;
  ev.venue=document.getElementById('edit-act-venue').value||'TBD';
  ev.color=selectedEditActColor;
  if(activeEventId)eventSchedule[activeEventId]=JSON.parse(JSON.stringify(schedEvents));
  closeModal('edit-sched-modal');
  renderSchedule();updateOverview();
  showToast('✅ Activity updated','success');
}

function pickEditActColor(el){
  document.querySelectorAll('#editActColorRow .csw').forEach(e=>e.classList.remove('sel'));
  el.classList.add('sel');
  selectedEditActColor=el.dataset.color;
  document.getElementById('edit-act-color-custom').value=selectedEditActColor;
}
function setEditActCustomColor(v){
  selectedEditActColor=v;
  document.querySelectorAll('#editActColorRow .csw').forEach(e=>e.classList.remove('sel'));
}

// ── Schedule Time Range ──
function initSchedTimeRange(){
  const startSel=document.getElementById('schedStartSel');
  const endSel=document.getElementById('schedEndSel');
  if(!startSel||!endSel)return;
  startSel.innerHTML='';endSel.innerHTML='';
  for(let h=0;h<24;h++){
    startSel.innerHTML+=`<option value="${h}"${h===schedStartHour?' selected':''}>${fmt12full(h)}</option>`;
  }
  for(let h=1;h<=24;h++){
    endSel.innerHTML+=`<option value="${h}"${h===schedEndHour?' selected':''}>${fmt12full(h)}</option>`;
  }
}
function setSchedTimeRange(){
  const sh=parseInt(document.getElementById('schedStartSel').value);
  const eh=parseInt(document.getElementById('schedEndSel').value);
  if(eh<=sh){showToast('⚠ End must be after start','warn');
    // reset selects
    document.getElementById('schedStartSel').value=schedStartHour;
    document.getElementById('schedEndSel').value=schedEndHour;
    return;
  }
  schedStartHour=sh;schedEndHour=eh;
  renderSchedule();
  showToast(`🕐 Schedule: ${fmt12full(sh)} – ${fmt12full(eh)}`,'info');
}

function exportSchedule(){
  const HOURS=getSchedHours();
  const dates=getWeekDates(currentWeekOffset);
  const cols=7, rows=HOURS.length;
  const cellW=110, cellH=48, labelW=54;
  // Header height: shrink when hiding dates
  const headH=schedShowDate?50:32;
  const totalW=labelW+cols*cellW, totalH=headH+rows*cellH;
  const oc=document.createElement('canvas');
  oc.width=totalW;oc.height=totalH;
  const ctx=oc.getContext('2d');
  // white bg
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,totalW,totalH);
  // header bg
  ctx.fillStyle='#f4f4f8';ctx.fillRect(0,0,totalW,headH);
  // header text
  ctx.font='bold 11px sans-serif';ctx.fillStyle='#1e1b3a';ctx.textAlign='center';ctx.textBaseline='middle';
  dates.forEach((d,i)=>{
    const x=labelW+i*cellW+cellW/2;
    if(schedShowDate){
      ctx.font='bold 11px sans-serif';ctx.fillStyle='#5c5880';
      ctx.fillText(DAYS[d.getDay()],x,headH/3);
      ctx.font='bold 19px sans-serif';ctx.fillStyle='#1e1b3a';
      ctx.fillText(d.getDate(),x,headH*0.68);
    } else {
      ctx.font='bold 12px sans-serif';ctx.fillStyle='#1e1b3a';
      ctx.fillText(DAYS[d.getDay()],x,headH/2);
    }
  });
  // time labels
  ctx.textAlign='right';ctx.font='bold 10px sans-serif';ctx.fillStyle='#1e1b3a';
  HOURS.forEach((h,i)=>{const y=headH+i*cellH+cellH/2;ctx.fillText(fmt12(h),labelW-5,y);});
  // grid lines
  ctx.strokeStyle='#e2e2ef';ctx.lineWidth=.5;
  for(let i=0;i<=cols;i++){const x=labelW+i*cellW;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,totalH);ctx.stroke();}
  for(let i=0;i<=rows;i++){const y=headH+i*cellH;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(totalW,y);ctx.stroke();}
  // events
  const overlaps=new Set();
  for(let i=0;i<schedEvents.length;i++)for(let j=i+1;j<schedEvents.length;j++){const a=schedEvents[i],b=schedEvents[j];if(a.dateStr===b.dateStr&&a.startH<b.endH&&b.startH<a.endH){overlaps.add(a.id);overlaps.add(b.id);}}
  schedEvents.forEach(ev=>{
    const dayIdx=dates.findIndex(d=>{const ds=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;return ds===ev.dateStr;});
    if(dayIdx<0)return;
    const hourIdx=HOURS.indexOf(ev.startH);if(hourIdx<0)return;
    const ht=Math.max(1,ev.endH-ev.startH);
    const ex=labelW+dayIdx*cellW+2, ey=headH+hourIdx*cellH+2;
    const ew=cellW-4, eh2=ht*cellH-4;
    const c=ev.color;
    ctx.fillStyle=c+'30';ctx.fillRect(ex,ey,ew,eh2);
    ctx.fillStyle=c;ctx.fillRect(ex,ey,3,eh2);
    ctx.font='bold 10px sans-serif';ctx.textAlign='left';ctx.fillStyle=c;
    ctx.fillText(ev.title,ex+6,ey+13);
    ctx.font='9px sans-serif';ctx.fillStyle='#5c5880';
    ctx.fillText(`${fmt12(ev.startH)}–${fmt12(ev.endH)}`,ex+6,ey+25);
    if(overlaps.has(ev.id)){ctx.fillStyle='#dc2626';ctx.font='bold 9px sans-serif';ctx.fillText('⚠ Overlap',ex+6,ey+36);}
  });
  const link=document.createElement('a');link.download='emgo-schedule.png';link.href=oc.toDataURL('image/png');link.click();
  showToast('⬇ Schedule exported','success');
}

// ══════════════════════════════════════════
// EVENTS MANAGEMENT
// ══════════════════════════════════════════
function selectEvType(el){document.querySelectorAll('#evTypePicker .type-opt').forEach(e=>e.classList.remove('active'));el.classList.add('active');selectedEvType=el.dataset.type;}
function pickEvColor(el){el.closest('.form-group').querySelectorAll('.csw').forEach(e=>e.classList.remove('sel'));el.classList.add('sel');selectedEvColor=el.dataset.color;document.getElementById('nev-color-custom').value=selectedEvColor;}
function setNevCustomColor(v){selectedEvColor=v;document.querySelectorAll('#new-event-modal .csw').forEach(e=>e.classList.remove('sel'));}

function typeTagHTML(type,status){
  const tmap={professional:'<span class="ev-tag tag-pro">💼 Professional</span>',social:'<span class="ev-tag tag-social">🎉 Social</span>',personal:'<span class="ev-tag tag-personal">🧘 Personal</span>',community:'<span class="ev-tag tag-community">🌍 Community</span>',family:'<span class="ev-tag tag-social">🏠 Family</span>',other:'<span class="ev-tag tag-community">✨ Other</span>'};
  const smap={upcoming:'<span class="ev-tag tag-upcoming">⏳ Upcoming</span>',draft:'<span class="ev-tag tag-draft">◦ Draft</span>',finished:'<span class="ev-tag tag-finished">✅ Finished</span>'};
  return (tmap[type]||'')+(smap[status]||'');
}

// ── Auto-status: check all events and update live/finished ──
let _statusInterval=null;
let _finishedSectionOpen=true;
let _libTypeFilter='all';

function checkEventStatuses(){
  const now=new Date();
  let changed=false;
  eventsData.forEach(ev=>{
    if(ev.status==='finished'||ev.status==='draft') return;
    if(ev.autoFinish===false) return;
    const hasExplicitTime=(ev.endTime&&ev.endTime.trim())||(ev.time&&ev.time!=='TBD'&&ev.time.trim());
    if(!hasExplicitTime) return;
    const endDate=ev.endDate||ev.date;
    const endTime=ev.endTime&&ev.endTime.trim()?ev.endTime:(ev.time&&ev.time!=='TBD'?ev.time:null);
    if(endDate&&endDate!=='TBD'&&endTime){
      const endDT=new Date(endDate+'T'+endTime);
      if(!isNaN(endDT)&&now>endDT){ev.status='finished';ev.finishedAt=Date.now();changed=true;return;}
    }
    const evSched=eventSchedule[ev.id]||[];
    if(evSched.length>0){
      const todayStr=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
      const futureActs=evSched.filter(a=>a.dateStr&&a.dateStr>todayStr);
      let maxEnd=null;
      evSched.forEach(a=>{
        if(!a.dateStr||a.dateStr>todayStr) return;
        const dt=new Date(a.dateStr+'T'+String(a.endH).padStart(2,'0')+':00');
        if(!maxEnd||dt>maxEnd) maxEnd=dt;
      });
      if(maxEnd&&now>maxEnd&&futureActs.length===0){ev.status='finished';ev.finishedAt=Date.now();changed=true;}
    }
  });
  if(changed){renderEvents();updateSidebarCards();updateOverview();}
}

function toggleFinishedSection(){
  _finishedSectionOpen=!_finishedSectionOpen;
  const grid=document.getElementById('finishedEvGrid');
  const chevron=document.getElementById('finishedChevron');
  if(grid) grid.style.display=_finishedSectionOpen?'grid':'none';
  if(chevron) chevron.style.transform=_finishedSectionOpen?'':'rotate(-90deg)';
}

// ── Library modal ──
function openLibraryModal(){
  openModal('custom-library-modal');
  renderCustomLibrary();
}

function setLibTypeFilter(type,el){
  _libTypeFilter=type;
  document.querySelectorAll('#libTypeAll,#libTypeShape,#libTypeEl').forEach(b=>b.classList.remove('active'));
  if(el)el.classList.add('active');
  renderCustomLibrary();
}

function renderEvents(){
  const grid=document.getElementById('eventsGrid');
  const search=(document.getElementById('evSearch')?.value||'').toLowerCase();
  const sortBy=document.getElementById('evSortSel')?.value||'date';

  // Separate finished from active
  const activeEvents=eventsData.filter(e=>e.status!=='finished');
  const finishedEvents=eventsData.filter(e=>e.status==='finished');

  // Filter active
  const filterFn=(e)=>{
    const mf=currentEvFilter==='all'
      ||e.type===currentEvFilter
      ||(currentEvFilter==='finished'&&e.status==='finished');
    const ms=!search||(e.name+e.venue+(e.desc||'')).toLowerCase().includes(search);
    return mf&&ms;
  };
  const sortFn=(a,b)=>{
    if(sortBy==='name') return a.name.localeCompare(b.name);
    if(sortBy==='status'){const o={live:0,upcoming:1,draft:2,finished:3};return(o[a.status]||4)-(o[b.status]||4);}
    if(sortBy==='type') return a.type.localeCompare(b.type);
    // date
    const da=new Date(a.date+'T'+(a.time||'00:00')), db=new Date(b.date+'T'+(b.time||'00:00'));
    return isNaN(da)||isNaN(db)?0:da-db;
  };

  // When filter is "finished", show only finished in main grid, hide the finished section
  const showingFinishedFilter=currentEvFilter==='finished';
  const mainList=showingFinishedFilter
    ? finishedEvents.filter(filterFn).sort(sortFn)
    : activeEvents.filter(filterFn).sort(sortFn);

  const evCardHTML=(e,dimmed=false)=>`
    <div class="ev-card${e.id===activeEventId?' ev-card-active':''}${dimmed?' finished-card':''}" onclick="selectEventFromGrid(${e.id})">
      <div class="ev-card-banner" style="background:${e.color}"></div>
      <div class="ev-card-body">
        <div class="ev-card-title">${e.name}</div>
        <div class="ev-card-meta">📅 ${e.date}${e.time&&e.time!=='TBD'?' · 🕐 '+e.time:''}${e.endTime?' – '+e.endTime:''} · 📍 ${e.venue}</div>
        <div style="margin-bottom:6px;display:flex;gap:4px;flex-wrap:wrap">${typeTagHTML(e.type,e.status)}</div>
        <div class="ev-card-desc">${e.desc||''}</div>
        <div class="ev-card-footer">
          <span style="font-size:10px;color:var(--text-lo)">👥 ${e.attendees!=null?e.attendees+' attendees':'Solo event'}</span>
          <div style="display:flex;gap:4px">
            <button class="mini-btn${e.status==='finished'?' mini-btn-finished':''}" title="${e.status==='finished'?'Mark as upcoming':'Mark as finished'}" onclick="event.stopPropagation();markEventFinished(${e.id})">${e.status==='finished'?'↩ Upcoming':'✓'}</button>
            ${e.status!=='finished'?`<button class="mini-btn" onclick="event.stopPropagation();openEditEvent(${e.id})">✏ Edit</button>`:''}
            <button class="mini-btn danger" onclick="event.stopPropagation();deleteEvent(${e.id})">🗑</button>
          </div>
        </div>
      </div>
    </div>`;

  const evRowHTML=(e)=>`<tr onclick="selectEventFromGrid(${e.id})" style="cursor:pointer;${e.id===activeEventId?'background:var(--primary-dim);':''}" onmouseover="this.style.background='var(--primary-dim)'" onmouseout="this.style.background='${e.id===activeEventId?'var(--primary-dim)':''}'">
    <td style="padding:9px 11px;border-bottom:1px solid rgba(255,255,255,.04)"><div style="display:flex;align-items:center;gap:7px"><div style="width:9px;height:9px;border-radius:50%;background:${e.color}"></div><span style="font-weight:600;font-size:12px">${e.name}</span>${e.id===activeEventId?'<span style="font-size:9px;padding:1px 5px;border-radius:8px;background:var(--primary);color:#fff;margin-left:4px">Active</span>':''}</div></td>
    <td style="padding:9px 11px;border-bottom:1px solid rgba(255,255,255,.04);font-size:11px;color:var(--text-md)">${e.date}${e.time&&e.time!=='TBD'?' · '+e.time:''}${e.endTime?' – '+e.endTime:''} · ${e.venue}</td>
    <td style="padding:9px 11px;border-bottom:1px solid rgba(255,255,255,.04)">${typeTagHTML(e.type,'')}</td>
    <td style="padding:9px 11px;border-bottom:1px solid rgba(255,255,255,.04);font-size:11px;color:var(--text-md)">${e.attendees!=null?e.attendees:'Solo'}</td>
    <td style="padding:9px 11px;border-bottom:1px solid rgba(255,255,255,.04)">${typeTagHTML('',e.status)}</td>
    <td style="padding:9px 11px;border-bottom:1px solid rgba(255,255,255,.04)"><div style="display:flex;gap:3px">
      <button class="mini-btn${e.status==='finished'?' mini-btn-finished':''}" title="${e.status==='finished'?'Mark as upcoming':'Mark done'}" onclick="event.stopPropagation();markEventFinished(${e.id})">${e.status==='finished'?'↩ Upcoming':'✓'}</button>
      ${e.status!=='finished'?`<button class="mini-btn" onclick="event.stopPropagation();openEditEvent(${e.id})">✏</button>`:''}
      <button class="mini-btn danger" onclick="event.stopPropagation();deleteEvent(${e.id})">🗑</button>
    </div></td>
  </tr>`;

  if(currentEvSubTab==='grid'){
    grid.style.display='grid';
    grid.innerHTML=mainList.length
      ? mainList.map(e=>evCardHTML(e,e.status==='finished')).join('')
      : `<div style="padding:40px;text-align:center;color:var(--text-lo);grid-column:1/-1"><div style="font-size:36px;margin-bottom:8px">📭</div>No events found</div>`;

    // Finished section (only when not already filtering finished)
    const finSec=document.getElementById('finishedEvSection');
    const finGrid=document.getElementById('finishedEvGrid');
    const finCount=document.getElementById('finishedCount');
    if(finSec&&finGrid){
      const filteredFinished=finishedEvents.filter(e=>{
        return !search||(e.name+e.venue+(e.desc||'')).toLowerCase().includes(search);
      }).sort(sortFn);
      if(filteredFinished.length>0&&!showingFinishedFilter){
        finSec.style.display='block';
        if(finCount)finCount.textContent=filteredFinished.length;
        finGrid.style.display=_finishedSectionOpen?'grid':'none';
        finGrid.innerHTML=filteredFinished.map(e=>evCardHTML(e,true)).join('');
      } else {
        finSec.style.display='none';
      }
    }
  } else {
    // List view
    grid.style.display='block';
    const allListEvents=showingFinishedFilter?mainList:[...mainList,...finishedEvents.filter(e=>!search||(e.name+e.venue+(e.desc||'')).toLowerCase().includes(search)).sort(sortFn)];
    grid.innerHTML=`<div style="border-radius:9px;border:1px solid var(--sys-border);overflow:hidden">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          ${['Event','Date & Venue','Type','Attendees','Status','Actions'].map(h=>`<th style="padding:8px 11px;text-align:left;font-family:'Syne',sans-serif;font-size:9px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:var(--text-lo);background:var(--primary-dim);border-bottom:1px solid var(--sys-border)">${h}</th>`).join('')}
        </tr></thead>
        <tbody>${allListEvents.map(e=>evRowHTML(e)).join('')}</tbody>
      </table>
    </div>`;
    // Hide finished section in list view
    const finSec=document.getElementById('finishedEvSection');
    if(finSec)finSec.style.display='none';
  }
}

function selectEventFromGrid(id){
  loadEventData(id);
  renderEvents();
  updateOverview();
  updateReadOnlyMode();
}

function setEventFilter(el){
  document.querySelectorAll('.filter-chip').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
  currentEvFilter=el.dataset.filter;
  renderEvents();
}
function setEvSubTab(el,tab){
  document.querySelectorAll('.esub').forEach(t=>t.classList.remove('active'));
  el.classList.add('active');
  currentEvSubTab=tab;
  renderEvents();
  updateSidebarSearchVisibility();
}
function updateSidebarSearchVisibility(){
  const wrap=document.querySelector('.sidebar-search-wrap');
  if(!wrap)return;
  // Hide sidebar search when viewing the event table (list) mode
  const inTableView=(document.getElementById('panel-events')?.classList.contains('active') && currentEvSubTab==='list');
  wrap.style.display=inTableView?'none':'flex';
}
function filterEvents(){renderEvents();}

function markEventFinished(id){
  const ev=eventsData.find(e=>e.id===id);
  if(!ev)return;
  if(ev.status==='finished'){
    ev.status='upcoming';ev.finishedAt=null;ev.autoFinish=false;
    showToast(`↩ "${ev.name}" marked upcoming · Auto-finish disabled`,'info');
  } else {
    ev.status='finished';ev.finishedAt=Date.now();
    showToast(`✅ "${ev.name}" marked finished`,'success');
  }
  renderEvents();updateSidebarCards();updateOverview();updateReadOnlyMode();
}

function createNewEvent(){
  const name=document.getElementById('nev-name').value.trim();
  if(!name){showToast('⚠ Enter event name','warn');return;}
  const attRaw=document.getElementById('nev-att').value;
  const att=attRaw.trim()?parseInt(attRaw):null;
  const autoFinish=document.getElementById('nev-auto-finish')?.checked!==false;
  const newEv={
    id:Date.now(),name,type:selectedEvType,
    date:document.getElementById('nev-date').value||'TBD',
    time:document.getElementById('nev-time').value||'TBD',
    endTime:document.getElementById('nev-endtime').value||'',
    endDate:document.getElementById('nev-date').value||'TBD', // same day by default
    venue:document.getElementById('nev-venue').value||'TBD',
    attendees:att,desc:document.getElementById('nev-desc').value||'',
    color:selectedEvColor,status:'upcoming',
    autoFinish,finishedAt:null,
  };
  eventsData.push(newEv);
  eventVenueObjects[newEv.id]=[];
  eventSchedule[newEv.id]=[];
  eventAttendees[newEv.id]=[];
  eventMapPins[newEv.id]=[];
  eventLayers[newEv.id]=[{id:Date.now(),name:'Floor 1',color:'#5b5bd6',visible:true}];
  closeModal('new-event-modal');
  ['nev-name','nev-desc','nev-att','nev-venue'].forEach(i=>document.getElementById(i).value='');
  showToast(`🎉 "${name}" created!`,'success');
  renderEvents();updateSidebarCards();updateOverview();
}

function deleteEvent(id){
  const ev=eventsData.find(e=>e.id===id);
  const evName=ev?`"${ev.name}"`:'this event';
  // Custom confirm modal
  const overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.55);backdrop-filter:blur(4px);';
  overlay.innerHTML=`
    <div style="background:var(--sys-surface2);border:1px solid var(--sys-border);border-radius:16px;padding:28px 28px 22px;max-width:360px;width:90%;box-shadow:0 24px 60px rgba(0,0,0,.55);text-align:center;">
      <div style="width:48px;height:48px;background:rgba(239,68,68,.12);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;">
        <svg width="22" height="22" fill="none" stroke="#ef4444" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
      </div>
      <div style="font-family:'Syne',sans-serif;font-size:16px;font-weight:800;color:var(--text-hi);margin-bottom:8px;">Delete Event?</div>
      <div style="font-size:13px;color:var(--text-lo);line-height:1.6;margin-bottom:22px;">
        <strong style="color:var(--text-hi)">${evName}</strong> and all its data —
        attendees, schedule, venue canvas, and map pins — will be
        <span style="color:#ef4444;font-weight:600;">permanently deleted</span>.
        This cannot be undone.
      </div>
      <div style="display:flex;gap:10px;">
        <button id="_delCancel" style="flex:1;height:40px;border-radius:10px;border:1px solid var(--sys-border);background:var(--sys-surface3);color:var(--text-hi);font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;cursor:pointer;">Cancel</button>
        <button id="_delConfirm" style="flex:1;height:40px;border-radius:10px;border:none;background:#ef4444;color:#fff;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;cursor:pointer;">Yes, Delete</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#_delCancel').onclick=()=>overlay.remove();
  overlay.querySelector('#_delConfirm').onclick=()=>{
    overlay.remove();
    eventsData=eventsData.filter(e=>e.id!==id);
    delete eventVenueObjects[id];delete eventSchedule[id];delete eventAttendees[id];delete eventMapPins[id];
    if(activeEventId===id){activeEventId=eventsData[0]?.id||null;}
    renderEvents();updateSidebarCards();updateOverview();
    showToast('🗑 Event deleted','info');
  };
}

function openEditEvent(id){
  const ev=eventsData.find(e=>e.id===id);
  if(!ev)return;
  document.getElementById('edit-ev-id').value=id;
  document.getElementById('edit-ev-name').value=ev.name;
  document.getElementById('edit-ev-date').value=ev.date;
  document.getElementById('edit-ev-time').value=ev.time;
  const endTimeEl=document.getElementById('edit-ev-endtime');
  if(endTimeEl)endTimeEl.value=ev.endTime||'';
  document.getElementById('edit-ev-venue').value=ev.venue;
  document.getElementById('edit-ev-att').value=ev.attendees!=null?ev.attendees:'';
  document.getElementById('edit-ev-desc').value=ev.desc||'';
  // Map old 'live' status to 'upcoming' for display
  const displayStatus=ev.status==='live'?'upcoming':ev.status||'upcoming';
  document.getElementById('edit-ev-status').value=displayStatus;
  const afEl=document.getElementById('edit-nev-auto-finish');
  if(afEl)afEl.checked=ev.autoFinish!==false;
  selectedEditEvType=ev.type||'professional';
  selectedEditEvColor=ev.color||'#5b5bd6';
  document.querySelectorAll('#editEvTypePicker .type-opt').forEach(opt=>{
    opt.classList.toggle('active',opt.dataset.type===selectedEditEvType);
  });
  document.querySelectorAll('#editEvColorRow .csw').forEach(sw=>{
    sw.classList.toggle('sel',sw.dataset.color===selectedEditEvColor);
  });
  document.getElementById('edit-ev-color-custom').value=selectedEditEvColor;
  openModal('edit-event-modal');
}

function selectEditEvType(el){
  document.querySelectorAll('#editEvTypePicker .type-opt').forEach(e=>e.classList.remove('active'));
  el.classList.add('active');selectedEditEvType=el.dataset.type;
}

function pickEditEvColor(el){
  document.querySelectorAll('#editEvColorRow .csw').forEach(e=>e.classList.remove('sel'));
  el.classList.add('sel');selectedEditEvColor=el.dataset.color;
  document.getElementById('edit-ev-color-custom').value=selectedEditEvColor;
}

function setEditEvCustomColor(v){
  selectedEditEvColor=v;
  document.querySelectorAll('#editEvColorRow .csw').forEach(e=>e.classList.remove('sel'));
}

function saveEditEvent(){
  const id=parseInt(document.getElementById('edit-ev-id').value);
  const ev=eventsData.find(e=>e.id===id);
  if(!ev){closeModal('edit-event-modal');return;}
  const name=document.getElementById('edit-ev-name').value.trim();
  if(!name){showToast('⚠ Enter event name','warn');return;}
  const attRaw=document.getElementById('edit-ev-att').value;
  ev.name=name;
  ev.type=selectedEditEvType;
  ev.date=document.getElementById('edit-ev-date').value||ev.date;
  ev.time=document.getElementById('edit-ev-time').value||ev.time;
  ev.endTime=document.getElementById('edit-ev-endtime')?.value||ev.endTime||'';
  ev.endDate=ev.date; // end date same as start date unless changed
  ev.venue=document.getElementById('edit-ev-venue').value||ev.venue;
  ev.attendees=attRaw.trim()?parseInt(attRaw):null;
  ev.desc=document.getElementById('edit-ev-desc').value||'';
  ev.status=document.getElementById('edit-ev-status').value||ev.status;
  ev.color=selectedEditEvColor;
  ev.autoFinish=document.getElementById('edit-nev-auto-finish')?.checked!==false;
  if(ev.status==='finished'&&!ev.finishedAt) ev.finishedAt=Date.now();
  if(ev.status!=='finished') ev.finishedAt=null;
  closeModal('edit-event-modal');
  renderEvents();updateSidebarCards();updateOverview();
  showToast(`✅ "${name}" updated!`,'success');
}

// ══════════════════════════════════════════
// ATTENDEES
// ══════════════════════════════════════════
function renderAttendees(list){
  const sc={Confirmed:'#22c55e',Pending:'#f59e0b'};
  document.getElementById('attBody').innerHTML=list.map((a,i)=>`
    <tr>
      <td><div class="att-nc"><div class="att-av" style="background:${ACCENTS[i%ACCENTS.length]}22;color:${ACCENTS[i%ACCENTS.length]}">${a.first[0]}${a.last[0]}</div><span style="font-weight:500">${a.first} ${a.last}</span></div></td>
      <td style="color:var(--text-md);font-size:11px">${a.email||'—'}</td>
      <td><span style="padding:2px 7px;border-radius:20px;background:var(--sys-border);font-size:10px">${a.role}</span></td>
      <td>
        <select onchange="updateAttStatus(${a.id},this.value);this.style.color=this.value==='Confirmed'?'#22c55e':'#f59e0b'" style="background:none;border:none;font-size:11px;font-weight:600;cursor:pointer;color:${sc[a.status]||'#f59e0b'};outline:none;padding:0;">
          <option ${a.status==='Pending'?'selected':''}>Pending</option>
          <option ${a.status==='Confirmed'?'selected':''}>Confirmed</option>
        </select>
      </td>
      <td><button onclick="removeAtt(${a.id})" style="background:none;border:none;color:var(--text-lo);cursor:pointer;font-size:11px;transition:color .15s" onmouseover="this.style.color='var(--danger)'" onmouseout="this.style.color='var(--text-lo)'">✕</button></td>
    </tr>
  `).join('')||'<tr><td colspan="5" style="padding:24px;text-align:center;color:var(--text-lo)">No attendees yet.</td></tr>';
}
function filterAttendees(q){
  const s=document.querySelector('.att-wrap select').value||'';
  renderAttendees(attendees.filter(a=>{
    const mq=!q||(a.first+' '+a.last+a.email+a.role).toLowerCase().includes(q.toLowerCase());
    const ms=!s||a.status===s;
    return mq&&ms;
  }));
}
function filterAttendeesByStatus(s){
  const q=document.querySelector('.att-wrap input[type=text]').value||'';
  renderAttendees(attendees.filter(a=>{
    const mq=!q||(a.first+' '+a.last+a.email+a.role).toLowerCase().includes(q.toLowerCase());
    const ms=!s||a.status===s;
    return mq&&ms;
  }));
}
function updateAttStatus(id,status){
  const a=attendees.find(a=>a.id===id);
  if(a){
    a.status=status;
    if(activeEventId)eventAttendees[activeEventId]=JSON.parse(JSON.stringify(attendees));
    showToast(`✅ ${a.first} → ${status}`,'success');
  }
}
function addAttendee(){
  const first=document.getElementById('att-first').value.trim();
  const last=document.getElementById('att-last').value.trim();
  if(!first||!last){showToast('⚠ Enter name','warn');return;}
  attendees.push({id:Date.now(),first,last,email:document.getElementById('att-email').value,role:document.getElementById('att-role').value,status:document.getElementById('att-status').value});
  if(activeEventId)eventAttendees[activeEventId]=JSON.parse(JSON.stringify(attendees));
  closeModal('att-modal');renderAttendees(attendees);
  ['att-first','att-last','att-email'].forEach(i=>document.getElementById(i).value='');
  updateOverview();
  showToast('✅ Attendee added','success');
}
function removeAtt(id){attendees=attendees.filter(a=>a.id!==id);if(activeEventId)eventAttendees[activeEventId]=JSON.parse(JSON.stringify(attendees));renderAttendees(attendees);updateOverview();showToast('🗑 Removed','info');}

// ══════════════════════════════════════════
// MODALS
// ══════════════════════════════════════════
function openModal(id){
  document.getElementById(id).classList.add('open');
  if(id==='custom-shape-modal')setTimeout(initCSCanvas,50);
}
function closeModal(id){document.getElementById(id).classList.remove('open');}
document.querySelectorAll('.modal-overlay').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('open');}));
function addLocation(){closeModal('loc-modal');showToast('📍 Location pinned','success');}

// ══════════════════════════════════════════
// MAP FUNCTIONS — Interactive Canvas Map
// ══════════════════════════════════════════
let mapCanvas, mapCtx;
let mapOffX=0, mapOffY=0, mapZoom=1;
let mapPanning=false, mapPanMoved=false;
let mapPanSX=0, mapPanSY=0, mapPanOX=0, mapPanOY=0;
let mapPinMode=false;
let mapHoverPin=null;
let mapStyles=['road','dark','satellite'];
let mapStyleIdx=0;
let pendingDropPin=null; // {x,y} in world coords

// Map background tile sets (CSS-drawn)
const MAP_STYLE_COLORS={
  road:{bg:'#e8e0d8',road:'#fff',road2:'#f0ebb8',water:'#9bcbdb',park:'#c5ddc5',bld:'#ddd4c4',grid:'rgba(0,0,0,.05)'},
  dark:{bg:'#1a1a28',road:'#2e2e4a',road2:'#212135',water:'#0d1a2a',park:'#1a2818',bld:'#282840',grid:'rgba(91,91,214,.06)'},
  satellite:{bg:'#2d4a1e',road:'rgba(255,255,255,.35)',road2:'rgba(200,180,100,.4)',water:'#1a3a5c',park:'#1e3a18',bld:'#3a3020',grid:'rgba(255,255,255,.04)'},
};

function initMap(){
  mapCanvas=document.getElementById('mapCanvas');
  if(!mapCanvas)return;
  const cont=document.getElementById('mapCanvasContainer');
  mapCanvas.width=cont.clientWidth||800;
  mapCanvas.height=cont.clientHeight||500;
  mapCanvas.style.width='100%';
  mapCanvas.style.height='100%';
  mapCtx=mapCanvas.getContext('2d');
  // Center on Manila
  mapOffX=mapCanvas.width/2-400;
  mapOffY=mapCanvas.height/2-300;
  // Events
  mapCanvas.addEventListener('mousedown',mapMouseDown);
  mapCanvas.addEventListener('mousemove',mapMouseMove);
  mapCanvas.addEventListener('mouseup',mapMouseUp);
  mapCanvas.addEventListener('mouseleave',mapMouseUp);
  mapCanvas.addEventListener('click',mapClick);
  mapCanvas.addEventListener('wheel',mapWheel,{passive:false});
  mapCanvas.addEventListener('touchstart',mapTouchStart,{passive:true});
  mapCanvas.addEventListener('touchmove',mapTouchMove,{passive:false});
  mapCanvas.addEventListener('touchend',mapTouchEnd);
  window.addEventListener('resize',resizeMapCanvas);
  renderMap();
  renderMapPins();
  // Populate event dropdown
  const sel=document.getElementById('loc-event');
  sel.innerHTML='<option value="">— None —</option>';
  eventsData.forEach(e=>{sel.innerHTML+=`<option value="${e.name}">${e.name}</option>`;});
}

function resizeMapCanvas(){
  if(!mapCanvas)return;
  const cont=document.getElementById('mapCanvasContainer');
  if(!cont)return;
  mapCanvas.width=cont.clientWidth||800;
  mapCanvas.height=cont.clientHeight||500;
  renderMap();
}

function mapToScreen(wx,wy){return{x:wx*mapZoom+mapOffX,y:wy*mapZoom+mapOffY};}
function screenToMap(sx,sy){return{x:(sx-mapOffX)/mapZoom,y:(sy-mapOffY)/mapZoom};}

function renderMap(){
  if(!mapCtx)return;
  const W=mapCanvas.width, H=mapCanvas.height;
  const style=MAP_STYLE_COLORS[mapStyles[mapStyleIdx]||'road'];
  mapCtx.clearRect(0,0,W,H);
  // Background
  mapCtx.fillStyle=style.bg;mapCtx.fillRect(0,0,W,H);
  // Grid lines (simulated streets)
  const gridStep=80*mapZoom;
  const ox=(mapOffX%gridStep+gridStep)%gridStep;
  const oy=(mapOffY%gridStep+gridStep)%gridStep;
  mapCtx.strokeStyle=style.grid;mapCtx.lineWidth=1;
  for(let x=ox-gridStep;x<W+gridStep;x+=gridStep){mapCtx.beginPath();mapCtx.moveTo(x,0);mapCtx.lineTo(x,H);mapCtx.stroke();}
  for(let y=oy-gridStep;y<H+gridStep;y+=gridStep){mapCtx.beginPath();mapCtx.moveTo(0,y);mapCtx.lineTo(W,y);mapCtx.stroke();}
  // Draw faux roads
  const roads=[
    {x1:0,y1:300,x2:800,y2:300,w:12},
    {x1:400,y1:0,x2:400,y2:600,w:12},
    {x1:0,y1:150,x2:800,y2:450,w:7},
    {x1:0,y1:450,x2:800,y2:150,w:5},
    {x1:200,y1:0,x2:200,y2:600,w:5},
    {x1:600,y1:0,x2:600,y2:600,w:5},
    {x1:0,y1:100,x2:800,y2:100,w:4},
    {x1:0,y1:500,x2:800,y2:500,w:4},
  ];
  roads.forEach(r=>{
    const s1=mapToScreen(r.x1,r.y1),s2=mapToScreen(r.x2,r.y2);
    mapCtx.beginPath();mapCtx.moveTo(s1.x,s1.y);mapCtx.lineTo(s2.x,s2.y);
    mapCtx.strokeStyle=style.road;mapCtx.lineWidth=r.w*mapZoom;mapCtx.lineCap='round';mapCtx.stroke();
  });
  // Draw faux blocks/parks
  const blocks=[
    {x:60,y:60,w:120,h:80,type:'bld'},{x:220,y:60,w:150,h:80,type:'bld'},
    {x:420,y:60,w:140,h:80,type:'bld'},{x:600,y:60,w:160,h:120,type:'bld'},
    {x:60,y:170,w:80,h:100,type:'park'},{x:160,y:170,w:200,h:100,type:'bld'},
    {x:60,y:330,w:200,h:120,type:'park'},{x:480,y:330,w:130,h:100,type:'bld'},
    {x:640,y:330,w:120,h:100,type:'bld'},{x:100,y:480,w:200,h:90,type:'bld'},
    {x:400,y:460,w:160,h:110,type:'park'},{x:570,y:460,w:200,h:110,type:'bld'},
    {x:40,y:410,w:100,h:60,type:'bld'},{x:300,y:200,w:80,h:80,type:'water'},
  ];
  blocks.forEach(b=>{
    const s=mapToScreen(b.x,b.y);
    const sw=b.w*mapZoom, sh=b.h*mapZoom;
    mapCtx.fillStyle=style[b.type]||style.bld;
    mapCtx.fillRect(s.x,s.y,sw,sh);
  });
  // Draw all pins
  mapPins.forEach(p=>drawMapPin(p,p.id===activeMapPin));
  // Draw share location pins (distinct style, on top)
  sharePins.forEach(p=>{
    const s=mapToScreen(p.x||400,p.y||300);
    drawSharePinMarker(mapCtx,s.x,s.y,activeSharePin===p.id);
    if(mapZoom>0.5){
      mapCtx.save();
      const label=p.name;
      mapCtx.font=`bold ${Math.min(11,9*mapZoom)}px Syne,sans-serif`;
      const tw=mapCtx.measureText(label).width;
      const ly=s.y-52*Math.min(1.5,mapZoom)-4;
      mapCtx.fillStyle='rgba(22,163,74,.93)';
      roundRect(mapCtx,s.x-tw/2-5,ly-12,tw+10,18,4);mapCtx.fill();
      mapCtx.fillStyle='#fff';mapCtx.textAlign='center';mapCtx.textBaseline='middle';
      mapCtx.fillText(label,s.x,ly-3);
      // code badge below name
      mapCtx.font=`bold ${Math.min(8,6.5*mapZoom)}px Syne,sans-serif`;
      const cw=mapCtx.measureText(p.code).width;
      mapCtx.fillStyle='rgba(13,13,18,.88)';
      roundRect(mapCtx,s.x-cw/2-5,ly+2,cw+10,13,3);mapCtx.fill();
      mapCtx.fillStyle='#22c55e';
      mapCtx.fillText(p.code,s.x,ly+8.5);
      mapCtx.restore();
    }
  });
  // Draw pending drop pin (ghost)
  if(pendingDropPin){
    const s=mapToScreen(pendingDropPin.x,pendingDropPin.y);
    drawPinMarker(mapCtx,s.x,s.y,'#5b5bd6',0.5,true);
  }
  // Map label
  const styleName=mapStyles[mapStyleIdx];
  mapCtx.font='bold 10px Syne,sans-serif';
  mapCtx.fillStyle=styleName==='dark'?'rgba(255,255,255,.25)':'rgba(0,0,0,.2)';
  mapCtx.textAlign='left';mapCtx.textBaseline='bottom';
  mapCtx.fillText(`EmGo Map · ${styleName.charAt(0).toUpperCase()+styleName.slice(1)} · ${Math.round(mapZoom*100)}%`,8,H-8);
}

function drawMapPin(p,isActive){
  const s=mapToScreen(p.x||400,p.y||300);
  drawPinMarker(mapCtx,s.x,s.y,p.color,isActive?1:0.85,false,isActive);
  if(mapZoom>0.6&&(isActive||mapHoverPin===p.id)){
    // Draw label
    mapCtx.save();
    const label=p.name;
    mapCtx.font=`bold ${Math.min(12,10*mapZoom)}px Syne,sans-serif`;
    const tw=mapCtx.measureText(label).width;
    const lx=s.x-tw/2, ly=s.y-36*mapZoom-6;
    mapCtx.fillStyle='rgba(13,13,18,.92)';
    roundRect(mapCtx,lx-5,ly-12,tw+10,18,4);mapCtx.fill();
    mapCtx.fillStyle='#f0eeff';mapCtx.textAlign='center';mapCtx.textBaseline='middle';
    mapCtx.fillText(label,s.x,ly-3);
    mapCtx.restore();
  }
}

function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
}

function drawPinMarker(ctx,sx,sy,color,alpha,ghost,active){
  const scale=mapZoom>1?Math.min(1.4,mapZoom):1;
  const h=32*scale, w=20*scale;
  ctx.save();ctx.globalAlpha=ghost?0.45:alpha;
  // Drop shadow
  ctx.shadowColor='rgba(0,0,0,.35)';ctx.shadowBlur=8;ctx.shadowOffsetY=3;
  // Pin body (teardrop)
  ctx.beginPath();
  ctx.arc(sx,sy-h*0.6,w/2,0,Math.PI*2);
  ctx.moveTo(sx,sy);ctx.lineTo(sx-w/2,sy-h*0.6);ctx.arc(sx,sy-h*0.6,w/2,Math.PI,0);ctx.lineTo(sx,sy);ctx.closePath();
  // Simpler approach: just draw arc + triangle
  ctx.beginPath();
  ctx.arc(sx,sy-h*0.55,w/2,0.55,Math.PI-0.55);
  ctx.lineTo(sx,sy-2);ctx.closePath();
  ctx.fillStyle=active?color:color;
  if(active){ctx.shadowColor=color;ctx.shadowBlur=14;}
  ctx.fill();
  ctx.shadowBlur=0;ctx.shadowOffsetY=0;
  // Inner circle
  ctx.beginPath();ctx.arc(sx,sy-h*0.55,w/4,0,Math.PI*2);
  ctx.fillStyle='rgba(255,255,255,.75)';ctx.fill();
  ctx.restore();
}

function pickPinAtScreen(sx,sy){
  for(let i=mapPins.length-1;i>=0;i--){
    const p=mapPins[i];
    const ps=mapToScreen(p.x||400,p.y||300);
    const dx=sx-ps.x, dy=sy-(ps.y-16*mapZoom);
    if(dx*dx+dy*dy<(14*mapZoom)**2)return p;
  }
  return null;
}

// Map mouse events
let mapTouches=[];
function mapMouseDown(e){
  mapPanMoved=false;
  if(mapPinMode){return;}
  mapPanning=true;
  mapPanSX=e.clientX;mapPanSY=e.clientY;
  mapPanOX=mapOffX;mapPanOY=mapOffY;
  mapCanvas.style.cursor='grabbing';
}
function mapMouseMove(e){
  const rect=mapCanvas.getBoundingClientRect();
  const sx=e.clientX-rect.left, sy=e.clientY-rect.top;
  if(mapPanning&&!mapPinMode){
    const dx=e.clientX-mapPanSX, dy=e.clientY-mapPanSY;
    if(Math.abs(dx)>2||Math.abs(dy)>2)mapPanMoved=true;
    mapOffX=mapPanOX+dx;mapOffY=mapPanOY+dy;
    renderMap();return;
  }
  // Hover detection
  const hovered=pickPinAtScreen(sx,sy);
  const prevHover=mapHoverPin;
  mapHoverPin=hovered?hovered.id:null;
  if(mapHoverPin!==prevHover)renderMap();
  // Tooltip
  const tooltip=document.getElementById('mapPinTooltip');
  if(hovered){
    tooltip.style.display='block';
    tooltip.style.left=(sx+12)+'px';
    tooltip.style.top=(sy-24)+'px';
    tooltip.textContent=hovered.name+(hovered.address?' — '+hovered.address:'');
    mapCanvas.style.cursor='pointer';
  } else {
    tooltip.style.display='none';
    mapCanvas.style.cursor=mapPinMode?'crosshair':(mapPanning?'grabbing':'grab');
  }
}
function mapMouseUp(e){
  if(mapPanning){mapPanning=false;mapCanvas.style.cursor=mapPinMode?'crosshair':'grab';}
}
function mapClick(e){
  if(mapPanMoved)return;
  const rect=mapCanvas.getBoundingClientRect();
  const sx=e.clientX-rect.left, sy=e.clientY-rect.top;
  // Check if clicked a regular pin
  const hit=pickPinAtScreen(sx,sy);
  if(hit&&!mapPinMode&&!mapSharePinMode){
    activeMapPin=hit.id;
    renderMapPins();renderMap();
    showToast(`📍 ${hit.name}`,'info');
    return;
  }
  if(mapSharePinMode){
    const w=screenToMap(sx,sy);
    pendingDropPin={x:w.x,y:w.y};
    showShareDropPopup(sx,sy,w.x,w.y);
    renderMap();
    return;
  }
  if(mapPinMode){
    const w=screenToMap(sx,sy);
    showDropPinPopup(sx,sy,w.x,w.y);
    pendingDropPin={x:w.x,y:w.y};
    renderMap();
  }
}
function mapWheel(e){
  e.preventDefault();
  const rect=mapCanvas.getBoundingClientRect();
  const mx=e.clientX-rect.left, my=e.clientY-rect.top;
  const factor=e.deltaY<0?1.15:0.87;
  const newZ=Math.max(0.3,Math.min(5,mapZoom*factor));
  mapOffX=mx-(mx-mapOffX)*(newZ/mapZoom);
  mapOffY=my-(my-mapOffY)*(newZ/mapZoom);
  mapZoom=newZ;renderMap();
}
function mapTouchStart(e){
  mapTouches=[...e.touches];
  if(e.touches.length===1){mapPanSX=e.touches[0].clientX;mapPanSY=e.touches[0].clientY;mapPanOX=mapOffX;mapPanOY=mapOffY;mapPanning=true;mapPanMoved=false;}
}
function mapTouchMove(e){
  e.preventDefault();
  if(e.touches.length===1&&mapPanning){
    const dx=e.touches[0].clientX-mapPanSX, dy=e.touches[0].clientY-mapPanSY;
    if(Math.abs(dx)>3||Math.abs(dy)>3)mapPanMoved=true;
    mapOffX=mapPanOX+dx;mapOffY=mapPanOY+dy;renderMap();
  } else if(e.touches.length===2){
    // Pinch zoom
    const d0=Math.hypot(mapTouches[1].clientX-mapTouches[0].clientX,mapTouches[1].clientY-mapTouches[0].clientY);
    const d1=Math.hypot(e.touches[1].clientX-e.touches[0].clientX,e.touches[1].clientY-e.touches[0].clientY);
    mapZoom=Math.max(0.3,Math.min(5,mapZoom*(d1/d0)));
    mapTouches=[...e.touches];renderMap();
  }
}
function mapTouchEnd(){mapPanning=false;}

// Pin Mode
function togglePinMode(){
  if(mapSharePinMode){toggleSharePinMode();}
  mapPinMode=!mapPinMode;
  const btn=document.getElementById('mapPinModeBtn');
  const indicator=document.getElementById('mapModeIndicator');
  const prompt=document.getElementById('mapDropPrompt');
  if(mapPinMode){
    btn.style.background='var(--primary)';btn.style.color='#fff';btn.style.borderColor='var(--primary)';
    indicator.style.display='block';
    prompt.style.display='block';
    mapCanvas.style.cursor='crosshair';
    showToast('📍 Pin mode ON — click anywhere to drop a pin','info');
  } else {
    btn.style.background='';btn.style.color='';btn.style.borderColor='';
    indicator.style.display='none';
    prompt.style.display='none';
    mapCanvas.style.cursor='grab';
    closePinPopup();
    pendingDropPin=null;renderMap();
  }
}

function showDropPinPopup(sx,sy,wx,wy){
  const popup=document.getElementById('pinSavePopup');
  const cont=document.getElementById('mapCanvasContainer');
  const cr=cont.getBoundingClientRect();
  // Position popup near click, keep inside container
  let px=sx+14, py=sy-80;
  if(px+220>cr.width)px=sx-234;
  if(py<4)py=sy+16;
  popup.style.left=px+'px';
  popup.style.top=py+'px';
  popup.style.display='block';
  popup.innerHTML=`
    <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:11px;margin-bottom:7px;color:var(--text-hi)">📍 Name this pin</div>
    <input type="text" id="pinNameInput" placeholder="e.g. Convention Center" autofocus>
    <input type="text" id="pinAddrInput" placeholder="Address (optional)" style="margin-top:0">
    <div style="display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap">
      ${['#5b5bd6','#f59e0b','#8b5cf6','#ef4444','#14b8a6','#22c55e'].map(c=>`<div onclick="selectPopupColor('${c}')" style="width:18px;height:18px;border-radius:3px;background:${c};cursor:pointer;border:2px solid transparent;transition:.15s" data-popup-color="${c}"></div>`).join('')}
    </div>
    <div class="pin-popup-btns">
      <button class="pin-popup-cancel" onclick="closePinPopup()">Cancel</button>
      <button class="pin-popup-save" onclick="saveDrop(${wx},${wy})">📍 Save Pin</button>
    </div>
  `;
  // Focus input after render
  setTimeout(()=>{const inp=document.getElementById('pinNameInput');if(inp)inp.focus();},30);
  // Highlight first color
  selectPopupColor('#5b5bd6');
}

let dropPinColor='#5b5bd6';
function selectPopupColor(c){
  dropPinColor=c;
  document.querySelectorAll('[data-popup-color]').forEach(el=>{
    el.style.borderColor=el.dataset.popupColor===c?'#fff':'transparent';
    el.style.transform=el.dataset.popupColor===c?'scale(1.2)':'scale(1)';
  });
}

function closePinPopup(){
  document.getElementById('pinSavePopup').style.display='none';
  pendingDropPin=null;renderMap();
}

function saveDrop(wx,wy){
  const name=(document.getElementById('pinNameInput')?.value.trim())||'Unnamed Pin';
  const address=(document.getElementById('pinAddrInput')?.value.trim())||'';
  const pin={id:Date.now(),name,address,x:wx,y:wy,color:dropPinColor,event:''};
  mapPins.push(pin);
  activeMapPin=pin.id;
  pendingDropPin=null;
  closePinPopup();
  renderMapPins();renderMap();
  showToast(`📍 "${name}" pinned!`,'success');
}

function mapZoomIn(){mapZoom=Math.min(5,mapZoom*1.25);renderMap();}
function mapZoomOut(){mapZoom=Math.max(0.3,mapZoom*0.8);renderMap();}

function cycleMapStyle(){
  mapStyleIdx=(mapStyleIdx+1)%mapStyles.length;
  const names={road:'🗺 Road',dark:'🌙 Dark',satellite:'🛰 Satellite'};
  document.getElementById('mapSatBtn').textContent=names[mapStyles[(mapStyleIdx+1)%3]||'road'];
  renderMap();
  showToast(`🗺 Map style: ${mapStyles[mapStyleIdx]}`,'info');
}

function centerMapDefault(){
  if(!mapCanvas)return;
  mapZoom=1;mapOffX=mapCanvas.width/2-400;mapOffY=mapCanvas.height/2-300;
  renderMap();
}

function pickLocColor(el){
  document.querySelectorAll('#locColorRow .csw').forEach(e=>e.classList.remove('sel'));
  el.classList.add('sel');selectedLocColor=el.dataset.color;
}

function addPinnedVenue(){
  const name=document.getElementById('loc-name').value.trim();
  const address=document.getElementById('loc-address').value.trim();
  if(!name&&!address){showToast('⚠ Enter a name or address','warn');return;}
  const lx=parseFloat(document.getElementById('loc-lat').value)||null;
  const ly=parseFloat(document.getElementById('loc-lng').value)||null;
  const linkedEvent=document.getElementById('loc-event').value||'';
  // Place at center of map view or given coords
  const wx=lx||screenToMap(mapCanvas?mapCanvas.width/2:400,0).x||400;
  const wy=ly||screenToMap(0,mapCanvas?mapCanvas.height/2:300).y||300;
  const pin={id:Date.now(),name:name||address,address,x:wx,y:wy,color:selectedLocColor,event:linkedEvent};
  mapPins.push(pin);
  activeMapPin=pin.id;
  closeModal('loc-modal');
  renderMapPins();renderMap();
  showToast(`📍 "${pin.name}" added to map!`,'success');
  ['loc-name','loc-address','loc-lat','loc-lng'].forEach(id=>document.getElementById(id).value='');
}

function viewMapPin(p){
  activeMapPin=p.id;
  // Pan to pin
  if(mapCanvas&&p.x!=null){
    mapOffX=mapCanvas.width/2-p.x*mapZoom;
    mapOffY=mapCanvas.height/2-p.y*mapZoom;
  }
  renderMapPins();renderMap();
}

function removeMapPin(id,e){
  if(e)e.stopPropagation();
  mapPins=mapPins.filter(p=>p.id!==id);
  if(activeMapPin===id)activeMapPin=null;
  renderMapPins();renderMap();
  showToast('🗑 Pin removed','info');
}

function renderMapPins(){
  const list=document.getElementById('pinsList');
  if(!list)return;
  document.getElementById('pinCount').textContent=`(${mapPins.length})`;
  if(!mapPins.length){
    list.innerHTML=`<div style="padding:16px 0;text-align:center;color:var(--text-lo);font-size:11px;font-style:italic">No venues pinned yet.<br>Enable "Drop Pin Mode" and click the map.</div>`;
    return;
  }
  list.innerHTML=mapPins.map(p=>`
    <div class="venue-pin-card ${activeMapPin===p.id?'active-pin':''}" onclick="viewMapPin(${JSON.stringify(p).replace(/"/g,'&quot;').replace(/'/g,'&#39;')})">
      <div class="vpc-name"><div class="vpc-dot" style="background:${p.color}"></div>${p.name}</div>
      ${p.address?`<div class="vpc-addr">📍 ${p.address}</div>`:''}
      ${p.event?`<div style="margin-top:3px"><span style="font-size:9px;padding:1px 6px;border-radius:20px;background:var(--primary-dim);color:var(--primary-light)">${p.event}</span></div>`:''}
      <button class="vpc-del" onclick="removeMapPin(${p.id},event)">✕</button>
    </div>
  `).join('');
}

function mapSearchGo(){
  const q=document.getElementById('mapSearchInput').value.trim();
  if(!q){showToast('⚠ Enter a search term','warn');return;}
  // Drop a search result pin at center with the search name
  const pin={id:Date.now(),name:q,address:'Searched: '+q,x:screenToMap(mapCanvas?mapCanvas.width/2:400,0).x,y:screenToMap(0,mapCanvas?mapCanvas.height/2:300).y,color:'#f59e0b',event:''};
  mapPins.push(pin);activeMapPin=pin.id;
  renderMapPins();renderMap();
  showToast(`🔍 "${q}" pinned at map center`,'info');
  document.getElementById('mapSearchInput').value='';
}

// ══════════════════════════════════════════
// SHARE LOCATION PINS (separate from regular pins)
// ══════════════════════════════════════════
let sharePins=[];          // [{id,name,address,x,y,code}]
let mapSharePinMode=false;
let activeSharePin=null;
let _currentShareCode='';

function generateShareCode(id){
  // Deterministic 6-char alphanumeric from id
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let seed=id%1000000; let code='';
  for(let i=0;i<6;i++){code+=chars[seed%chars.length];seed=Math.floor(seed/chars.length)+7*(i+1)+13;}
  return code;
}

function toggleSharePinMode(){
  // Turn off regular pin mode first
  if(mapPinMode){togglePinMode();}
  mapSharePinMode=!mapSharePinMode;
  const btn=document.getElementById('mapSharePinModeBtn');
  const ind=document.getElementById('mapShareModeIndicator');
  const prompt=document.getElementById('mapDropPrompt');
  if(mapSharePinMode){
    btn.classList.add('share-mode-active');
    ind.style.display='block';
    prompt.textContent='🔗 Click to place a Share Location pin';
    prompt.style.background='rgba(34,197,94,.9)';
    prompt.style.display='block';
    mapCanvas.style.cursor='crosshair';
    showToast('🔗 Share Pin mode ON — click to place a shareable location','info');
  } else {
    btn.classList.remove('share-mode-active');
    ind.style.display='none';
    prompt.style.display='none';
    prompt.style.background='';prompt.textContent='📍 Click to drop a pin';
    mapCanvas.style.cursor='grab';
    closePinPopup();renderMap();
  }
}

function showShareDropPopup(sx,sy,wx,wy){
  const popup=document.getElementById('pinSavePopup');
  const cont=document.getElementById('mapCanvasContainer');
  const cr=cont.getBoundingClientRect();
  let px=sx+14, py=sy-110;
  if(px+230>cr.width)px=sx-244;
  if(py<4)py=sy+16;
  popup.style.left=px+'px'; popup.style.top=py+'px'; popup.style.display='block';
  popup.innerHTML=`
    <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:11px;margin-bottom:3px;color:var(--success)">🔗 Share Location Pin</div>
    <div style="font-size:9px;color:var(--text-lo);margin-bottom:7px">This pin will generate a QR code &amp; code for EmGo Mobile</div>
    <input type="text" id="pinNameInput" placeholder="Location name (e.g. Main Stage)" autofocus>
    <input type="text" id="pinAddrInput" placeholder="Address or notes (optional)" style="margin-top:0">
    <div style="margin-bottom:8px;">
      <div style="font-family:'Syne',sans-serif;font-size:10px;font-weight:700;color:var(--text-hi);margin-bottom:4px;">⏱ Live location expires in:</div>
      <div style="display:flex;gap:5px;align-items:center;">
        <select id="pinTimeLimitSel" style="flex:1;background:var(--sys-surface3);border:1px solid var(--sys-border);border-radius:7px;color:var(--text-hi);padding:6px 8px;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:600;outline:none;cursor:pointer;">
          <option value="15">15 minutes</option>
          <option value="30">30 minutes</option>
          <option value="60" selected>1 hour</option>
          <option value="90">1.5 hours</option>
          <option value="120">2 hours (max)</option>
        </select>
        <span style="font-size:9px;color:var(--text-lo);white-space:nowrap;">max 2 hrs</span>
      </div>
    </div>
    <div class="pin-popup-btns">
      <button class="pin-popup-cancel" onclick="closePinPopup()">Cancel</button>
      <button class="pin-popup-save" style="background:var(--success)" onclick="saveShareDrop(${wx},${wy})">🔗 Create &amp; Share</button>
    </div>
  `;
  setTimeout(()=>{const inp=document.getElementById('pinNameInput');if(inp)inp.focus();},30);
}

// Pending new share pin data (held while confirm dialog is open)
let _pendingSharePin=null;

function saveShareDrop(wx,wy){
  const name=(document.getElementById('pinNameInput')?.value.trim())||'Shared Location';
  const address=(document.getElementById('pinAddrInput')?.value.trim())||'';
  const timeLimitMins=Math.min(120,Math.max(1,parseInt(document.getElementById('pinTimeLimitSel')?.value||'60')));
  closePinPopup();

  if(sharePins.length>0){
    // Already has one — store pending and ask user
    _pendingSharePin={wx,wy,name,address,timeLimitMins};
    const existing=sharePins[0];
    document.getElementById('replaceExistingName').textContent=existing.name;
    document.getElementById('replaceExistingCode').textContent=existing.code;
    document.getElementById('replaceModal').classList.add('open');
    return;
  }
  _createSharePin(wx,wy,name,address,timeLimitMins);
}

function closeReplaceModal(){
  document.getElementById('replaceModal').classList.remove('open');
  _pendingSharePin=null;
  // Turn off share pin mode since user cancelled
  if(mapSharePinMode)toggleSharePinMode();
}

function confirmReplace(){
  document.getElementById('replaceModal').classList.remove('open');
  if(!_pendingSharePin)return;
  // Delete all existing share pins
  sharePins=[];activeSharePin=null;
  const {wx,wy,name,address,timeLimitMins}=_pendingSharePin;
  _pendingSharePin=null;
  _createSharePin(wx,wy,name,address,timeLimitMins||60);
}

let _sharePinExpireTimer=null;

function _createSharePin(wx,wy,name,address,timeLimitMins){
  timeLimitMins=Math.min(120,Math.max(1,timeLimitMins||60));
  const id=Date.now();
  const code=generateShareCode(id);
  const expiresAt=Date.now()+(timeLimitMins*60*1000);
  const pin={id,name,address,x:wx,y:wy,code,expiresAt,timeLimitMins};
  sharePins=[pin]; // enforce single
  activeSharePin=id;
  renderSharePins();renderMap();
  showToast(`🔗 "${name}" — code: ${code} · expires in ${timeLimitMins}min`,'success');
  setTimeout(()=>openShareModal(id),300);
  _startSharePinExpireTimer();
}

function _startSharePinExpireTimer(){
  if(_sharePinExpireTimer)clearInterval(_sharePinExpireTimer);
  _sharePinExpireTimer=setInterval(()=>{
    const now=Date.now();
    const before=sharePins.length;
    sharePins=sharePins.filter(p=>{
      if(p.expiresAt&&now>=p.expiresAt){
        if(activeSharePin===p.id)activeSharePin=null;
        showToast(`⏱ Share pin "${p.name}" expired and was removed`,'warn');
        return false;
      }
      return true;
    });
    if(sharePins.length!==before){renderSharePins();renderMap();}
    if(!sharePins.length){clearInterval(_sharePinExpireTimer);_sharePinExpireTimer=null;}
  },10000); // check every 10s
}

function renderSharePins(){
  const list=document.getElementById('sharePinsList');
  if(!list)return;
  document.getElementById('sharePinCount').textContent=`(${sharePins.length})`;
  if(!sharePins.length){
    list.innerHTML=`<div style="padding:12px 0;text-align:center;color:var(--text-lo);font-size:10px;font-style:italic">No share pins yet.<br>Enable "Share Location Pin" mode and click the map.</div>`;
    return;
  }
  const now=Date.now();
  list.innerHTML=sharePins.map(p=>{
    let expiryHtml='';
    if(p.expiresAt){
      const minsLeft=Math.max(0,Math.ceil((p.expiresAt-now)/60000));
      const pct=Math.max(0,Math.min(100,((p.expiresAt-now)/(p.timeLimitMins*60000))*100));
      const barColor=pct>50?'#22c55e':pct>20?'#f59e0b':'#ef4444';
      expiryHtml=`
        <div style="margin-top:5px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
            <span style="font-size:9px;color:var(--text-lo);">⏱ Expires in</span>
            <span style="font-size:10px;font-weight:700;color:${barColor};">${minsLeft}min</span>
          </div>
          <div style="height:3px;border-radius:2px;background:var(--sys-border);overflow:hidden;">
            <div style="height:100%;width:${pct}%;background:${barColor};border-radius:2px;transition:width 1s linear;"></div>
          </div>
        </div>`;
    }
    return `
    <div class="share-pin-card ${activeSharePin===p.id?'active-share-pin':''}" onclick="focusSharePin(${p.id})">
      <div class="spc-header">
        <div class="spc-icon">🔗</div>
        <div class="spc-name">${p.name}</div>
      </div>
      <div class="spc-code">${p.code}</div>
      ${p.address?`<div class="spc-addr">📍 ${p.address}</div>`:''}
      ${expiryHtml}
      <div class="spc-actions">
        <button class="spc-btn spc-btn-qr" onclick="openShareModal(${p.id});event.stopPropagation()">📱 QR / Code</button>
        <button class="spc-btn spc-btn-del" onclick="removeSharePin(${p.id});event.stopPropagation()">✕ Remove</button>
      </div>
    </div>
  `}).join('');
}

function focusSharePin(id){
  const p=sharePins.find(sp=>sp.id===id);
  if(!p)return;
  activeSharePin=id;
  if(mapCanvas){mapOffX=mapCanvas.width/2-p.x*mapZoom;mapOffY=mapCanvas.height/2-p.y*mapZoom;}
  renderSharePins();renderMap();
}

function removeSharePin(id){
  sharePins=sharePins.filter(p=>p.id!==id);
  if(activeSharePin===id)activeSharePin=null;
  renderSharePins();renderMap();
  showToast('🗑 Share pin removed','info');
}

// ── QR Modal ──
function openShareModal(id){
  const pin=sharePins.find(p=>p.id===id);
  if(!pin)return;
  _currentShareCode=pin.code;
  document.getElementById('slmPinName').textContent=`📍 ${pin.name}${pin.address?' · '+pin.address:''}`;
  document.getElementById('slmCodeVal').textContent=pin.code;
  const payload=JSON.stringify({app:'emgo',v:1,code:pin.code,name:pin.name,addr:pin.address||'',x:Math.round(pin.x),y:Math.round(pin.y)});
  drawQR(document.getElementById('shareQrCanvas'),payload);
  document.getElementById('shareLocModal').classList.add('open');
}
function closeShareModal(){document.getElementById('shareLocModal').classList.remove('open');}
function copyShareCode(){
  navigator.clipboard.writeText(_currentShareCode).catch(()=>{});
  showToast('✅ Code copied!','success');
}
function downloadShareQR(){
  const c=document.getElementById('shareQrCanvas');
  const a=document.createElement('a');a.download=`emgo-share-${_currentShareCode}.png`;a.href=c.toDataURL();a.click();
  showToast('⬇ QR image saved!','success');
}

// ── Draw share pins on map canvas ──
function drawSharePinMarker(ctx,sx,sy,isActive){
  const scale=Math.min(1.5,Math.max(0.7,mapZoom));
  const R=14*scale;
  ctx.save();
  // Pulse ring
  if(isActive){
    ctx.beginPath();ctx.arc(sx,sy-R*1.4,R*1.5,0,Math.PI*2);
    ctx.strokeStyle='rgba(34,197,94,.35)';ctx.lineWidth=3;ctx.stroke();
  }
  // Pin body
  ctx.shadowColor='rgba(34,197,94,.5)';ctx.shadowBlur=isActive?18:8;ctx.shadowOffsetY=3;
  ctx.beginPath();
  ctx.arc(sx,sy-R*1.55,R,0.55,Math.PI-0.55);
  ctx.lineTo(sx,sy-2);ctx.closePath();
  ctx.fillStyle=isActive?'#22c55e':'#16a34a';ctx.fill();
  ctx.shadowBlur=0;ctx.shadowOffsetY=0;
  // Inner icon
  ctx.fillStyle='rgba(255,255,255,.9)';
  ctx.font=`bold ${R*0.8}px sans-serif`;
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText('🔗',sx,sy-R*1.55);
  ctx.restore();
}

// ── QR Code generator (pure canvas) ──
function drawQR(canvas,data){
  const ctx=canvas.getContext('2d');
  const S=164;
  ctx.clearRect(0,0,S,S);
  const isDark=document.documentElement.getAttribute('data-theme')!=='light';

  // Background
  ctx.fillStyle=isDark?'#1a1a28':'#ffffff';
  ctx.beginPath();ctx.roundRect(0,0,S,S,10);ctx.fill();

  const GRID=25;
  const cell=Math.floor((S-28)/GRID);
  const off=Math.floor((S-cell*GRID)/2);
  const mat=buildQRMatrix(data,GRID);

  // Data modules
  ctx.fillStyle=isDark?'#f0eeff':'#1e1b3a';
  for(let r=0;r<GRID;r++){
    for(let c=0;c<GRID;c++){
      if(mat[r][c]&&!isFinderZone(r,c,GRID)){
        ctx.beginPath();ctx.roundRect(off+c*cell+1,off+r*cell+1,cell-2,cell-2,1);ctx.fill();
      }
    }
  }

  // Finder patterns (green themed)
  [[0,0],[0,GRID-7],[GRID-7,0]].forEach(([fr,fc])=>{
    ctx.fillStyle='#22c55e';
    ctx.beginPath();ctx.roundRect(off+fc*cell,off+fr*cell,7*cell,7*cell,4);ctx.fill();
    ctx.fillStyle=isDark?'#1a1a28':'#fff';
    ctx.beginPath();ctx.roundRect(off+(fc+1)*cell,off+(fr+1)*cell,5*cell,5*cell,2.5);ctx.fill();
    ctx.fillStyle='#22c55e';
    ctx.beginPath();ctx.roundRect(off+(fc+2)*cell,off+(fr+2)*cell,3*cell,3*cell,1.5);ctx.fill();
  });

  // Center logo mark
  const ls=26;const lx=(S-ls)/2,ly=(S-ls)/2;
  ctx.fillStyle=isDark?'#1a1a28':'#fff';
  ctx.beginPath();ctx.roundRect(lx-4,ly-4,ls+8,ls+8,7);ctx.fill();
  ctx.fillStyle='#22c55e';
  ctx.beginPath();ctx.roundRect(lx,ly,ls,ls,6);ctx.fill();
  ctx.fillStyle='#fff';
  ctx.font=`bold ${ls*0.42}px Syne,sans-serif`;
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillText('EG',S/2,S/2);
}

function isFinderZone(r,c,G){
  const s=G-7;
  return (r<8&&c<8)||(r<8&&c>=s)||(r>=s&&c<8);
}

function buildQRMatrix(data,size){
  let seed=strHash(data)>>>0;
  const mat=Array.from({length:size},()=>new Array(size).fill(0));
  for(let r=0;r<size;r++){
    for(let c=0;c<size;c++){
      if(!isFinderZone(r,c,size)&&!(r===6||c===6)){
        seed=(seed*1664525+1013904223)>>>0;
        mat[r][c]=(seed>>15)&1;
      }
    }
  }
  // timing strips
  for(let i=8;i<size-8;i++){mat[6][i]=i%2===0?1:0;mat[i][6]=i%2===0?1:0;}
  return mat;
}

function strHash(s){let h=5381;for(let i=0;i<s.length;i++){h=((h<<5)+h)^s.charCodeAt(i);h>>>=0;}return h;}

// ══════════════════════════════════════════
// TOAST — single, no stacking
// ══════════════════════════════════════════
let _toastTimer=null, _toastEl=null;
function showToast(msg,type='info'){
  const b={success:'rgba(34,197,94,.3)',warn:'rgba(245,158,11,.3)',error:'rgba(239,68,68,.3)',info:'rgba(91,91,214,.2)'};
  const ic={success:'✅',warn:'⚠️',info:'ℹ️',error:'❌'};
  const wrap=document.getElementById('toastWrap');
  // Clear any existing toast immediately
  if(_toastTimer){clearTimeout(_toastTimer);_toastTimer=null;}
  if(_toastEl){_toastEl.remove();_toastEl=null;}
  const t=document.createElement('div');
  t.className='toast';t.style.borderColor=b[type]||'';
  t.innerHTML=`<span>${ic[type]||'ℹ️'}</span>${msg}`;
  wrap.appendChild(t);
  _toastEl=t;
  _toastTimer=setTimeout(()=>{
    t.style.opacity='0';t.style.transform='translateY(8px)';
    setTimeout(()=>{if(t.parentNode)t.remove();if(_toastEl===t)_toastEl=null;},300);
  },2800);
}

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════
window.addEventListener('load',()=>{
  // Data stores populated from Supabase by db.js after auth.
  // Defaults are only used as fallback for brand-new users with no DB rows.
  schedEvents=[];
  canvasObjects=[];
  layers=[{id:1,name:'Floor 1',color:'#5b5bd6',visible:true}];
  attendees=[];
  mapPins=[];

  initCanvas();
  initSchedTimeRange();
  renderSchedule();
  renderAttendees(attendees);
  renderEvents();
  renderLayers();
  renderRecents();
  renderCustomLibrary();
  initDial();
  initMap();
  renderSharePins();
  updateSidebarCards();
  updateSidebarScrollVisibility();
  // Run auto-status check immediately then every 30 seconds
  checkEventStatuses();
  _statusInterval=setInterval(checkEventStatuses,30000);
  updateOverview();
  document.getElementById('shareLocModal').addEventListener('click',function(e){if(e.target===this)closeShareModal();});
  document.getElementById('replaceModal').addEventListener('click',function(e){if(e.target===this)closeReplaceModal();});
  document.getElementById('nev-date').value=new Date().toISOString().split('T')[0];
  // Note: schedule is loaded from Supabase by db.js (localStorage removed to avoid conflicts)
  // init map when switching to map tab
  document.querySelectorAll('.nav-tab').forEach(t=>{
    t.addEventListener('click',()=>{
      if(t.textContent.includes('Map')){setTimeout(()=>{resizeMapCanvas();},50);}
    });
  });
});
window.addEventListener('resize',()=>{resizeCanvas();resizeMapCanvas();});

// ══════════════════════════════════════════
// PER-MODULE HELP
// ══════════════════════════════════════════
const HELP_DATA = {
  venue: {
    icon: '🗺',
    title: 'How to Use the Canvas',
    items: [
      'Select a <b>tool</b> from the toolbar — Room, Table, Stage, Wall, etc.',
      '<b>Click and drag</b> on the canvas to draw an element.',
      'Switch to <b>Select (↖ or V)</b> to move, resize, or rotate elements.',
      '<b>Click</b> an element to show <b>MS Word-style handles</b> — drag corners/edges to resize, drag the circle above to rotate.',
      '<b>Drag empty space</b> to rubber-band select multiple elements at once.',
      '<b>Shift+click</b> to add/remove elements from your selection.',
      '<b>Ctrl+C/X/V</b> to copy/cut/paste · <b>Ctrl+D</b> to duplicate · <b>Ctrl+A</b> select all.',
      '<b>Ctrl+Z/Y</b> to undo/redo · <b>Delete</b> to remove selected.',
      '<b>Arrow keys</b> to nudge elements · <b>Shift+Arrow</b> for larger steps.',
      '<b>G</b> to toggle grid · <b>Right-click</b> for the full context menu.',
      'Use <b>Layers</b> on the right panel for multi-floor layouts.',
    ]
  },
  schedule: {
    icon: '📅',
    title: 'How Scheduling Works',
    items: [
      '<b>Click any time slot</b> in the calendar to add an activity.',
      'Fill in the name, start and end time, then save.',
      'The system <b>auto-detects overlapping</b> events on the same day.',
      'A <b>red conflict badge</b> appears on overlapping events.',
      'Use <b>← →</b> arrows to navigate between weeks.',
      '<b>Hover an event</b> to reveal the delete button.',
    ]
  },
  map: {
    icon: '📍',
    title: 'How QR Sharing Works',
    items: [
      'Enable <b>Share Location Pin</b> mode, then click the map to drop a pin.',
      'Give the pin a <b>name</b> in the popup that appears.',
      'A unique <b>5-letter code</b> is generated for each share pin.',
      'Click <b>QR</b> on a pin card to open the shareable QR code modal.',
      '<b>Only one active share pin</b> per event — new pin replaces the old.',
      'Download or copy the QR to send guests for instant directions.',
    ]
  },
  events: {
    icon: '📋',
    title: 'How Events Works',
    items: [
      'Click <b>＋ Create Event</b> to add a new event with name, type, and date.',
      'Use <b>filter chips</b> to narrow events by type (Pro, Social, etc.).',
      'Switch between <b>Cards</b> and <b>List</b> view using the sub-tabs.',
      '<b>Hover an event card</b> to reveal Edit and Delete options.',
      'Events also appear in the <b>sidebar</b> for quick access.',
    ]
  },
  attendees: {
    icon: '👥',
    title: 'How Attendees Works',
    items: [
      'Click <b>＋ Add Attendee</b> to enter name, email, role, and RSVP.',
      'Status shows <b>Confirmed ✅</b>, <b>Pending ⏳</b>, or <b>Declined ❌</b> at a glance.',
      'Use the <b>search bar</b> to filter by name or email.',
      '<b>Hover a row</b> and click the delete icon to remove an attendee.',
      'Total count updates <b>automatically</b> in the sidebar.',
    ]
  }
};

function openHelp(module) {
  const d = HELP_DATA[module];
  if (!d) return;
  document.getElementById('helpIcon').textContent = d.icon;
  document.getElementById('helpTitle').textContent = d.title;
  document.getElementById('helpList').innerHTML = d.items.map(i => `<li>${i}</li>`).join('');
  document.getElementById('helpModal').classList.add('open');
}
function closeHelp() { document.getElementById('helpModal').classList.remove('open'); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeHelp(); });