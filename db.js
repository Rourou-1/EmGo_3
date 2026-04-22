// ══════════════════════════════════════════════════════════════
//  EmGo — Database Layer  (db.js)
//  Load AFTER app.js and map.js.
//  Depends on: supabase-client.js → emgoDb
// ══════════════════════════════════════════════════════════════

let currentUser = null;
let _canvasDirty = false;
let _canvasSaveTimer = null;

// ════════════════════════════════════════
//  AUTH
// ════════════════════════════════════════

async function initAuth() {
  try {
    const { data: { session }, error } = await emgoDb.auth.getSession();
    if (error || !session) { _hideAppLoader(); window.location.href = 'Login.html'; return null; }
    currentUser = session.user;
    updateUserUI(currentUser);

    // ── Verify the session actually works with the database ──────
    // A stale/cross-project JWT looks valid but fails FK constraints.
    // We do a lightweight SELECT; if Supabase rejects it with an auth
    // error we sign out instead of crashing later with confusing 409s.
    const { error: pingErr } = await emgoDb
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', currentUser.id)
      .limit(1);

    if (pingErr) {
      const code = pingErr.code || '';
      // PGRST301 = JWT expired; 42501 = insufficient privilege; anything auth-ish
      const isAuthErr = code === 'PGRST301' || code === '42501' ||
        (pingErr.message || '').toLowerCase().includes('jwt') ||
        (pingErr.message || '').toLowerCase().includes('invalid');
      if (isAuthErr) {
        console.warn('Session invalid – redirecting to login:', pingErr.message);
        try { await emgoDb.auth.signOut(); } catch (_) {}
        window.location.href = 'Login.html';
        return null;
      }
      // Non-auth DB errors (e.g. network) — log but continue
      console.warn('DB ping warning (non-fatal):', pingErr.message);
    }

    emgoDb.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') window.location.href = 'Login.html';
    });
    return currentUser;
  } catch (err) {
    console.error('Auth init error:', err);
    window.location.href = 'Login.html';
    return null;
  }
}

function updateUserUI(user) {
  if (!user) return;
  const meta = user.user_metadata || {};
  const fullName = meta.full_name || user.email || '';
  const initials = fullName.split(' ').filter(Boolean).map(n => n[0].toUpperCase()).join('').slice(0, 2) || 'ME';
  const avatar = document.querySelector('.avatar');
  if (avatar) { avatar.textContent = initials; avatar.title = fullName || user.email; }
  const label = document.getElementById('userNameLabel');
  if (label) label.textContent = fullName.split(' ')[0] || '';
}

async function logout() {
  try { await emgoDb.auth.signOut(); } catch (e) {}
  window.location.href = 'Login.html';
}

// ════════════════════════════════════════
//  EVENTS
// ════════════════════════════════════════

async function dbSaveEvent(ev) {
  if (!currentUser) return null;
  const { data, error } = await emgoDb.from('events').insert([{
    user_id: currentUser.id, local_id: ev.id,
    name: ev.name, type: ev.type,
    date: (ev.date && ev.date !== 'TBD') ? ev.date : null,
    time: (ev.time && ev.time !== 'TBD') ? ev.time : null,
    end_time: ev.endTime || null,
    venue: ev.venue || null, attendees_count: ev.attendees ?? null,
    description: ev.desc || null, color: ev.color || '#5b5bd6',
    status: ev.status || 'upcoming', auto_finish: ev.autoFinish !== false,
  }]).select().single();
  if (error) {
    console.error('dbSaveEvent:', error.message);
    // FK violation means the auth session user doesn't exist in auth.users — stale session
    if (error.message && error.message.includes('foreign key')) {
      console.warn('dbSaveEvent: FK violation — session is stale, forcing re-auth.');
      // Caller will handle the null return and trigger logout
    }
    return null;
  }
  return data;
}

async function dbUpdateEvent(ev) {
  if (!currentUser || !ev) return;
  const { error } = await emgoDb.from('events').update({
    name: ev.name, type: ev.type,
    date: (ev.date && ev.date !== 'TBD') ? ev.date : null,
    time: (ev.time && ev.time !== 'TBD') ? ev.time : null,
    end_time: ev.endTime || null,
    venue: ev.venue || null, attendees_count: ev.attendees ?? null,
    description: ev.desc || null, color: ev.color || '#5b5bd6',
    status: ev.status || 'upcoming', auto_finish: ev.autoFinish !== false,
  }).eq('local_id', ev.id).eq('user_id', currentUser.id);
  if (error) console.error('dbUpdateEvent:', error.message);
}

async function dbDeleteEvent(localId) {
  if (!currentUser) return;
  await Promise.all([
    emgoDb.from('events').delete().eq('local_id', localId).eq('user_id', currentUser.id),
    emgoDb.from('attendees').delete().eq('event_local_id', localId).eq('user_id', currentUser.id),
    emgoDb.from('schedule_activities').delete().eq('event_local_id', localId).eq('user_id', currentUser.id),
    emgoDb.from('venue_canvas').delete().eq('event_local_id', localId).eq('user_id', currentUser.id),
    emgoDb.from('map_pins').delete().eq('event_local_id', localId).eq('user_id', currentUser.id),
    emgoDb.from('share_pins').delete().eq('event_local_id', localId).eq('user_id', currentUser.id),
  ]);
}

