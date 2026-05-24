// ===== CCS SIT-IN MONITORING SYSTEM =====
// Supabase-powered — replace keys if you ever rotate them

const SUPABASE_URL     = 'https://ckqpukjqwvmlhhjlmrzw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrcXB1a2pxd3ZtbGhoamxtcnp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1Mjc5ODEsImV4cCI6MjA5NTEwMzk4MX0.xd1vjswsMq4aDNq-EPdH2uFNgAGt9BNwIgP1AXTVv80';

const _db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== AUTH =====
const Auth = {
  async login(idNumber, password) {
    const { data, error } = await _db
      .from('users')
      .select('*')
      .eq('id_number', idNumber)
      .eq('password', password)
      .single();
    if (error || !data) return null;
    sessionStorage.setItem('ccs_session', JSON.stringify(data));
    return data;
  },

  async register(fields) {
    const { data: existing } = await _db
      .from('users').select('id').eq('id_number', fields.idNumber).maybeSingle();
    if (existing) return { error: 'ID Number already registered.' };

    const { data, error } = await _db.from('users').insert([{
      id_number:          fields.idNumber,
      password:           fields.password,
      first_name:         fields.firstName,
      last_name:          fields.lastName,
      middle_name:        fields.middleName || '',
      email:              fields.email || '',
      address:            fields.address || '',
      course:             fields.course || 'N/A',
      course_level:       parseInt(fields.courseLevel) || 0,
      role:               'student',
      remaining_sessions: 30
    }]).select().single();

    if (error) return { error: error.message };
    return { success: true, user: data };
  },

  logout() {
    sessionStorage.removeItem('ccs_session');
    const inPages = window.location.pathname.includes('/pages/');
    window.location.href = inPages ? '../login.html' : 'login.html';
  },

  current() {
    try { return JSON.parse(sessionStorage.getItem('ccs_session')); }
    catch { return null; }
  },

  isAdmin() { const u = this.current(); return u && u.role === 'admin'; },

  // Synchronous guard — call at top of page, then use returned user
  require(adminOnly = false) {
    const u = this.current();
    if (!u) { window.location.href = '../login.html'; return null; }
    if (adminOnly && u.role !== 'admin') { window.location.href = '../pages/student-dashboard.html'; return null; }
    return u;
  },

  // Refresh session from DB (call after updates that change remainingSessions etc.)
  async refresh() {
    const u = this.current();
    if (!u) return null;
    const { data } = await _db.from('users').select('*').eq('id_number', u.id_number).single();
    if (data) sessionStorage.setItem('ccs_session', JSON.stringify(data));
    return data;
  }
};

// ===== USERS =====
const Users = {
  async getAll() {
    const { data } = await _db.from('users').select('*').order('last_name');
    return (data || []).map(_mapUser);
  },

  async find(idNumber) {
    const { data } = await _db.from('users').select('*').eq('id_number', idNumber).maybeSingle();
    return data ? _mapUser(data) : null;
  },

  async update(idNumber, fields) {
    const mapped = {};
    if (fields.firstName         !== undefined) mapped.first_name         = fields.firstName;
    if (fields.lastName          !== undefined) mapped.last_name          = fields.lastName;
    if (fields.middleName        !== undefined) mapped.middle_name        = fields.middleName;
    if (fields.email             !== undefined) mapped.email              = fields.email;
    if (fields.address           !== undefined) mapped.address            = fields.address;
    if (fields.course            !== undefined) mapped.course             = fields.course;
    if (fields.courseLevel       !== undefined) mapped.course_level       = parseInt(fields.courseLevel) || 0;
    if (fields.remainingSessions !== undefined) mapped.remaining_sessions = Math.max(0, parseInt(fields.remainingSessions) || 0);
    if (fields.password          !== undefined) mapped.password           = fields.password;

    const { data, error } = await _db.from('users').update(mapped).eq('id_number', idNumber).select().single();
    if (error) return { error: error.message };

    const session = Auth.current();
    if (session && session.id_number === idNumber) {
      sessionStorage.setItem('ccs_session', JSON.stringify(data));
    }
    return { success: true, user: _mapUser(data) };
  },

  async resetSessions(idNumber, count = 30) {
    return this.update(idNumber, { remainingSessions: count });
  }
};

