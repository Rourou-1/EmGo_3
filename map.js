// ══════════════════════════════════════════════════════════════
//  EmGo — Leaflet.js Map  (map.js)
//  Loaded AFTER app.js, BEFORE db.js.
//  Overrides canvas-based map functions with real interactive map.
//  Uses: OpenStreetMap (free), Nominatim geocoding (free)
// ══════════════════════════════════════════════════════════════

// ── Internal state ──────────────────────────────────────────
let _leafletMap      = null;
let _currentTileLayer = null;
let _pinMarkers      = {};   // localId → L.marker
let _sharePinMarkers = {};   // localId → L.marker
let _tempMarker      = null;
let _mapStyleIdx     = 0;

const MAP_STYLES = [
  { key: 'road',      name: '🗺 Road',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attr: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' },
  { key: 'dark',      name: '🌙 Dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attr: '&copy; <a href="https://carto.com">CARTO</a>' },
  { key: 'satellite', name: '🛰 Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attr: '&copy; <a href="https://www.esri.com">Esri</a>' },
];

// ── Custom pin icon factory ─────────────────────────────────
function _makePinIcon(color, isShare, isActive) {
  const sz  = isActive ? 38 : 32;
  const bg  = isShare ? '#22c55e' : color;
  const sh  = isShare ? '0 4px 14px rgba(34,197,94,.55)' : `0 4px 14px ${color}88`;
  const bdr = isShare ? '#16a34a' : 'rgba(255,255,255,0.35)';
  const inner = isShare
    ? `<span style="font-size:${sz*0.36}px;line-height:1">🔗</span>`
    : `<div style="width:${sz*0.34}px;height:${sz*0.34}px;background:rgba(255,255,255,.85);border-radius:50%"></div>`;
  const html = `
    <div style="
      width:${sz}px;height:${sz}px;
      border-radius:50% 50% 50% 0;
      background:${bg};
      transform:rotate(-45deg);
      display:flex;align-items:center;justify-content:center;
      box-shadow:${sh};
      border:2px solid ${bdr};
      transition:transform .15s">
      <div style="transform:rotate(45deg);display:flex;align-items:center;justify-content:center">${inner}</div>
    </div>`;
  return L.divIcon({ html, className:'', iconSize:[sz,sz], iconAnchor:[sz/2,sz], popupAnchor:[0,-sz+4] });
}

// ── Override initMap ─────────────────────────────────────────
function initMap() {
  // Retry until both Leaflet and the map container are available
  if (!window.L || !document.getElementById('mapCanvas')) {
    setTimeout(initMap, 150);
    return;
  }
  if (_leafletMap) return;   // already initialised — don't double-init
  const container = document.getElementById('mapCanvas');

  // Make container fill its parent
  container.style.cssText = 'position:absolute;inset:0;z-index:1;border-radius:inherit;';

  // Hide tooltip element (Leaflet uses its own)
  const tt = document.getElementById('mapPinTooltip');
  if (tt) tt.style.display = 'none';

  // Init Leaflet map
  _leafletMap = L.map('mapCanvas', {
    center: [14.5995, 120.9842],  // Manila
    zoom: 13,
    zoomControl: false,
    attributionControl: true,
  });

  // Expose on window so the mobile IIFE can call invalidateSize()
  // when the Map tab is first activated (mSwitchTab references window._leafletMap).
  window._leafletMap = _leafletMap;

  // Attribution control in bottom-left
  _leafletMap.attributionControl.setPosition('bottomleft');
  _leafletMap.attributionControl.setPrefix('EmGo · <a href="https://leafletjs.com">Leaflet</a>');

  // Initial tile layer (road)
  _applyMapStyle(0);

  // Click handler
  _leafletMap.on('click', _onMapClick);

  // Handle hidden-panel init: on mobile the map panel is display:none
  // when initMap() runs, so Leaflet measures 0x0 and loads no tiles.
  // We call invalidateSize() shortly after init so the first tile
  // request fires as soon as the container has real dimensions.
  setTimeout(function() {
    if (_leafletMap) _leafletMap.invalidateSize({ animate: false });
  }, 400);

  // Populate event dropdown in loc-modal
  _refreshLocEventDropdown();

  // Render any pins already in memory
  renderMapPins();
}

// ── Apply map style ──────────────────────────────────────────
function _applyMapStyle(idx) {
  _mapStyleIdx = idx;
  if (_currentTileLayer) _leafletMap.removeLayer(_currentTileLayer);
  const s = MAP_STYLES[idx];
  _currentTileLayer = L.tileLayer(s.url, { attribution: s.attr, maxZoom: 19 }).addTo(_leafletMap);
}

function _refreshLocEventDropdown() {
  const sel = document.getElementById('loc-event');
  if (!sel) return;
  sel.innerHTML = '<option value="">— None —</option>';
  eventsData.forEach(e => { sel.innerHTML += `<option value="${e.name}">${e.name}</option>`; });
}

// ── Map click handler ────────────────────────────────────────
function _onMapClick(e) {
  if (!mapPinMode && !mapSharePinMode) return;
  if (typeof isActiveEventFinished === 'function' && isActiveEventFinished()) {
    showToast('🔒 Event is finished — view only. Mark as Upcoming to edit.', 'warn');
    return;
  }
  const { lat, lng } = e.latlng;

  // Ghost temp marker
  if (_tempMarker) { _tempMarker.remove(); _tempMarker = null; }
  _tempMarker = L.marker([lat, lng], {
    icon: _makePinIcon(mapPinMode ? dropPinColor : '#22c55e', mapSharePinMode, false),
    opacity: 0.65,
    zIndexOffset: 900,
  }).addTo(_leafletMap);

  if (mapSharePinMode) _showShareDropPopup(lat, lng);
  else                 _showDropPopup(lat, lng);
}

// ── Pin popup (drop pin) ─────────────────────────────────────
function _popupPos(lat, lng) {
  if (!_leafletMap) return { x: 200, y: 200 };
  const pt  = _leafletMap.latLngToContainerPoint([lat, lng]);
  const cr  = document.getElementById('mapCanvasContainer').getBoundingClientRect();
  let px = pt.x + 16, py = pt.y - 90;
  if (px + 240 > cr.width)  px = pt.x - 254;
  if (py < 6)               py = pt.y + 18;
  if (py + 160 > cr.height) py = cr.height - 166;
  return { x: px, y: py };
}

function _showDropPopup(lat, lng) {
  const p = document.getElementById('pinSavePopup');
  const { x, y } = _popupPos(lat, lng);
  p.style.left = x + 'px'; p.style.top = y + 'px';
  p.style.display = 'block'; p.style.zIndex = '1100';
  p.innerHTML = `
    <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:11px;margin-bottom:7px;color:var(--text-hi)">📍 Name this pin</div>
    <input type="text" id="pinNameInput" placeholder="e.g. Convention Center" autofocus>
    <input type="text" id="pinAddrInput" placeholder="Address (optional)" style="margin-top:0">
    <div style="display:flex;gap:4px;margin-bottom:8px;flex-wrap:wrap">
      ${['#5b5bd6','#f59e0b','#8b5cf6','#ef4444','#14b8a6','#22c55e'].map(c =>
        `<div onclick="selectPopupColor('${c}')" style="width:18px;height:18px;border-radius:3px;background:${c};cursor:pointer;border:2px solid transparent;transition:.15s" data-popup-color="${c}"></div>`
      ).join('')}
    </div>
    <div class="pin-popup-btns">
      <button class="pin-popup-cancel" onclick="closePinPopup()">Cancel</button>
      <button class="pin-popup-save" onclick="_saveDropPin(${lat},${lng})">📍 Save Pin</button>
    </div>`;
  setTimeout(() => { const i = document.getElementById('pinNameInput'); if (i) i.focus(); }, 30);
  selectPopupColor('#5b5bd6');
}

function _showShareDropPopup(lat, lng) {
  const p = document.getElementById('pinSavePopup');
  const { x, y } = _popupPos(lat, lng);
  p.style.left = x + 'px'; p.style.top = y + 'px';
  p.style.display = 'block'; p.style.zIndex = '1100';
  p.innerHTML = `
    <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:11px;margin-bottom:3px;color:var(--success)">🔗 Share Location Pin</div>
    <div style="font-size:9px;color:var(--text-lo);margin-bottom:7px">Generates a QR code &amp; 6-letter code</div>
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
      <button class="pin-popup-save" style="background:var(--success)" onclick="_saveShareDrop(${lat},${lng})">🔗 Create &amp; Share</button>
    </div>`;
  setTimeout(() => { const i = document.getElementById('pinNameInput'); if (i) i.focus(); }, 30);
}

// ── Save regular drop pin ────────────────────────────────────
function _saveDropPin(lat, lng) {
  const name    = (document.getElementById('pinNameInput')?.value.trim()) || 'Unnamed Pin';
  const address = (document.getElementById('pinAddrInput')?.value.trim()) || '';
  const pin = { id: Date.now(), name, address, lat, lng, color: dropPinColor, event: '' };
  mapPins.push(pin);
  if (activeEventId) eventMapPins[activeEventId] = JSON.parse(JSON.stringify(mapPins));
  activeMapPin = pin.id;
  _clearTempMarker();
  closePinPopup();
  renderMapPins();
  if (typeof dbSaveMapPin === 'function') dbSaveMapPin(pin, activeEventId);
  showToast(`📍 "${name}" pinned!`, 'success');
  updateOverview();
}

// ── Save share drop pin ──────────────────────────────────────
function _saveShareDrop(lat, lng) {
  const name    = (document.getElementById('pinNameInput')?.value.trim()) || 'Shared Location';
  const address = (document.getElementById('pinAddrInput')?.value.trim()) || '';
  const timeLimitMins = Math.min(120, Math.max(1, parseInt(document.getElementById('pinTimeLimitSel')?.value || '60')));
  closePinPopup();

  if (sharePins.length > 0) {
    _pendingSharePin = { lat, lng, name, address, timeLimitMins };
    const existing = sharePins[0];
    document.getElementById('replaceExistingName').textContent = existing.name;
    document.getElementById('replaceExistingCode').textContent = existing.code;
    document.getElementById('replaceModal').classList.add('open');
    return;
  }
  _createSharePin(lat, lng, name, address, timeLimitMins);
}

// Override confirmReplace for Leaflet share pins
function confirmReplace() {
  document.getElementById('replaceModal').classList.remove('open');
  if (!_pendingSharePin) return;
  sharePins.forEach(p => { if (typeof dbDeleteSharePin === 'function') dbDeleteSharePin(p.id); });
  sharePins = []; activeSharePin = null;
  const { lat, lng, name, address, timeLimitMins } = _pendingSharePin;
  _pendingSharePin = null;
  _createSharePin(lat, lng, name, address, timeLimitMins || 60);
}

function _createSharePin(lat, lng, name, address, timeLimitMins) {
  timeLimitMins = Math.min(120, Math.max(1, timeLimitMins || 60));
  const id   = Date.now();
  const code = generateShareCode(id);
  const expiresAt = Date.now() + (timeLimitMins * 60 * 1000);
  const pin  = { id, name, address, lat, lng, code, expiresAt, timeLimitMins };
  sharePins  = [pin];
  if (activeEventId) eventSharePins[activeEventId] = JSON.parse(JSON.stringify(sharePins));
  activeSharePin = id;
  _clearTempMarker();
  renderSharePins();
  renderMapPins();  // re-render to add share marker
  showToast(`🔗 "${name}" — code: ${code} · expires in ${timeLimitMins}min`, 'success');
  setTimeout(() => openShareModal(id), 300);
  if (typeof dbSaveSharePin === 'function') dbSaveSharePin(pin, activeEventId);
  _startSharePinExpireTimer();
}

let _leafletShareExpireTimer = null;
function _startSharePinExpireTimer() {
  if (_leafletShareExpireTimer) clearInterval(_leafletShareExpireTimer);
  _leafletShareExpireTimer = setInterval(() => {
    const now = Date.now();
    const before = sharePins.length;
    sharePins = sharePins.filter(p => {
      if (p.expiresAt && now >= p.expiresAt) {
        if (activeSharePin === p.id) activeSharePin = null;
        if (_sharePinMarkers[p.id]) { _sharePinMarkers[p.id].remove(); delete _sharePinMarkers[p.id]; }
        // Remove from DB
        if (typeof dbDeleteSharePin === 'function') dbDeleteSharePin(p.id);
        showToast(`⏱ Share pin "${p.name}" expired and was removed`, 'warn');
        return false;
      }
      return true;
    });
    if (sharePins.length !== before && activeEventId) {
      eventSharePins[activeEventId] = JSON.parse(JSON.stringify(sharePins));
    }
    // Always re-render to tick the countdown display
    renderSharePins();
    if (!sharePins.length) { clearInterval(_leafletShareExpireTimer); _leafletShareExpireTimer = null; }
  }, 1000); // 1-second tick for live mm:ss countdown
}

// ── Close pin popup ──────────────────────────────────────────
function closePinPopup() {
  const p = document.getElementById('pinSavePopup');
  if (p) p.style.display = 'none';
  _clearTempMarker();
}

function _clearTempMarker() {
  if (_tempMarker) { _tempMarker.remove(); _tempMarker = null; }
}

// ── Popup HTML builders ──────────────────────────────────────
function _pinPopupHtml(p) {
  const mapsUrl = `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}&zoom=17`;
  const readonly = typeof isActiveEventFinished === 'function' && isActiveEventFinished();
  const actionBtns = readonly
    ? `<div style="font-size:10px;color:#888;text-align:center;padding:4px 0;font-style:italic">🔒 View only — event is finished</div>`
    : `<div style="display:flex;gap:5px">
        <button onclick="_editPin(${p.id})"
          style="flex:1;padding:5px 8px;border-radius:7px;border:1px solid #ddd;background:#f4f4f8;cursor:pointer;font-size:11px;font-family:'DM Sans',sans-serif;font-weight:600">
          ✏ Edit
        </button>
        <button onclick="removeMapPin(${p.id})"
          style="flex:1;padding:5px 8px;border-radius:7px;border:1px solid #fca5a5;background:#fee2e2;cursor:pointer;font-size:11px;font-family:'DM Sans',sans-serif;font-weight:600;color:#dc2626">
          🗑 Remove
        </button>
      </div>`;
  return `
    <div style="font-family:'DM Sans',sans-serif;min-width:200px;padding:2px">
      <div style="font-weight:700;font-size:13px;margin-bottom:4px;color:#111">${p.name}</div>
      ${p.address ? `<div style="font-size:11px;color:#555;margin-bottom:4px">📍 ${p.address}</div>` : ''}
      ${p.event   ? `<div style="font-size:10px;color:#888;margin-bottom:4px">🎪 ${p.event}</div>` : ''}
      <div style="font-size:9px;color:#aaa;margin-bottom:8px">
        ${p.lat?.toFixed(6)}, ${p.lng?.toFixed(6)} ·
        <a href="${mapsUrl}" target="_blank" style="color:#4b5fce">Open OSM ↗</a>
      </div>
      ${actionBtns}
    </div>`;
}

function _sharePinPopupHtml(p) {
  const mapsUrl = `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}&zoom=17`;
  const readonly = typeof isActiveEventFinished === 'function' && isActiveEventFinished();
  return `
    <div style="font-family:'DM Sans',sans-serif;min-width:200px;padding:2px">
      <div style="font-weight:700;font-size:13px;margin-bottom:4px;color:#111">🔗 ${p.name}</div>
      ${p.address ? `<div style="font-size:11px;color:#555;margin-bottom:4px">📍 ${p.address}</div>` : ''}
      <div style="font-size:12px;font-weight:700;color:#16a34a;margin-bottom:4px;letter-spacing:1.5px">${p.code}</div>
      <div style="font-size:9px;color:#aaa;margin-bottom:8px">
        ${p.lat?.toFixed(6)}, ${p.lng?.toFixed(6)} ·
        <a href="${mapsUrl}" target="_blank" style="color:#16a34a">Open OSM ↗</a>
      </div>
      <div style="display:flex;gap:5px">
        <button onclick="openShareModal(${p.id});if(_leafletMap)_leafletMap.closePopup()"
          style="flex:1;padding:5px 8px;border-radius:7px;border:1px solid #86efac;background:#dcfce7;cursor:pointer;font-size:11px;font-family:'DM Sans',sans-serif;font-weight:600;color:#16a34a">
          📱 QR Code
        </button>
        ${!readonly ? `<button onclick="removeSharePin(${p.id})"
          style="flex:1;padding:5px 8px;border-radius:7px;border:1px solid #fca5a5;background:#fee2e2;cursor:pointer;font-size:11px;font-family:'DM Sans',sans-serif;font-weight:600;color:#dc2626">
          ✕ Remove
        </button>` : ''}
      </div>
      ${readonly ? `<div style="font-size:10px;color:#888;text-align:center;padding:4px 0;font-style:italic">🔒 View only — event is finished</div>` : ''}
    </div>`;
}

// ── renderMapPins ────────────────────────────────────────────
function renderMapPins() {
  // Update sidebar list
  const list     = document.getElementById('pinsList');
  const countEl  = document.getElementById('pinCount');
  if (countEl) countEl.textContent = `(${mapPins.length})`;

  if (list) {
    if (!mapPins.length) {
      list.innerHTML = `<div style="padding:16px 0;text-align:center;color:var(--text-lo);font-size:11px;font-style:italic">No venues pinned yet.<br>Enable "Drop Pin Mode" and click the map.</div>`;
    } else {
      const _mapRO = typeof isActiveEventFinished === 'function' && isActiveEventFinished();
      list.innerHTML = mapPins.map(p => `
        <div class="venue-pin-card ${activeMapPin === p.id ? 'active-pin' : ''}" onclick="_focusPin(${p.id})">
          <div class="vpc-name"><div class="vpc-dot" style="background:${p.color}"></div>${p.name}</div>
          ${p.address ? `<div class="vpc-addr">📍 ${p.address}</div>` : ''}
          ${p.event   ? `<div style="margin-top:3px"><span style="font-size:9px;padding:1px 6px;border-radius:20px;background:var(--primary-dim);color:var(--primary-light)">${p.event}</span></div>` : ''}
          ${_mapRO ? '' : `<button class="vpc-del" onclick="removeMapPin(${p.id},event)">✕</button>`}
        </div>`
      ).join('');
    }
  }

  // Sync Leaflet markers
  if (!_leafletMap) return;

  // Remove old markers
  Object.values(_pinMarkers).forEach(m => m.remove());
  _pinMarkers = {};

  // Add regular pin markers
  mapPins.forEach(p => {
    if (p.lat == null || p.lng == null) return;
    const m = L.marker([p.lat, p.lng], {
      icon: _makePinIcon(p.color, false, p.id === activeMapPin),
      title: p.name,
      zIndexOffset: p.id === activeMapPin ? 500 : 0,
    }).addTo(_leafletMap);
    m.bindPopup(_pinPopupHtml(p), { maxWidth: 260 });
    m.on('click', () => { activeMapPin = p.id; renderMapPins(); });
    _pinMarkers[p.id] = m;
  });

  // Re-render share pin markers (call renderSharePins which handles them)
  _renderShareMarkers();
}

// ── renderSharePins ──────────────────────────────────────────
function renderSharePins() {
  const list     = document.getElementById('sharePinsList');
  const countEl  = document.getElementById('sharePinCount');
  if (countEl) countEl.textContent = `(${sharePins.length})`;

  if (list) {
    if (!sharePins.length) {
      list.innerHTML = `<div style="padding:12px 0;text-align:center;color:var(--text-lo);font-size:10px;font-style:italic">No share pins yet.<br>Enable "Share Location Pin" mode and click the map.</div>`;
    } else {
      const now = Date.now();
      list.innerHTML = sharePins.map(p => {
        let expiryHtml = '';
        if (p.expiresAt) {
          const msLeft   = Math.max(0, p.expiresAt - now);
          const totalMs  = (p.timeLimitMins || 60) * 60 * 1000;
          const pct      = Math.max(0, Math.min(100, (msLeft / totalMs) * 100));
          const barColor = pct > 50 ? '#22c55e' : pct > 20 ? '#f59e0b' : '#ef4444';
          const secsLeft = Math.floor(msLeft / 1000);
          const hh = Math.floor(secsLeft / 3600);
          const mm = Math.floor((secsLeft % 3600) / 60);
          const ss = secsLeft % 60;
          const timeStr = hh > 0
            ? `${hh}h ${String(mm).padStart(2,'0')}m ${String(ss).padStart(2,'0')}s`
            : `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
          expiryHtml = `
            <div style="margin-top:5px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
                <span style="font-size:9px;color:var(--text-lo);">⏱ Expires in</span>
                <span style="font-size:10px;font-weight:700;font-variant-numeric:tabular-nums;color:${barColor};">${timeStr}</span>
              </div>
              <div style="height:3px;border-radius:2px;background:var(--sys-border);overflow:hidden;">
                <div style="height:100%;width:${pct.toFixed(2)}%;background:${barColor};border-radius:2px;"></div>
              </div>
            </div>`;
        }
        return `
        <div class="share-pin-card ${activeSharePin === p.id ? 'active-share-pin' : ''}" onclick="_focusSharePin(${p.id})">
          <div class="spc-header"><div class="spc-icon">🔗</div><div class="spc-name">${p.name}</div></div>
          <div class="spc-code">${p.code}</div>
          ${p.address ? `<div class="spc-addr">📍 ${p.address}</div>` : ''}
          ${expiryHtml}
          <div class="spc-actions">
            <button class="spc-btn spc-btn-qr" onclick="openShareModal(${p.id});event.stopPropagation()">📱 QR / Code</button>
            <button class="spc-btn spc-btn-del" onclick="removeSharePin(${p.id});event.stopPropagation()">✕ Remove</button>
          </div>
        </div>`;
      }).join('');
    }
  }

  _renderShareMarkers();
}

function _renderShareMarkers() {
  if (!_leafletMap) return;
  Object.values(_sharePinMarkers).forEach(m => m.remove());
  _sharePinMarkers = {};
  sharePins.forEach(p => {
    if (p.lat == null || p.lng == null) return;
    const m = L.marker([p.lat, p.lng], {
      icon: _makePinIcon('#22c55e', true, p.id === activeSharePin),
      title: `🔗 ${p.name} · ${p.code}`,
      zIndexOffset: 600,
    }).addTo(_leafletMap);
    m.bindPopup(_sharePinPopupHtml(p), { maxWidth: 260 });
    _sharePinMarkers[p.id] = m;
  });
}

// ── Focus / view pin ─────────────────────────────────────────
function _focusPin(id) {
  const p = mapPins.find(x => x.id === id);
  if (!p || !_leafletMap) return;
  activeMapPin = id;
  if (p.lat != null && p.lng != null) {
    _leafletMap.setView([p.lat, p.lng], Math.max(_leafletMap.getZoom(), 15), { animate: true });
    setTimeout(() => { if (_pinMarkers[id]) _pinMarkers[id].openPopup(); }, 400);
  }
  renderMapPins();
}

function _focusSharePin(id) {
  const p = sharePins.find(x => x.id === id);
  if (!p || !_leafletMap) return;
  activeSharePin = id;
  if (p.lat != null && p.lng != null) {
    _leafletMap.setView([p.lat, p.lng], Math.max(_leafletMap.getZoom(), 15), { animate: true });
    setTimeout(() => { if (_sharePinMarkers[id]) _sharePinMarkers[id].openPopup(); }, 400);
  }
  renderSharePins();
}

// viewMapPin called from sidebar card onclick
function viewMapPin(p) { _focusPin(p.id); }
function focusSharePin(id) { _focusSharePin(id); }

// ── Edit pin in-place ────────────────────────────────────────
function _editPin(id) {
  const p = mapPins.find(x => x.id === id);
  if (!p) return;
  if (_leafletMap) _leafletMap.closePopup();

  const newName = prompt('Edit pin name:', p.name);
  if (newName === null) return;
  const newAddr = prompt('Edit address:', p.address || '');
  if (newAddr === null) return;

  p.name    = newName.trim() || p.name;
  p.address = newAddr.trim();
  if (activeEventId) eventMapPins[activeEventId] = JSON.parse(JSON.stringify(mapPins));
  renderMapPins();
  if (typeof dbUpdateMapPin === 'function') dbUpdateMapPin(p);
  showToast('✅ Pin updated', 'success');
}

// ── Remove map pin ───────────────────────────────────────────
function removeMapPin(id, e) {
  if (e) e.stopPropagation();
  if (_leafletMap) _leafletMap.closePopup();
  if (_pinMarkers[id]) { _pinMarkers[id].remove(); delete _pinMarkers[id]; }
  mapPins = mapPins.filter(p => p.id !== id);
  if (activeEventId) eventMapPins[activeEventId] = JSON.parse(JSON.stringify(mapPins));
  if (activeMapPin === id) activeMapPin = null;
  renderMapPins();
  if (typeof dbDeleteMapPin === 'function') dbDeleteMapPin(id);
  showToast('🗑 Pin removed', 'info');
}

// ── Remove share pin ─────────────────────────────────────────
function removeSharePin(id) {
  if (_leafletMap) _leafletMap.closePopup();
  if (_sharePinMarkers[id]) { _sharePinMarkers[id].remove(); delete _sharePinMarkers[id]; }
  sharePins = sharePins.filter(p => p.id !== id);
  if (activeEventId) eventSharePins[activeEventId] = JSON.parse(JSON.stringify(sharePins));
  if (activeSharePin === id) activeSharePin = null;
  renderSharePins();
  if (typeof dbDeleteSharePin === 'function') dbDeleteSharePin(id);
  showToast('🗑 Share pin removed', 'info');
}

// ── Add venue via modal ──────────────────────────────────────
function addPinnedVenue() {
  const name    = document.getElementById('loc-name').value.trim();
  const address = document.getElementById('loc-address').value.trim();
  if (!name && !address) { showToast('⚠ Enter a name or address', 'warn'); return; }

  const latVal  = parseFloat(document.getElementById('loc-lat').value);
  const lngVal  = parseFloat(document.getElementById('loc-lng').value);
  const linked  = document.getElementById('loc-event').value || '';

  const _place = (lat, lng) => {
    const pin = { id: Date.now(), name: name || address, address, lat, lng, color: selectedLocColor, event: linked };
    mapPins.push(pin);
    if (activeEventId) eventMapPins[activeEventId] = JSON.parse(JSON.stringify(mapPins));
    activeMapPin = pin.id;
    closeModal('loc-modal');
    renderMapPins();
    if (_leafletMap) _leafletMap.setView([lat, lng], 15, { animate: true });
    if (typeof dbSaveMapPin === 'function') dbSaveMapPin(pin, activeEventId);
    showToast(`📍 "${pin.name}" added!`, 'success');
    ['loc-name','loc-address','loc-lat','loc-lng'].forEach(i => { const el = document.getElementById(i); if (el) el.value = ''; });
  };

  if (!isNaN(latVal) && !isNaN(lngVal)) {
    _place(latVal, lngVal);
  } else if (address) {
    showToast('🔍 Geocoding address…', 'info');
    _geocode(address)
      .then(({ lat, lng }) => _place(lat, lng))
      .catch(() => {
        const c = _leafletMap ? _leafletMap.getCenter() : { lat: 14.5995, lng: 120.9842 };
        _place(c.lat, c.lng);
        showToast('📍 Address not found — placed at map center', 'warn');
      });
  } else {
    const c = _leafletMap ? _leafletMap.getCenter() : { lat: 14.5995, lng: 120.9842 };
    _place(c.lat, c.lng);
  }
}

// ── Geocode via Nominatim (free) ─────────────────────────────
async function _geocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
  const res  = await fetch(url, { headers: { 'Accept': 'application/json' } });
  const data = await res.json();
  if (!data || !data.length) throw new Error('Not found');
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

// ── Map search ───────────────────────────────────────────────
async function mapSearchGo() {
  const q = (document.getElementById('mapSearchInput')?.value || '').trim();
  if (!q) { showToast('⚠ Enter a place name or address', 'warn'); return; }

  showToast('🔍 Searching…', 'info');
  try {
    const { lat, lng } = await _geocode(q);
    const pin = { id: Date.now(), name: q, address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng, color: '#f59e0b', event: '' };
    mapPins.push(pin);
    if (activeEventId) eventMapPins[activeEventId] = JSON.parse(JSON.stringify(mapPins));
    activeMapPin = pin.id;
    renderMapPins();
    if (_leafletMap) {
      _leafletMap.setView([lat, lng], 15, { animate: true });
      setTimeout(() => { if (_pinMarkers[pin.id]) _pinMarkers[pin.id].openPopup(); }, 500);
    }
    if (typeof dbSaveMapPin === 'function') dbSaveMapPin(pin, activeEventId);
    showToast(`📍 "${q}" found and pinned!`, 'success');
  } catch {
    showToast(`❌ "${q}" not found. Try a more specific address.`, 'error');
  }
  if (document.getElementById('mapSearchInput')) document.getElementById('mapSearchInput').value = '';
}

// ── Toggle pin modes ─────────────────────────────────────────
function togglePinMode() {
  if (mapSharePinMode) toggleSharePinMode();
  mapPinMode = !mapPinMode;
  const btn  = document.getElementById('mapPinModeBtn');
  const ind  = document.getElementById('mapModeIndicator');
  const prm  = document.getElementById('mapDropPrompt');
  if (mapPinMode) {
    if (btn) { btn.style.background='var(--primary)';btn.style.color='#fff';btn.style.borderColor='var(--primary)'; }
    if (ind) ind.style.display='block';
    if (prm) prm.style.display='block';
    if (_leafletMap) _leafletMap.getContainer().style.cursor='crosshair';
    showToast('📍 Pin mode ON — click the map to drop a pin', 'info');
  } else {
    if (btn) { btn.style.background='';btn.style.color='';btn.style.borderColor=''; }
    if (ind) ind.style.display='none';
    if (prm) prm.style.display='none';
    if (_leafletMap) _leafletMap.getContainer().style.cursor='';
    closePinPopup();
  }
}

function toggleSharePinMode() {
  if (mapPinMode) togglePinMode();
  mapSharePinMode = !mapSharePinMode;
  const btn  = document.getElementById('mapSharePinModeBtn');
  const ind  = document.getElementById('mapShareModeIndicator');
  const prm  = document.getElementById('mapDropPrompt');
  if (mapSharePinMode) {
    if (btn) btn.classList.add('share-mode-active');
    if (ind) ind.style.display='block';
    if (prm) { prm.textContent='🔗 Click to place a Share Location pin'; prm.style.background='rgba(34,197,94,.9)'; prm.style.display='block'; }
    if (_leafletMap) _leafletMap.getContainer().style.cursor='crosshair';
    showToast('🔗 Share Pin mode ON — click the map to place', 'info');
  } else {
    if (btn) btn.classList.remove('share-mode-active');
    if (ind) ind.style.display='none';
    if (prm) { prm.style.display='none'; prm.style.background=''; prm.textContent='📍 Click to drop a pin'; }
    if (_leafletMap) _leafletMap.getContainer().style.cursor='';
    closePinPopup();
  }
}

// ── Map controls ─────────────────────────────────────────────
function mapZoomIn()  { if (_leafletMap) _leafletMap.zoomIn(); }
function mapZoomOut() { if (_leafletMap) _leafletMap.zoomOut(); }

function cycleMapStyle() {
  if (!_leafletMap) return;
  _mapStyleIdx = (_mapStyleIdx + 1) % MAP_STYLES.length;
  _applyMapStyle(_mapStyleIdx);
  const nextName = MAP_STYLES[(_mapStyleIdx + 1) % MAP_STYLES.length].name;
  const btn = document.getElementById('mapSatBtn');
  if (btn) btn.textContent = nextName;
  showToast(`🗺 Style: ${MAP_STYLES[_mapStyleIdx].name}`, 'info');
}

function centerMapDefault() {
  if (_leafletMap) _leafletMap.setView([14.5995, 120.9842], 13, { animate: true });
}

function resizeMapCanvas() {
  if (_leafletMap) setTimeout(() => _leafletMap.invalidateSize(), 60);
}

function renderMap() {
  if (_leafletMap) _leafletMap.invalidateSize();
}

// ── Share modal (override to use lat/lng in QR payload) ──────
function openShareModal(id) {
  const pin = sharePins.find(p => p.id === id);
  if (!pin) return;
  _currentShareCode = pin.code;
  document.getElementById('slmPinName').textContent = `📍 ${pin.name}${pin.address ? ' · ' + pin.address : ''}`;
  document.getElementById('slmCodeVal').textContent  = pin.code;
  const payload = JSON.stringify({
    app: 'emgo', v: 1, code: pin.code,
    name: pin.name, addr: pin.address || '',
    lat: pin.lat, lng: pin.lng,
  });
  drawQR(document.getElementById('shareQrCanvas'), payload);
  document.getElementById('shareLocModal').classList.add('open');
}

// ── Patch switchPanel to invalidate map size on show ─────────
const _origSwitchPanel = switchPanel;
switchPanel = function (name, el) {
  _origSwitchPanel(name, el);
  if (name === 'map' && _leafletMap) setTimeout(() => _leafletMap.invalidateSize(), 80);
};

function saveDrop()           {}
function mapMouseDown()       {}
function mapMouseMove()       {}
function mapMouseUp()         {}
function mapClick()           {}
function mapWheel()           {}
function mapTouchStart()      {}
function mapTouchMove()       {}
function mapTouchEnd()        {}
function drawMapPin()         {}
function drawSharePinMarker() {}
function pickPinAtScreen()    { return null; }

// ══════════════════════════════════════════════════════════════
//  Attendee Status Patch
//  — Only "Pending" (orange) and "Confirmed" (green)
//  — Removes "Checked In" from dropdowns & badge renders
// ══════════════════════════════════════════════════════════════

/** Return CSS colour for an attendee status */
function attendeeStatusColor(status) {
  if (!status) return '#f59e0b';
  const s = status.toLowerCase();
  if (s === 'confirmed') return '#22c55e';
  return '#f59e0b'; // Pending (default)
}

/** Patch a single <select> that controls attendee status */
function _patchStatusSelect(sel) {
  // Remove every option that isn't Pending or Confirmed
  Array.from(sel.options).forEach(opt => {
    const v = opt.value.toLowerCase();
    if (v !== 'pending' && v !== 'confirmed') opt.remove();
  });
  // Ensure both options exist
  const vals = Array.from(sel.options).map(o => o.value.toLowerCase());
  if (!vals.includes('pending'))   { const o = new Option('Pending',   'Pending');   sel.add(o, 0); }
  if (!vals.includes('confirmed')) { const o = new Option('Confirmed', 'Confirmed'); sel.add(o); }

  // Apply colour on change
  const applyColor = () => {
    sel.style.color       = attendeeStatusColor(sel.value);
    sel.style.borderColor = attendeeStatusColor(sel.value);
    sel.style.fontWeight  = '700';
  };
  sel.removeEventListener('change', applyColor);
  sel.addEventListener('change', applyColor);
  applyColor();
}

/** Patch status badge spans/pills already rendered in the DOM */
function _patchStatusBadges(root) {
  root = root || document;
  root.querySelectorAll('[data-status], .attendee-status, .status-badge').forEach(el => {
    const raw = (el.dataset.status || el.textContent || '').trim().toLowerCase();
    if (raw === 'checked in' || raw === 'checkedin') {
      // Demote checked-in to Confirmed
      el.textContent = 'Confirmed';
      if (el.dataset) el.dataset.status = 'Confirmed';
    }
    const color = attendeeStatusColor(el.dataset.status || el.textContent);
    el.style.color           = color;
    el.style.borderColor     = color;
    el.style.backgroundColor = color + '22';
  });
}

/** Run all patches on the current DOM */
function _runAttendeePatch() {
  document.querySelectorAll('select').forEach(sel => {
    const hasStatusOpts = Array.from(sel.options).some(o =>
      ['pending','confirmed','checked in','checkedin'].includes(o.value.toLowerCase())
    );
    if (hasStatusOpts) _patchStatusSelect(sel);
  });
  _patchStatusBadges();
}

// Observe DOM changes so we catch dynamically injected selects / badges
const _attendeeObserver = new MutationObserver(mutations => {
  for (const m of mutations) {
    if (!m.addedNodes.length) continue;
    m.addedNodes.forEach(node => {
      if (node.nodeType !== 1) return;
      // Patch selects inside the added subtree
      node.querySelectorAll && node.querySelectorAll('select').forEach(sel => {
        const hasStatusOpts = Array.from(sel.options).some(o =>
          ['pending','confirmed','checked in','checkedin'].includes(o.value.toLowerCase())
        );
        if (hasStatusOpts) _patchStatusSelect(sel);
      });
      _patchStatusBadges(node);
    });
  }
});
_attendeeObserver.observe(document.body, { childList: true, subtree: true });

// Initial pass once DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _runAttendeePatch);
} else {
  _runAttendeePatch();
}
// ── QR Generation via api.qrserver.com (same approach as mobileMap.html) ──
// Uses an <img> element instead of a canvas — no library needed, always renders correctly.
// The share modal HTML is patched by openShareModal to use #shareQrImg + #shareQrLoader.
function drawQR(canvasOrIgnored, data) {
  const img    = document.getElementById('shareQrImg');
  const loader = document.getElementById('shareQrLoader');
  const canvas = document.getElementById('shareQrCanvas');

  // Show loader, hide stale image/canvas
  if (loader) { loader.style.display = 'flex'; }
  if (img)    { img.style.display = 'none'; img.src = ''; }
  if (canvas) { canvas.style.display = 'none'; }

  const encoded = encodeURIComponent(data);
  const isDark  = document.documentElement.getAttribute('data-theme') !== 'light';
  const fg      = isDark ? 'f0eeff' : '1e1b3a';
  const bg      = isDark ? '1a1a28' : 'ffffff';
  const url     = `https://api.qrserver.com/v1/create-qr-code/?size=164x164&data=${encoded}&color=${fg}&bgcolor=${bg}&qzone=1&format=png`;

  if (img) {
    const tmp = new Image();
    tmp.crossOrigin = 'anonymous';
    tmp.onload = () => {
      img.src = url;
      img.style.display = 'block';
      if (loader) loader.style.display = 'none';
    };
    tmp.onerror = () => {
      // Try without colour params
      const fallback = `https://api.qrserver.com/v1/create-qr-code/?size=164x164&data=${encoded}&qzone=1`;
      img.src = fallback;
      img.style.display = 'block';
      img.onerror = () => {
        if (loader) loader.innerHTML = '<span style="font-size:10px;color:#ef4444">QR unavailable — check connection</span>';
        img.style.display = 'none';
      };
      if (loader) loader.style.display = 'none';
    };
    tmp.src = url;
  }
}

// ── Download QR from the img element ──
function downloadShareQR() {
  const img = document.getElementById('shareQrImg');
  if (!img || !img.src) return;
  // Fetch as blob so cross-origin images can be saved
  fetch(img.src)
    .then(r => r.blob())
    .then(blob => {
      const url  = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `emgo-pin-${_currentShareCode || 'qr'}.png`;
      link.href = url;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    })
    .catch(() => {
      // Fallback: open image in new tab
      window.open(img.src, '_blank');
    });
}