async function dbLoadEvents() {
  if (!currentUser) return [];
  const { data, error } = await emgoDb.from('events')
    .select('*').eq('user_id', currentUser.id).order('created_at', { ascending: true });
  if (error) { console.error('dbLoadEvents:', error.message); return []; }
  return data || [];
}

// ════════════════════════════════════════
//  ATTENDEES
// ════════════════════════════════════════

async function dbSaveAttendee(att, eventLocalId) {
  if (!currentUser) return null;
  const { data, error } = await emgoDb.from('attendees').insert([{
    user_id: currentUser.id, event_local_id: eventLocalId, local_id: att.id,
    first_name: att.first, last_name: att.last,
    email: att.email || null, role: att.role || 'Guest', status: att.status || 'Pending',
  }]).select().single();
  if (error) { console.error('dbSaveAttendee:', error.message); return null; }
  return data;
}

async function dbUpdateAttendeeStatus(localId, status) {
  if (!currentUser) return;
  const { error } = await emgoDb.from('attendees')
    .update({ status }).eq('local_id', localId).eq('user_id', currentUser.id);
  if (error) console.error('dbUpdateAttendeeStatus:', error.message);
}

async function dbDeleteAttendee(localId) {
  if (!currentUser) return;
  const { error } = await emgoDb.from('attendees')
    .delete().eq('local_id', localId).eq('user_id', currentUser.id);
  if (error) console.error('dbDeleteAttendee:', error.message);
}

async function dbLoadAttendees(eventLocalId) {
  if (!currentUser) return [];
  const { data, error } = await emgoDb.from('attendees')
    .select('*').eq('user_id', currentUser.id).eq('event_local_id', eventLocalId);
  if (error) { console.error('dbLoadAttendees:', error.message); return []; }
  return data || [];
}

// ════════════════════════════════════════
//  SCHEDULE ACTIVITIES
// ════════════════════════════════════════

async function dbSaveActivity(act, eventLocalId) {
  if (!currentUser) return null;
  const { data, error } = await emgoDb.from('schedule_activities').insert([{
    user_id: currentUser.id, event_local_id: eventLocalId, local_id: act.id,
    title: act.title, date_str: act.dateStr || null,
    start_h: act.startH, end_h: act.endH,
    color: act.color || '#5b5bd6', venue: act.venue || null,
  }]).select().single();
  if (error) { console.error('dbSaveActivity:', error.message); return null; }
  return data;
}

async function dbUpdateActivity(act) {
  if (!currentUser || !act) return;
  const { error } = await emgoDb.from('schedule_activities').update({
    title: act.title, date_str: act.dateStr || null,
    start_h: act.startH, end_h: act.endH,
    color: act.color || '#5b5bd6', venue: act.venue || null,
  }).eq('local_id', act.id).eq('user_id', currentUser.id);
  if (error) console.error('dbUpdateActivity:', error.message);
}

async function dbDeleteActivity(localId) {
  if (!currentUser) return;
  const { error } = await emgoDb.from('schedule_activities')
    .delete().eq('local_id', localId).eq('user_id', currentUser.id);
  if (error) console.error('dbDeleteActivity:', error.message);
}

async function dbLoadActivities(eventLocalId) {
  if (!currentUser) return [];
  const { data, error } = await emgoDb.from('schedule_activities')
    .select('*').eq('user_id', currentUser.id).eq('event_local_id', eventLocalId)
    .order('start_h', { ascending: true });
  if (error) { console.error('dbLoadActivities:', error.message); return []; }
  return data || [];
}

// ════════════════════════════════════════
//  VENUE CANVAS
// ════════════════════════════════════════