// ===== SIT-IN =====
const SitIn = {
  async getAll() {
    const { data } = await _db.from('sit_ins').select('*').order('created_at', { ascending: false });
    return (data || []).map(_mapSitin);
  },

  async getActive() {
    const { data } = await _db.from('sit_ins').select('*').eq('status', 'active');
    return (data || []).map(_mapSitin);
  },

  async getByStudent(idNumber) {
    const { data } = await _db.from('sit_ins').select('*').eq('student_id', idNumber).order('created_at', { ascending: false });
    return (data || []).map(_mapSitin);
  },

  async getPending() {
    const { data } = await _db.from('sit_ins').select('*').eq('status', 'pending').order('created_at', { ascending: false });
    return (data || []).map(_mapSitin);
  },

  async start(studentId, studentName, purpose, lab) {
    const { data: active } = await _db.from('sit_ins').select('id').eq('student_id', studentId).eq('status', 'active').maybeSingle();
    if (active) return { error: 'Student already has an active sit-in session.' };

    const { data: user } = await _db.from('users').select('remaining_sessions').eq('id_number', studentId).single();
    if (!user || user.remaining_sessions <= 0) return { error: 'No remaining sessions.' };

    const { data: sitin, error } = await _db.from('sit_ins').insert([{
      student_id:   studentId,
      student_name: studentName,
      purpose,
      lab,
      time_in:  new Date().toISOString(),
      time_out: null,
      status:   'active',
      date:     new Date().toLocaleDateString()
    }]).select().single();

    if (error) return { error: error.message };
    await _db.from('users').update({ remaining_sessions: user.remaining_sessions - 1 }).eq('id_number', studentId);
    await Auth.refresh();
    return { success: true, sitin: _mapSitin(sitin) };
  },

  async request(studentId, studentName, purpose, lab) {
    const { data: active } = await _db.from('sit_ins').select('id').eq('student_id', studentId).eq('status', 'active').maybeSingle();
    if (active) return { error: 'Student already has an active sit-in session.' };
    const { data: pending } = await _db.from('sit_ins').select('id').eq('student_id', studentId).eq('status', 'pending').maybeSingle();
    if (pending) return { error: 'You already have a pending sit-in request.' };

    const { data: sitin, error } = await _db.from('sit_ins').insert([{
      student_id:   studentId,
      student_name: studentName,
      purpose,
      lab,
      time_in:      null,
      time_out:     null,
      status:       'pending',
      date:         new Date().toLocaleDateString(),
      requested_at: new Date().toISOString()
    }]).select().single();

    if (error) return { error: error.message };
    return { success: true, sitin: _mapSitin(sitin) };
  },

  async approve(sitinId) {
    const { data: sitin } = await _db.from('sit_ins').select('*').eq('id', sitinId).eq('status', 'pending').maybeSingle();
    if (!sitin) return { error: 'Pending request not found.' };

    const { data: user } = await _db.from('users').select('remaining_sessions').eq('id_number', sitin.student_id).single();
    if (!user || user.remaining_sessions <= 0) return { error: 'No remaining sessions for this student.' };

    await _db.from('sit_ins').update({ status: 'active', time_in: new Date().toISOString() }).eq('id', sitinId);
    await _db.from('users').update({ remaining_sessions: user.remaining_sessions - 1 }).eq('id_number', sitin.student_id);
    return { success: true };
  },

  async decline(sitinId) {
    const { error } = await _db.from('sit_ins').update({ status: 'declined' }).eq('id', sitinId);
    if (error) return { error: error.message };
    return { success: true };
  },

  async end(sitinId) {
    const { error } = await _db.from('sit_ins').update({ status: 'done', time_out: new Date().toISOString() }).eq('id', sitinId);
    if (error) return { error: error.message };
    return { success: true };
  },

  formatTime(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  },

  formatDuration(timeIn, timeOut) {
    if (!timeIn) return '—';
    const end = timeOut ? new Date(timeOut) : new Date();
    const diff = Math.max(0, Math.floor((end - new Date(timeIn)) / 60000));
    const h = Math.floor(diff / 60), m = diff % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }
};

// ===== ANNOUNCEMENTS =====
const Announcements = {
  async getAll() {
    const { data } = await _db.from('announcements').select('*').order('created_at', { ascending: false });
    return (data || []).map(a => ({ ...a, id: a.id }));
  },

  async post(title, message) {
    const { data, error } = await _db.from('announcements').insert([{
      title, message,
      date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }]).select().single();
    if (error) return null;
    // Notify all students
    const { data: students } = await _db.from('users').select('id_number').eq('role', 'student');
    if (students && students.length) {
      const rows = students.map(s => ({
        student_id: s.id_number,
        title: '📢 New Announcement',
        message: `${title}: ${message}`,
        type: 'announcement',
        is_read: false,
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }));
      await _db.from('notifications').insert(rows);
    }
    return data;
  },

  async delete(id) {
    await _db.from('announcements').delete().eq('id', id);
  }
};