async function dbSaveCanvas(eventLocalId, objects, layersArr) {
  if (!currentUser || !eventLocalId) return false;
  try {
    const { error } = await emgoDb.from('venue_canvas').upsert({
      user_id: currentUser.id,
      event_local_id: eventLocalId,
      objects: JSON.parse(JSON.stringify(objects || [])),
      layers_data: JSON.parse(JSON.stringify(layersArr || [])),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,event_local_id' });
    if (error) {
      console.error('dbSaveCanvas:', error.message);
      // FK constraint means session is stale — force re-auth
      if (error.message && error.message.includes('foreign key')) {
        console.warn('dbSaveCanvas: FK violation — session may be stale.');
        try { await emgoDb.auth.signOut(); } catch (_) {}
        window.location.href = 'Login.html';
      }
      return false;
    }
    return true;
  } catch (err) { console.error('dbSaveCanvas exception:', err); return false; }
}

async function dbLoadCanvas(eventLocalId) {
  if (!currentUser || !eventLocalId) return null;
  try {
    const { data, error } = await emgoDb.from('venue_canvas')
      .select('objects, layers_data')
      .eq('user_id', currentUser.id)
      .eq('event_local_id', eventLocalId)
      .maybeSingle();
    if (error) { console.error('dbLoadCanvas:', error.message); return null; }
    if (!data) return null;
    return { objects: data.objects || [], layers: data.layers_data || [] };
  } catch (err) { console.error('dbLoadCanvas exception:', err); return null; }
}

// ════════════════════════════════════════
//  MAP PINS
// ════════════════════════════════════════

async function dbSaveMapPin(pin, eventLocalId) {
  if (!currentUser) return null;
  const { data, error } = await emgoDb.from('map_pins').insert([{
    user_id: currentUser.id, event_local_id: eventLocalId, local_id: pin.id,
    name: pin.name, address: pin.address || null,
    lat: pin.lat ?? 14.5995, lng: pin.lng ?? 120.9842,
    color: pin.color || '#5b5bd6', event_name: pin.event || null,
  }]).select().single();
  if (error) { console.error('dbSaveMapPin:', error.message); return null; }
  return data;
}

async function dbUpdateMapPin(pin) {
  if (!currentUser || !pin) return;
  const { error } = await emgoDb.from('map_pins').update({
    name: pin.name, address: pin.address || null,
    lat: pin.lat, lng: pin.lng,
    color: pin.color || '#5b5bd6', event_name: pin.event || null,
  }).eq('local_id', pin.id).eq('user_id', currentUser.id);
  if (error) console.error('dbUpdateMapPin:', error.message);
}

async function dbDeleteMapPin(localId) {
  if (!currentUser) return;
  const { error } = await emgoDb.from('map_pins')
    .delete().eq('local_id', localId).eq('user_id', currentUser.id);
  if (error) console.error('dbDeleteMapPin:', error.message);
}

async function dbLoadMapPins(eventLocalId) {
  if (!currentUser) return [];
  const { data, error } = await emgoDb.from('map_pins')
    .select('*').eq('user_id', currentUser.id).eq('event_local_id', eventLocalId)
    .order('created_at', { ascending: true });
  if (error) { console.error('dbLoadMapPins:', error.message); return []; }
  return data || [];
}

// ════════════════════════════════════════
//  SHARE PINS
// ════════════════════════════════════════

async function dbSaveSharePin(pin, eventLocalId) {
  if (!currentUser) return null;
  const { data, error } = await emgoDb.from('share_pins').insert([{
    user_id: currentUser.id, event_local_id: eventLocalId, local_id: pin.id,
    name: pin.name, address: pin.address || null,
    lat: pin.lat ?? 14.5995, lng: pin.lng ?? 120.9842, code: pin.code,
    expires_at: pin.expiresAt ? new Date(pin.expiresAt).toISOString() : null,
    time_limit_mins: pin.timeLimitMins || null,
  }]).select().single();
  if (error) { console.error('dbSaveSharePin:', error.message); return null; }
  return data;
}

async function dbDeleteSharePin(localId) {
  if (!currentUser) return;
  const { error } = await emgoDb.from('share_pins')
    .delete().eq('local_id', localId).eq('user_id', currentUser.id);
  if (error) console.error('dbDeleteSharePin:', error.message);
}

async function dbLoadSharePins(eventLocalId) {
  if (!currentUser) return [];
  const { data, error } = await emgoDb.from('share_pins')
    .select('*').eq('user_id', currentUser.id).eq('event_local_id', eventLocalId)
    .order('created_at', { ascending: true });
  if (error) { console.error('dbLoadSharePins:', error.message); return []; }
  return data || [];
}

// ════════════════════════════════════════
//  ARRIVALS  (cross-user: attendee writes, pin-owner reads)
// ════════════════════════════════════════

// Called by mobileMap.html when the scanning user arrives at a destination.
// pin_owner_user_id = the user who owns the share pin (User A)
// Requires Supabase RLS:
//   INSERT: authenticated users can insert any row
//   SELECT: users can only read rows where pin_owner_user_id = auth.uid()
async function dbRecordArrival({ pinCode, pinOwnerUserId, eventLocalId, arrivedName, arrivedEmail, lat, lng }) {
  // Any authenticated user can insert — no currentUser check needed,
  // but we do need a valid Supabase session (handled by mobileMap auth)
  const { data, error } = await emgoDb.from('arrivals').insert([{
    pin_code:            pinCode,
    pin_owner_user_id:   pinOwnerUserId,
    event_local_id:      eventLocalId ? Number(eventLocalId) : null,
    arrived_name:        arrivedName  || 'Unknown',
    arrived_email:       arrivedEmail || null,
    arrived_lat:         lat  ?? null,
    arrived_lng:         lng  ?? null,
    arrived_at:          new Date().toISOString(),
  }]).select().single();
  if (error) { console.error('dbRecordArrival:', error.message); return null; }
  return data;
}

// ════════════════════════════════════════
//  ATTENDEES REALTIME LISTENER
//  Listens for new rows in the `attendees` table where user_id = currentUser.id.
//  This fires both when the organiser manually adds someone AND when a mobile
//  attendee's arrival inserts a row directly into attendees (the new primary path).
//  We track which local_ids we already know about so we only notify on genuinely
//  new rows that arrived from another device / the mobile scanner.
// ════════════════════════════════════════

let _attendeesChannel  = null;
let _knownAttendeeIds  = new Set(); // local_ids seen at load time — we skip those

function _seedKnownAttendees() {
  _knownAttendeeIds.clear();
  Object.values(eventAttendees).forEach(list => {
    (list || []).forEach(a => { if (a.id) _knownAttendeeIds.add(Number(a.id)); });
  });
}

function dbListenAttendees() {
  if (!currentUser) return;
  if (_attendeesChannel) {
    emgoDb.removeChannel(_attendeesChannel);
    _attendeesChannel = null;
  }
  _attendeesChannel = emgoDb
    .channel('attendees-' + currentUser.id)
    .on('postgres_changes', {
      event:  'INSERT',
      schema: 'public',
      table:  'attendees',
      filter: `user_id=eq.${currentUser.id}`,
    }, async (payload) => {
      if (!payload.new) return;
      const row      = payload.new;
      const localId  = Number(row.local_id);

      // Skip attendees we already knew about at load time
      if (_knownAttendeeIds.has(localId)) return;
      _knownAttendeeIds.add(localId); // prevent double-notification

      const evId   = row.event_local_id ? Number(row.event_local_id) : null;
      const first  = row.first_name || 'Unknown';
      const last   = row.last_name  || 'Attendee';
      const email  = row.email      || '';

      // Find target event
      const ev = evId
        ? eventsData.find(e => e.id === evId)
        : eventsData[0];
      if (!ev) return;

      // Dedup: check in-memory list (handles race where row was already pulled via manual add)
      const existing = (eventAttendees[ev.id] || []);
      const isDupe = existing.some(a =>
        (email && a.email && a.email.toLowerCase() === email.toLowerCase()) ||
        (a.first.toLowerCase() === first.toLowerCase() && a.last.toLowerCase() === last.toLowerCase())
      );
      if (isDupe) return;

      // Build attendee object and update in-memory state
      const newAtt = { id: localId || Date.now(), first, last, email, role: row.role || 'Guest', status: row.status || 'Confirmed' };
      if (!eventAttendees[ev.id]) eventAttendees[ev.id] = [];
      eventAttendees[ev.id].push(newAtt);

      if (ev.id === activeEventId) {
        attendees = JSON.parse(JSON.stringify(eventAttendees[ev.id]));
        renderAttendees(attendees);
        updateOverview();
      }

      // ── Notification ──────────────────────────────────────────
      const msg = `${first} ${last} has arrived at ${ev.name}!`;
      showToast('🎉 ' + msg, 'success');

      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification('EmGo — New Arrival 🎉', {
            body: msg,
            tag: 'emgo-arrival-' + localId,
            requireInteraction: false,
          });
        } catch (e) { console.warn('Notification error:', e); }
      }
    })
    .subscribe();
}

function dbStopListenAttendees() {
  if (_attendeesChannel) {
    emgoDb.removeChannel(_attendeesChannel);
    _attendeesChannel = null;
  }
}

// ── Keep arrivals listener + dbAddAttendeeFromArrival as FALLBACK ─────────
// If the mobile's direct attendees insert is blocked by RLS, the mobile falls
// back to inserting into `arrivals`. This handler picks that up and adds the
// person to attendees from the organiser's side.

let _arrivalsChannel = null;
function dbListenArrivals(onArrival) {
  if (!currentUser) return;
  if (_arrivalsChannel) { emgoDb.removeChannel(_arrivalsChannel); _arrivalsChannel = null; }
  _arrivalsChannel = emgoDb
    .channel('arrivals-fallback-' + currentUser.id)
    .on('postgres_changes', {
      event:  'INSERT',
      schema: 'public',
      table:  'arrivals',
      filter: `pin_owner_user_id=eq.${currentUser.id}`,
    }, (payload) => { if (payload.new) onArrival(payload.new); })
    .subscribe();
}

function dbStopListenArrivals() {
  if (_arrivalsChannel) { emgoDb.removeChannel(_arrivalsChannel); _arrivalsChannel = null; }
}

async function dbAddAttendeeFromArrival(row) {
  if (!currentUser) return;
  const eventLocalId = row.event_local_id;
  const fullName     = (row.arrived_name || 'Unknown Attendee').trim();
  const parts        = fullName.split(/\s+/);
  const first        = parts[0] || 'Unknown';
  const last         = parts.slice(1).join(' ') || 'Attendee';
  const email        = row.arrived_email || '';
  const ev = eventLocalId
    ? eventsData.find(e => e.id === Number(eventLocalId))
    : eventsData[0];
  if (!ev) { console.warn('dbAddAttendeeFromArrival: event not found for', eventLocalId); return; }
  const existing = (eventAttendees[ev.id] || []);
  const isDupe = existing.some(a =>
    (email && a.email && a.email.toLowerCase() === email.toLowerCase()) ||
    (a.first.toLowerCase() === first.toLowerCase() && a.last.toLowerCase() === last.toLowerCase())
  );
  if (isDupe) { console.info('dbAddAttendeeFromArrival: duplicate skipped for', fullName); return; }
  const newAtt = { id: Date.now(), first, last, email, role: 'Guest', status: 'Confirmed' };
  await dbSaveAttendee(newAtt, ev.id);
  if (!eventAttendees[ev.id]) eventAttendees[ev.id] = [];
  eventAttendees[ev.id].push(newAtt);
  _knownAttendeeIds.add(newAtt.id); // prevent double-notification from attendees listener
  if (ev.id === activeEventId) {
    attendees = JSON.parse(JSON.stringify(eventAttendees[ev.id]));
    renderAttendees(attendees);
    updateOverview();
  }
  return newAtt;
}

// ════════════════════════════════════════
//  LOAD ALL USER DATA
// ════════════════════════════════════════