// ===== FEEDBACK =====
const Feedback = {
  async getAll() {
    const { data } = await _db.from('feedback').select('*').order('created_at', { ascending: false });
    return (data || []).map(f => ({ ...f, studentId: f.student_id, studentName: f.student_name }));
  },

  async getByStudent(idNumber) {
    const { data } = await _db.from('feedback').select('*').eq('student_id', idNumber).order('created_at', { ascending: false });
    return (data || []).map(f => ({ ...f, studentId: f.student_id, studentName: f.student_name }));
  },

  async post(studentId, studentName, message) {
    const { data, error } = await _db.from('feedback').insert([{
      student_id:   studentId,
      student_name: studentName,
      message,
      date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }]).select().single();
    if (error) return null;
    return { ...data, studentId: data.student_id, studentName: data.student_name };
  }
};

// ===== REWARDS =====
const Rewards = {
  async getAll() {
    const { data } = await _db.from('rewards').select('*').order('created_at', { ascending: false });
    return (data || []).map(r => ({ ...r, studentId: r.student_id }));
  },

  async getByStudent(idNumber) {
    const { data } = await _db.from('rewards').select('*').eq('student_id', idNumber).order('created_at', { ascending: false });
    return (data || []).map(r => ({ ...r, studentId: r.student_id }));
  },

  async add(studentId, points, reason) {
    const { data, error } = await _db.from('rewards').insert([{
      student_id: studentId,
      points:     parseInt(points),
      reason,
      date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }]).select().single();
    if (error) return null;
    await _db.from('notifications').insert([{
      student_id: studentId,
      title:      '🏆 Reward Received',
      message:    `You earned ${points} points! Reason: ${reason}`,
      type:       'reward',
      is_read:    false,
      date: new Date().toLocaleDateString(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }]);
    return { ...data, studentId: data.student_id };
  },

  async getTotalPoints(idNumber) {
    const list = await this.getByStudent(idNumber);
    return list.reduce((sum, r) => sum + r.points, 0);
  }
};

// ===== ANALYTICS =====
const Analytics = {
  async getRoomUsage() {
    const { data } = await _db.from('sit_ins').select('lab');
    const usage = {};
    (data || []).forEach(s => { usage[s.lab] = (usage[s.lab] || 0) + 1; });
    return Object.entries(usage).sort((a, b) => b[1] - a[1]);
  },

  async getTopStudents() {
    const { data } = await _db.from('sit_ins').select('student_id, student_name');
    const usage = {};
    (data || []).forEach(s => {
      if (!usage[s.student_id]) usage[s.student_id] = { name: s.student_name, count: 0 };
      usage[s.student_id].count++;
    });
    return Object.entries(usage).map(([id, d]) => ({ id, name: d.name, sessions: d.count })).sort((a, b) => b.sessions - a.sessions);
  },

  async getTotalSessions() {
    const { count } = await _db.from('sit_ins').select('*', { count: 'exact', head: true });
    return count || 0;
  },

  async getActiveSessions() {
    const { count } = await _db.from('sit_ins').select('*', { count: 'exact', head: true }).eq('status', 'active');
    return count || 0;
  },

  async getAverageDuration() {
    const { data } = await _db.from('sit_ins').select('time_in, time_out').eq('status', 'done').not('time_out', 'is', null);
    if (!data || !data.length) return 0;
    const total = data.reduce((sum, s) => {
      const mins = Math.floor((new Date(s.time_out) - new Date(s.time_in)) / 60000);
      return sum + mins;
    }, 0);
    return Math.round(total / data.length);
  }
};

// ===== RESERVATIONS =====
const Reservations = {
  async getAll() {
    const { data } = await _db.from('reservations').select('*').order('created_at', { ascending: false });
    return (data || []).map(_mapReservation);
  },

  async getByStudent(idNumber) {
    const { data } = await _db.from('reservations').select('*').eq('student_id', idNumber).order('created_at', { ascending: false });
    return (data || []).map(_mapReservation);
  },

  async getPending() {
    const { data } = await _db.from('reservations').select('*').eq('status', 'reserved').order('created_at', { ascending: false });
    return (data || []).map(_mapReservation);
  },

  async isAvailable(lab, pc, date, start, end) {
    const { data } = await _db.from('reservations').select('pcs, start_time, end_time').eq('lab', lab).eq('date', date).neq('status', 'declined');
    const toMin = t => { if (!t) return 0; const [h, m] = t.split(':'); return parseInt(h) * 60 + parseInt(m); };
    const s = toMin(start), e = toMin(end);
    for (const r of (data || [])) {
      const pcs = Array.isArray(r.pcs) ? r.pcs : JSON.parse(r.pcs || '[]');
      if (!pcs.includes(pc)) continue;
      const rs = toMin(r.start_time), re = toMin(r.end_time);
      if (!(e <= rs || s >= re)) return false;
    }
    return true;
  },

  async post(studentId, studentName, lab, pcs, date, startTime, endTime, purpose) {
    const { data, error } = await _db.from('reservations').insert([{
      student_id:   studentId,
      student_name: studentName,
      lab,
      pcs:          pcs,
      date,
      start_time:   startTime,
      end_time:     endTime,
      purpose:      purpose || '',
      status:       'reserved'
    }]).select().single();
    if (error) return null;
    return _mapReservation(data);
  },

  async approve(resId) {
    const { data: res } = await _db.from('reservations').select('*').eq('id', resId).eq('status', 'reserved').maybeSingle();
    if (!res) return { error: 'Reservation not found.' };
    const startRes = await SitIn.start(res.student_id, res.student_name, res.purpose || '', res.lab);
    if (startRes.error) return { error: startRes.error };
    await _db.from('reservations').update({ status: 'approved', sitin_id: startRes.sitin.id }).eq('id', resId);
    return { success: true, sitin: startRes.sitin };
  },

  async decline(resId) {
    const { error } = await _db.from('reservations').update({ status: 'declined' }).eq('id', resId);
    if (error) return { error: error.message };
    return { success: true };
  }
};

// ===== NOTIFICATIONS =====
const Notifications = {
  async getByStudent(idNumber) {
    const { data } = await _db.from('notifications').select('*').eq('student_id', idNumber).order('created_at', { ascending: false });
    return (data || []).map(n => ({ ...n, studentId: n.student_id, read: n.is_read }));
  },

  async markAsRead(id) {
    await _db.from('notifications').update({ is_read: true }).eq('id', id);
  },

  async clearAll(studentId) {
    await _db.from('notifications').delete().eq('student_id', studentId);
  }
};

// ===== INTERNAL MAPPERS =====
// Map snake_case DB columns → camelCase used in HTML templates
function _mapUser(u) {
  if (!u) return null;
  return {
    ...u,
    idNumber:          u.id_number,
    firstName:         u.first_name,
    lastName:          u.last_name,
    middleName:        u.middle_name,
    remainingSessions: u.remaining_sessions,
    courseLevel:       u.course_level
  };
}

function _mapSitin(s) {
  if (!s) return null;
  return {
    ...s,
    studentId:   s.student_id,
    studentName: s.student_name,
    timeIn:      s.time_in,
    timeOut:     s.time_out,
    requestedAt: s.requested_at
  };
}

function _mapReservation(r) {
  if (!r) return null;
  return {
    ...r,
    studentId:   r.student_id,
    studentName: r.student_name,
    startTime:   r.start_time,
    endTime:     r.end_time,
    pcs:         Array.isArray(r.pcs) ? r.pcs : (r.pcs ? JSON.parse(r.pcs) : [])
  };
}

// ===== UI HELPERS =====
function showAlert(id, message, type = 'danger') {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `alert alert-${type} show`;
  el.innerHTML = `<span>${type === 'success' ? '✅' : '⚠️'}</span> ${message}`;
  setTimeout(() => { el.className = 'alert'; }, 4000);
}

function openModal(id)  { document.getElementById(id)?.classList.add('active'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('active'); }

function setNavUser() {
  const u = Auth.current();
  if (!u) return;
  const el = document.getElementById('nav-user-name');
  if (el) el.textContent = (u.first_name || u.firstName || '') + ' ' + (u.last_name || u.lastName || '');
}

// ===== SEED ADMIN (run once from browser console) =====
async function seedAdmin() {
  const { data: existing } = await _db.from('users').select('id').eq('id_number', 'admin').maybeSingle();
  if (existing) { console.log('Admin already exists.'); return; }
  const { error } = await _db.from('users').insert([{
    id_number: 'admin', password: 'admin123',
    first_name: 'Admin', last_name: 'CCS', middle_name: '',
    role: 'admin', course: 'N/A', course_level: 0,
    email: 'admin@ccs.edu', address: 'UC Main Campus',
    remaining_sessions: 9999
  }]);
  if (error) console.error('Seed error:', error.message);
  else console.log('✅ Admin created. Login: admin / admin123');
}