async function loadUserData() {
  const dbEvRows = await dbLoadEvents();

  // ── New user: save the defaults to DB so they persist ──
  if (!dbEvRows.length) {
    // Guard: if user previously had events (they deleted all), show empty state
    const hadEvents = localStorage.getItem('emgo_had_events_' + currentUser.id);
    if (hadEvents) {
      eventsData = [];
      activeEventId = null;
      _refreshAllUI();
      showToast('📋 No events found. Create one to get started!', 'info');
      return;
    }
    // Provide one starter event for new users
    const starterEv = {
      id: Date.now(), name: 'My First Event', type: 'professional',
      date: new Date().toISOString().split('T')[0],
      time: '09:00', endTime: '17:00',
      endDate: new Date().toISOString().split('T')[0],
      venue: 'TBD', attendees: null, desc: '',
      color: '#5b5bd6', status: 'upcoming', autoFinish: true, finishedAt: null,
    };
    eventsData = [starterEv];
    eventVenueObjects[starterEv.id] = getDefaultCanvasObjects();
    eventSchedule[starterEv.id]     = getDefaultSchedule();
    eventAttendees[starterEv.id]    = [];
    eventMapPins[starterEv.id]      = [];
    eventSharePins[starterEv.id]    = [];
    eventLayers[starterEv.id]       = getDefaultLayers();

    canvasObjects = JSON.parse(JSON.stringify(eventVenueObjects[starterEv.id]));
    layers        = JSON.parse(JSON.stringify(eventLayers[starterEv.id]));
    schedEvents   = JSON.parse(JSON.stringify(eventSchedule[starterEv.id]));
    attendees     = [];
    mapPins       = [];
    sharePins     = [];
    activeEventId = starterEv.id;
    activeLayerId = layers[0]?.id || 1;

    // Persist to DB — if this fails with FK error the session is stale
    const savedEv = await dbSaveEvent(starterEv);
    if (!savedEv) {
      // dbSaveEvent returned null → DB rejected the write (likely stale/cross-project JWT)
      // Render UI with local state so the app is usable, but warn the user.
      _refreshAllUI();
      showToast(
        '⚠ Could not sync to database. Your session may be expired — please log out and back in.',
        'error'
      );
      // Auto-logout after a short delay so the user sees the message
      setTimeout(async () => {
        try { await emgoDb.auth.signOut(); } catch (_) {}
        window.location.href = 'Login.html';
      }, 4000);
      return;
    }

    // Canvas save is fire-and-forget; errors already logged inside dbSaveCanvas
    dbSaveCanvas(starterEv.id, canvasObjects, layers);
    localStorage.setItem('emgo_had_events_' + currentUser.id, '1');

    _refreshAllUI();
    showToast('👋 Welcome to EmGo! Your workspace is ready.', 'success');
    return;
  }

  // ── Existing user: load all data in parallel ──
  localStorage.setItem('emgo_had_events_' + currentUser.id, '1');
  eventsData = dbEvRows.map(row => ({
    id        : Number(row.local_id),
    name      : row.name,
    type      : row.type || 'professional',
    date      : row.date || 'TBD',
    time      : row.time || 'TBD',
    endTime   : row.end_time || '',
    endDate   : row.date || 'TBD',
    venue     : row.venue || 'TBD',
    attendees : row.attendees_count ?? null,
    desc      : row.description || '',
    color     : row.color || '#5b5bd6',
    status    : row.status || 'upcoming',
    autoFinish: row.auto_finish !== false,
    finishedAt: null,
  }));

  await Promise.all(eventsData.map(async ev => {
    const [atts, acts, canvas, pins, sPins] = await Promise.all([
      dbLoadAttendees(ev.id),
      dbLoadActivities(ev.id),
      dbLoadCanvas(ev.id),
      dbLoadMapPins(ev.id),
      dbLoadSharePins(ev.id),
    ]);

    eventAttendees[ev.id] = atts.map(row => ({
      id: Number(row.local_id), first: row.first_name, last: row.last_name,
      email: row.email || '', role: row.role || 'Guest', status: row.status || 'Pending',
    }));

    eventSchedule[ev.id] = acts.map(row => ({
      id: Number(row.local_id), title: row.title,
      dateStr: row.date_str || '', startH: row.start_h, endH: row.end_h,
      color: row.color || '#5b5bd6', venue: row.venue || '',
    }));

    // Canvas
    if (canvas && canvas.objects && canvas.objects.length > 0) {
      eventVenueObjects[ev.id] = canvas.objects;
      eventLayers[ev.id]       = (canvas.layers && canvas.layers.length > 0)
        ? canvas.layers
        : [{ id: ev.id * 100 + 1, name: 'Floor 1', color: '#5b5bd6', visible: true }];
    } else {
      eventVenueObjects[ev.id] = [];
      eventLayers[ev.id]       = [{ id: ev.id * 100 + 1, name: 'Floor 1', color: '#5b5bd6', visible: true }];
    }

    // Map pins
    eventMapPins[ev.id] = pins.map(row => ({
      id: Number(row.local_id), name: row.name, address: row.address || '',
      lat: row.lat, lng: row.lng, color: row.color || '#5b5bd6', event: row.event_name || '',
    }));

    // Share pins
    eventSharePins[ev.id] = sPins.map(row => {
      const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : null;
      if (expiresAt && expiresAt <= Date.now()) {
        dbDeleteSharePin(row.local_id).catch(() => {});
        return null;
      }
      return {
        id: Number(row.local_id), name: row.name, address: row.address || '',
        lat: row.lat, lng: row.lng, code: row.code || '',
        expiresAt, timeLimitMins: row.time_limit_mins || null,
      };
    }).filter(Boolean);
  }));

  // Activate first event
  const firstEv = eventsData[0];
  if (firstEv) {
    activeEventId  = firstEv.id;
    canvasObjects  = JSON.parse(JSON.stringify(eventVenueObjects[firstEv.id] || []));
    layers         = JSON.parse(JSON.stringify(eventLayers[firstEv.id] || [{ id: 1, name: 'Floor 1', color: '#5b5bd6', visible: true }]));
    schedEvents    = JSON.parse(JSON.stringify(eventSchedule[firstEv.id] || []));
    attendees      = JSON.parse(JSON.stringify(eventAttendees[firstEv.id] || []));
    mapPins        = JSON.parse(JSON.stringify(eventMapPins[firstEv.id] || []));
    sharePins      = JSON.parse(JSON.stringify(eventSharePins[firstEv.id] || []));
    activeSharePin = sharePins[0]?.id || null;
    activeLayerId  = layers[0]?.id || 1;
  }

  _refreshAllUI();
  if (sharePins.length > 0 && typeof _startSharePinExpireTimer === 'function') {
    _startSharePinExpireTimer();
  }

  // ── Request notification permission so User A gets browser push alerts ──
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  // ── Seed the set of attendee IDs we already know about ──────────────────
  // Any new INSERT to `attendees` after this point is a genuine arrival.
  _seedKnownAttendees();

  // ── PRIMARY: listen for attendees inserted directly by the mobile scanner ──
  dbListenAttendees();

  // ── FALLBACK: if cross-user RLS blocks direct attendees insert, the mobile
  //    writes to `arrivals` instead. Pick that up and add to attendees here. ──
  dbListenArrivals(async (row) => {
    const att = await dbAddAttendeeFromArrival(row);
    if (att) {
      const evName = eventsData.find(e => e.id === Number(row.event_local_id))?.name || 'your event';
      const msg = att.first + ' ' + att.last + ' has arrived at ' + evName + '!';
      showToast('🎉 ' + msg, 'success');
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification('EmGo — New Arrival 🎉', {
            body: msg,
            tag: 'emgo-arrival-fallback-' + (att.id || Date.now()),
            requireInteraction: false,
          });
        } catch (notifErr) { console.warn('Notification error:', notifErr); }
      }
    }
  });

  showToast('☁ All data synced from Supabase', 'success');
}

// ── Refresh all UI panels at once ──
function _refreshAllUI() {
  renderEvents();
  updateSidebarCards();
  renderSchedule();
  renderAttendees(attendees);
  renderLayers();
  render();
  renderMapPins();
  renderSharePins();
  updateOverview();
  checkEventStatuses();
}

// ════════════════════════════════════════
//  CANVAS AUTO-SAVE (debounced 6 sec)
// ════════════════════════════════════════

const _origSaveUndo = saveUndo;
saveUndo = function () {
  _origSaveUndo();
  _scheduleCanvasSave();
};

function _scheduleCanvasSave() {
  _canvasDirty = true;
  if (_canvasSaveTimer) clearTimeout(_canvasSaveTimer);
  _canvasSaveTimer = setTimeout(() => {
    if (_canvasDirty && currentUser && activeEventId) {
      dbSaveCanvas(activeEventId, canvasObjects, layers);
      _canvasDirty = false;
    }
  }, 1500); // reduced from 6000ms for near-instant saves
}

// Flush canvas immediately — called from onMouseUp after any drag/resize/rotate
function _flushCanvasSave() {
  if (!_canvasDirty || !currentUser || !activeEventId) return;
  if (_canvasSaveTimer) { clearTimeout(_canvasSaveTimer); _canvasSaveTimer = null; }
  dbSaveCanvas(activeEventId, canvasObjects, layers);
  _canvasDirty = false;
}

// ════════════════════════════════════════
//  FUNCTION WRAPPERS
// ════════════════════════════════════════

// ── loadEventData — save canvas + share pins before switching ──
const _origLoadEventData = loadEventData;
loadEventData = function (evId) {
  if (activeEventId && currentUser) {
    // Persist canvas of the event we're leaving (fire-and-forget)
    dbSaveCanvas(
      activeEventId,
      JSON.parse(JSON.stringify(canvasObjects)),
      JSON.parse(JSON.stringify(layers))
    ).catch(() => {});
    _canvasDirty = false;
    if (_canvasSaveTimer) { clearTimeout(_canvasSaveTimer); _canvasSaveTimer = null; }
    // Save share pins state
    eventSharePins[activeEventId] = JSON.parse(JSON.stringify(sharePins));
  }
  // Restore share pins for target event
  sharePins      = JSON.parse(JSON.stringify(eventSharePins[evId] || []));
  activeSharePin = sharePins[0]?.id || null;

  _origLoadEventData(evId);
  // renderSharePins is not called by origLoadEventData, call it now
  renderSharePins();
};

// ── createNewEvent ──
const _origCreateNewEvent = createNewEvent;
createNewEvent = function () {
  _origCreateNewEvent();
  const newEv = eventsData[eventsData.length - 1];
  if (newEv) {
    eventSharePins[newEv.id] = [];
    dbSaveEvent(newEv);
  }
  updateOverview();
};

// ── deleteEvent ──
const _origDeleteEvent = deleteEvent;
deleteEvent = function (id) {
  // Show the confirm dialog first (synchronous DOM append)
  _origDeleteEvent(id);
  // Now patch the confirm button so DB delete only fires after user clicks Yes
  const btn = document.getElementById('_delConfirm');
  if (btn) {
    const prevOnclick = btn.onclick;
    btn.onclick = () => {
      dbDeleteEvent(id);
      delete eventSharePins[id];
      if (prevOnclick) prevOnclick.call(btn);
      updateOverview();
    };
  }
};

// ── saveEditEvent ──
const _origSaveEditEvent = saveEditEvent;
saveEditEvent = function () {
  _origSaveEditEvent();
  const id = parseInt(document.getElementById('edit-ev-id')?.value);
  const ev = eventsData.find(e => e.id === id);
  if (ev) dbUpdateEvent(ev);
  updateOverview();
};

// ── markEventFinished ──
const _origMarkEventFinished = markEventFinished;
markEventFinished = function (id) {
  _origMarkEventFinished(id);
  const ev = eventsData.find(e => e.id === id);
  // Must persist — when toggling back to upcoming, autoFinish=false must reach DB
  if (ev) dbUpdateEvent(ev);
  updateOverview();
};

// ── addAttendee ──
const _origAddAttendee = addAttendee;
addAttendee = function () {
  const before = attendees.length;
  _origAddAttendee();
  if (attendees.length > before) {
    const newAtt = attendees[attendees.length - 1];
    // Register this ID so the Realtime listener doesn't fire a "new arrival" notification
    if (newAtt.id) _knownAttendeeIds.add(Number(newAtt.id));
    dbSaveAttendee(newAtt, activeEventId);
  }
  updateOverview();
};

// ── removeAtt ──
const _origRemoveAtt = removeAtt;
removeAtt = function (id) {
  dbDeleteAttendee(id);
  _origRemoveAtt(id);
  updateOverview();
};

// ── updateAttStatus ──
const _origUpdateAttStatus = updateAttStatus;
updateAttStatus = function (id, status) {
  _origUpdateAttStatus(id, status);
  dbUpdateAttendeeStatus(id, status);
};

// ── deleteSchedEvent for the dataStore lol──
const _origDeleteSchedEvent = deleteSchedEvent;
deleteSchedEvent = function (id, e) {
  dbDeleteActivity(id);
  _origDeleteSchedEvent(id, e);
  updateOverview();
};

// ── addActivity (no-conflict path) for the dataStore lol ──
const _origAddActivity = addActivity;
addActivity = function () {
  const before = schedEvents.length;
  _origAddActivity();
  if (schedEvents.length > before) {
    const act = schedEvents[schedEvents.length - 1];
    dbSaveActivity(act, activeEventId);
    updateOverview();
  }
};

// ── forceAddActivity (conflict override path) for the dataStore lol ──
const _origForceAddActivity = forceAddActivity;
forceAddActivity = function () {
  const before = schedEvents.length;
  _origForceAddActivity();
  if (schedEvents.length > before) {
    const act = schedEvents[schedEvents.length - 1];
    dbSaveActivity(act, activeEventId);
    updateOverview();
  }
};

// ── saveEditActivity ──
const _origSaveEditActivity = saveEditActivity;
saveEditActivity = function () {
  _origSaveEditActivity();
  const id  = parseInt(document.getElementById('edit-act-id')?.value);
  const act = schedEvents.find(x => x.id === id);
  if (act) dbUpdateActivity(act);
  updateOverview();
};

// ── addLayer ──
const _origAddLayer = addLayer;
addLayer = function () {
  _origAddLayer();
  dbSaveCanvas(activeEventId, canvasObjects, layers);
  updateOverview();
};

// ── deleteLayer ──
const _origDeleteLayer = deleteLayer;
deleteLayer = function (id) {
  _origDeleteLayer(id);
  dbSaveCanvas(activeEventId, canvasObjects, layers);
  updateOverview();
};

// ════════════════════════════════════════
//  INIT
// ════════════════════════════════════════

window.addEventListener('load', async () => {
  _showAppLoader();
  const user = await initAuth();
  if (!user) return;
  await loadUserData();
  _hideAppLoader();
  _checkNewUserOnboarding(user);
});

function _showAppLoader() {
  let el = document.getElementById('appLoadingScreen');
  if (el) { el.style.display = 'flex'; return; }
  el = document.createElement('div');
  el.id = 'appLoadingScreen';
  el.innerHTML = `<div style="
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  gap:14px;

  padding:26px 30px;
  border-radius:16px;

  background: var(--sys-surface);
  border: 1px solid var(--sys-border);
  box-shadow: 0 10px 30px rgba(0,0,0,.35);

  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
">

  <!-- EmGo Loader Mark (consistent with m-logo-mark) -->
  <div style="
    width:44px;
    height:44px;
    border-radius:10px;

    background: linear-gradient(
      135deg,
      var(--primary),
      var(--violet)
    );

    display:flex;
    align-items:center;
    justify-content:center;

    box-shadow: 0 0 12px var(--primary-glow);

    animation: emgoSpin 1.1s linear infinite;
  ">
    <div style="
      width:18px;
      height:18px;
      border-radius:50%;
      border:2px solid rgba(255,255,255,.35);
      border-top:2px solid #fff;
    "></div>
  </div>

  <!-- Brand -->
  <div style="
    font-family:'Syne', sans-serif;
    font-weight:800;
    font-size:15px;
    color: var(--text-hi);
    letter-spacing:-.3px;
  ">
    EmGo
  </div>

  <!-- Dots -->
  <div style="display:flex;gap:6px;">
    <div class="em-dot"></div>
    <div class="em-dot" style="animation-delay:.2s"></div>
    <div class="em-dot" style="animation-delay:.4s"></div>
  </div>

  <!-- Loading Text -->
  <div style="
    font-family:'DM Sans', sans-serif;
    font-size:12px;
    color: var(--text-md);
    letter-spacing:.2px;
  ">
    Loading your events…
  </div>

</div>

<style>
@keyframes emgoSpin {
  to { transform: rotate(360deg); }
}

.em-dot {
  width:6px;
  height:6px;
  border-radius:50%;
  background: var(--primary-light);
  opacity:.4;
  animation: emBlink 1.2s infinite ease-in-out;
}

@keyframes emBlink {
  0%, 80%, 100% { opacity:.2; transform: scale(.8); }
  40% { opacity:1; transform: scale(1); }
}
</style>`;
  el.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:var(--sys-bg,#13111f);';
  if (!document.getElementById('_loaderStyles')) {
    const s = document.createElement('style'); s.id = '_loaderStyles';
    s.textContent = '@keyframes _lspin{to{transform:rotate(360deg);}} @keyframes _ldotBounce{0%,80%,100%{transform:scale(0.6);opacity:.4}40%{transform:scale(1);opacity:1}} ._ldot{width:9px;height:9px;border-radius:50%;background:var(--primary,#5b5bd6);animation:_ldotBounce 1.2s infinite ease-in-out both;}';
    document.head.appendChild(s);
  }
  document.body.appendChild(el);
}

function _hideAppLoader() {
  const el = document.getElementById('appLoadingScreen');
  if (!el) return;
  el.style.transition = 'opacity .35s ease'; el.style.opacity = '0';
  setTimeout(() => { if (el.parentNode) el.remove(); }, 380);
}

// ════════════════════════════════════════
//  NEW USER ONBOARDING POPUP
// ════════════════════════════════════════

function _checkNewUserOnboarding(user) {
  if (!user) return;
  const key = 'emgo_onboarding_seen_' + user.id;
  if (localStorage.getItem(key)) return; // already seen

  // Only show for accounts created recently (within last 5 minutes) OR if eventsData is empty
  const createdAt = user.created_at ? new Date(user.created_at).getTime() : 0;
  const isNewAccount = (Date.now() - createdAt) < 5 * 60 * 1000 || eventsData.length === 0;
  if (!isNewAccount) {
    localStorage.setItem(key, '1');
    return;
  }

  // Show the popup after a short delay for smoother entry
  setTimeout(() => _showOnboardingPopup(key), 800);
}

function _showOnboardingPopup(storageKey) {
  const overlay = document.createElement('div');
  overlay.id = 'onboardingOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.65);backdrop-filter:blur(6px);animation:fadeIn .3s ease;';
  overlay.innerHTML = `
    <div style="background:var(--sys-surface2);border:1px solid var(--sys-border);border-radius:20px;padding:36px 32px 28px;max-width:380px;width:90%;box-shadow:0 32px 80px rgba(0,0,0,.6);text-align:center;animation:slideUp .35s cubic-bezier(.22,1,.36,1);">
      <div style="width:64px;height:64px;background:var(--primary-dim);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 18px;font-size:28px;">👋</div>
      <div style="font-family:'Syne',sans-serif;font-size:20px;font-weight:800;color:var(--text-hi);margin-bottom:8px;">Welcome to EmGo!</div>
      <div style="font-size:13px;color:var(--text-lo);line-height:1.7;margin-bottom:24px;">
        Looks like you're new here.<br>Would you like a quick tour of the app?
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <button id="_onboardYes" style="width:100%;height:46px;border-radius:12px;border:none;background:var(--primary);color:#fff;font-family:'Syne',sans-serif;font-size:14px;font-weight:700;cursor:pointer;transition:opacity .15s;">
          ✨ Yes, show me around!
        </button>
        <button id="_onboardNo" style="width:100%;height:40px;border-radius:12px;border:1px solid var(--sys-border);background:var(--sys-surface3);color:var(--text-md);font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;cursor:pointer;transition:opacity .15s;">
          No thanks, I'll explore on my own
        </button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  document.getElementById('_onboardYes').onclick = () => {
    localStorage.setItem(storageKey, '1');
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity .25s';
    setTimeout(() => { overlay.remove(); window.location.href = 'onboarding.html'; }, 250);
  };
  document.getElementById('_onboardNo').onclick = () => {
    localStorage.setItem(storageKey, '1');
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity .25s';
    setTimeout(() => overlay.remove(), 250);
    showToast('👍 You\'re all set! Explore EmGo at your own pace.', 'info');
  };
}