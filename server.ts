import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { db, initDatabase, hashPassword, verifyPassword } from './server/db.js';
import { getErpConfig, updateErpConfig, searchErpReferences } from './server/erp.js';

initDatabase();

const app = express();
app.use(express.json({ limit: '15mb' }));

interface AuthUser {
  id: number;
  employee_id: string;
  name: string;
  email: string;
  department: string;
  role: 'staff' | 'supervisor' | 'manager' | 'admin';
  supervisor_id: number | null;
  status: string;
}

interface AuthedRequest extends Request {
  user?: AuthUser;
}

function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return -1;
  return h * 60 + m;
}

function formatDurationId(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h} Jam ${m} Menit`;
  if (h > 0) return `${h} Jam`;
  return `${m} Menit`;
}

function formatDateId(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function authMiddleware(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Sesi tidak valid. Silakan login kembali.' });
    return;
  }

  const session = db
    .prepare(
      `SELECT s.token, s.expires_at, u.id, u.employee_id, u.name, u.email, u.department, u.role, u.supervisor_id, u.status
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`
    )
    .get(token) as (AuthUser & { token: string; expires_at: string }) | undefined;

  if (!session || new Date(session.expires_at).getTime() < Date.now() || session.status !== 'Active') {
    if (session) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.status(401).json({ error: 'Sesi telah berakhir. Silakan login kembali.' });
    return;
  }

  req.user = {
    id: session.id,
    employee_id: session.employee_id,
    name: session.name,
    email: session.email,
    department: session.department,
    role: session.role,
    supervisor_id: session.supervisor_id,
    status: session.status,
  };
  next();
}

function getScopedUserIds(user: AuthUser): number[] | null {
  if (user.role === 'manager' || user.role === 'admin') return null; // all
  if (user.role === 'supervisor') {
    const subs = db.prepare('SELECT id FROM users WHERE supervisor_id = ?').all(user.id) as Array<{ id: number }>;
    return [user.id, ...subs.map((s) => s.id)];
  }
  return [user.id];
}

// --- AUTH ROUTES ---
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    res.status(400).json({ error: 'Email dan password wajib diisi.' });
    return;
  }

  const user = db
    .prepare("SELECT * FROM users WHERE (LOWER(email) = LOWER(?) OR LOWER(employee_id) = LOWER(?)) AND status = 'Active'")
    .get(email.trim(), email.trim()) as (AuthUser & { password_hash: string }) | undefined;

  if (!user || !verifyPassword(password, user.password_hash)) {
    res.status(401).json({ error: 'Email/Username atau password tidak sesuai.' });
    return;
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(); // 12h session expiration
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, user.id, expiresAt);

  const supervisor = user.supervisor_id
    ? (db.prepare('SELECT name FROM users WHERE id = ?').get(user.supervisor_id) as { name: string } | undefined)
    : undefined;

  res.json({
    token,
    expiresAt,
    user: {
      id: user.id,
      employee_id: user.employee_id,
      name: user.name,
      email: user.email,
      department: user.department,
      role: user.role,
      supervisor_id: user.supervisor_id,
      supervisor_name: supervisor?.name ?? null,
      status: user.status,
    },
  });
});

app.post('/api/auth/logout', authMiddleware, (req: AuthedRequest, res) => {
  const token = req.headers.authorization?.slice(7);
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.json({ ok: true });
});

app.get('/api/auth/me', authMiddleware, (req: AuthedRequest, res) => {
  const user = req.user!;
  const supervisor = user.supervisor_id
    ? (db.prepare('SELECT name FROM users WHERE id = ?').get(user.supervisor_id) as { name: string } | undefined)
    : undefined;
  res.json({ user: { ...user, supervisor_name: supervisor?.name ?? null } });
});

// --- CATEGORIES ---
app.get('/api/categories', authMiddleware, (_req, res) => {
  const rows = db.prepare('SELECT * FROM work_categories ORDER BY id ASC').all();
  res.json(rows);
});

app.post('/api/categories', authMiddleware, (req: AuthedRequest, res) => {
  if (req.user!.role !== 'admin') {
    res.status(403).json({ error: 'Hanya Administrator yang dapat mengelola jenis pekerjaan.' });
    return;
  }
  const { category_name, department } = req.body as { category_name?: string; department?: string };
  if (!category_name?.trim()) {
    res.status(400).json({ error: 'Nama jenis pekerjaan wajib diisi.' });
    return;
  }
  try {
    const info = db
      .prepare("INSERT INTO work_categories (category_name, department, status) VALUES (?, ?, 'Active')")
      .run(category_name.trim(), department || 'All');
    res.status(201).json(db.prepare('SELECT * FROM work_categories WHERE id = ?').get(info.lastInsertRowid));
  } catch {
    res.status(409).json({ error: 'Jenis pekerjaan sudah terdaftar.' });
  }
});

app.patch('/api/categories/:id', authMiddleware, (req: AuthedRequest, res) => {
  if (req.user!.role !== 'admin') {
    res.status(403).json({ error: 'Akses ditolak.' });
    return;
  }
  const { status, category_name, department } = req.body as {
    status?: string;
    category_name?: string;
    department?: string;
  };
  const existing = db.prepare('SELECT * FROM work_categories WHERE id = ?').get(req.params.id) as
    | { category_name: string; department: string; status: string }
    | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Kategori tidak ditemukan.' });
    return;
  }
  db.prepare('UPDATE work_categories SET category_name = ?, department = ?, status = ? WHERE id = ?').run(
    category_name ?? existing.category_name,
    department ?? existing.department,
    status ?? existing.status,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM work_categories WHERE id = ?').get(req.params.id));
});

// --- ERP INTEGRATION LAYER ---
app.get('/api/erp/references', authMiddleware, (req, res) => {
  const type = typeof req.query.type === 'string' ? req.query.type : undefined;
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  res.json(searchErpReferences(type, q));
});

app.get('/api/erp/config', authMiddleware, (_req, res) => {
  res.json(getErpConfig());
});

app.put('/api/erp/config', authMiddleware, (req: AuthedRequest, res) => {
  if (req.user!.role !== 'admin') {
    res.status(403).json({ error: 'Hanya Administrator yang dapat mengubah konfigurasi ERP.' });
    return;
  }
  const { mode, baseUrl, authType } = req.body as {
    mode: 'SIMULATION' | 'PRODUCTION';
    baseUrl: string;
    authType: string;
  };
  res.json(updateErpConfig(mode, baseUrl, authType));
});

// --- WORKLOGS CRUD ---
app.get('/api/worklogs', authMiddleware, (req: AuthedRequest, res) => {
  const scopedIds = getScopedUserIds(req.user!);
  const { date, startDate, endDate, userId, department, categoryId, referenceType } = req.query;

  let sql = `
    SELECT w.*, u.name as user_name, u.employee_id, u.department,
           c.category_name,
           r.reference_type, r.reference_number, r.product_code, r.product_name
    FROM worklogs w
    JOIN users u ON u.id = w.user_id
    JOIN work_categories c ON c.id = w.category_id
    LEFT JOIN work_references r ON r.id = w.reference_id
    WHERE 1=1
  `;
  const params: unknown[] = [];

  if (scopedIds !== null) {
    sql += ` AND w.user_id IN (${scopedIds.map(() => '?').join(',')})`;
    params.push(...scopedIds);
  }
  if (typeof date === 'string' && date) {
    sql += ' AND w.work_date = ?';
    params.push(date);
  }
  if (typeof startDate === 'string' && startDate) {
    sql += ' AND w.work_date >= ?';
    params.push(startDate);
  }
  if (typeof endDate === 'string' && endDate) {
    sql += ' AND w.work_date <= ?';
    params.push(endDate);
  }
  if (typeof userId === 'string' && userId && userId !== 'all') {
    sql += ' AND w.user_id = ?';
    params.push(Number(userId));
  }
  if (typeof department === 'string' && department && department !== 'all') {
    sql += ' AND u.department = ?';
    params.push(department);
  }
  if (typeof categoryId === 'string' && categoryId && categoryId !== 'all') {
    sql += ' AND w.category_id = ?';
    params.push(Number(categoryId));
  }
  if (typeof referenceType === 'string' && referenceType && referenceType !== 'all') {
    sql += ' AND r.reference_type = ?';
    params.push(referenceType);
  }

  sql += ' ORDER BY w.work_date DESC, w.start_time ASC';
  res.json(db.prepare(sql).all(...params));
});

app.post('/api/worklogs', authMiddleware, (req: AuthedRequest, res) => {
  const user = req.user!;
  const {
    work_date,
    category_id,
    reference_id,
    start_time,
    end_time,
    description,
    attachment_name,
    attachment_type,
    attachment_data,
  } = req.body as {
    work_date?: string;
    category_id?: number;
    reference_id?: number | null;
    start_time?: string;
    end_time?: string;
    description?: string;
    attachment_name?: string | null;
    attachment_type?: string | null;
    attachment_data?: string | null;
  };

  if (!work_date || !category_id || !reference_id || !start_time || !end_time || !description?.trim()) {
    res.status(400).json({ error: 'Semua field (Jenis Pekerjaan, Referensi ERP, Tanggal, Waktu, dan Keterangan) wajib diisi.' });
    return;
  }

  const startMin = parseMinutes(start_time);
  const endMinRaw = parseMinutes(end_time);
  if (startMin < 0 || endMinRaw < 0 || endMinRaw === startMin) {
    res.status(400).json({ error: 'Waktu mulai dan waktu selesai tidak boleh sama atau tidak valid.' });
    return;
  }
  const endMin = endMinRaw < startMin ? endMinRaw + 1440 : endMinRaw;

  // Check if day is already locked
  const sub = db
    .prepare('SELECT submission_status FROM daily_submissions WHERE user_id = ? AND submission_date = ?')
    .get(user.id, work_date) as { submission_status: string } | undefined;
  if (sub && (sub.submission_status === 'Sudah Submit' || sub.submission_status === 'Menunggu Revisi')) {
    res.status(400).json({ error: `Worklog tanggal ${formatDateId(work_date)} berstatus ${sub.submission_status}. Ajukan Request Revisi untuk mengubah data.` });
    return;
  }

  // Check overlapping time (including cross-day intervals)
  const existingLogs = db
    .prepare('SELECT id, start_time, end_time FROM worklogs WHERE user_id = ? AND work_date = ?')
    .all(user.id, work_date) as Array<{ id: number; start_time: string; end_time: string }>;

  for (const log of existingLogs) {
    const exStart = parseMinutes(log.start_time);
    const exEndRaw = parseMinutes(log.end_time);
    const exEnd = exEndRaw < exStart ? exEndRaw + 1440 : exEndRaw;
    if (startMin < exEnd && endMin > exStart) {
      res.status(400).json({
        error: `Waktu tumpang tindih dengan aktivitas yang sudah dicatat (${log.start_time} - ${log.end_time}).`,
      });
      return;
    }
  }

  const duration = endMin - startMin;
  const info = db
    .prepare(
      `INSERT INTO worklogs (user_id, work_date, category_id, reference_id, start_time, end_time, duration_minutes, description, attachment_name, attachment_type, attachment_data, submission_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Belum Submit')`
    )
    .run(
      user.id,
      work_date,
      category_id,
      reference_id,
      start_time,
      end_time,
      duration,
      description.trim(),
      attachment_name || null,
      attachment_type || null,
      attachment_data || null
    );

  const newId = Number(info.lastInsertRowid);
  db.prepare(
    `INSERT INTO worklog_audit_trail (worklog_id, changed_by, previous_value, new_value, change_reason)
     VALUES (?, ?, '{}', ?, 'Pencatatan aktivitas baru')`
  ).run(newId, user.id, JSON.stringify({ work_date, start_time, end_time, duration_minutes: duration, description }));

  const created = db
    .prepare(
      `SELECT w.*, c.category_name, r.reference_type, r.reference_number, r.product_code, r.product_name
       FROM worklogs w
       JOIN work_categories c ON c.id = w.category_id
       LEFT JOIN work_references r ON r.id = w.reference_id
       WHERE w.id = ?`
    )
    .get(newId);

  res.status(201).json(created);
});

app.delete('/api/worklogs/:id', authMiddleware, (req: AuthedRequest, res) => {
  const user = req.user!;
  const log = db.prepare('SELECT * FROM worklogs WHERE id = ?').get(req.params.id) as
    | { id: number; user_id: number; work_date: string; submission_status: string; description: string }
    | undefined;
  if (!log) {
    res.status(404).json({ error: 'Aktivitas tidak ditemukan.' });
    return;
  }
  if (log.user_id !== user.id && user.role !== 'admin') {
    res.status(403).json({ error: 'Anda tidak memiliki akses untuk menghapus aktivitas ini.' });
    return;
  }
  if (log.submission_status === 'Sudah Submit' || log.submission_status === 'Menunggu Revisi') {
    res.status(400).json({ error: 'Aktivitas yang sudah disubmit tidak dapat dihapus sebelum revisi disetujui.' });
    return;
  }

  db.prepare('DELETE FROM worklogs WHERE id = ?').run(log.id);
  db.prepare(
    `INSERT INTO worklog_audit_trail (worklog_id, changed_by, previous_value, new_value, change_reason)
     VALUES (?, ?, ?, '{}', 'Penghapusan aktivitas sebelum submit')`
  ).run(log.id, user.id, JSON.stringify(log));

  res.json({ ok: true });
});

// --- DAILY SUBMISSION & REVISION ---
app.post('/api/submissions/submit', authMiddleware, (req: AuthedRequest, res) => {
  const user = req.user!;
  const { work_date } = req.body as { work_date?: string };
  if (!work_date) {
    res.status(400).json({ error: 'Tanggal pekerjaan wajib diisi.' });
    return;
  }

  const logs = db
    .prepare('SELECT id, duration_minutes FROM worklogs WHERE user_id = ? AND work_date = ?')
    .all(user.id, work_date) as Array<{ id: number; duration_minutes: number }>;

  if (logs.length === 0) {
    res.status(400).json({ error: 'Minimal harus ada 1 aktivitas sebelum melakukan submit harian.' });
    return;
  }

  const totalActivities = logs.length;
  const totalDuration = logs.reduce((acc, l) => acc + l.duration_minutes, 0);

  db.prepare(
    `INSERT INTO daily_submissions (user_id, submission_date, total_activities, total_duration_minutes, submission_status, revision_reason, submitted_at)
     VALUES (?, ?, ?, ?, 'Sudah Submit', NULL, datetime('now'))
     ON CONFLICT(user_id, submission_date)
     DO UPDATE SET total_activities = excluded.total_activities,
                   total_duration_minutes = excluded.total_duration_minutes,
                   submission_status = 'Sudah Submit',
                   revision_reason = NULL,
                   submitted_at = datetime('now')`
  ).run(user.id, work_date, totalActivities, totalDuration);

  db.prepare(`UPDATE worklogs SET submission_status = 'Sudah Submit', updated_at = datetime('now') WHERE user_id = ? AND work_date = ?`).run(
    user.id,
    work_date
  );

  // Notify Supervisor
  if (user.supervisor_id) {
    db.prepare(
      `INSERT INTO notifications (recipient_id, notification_type, title, message, read_status)
       VALUES (?, 'SUBMITTED', 'Worklog Submitted', ?, 0)`
    ).run(
      user.supervisor_id,
      `${user.name} dari ${user.department} telah melakukan submit pekerjaan harian pada ${formatDateId(work_date)}. Total Aktivitas: ${totalActivities}, Total Durasi: ${formatDurationId(totalDuration)}.`
    );
  }

  res.json({
    ok: true,
    submission_status: 'Sudah Submit',
    total_activities: totalActivities,
    total_duration_minutes: totalDuration,
  });
});

app.post('/api/submissions/request-revision', authMiddleware, (req: AuthedRequest, res) => {
  const user = req.user!;
  const { work_date, reason } = req.body as { work_date?: string; reason?: string };
  if (!work_date || !reason?.trim()) {
    res.status(400).json({ error: 'Tanggal dan alasan revisi wajib diisi.' });
    return;
  }

  db.prepare(
    `UPDATE daily_submissions SET submission_status = 'Menunggu Revisi', revision_reason = ? WHERE user_id = ? AND submission_date = ?`
  ).run(reason.trim(), user.id, work_date);

  db.prepare(
    `UPDATE worklogs SET submission_status = 'Menunggu Revisi', updated_at = datetime('now') WHERE user_id = ? AND work_date = ?`
  ).run(user.id, work_date);

  if (user.supervisor_id) {
    db.prepare(
      `INSERT INTO notifications (recipient_id, notification_type, title, message, read_status)
       VALUES (?, 'REVISION_REQUEST', 'Permintaan Revisi Worklog', ?, 0)`
    ).run(
      user.supervisor_id,
      `${user.name} mengajukan revisi worklog tanggal ${formatDateId(work_date)}. Alasan: ${reason.trim()}`
    );
  }

  res.json({ ok: true, submission_status: 'Menunggu Revisi' });
});

app.post('/api/submissions/review-revision', authMiddleware, (req: AuthedRequest, res) => {
  const reviewer = req.user!;
  if (!['supervisor', 'manager', 'admin'].includes(reviewer.role)) {
    res.status(403).json({ error: 'Hanya atasan yang dapat menyetujui atau menolak revisi.' });
    return;
  }

  const { user_id, work_date, approve } = req.body as { user_id: number; work_date: string; approve: boolean };
  const newStatus = approve ? 'Perlu Revisi' : 'Sudah Submit';

  db.prepare(`UPDATE daily_submissions SET submission_status = ? WHERE user_id = ? AND submission_date = ?`).run(
    newStatus,
    user_id,
    work_date
  );
  db.prepare(`UPDATE worklogs SET submission_status = ?, updated_at = datetime('now') WHERE user_id = ? AND work_date = ?`).run(
    newStatus,
    user_id,
    work_date
  );

  db.prepare(
    `INSERT INTO notifications (recipient_id, notification_type, title, message, read_status)
     VALUES (?, ?, ?, ?, 0)`
  ).run(
    user_id,
    approve ? 'REVISION_APPROVED' : 'REVISION_REJECTED',
    approve ? 'Revisi Disetujui' : 'Revisi Ditolak',
    approve
      ? `Permintaan revisi worklog tanggal ${formatDateId(work_date)} telah disetujui oleh ${reviewer.name}. Anda dapat mengubah data dan melakukan submit ulang.`
      : `Permintaan revisi worklog tanggal ${formatDateId(work_date)} ditolak oleh ${reviewer.name}.`
  );

  db.prepare(
    `INSERT INTO worklog_audit_trail (worklog_id, changed_by, previous_value, new_value, change_reason)
     VALUES (0, ?, 'Menunggu Revisi', ?, ?)`
  ).run(reviewer.id, newStatus, `Review revisi untuk user #${user_id} tanggal ${work_date}`);

  res.json({ ok: true, submission_status: newStatus });
});

// --- DASHBOARD SUMMARY ---
app.get('/api/dashboard/summary', authMiddleware, (req: AuthedRequest, res) => {
  const scopedIds = getScopedUserIds(req.user!);
  const date = typeof req.query.date === 'string' && req.query.date ? req.query.date : '2026-11-19';
  const startDate = typeof req.query.startDate === 'string' && req.query.startDate ? req.query.startDate : '2026-09-01';
  const endDate = typeof req.query.endDate === 'string' && req.query.endDate ? req.query.endDate : '2026-11-30';
  const department = typeof req.query.department === 'string' ? req.query.department : 'all';
  const categoryId = typeof req.query.categoryId === 'string' ? req.query.categoryId : 'all';
  const referenceType = typeof req.query.referenceType === 'string' ? req.query.referenceType : 'all';

  let userFilter = `u.role = 'staff' AND u.status = 'Active'`;
  const userParams: unknown[] = [];
  if (scopedIds !== null) {
    userFilter += ` AND u.id IN (${scopedIds.map(() => '?').join(',')})`;
    userParams.push(...scopedIds);
  }
  if (department !== 'all') {
    userFilter += ' AND u.department = ?';
    userParams.push(department);
  }

  const staffUsers = db.prepare(`SELECT * FROM users u WHERE ${userFilter} ORDER BY u.department, u.name`).all(...userParams) as AuthUser[];
  const totalPd = staffUsers.filter((u) => u.department === 'Product Development').length;
  const totalAndev = staffUsers.filter((u) => u.department === 'Analytical Development').length;

  // Today monitoring per employee
  const employeeMonitoring = staffUsers.map((u) => {
    const dayLogs = db
      .prepare('SELECT COUNT(*) as cnt, COALESCE(SUM(duration_minutes), 0) as dur FROM worklogs WHERE user_id = ? AND work_date = ?')
      .get(u.id, date) as { cnt: number; dur: number };
    const sub = db
      .prepare('SELECT submission_status, revision_reason FROM daily_submissions WHERE user_id = ? AND submission_date = ?')
      .get(u.id, date) as { submission_status: string; revision_reason: string | null } | undefined;

    return {
      user_id: u.id,
      employee_id: u.employee_id,
      name: u.name,
      department: u.department,
      total_activities: dayLogs.cnt,
      total_duration_minutes: dayLogs.dur,
      submission_status: (sub?.submission_status ?? 'Belum Submit') as 'Belum Submit' | 'Sudah Submit' | 'Menunggu Revisi' | 'Perlu Revisi',
      revision_reason: sub?.revision_reason ?? null,
    };
  });

  const totalActivitiesToday = employeeMonitoring.reduce((s, e) => s + e.total_activities, 0);
  const totalSubmittedToday = employeeMonitoring.filter((e) => e.submission_status === 'Sudah Submit').length;
  const totalNotSubmittedToday = employeeMonitoring.length - totalSubmittedToday;

  // Period filtered worklogs for charts & top 10 products
  let logFilter = 'w.work_date >= ? AND w.work_date <= ?';
  const logParams: unknown[] = [startDate, endDate];
  if (scopedIds !== null) {
    logFilter += ` AND w.user_id IN (${scopedIds.map(() => '?').join(',')})`;
    logParams.push(...scopedIds);
  }
  if (department !== 'all') {
    logFilter += ' AND u.department = ?';
    logParams.push(department);
  }
  if (categoryId !== 'all') {
    logFilter += ' AND w.category_id = ?';
    logParams.push(Number(categoryId));
  }
  if (referenceType !== 'all') {
    logFilter += ' AND r.reference_type = ?';
    logParams.push(referenceType);
  }

  const periodLogs = db
    .prepare(
      `SELECT w.*, u.department, r.reference_type, r.reference_number, r.product_code, r.product_name
       FROM worklogs w
       JOIN users u ON u.id = w.user_id
       LEFT JOIN work_references r ON r.id = w.reference_id
       WHERE ${logFilter}`
    )
    .all(...logParams) as Array<{
    work_date: string;
    duration_minutes: number;
    department: string;
    reference_id: number;
    reference_type: 'UPB' | 'UPV' | 'Produk Eksisting';
    reference_number: string;
    product_code: string;
    product_name: string;
  }>;

  const totalDurationMinutes = periodLogs.reduce((s, l) => s + l.duration_minutes, 0);
  const totalPeriodCount = periodLogs.length;

  // Source Distribution
  const sourceTypes: Array<'UPB' | 'UPV' | 'Produk Eksisting'> = ['UPB', 'UPV', 'Produk Eksisting'];
  const sourceDistribution = sourceTypes.map((st) => {
    const items = periodLogs.filter((l) => l.reference_type === st);
    return {
      name: st,
      count: items.length,
      percentage: totalPeriodCount > 0 ? Math.round((items.length / totalPeriodCount) * 100) : 0,
      durationMinutes: items.reduce((s, l) => s + l.duration_minutes, 0),
    };
  });

  // Monthly Trend
  const monthMap = new Map<string, { month: string; UPB: number; UPV: number; 'Produk Eksisting': number; total: number }>();
  for (const l of periodLogs) {
    const ym = l.work_date.slice(0, 7);
    if (!monthMap.has(ym)) {
      monthMap.set(ym, { month: ym, UPB: 0, UPV: 0, 'Produk Eksisting': 0, total: 0 });
    }
    const bucket = monthMap.get(ym)!;
    if (l.reference_type) bucket[l.reference_type] += 1;
    bucket.total += 1;
  }
  const monthlyTrend = Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month));

  // Department Comparison
  const deptNames = ['Product Development', 'Analytical Development'];
  const departmentComparison = deptNames.map((dn) => {
    const items = periodLogs.filter((l) => l.department === dn);
    const dur = items.reduce((s, l) => s + l.duration_minutes, 0);
    return {
      department: dn,
      activities: items.length,
      durationMinutes: dur,
      avgDurationMinutes: items.length > 0 ? Math.round(dur / items.length) : 0,
    };
  });

  // Top 10 Products
  const prodMap = new Map<
    number,
    {
      reference_id: number;
      reference_number: string;
      product_code: string;
      product_name: string;
      reference_type: 'UPB' | 'UPV' | 'Produk Eksisting';
      activity_count: number;
      total_duration_minutes: number;
    }
  >();
  for (const l of periodLogs) {
    if (!l.reference_id) continue;
    if (!prodMap.has(l.reference_id)) {
      prodMap.set(l.reference_id, {
        reference_id: l.reference_id,
        reference_number: l.reference_number,
        product_code: l.product_code,
        product_name: l.product_name,
        reference_type: l.reference_type,
        activity_count: 0,
        total_duration_minutes: 0,
      });
    }
    const p = prodMap.get(l.reference_id)!;
    p.activity_count += 1;
    p.total_duration_minutes += l.duration_minutes;
  }
  const topProducts = Array.from(prodMap.values())
    .sort((a, b) => b.activity_count - a.activity_count || b.total_duration_minutes - a.total_duration_minutes)
    .slice(0, 10)
    .map((p, idx) => ({
      rank: idx + 1,
      ...p,
      percentage: totalPeriodCount > 0 ? Math.round((p.activity_count / totalPeriodCount) * 100) : 0,
    }));

  res.json({
    kpi: {
      totalPd,
      totalAndev,
      totalActivitiesToday,
      totalSubmittedToday,
      totalNotSubmittedToday,
      totalDurationMinutes,
    },
    sourceDistribution,
    monthlyTrend,
    departmentComparison,
    topProducts,
    employeeMonitoring,
  });
});

// --- NOTIFICATIONS ---
app.get('/api/notifications', authMiddleware, (req: AuthedRequest, res) => {
  const rows = db
    .prepare('SELECT * FROM notifications WHERE recipient_id = ? ORDER BY created_at DESC LIMIT 30')
    .all(req.user!.id);
  res.json(rows);
});

app.patch('/api/notifications/:id/read', authMiddleware, (req: AuthedRequest, res) => {
  db.prepare('UPDATE notifications SET read_status = 1 WHERE id = ? AND recipient_id = ?').run(req.params.id, req.user!.id);
  res.json({ ok: true });
});

app.post('/api/notifications/read-all', authMiddleware, (req: AuthedRequest, res) => {
  db.prepare('UPDATE notifications SET read_status = 1 WHERE recipient_id = ?').run(req.user!.id);
  res.json({ ok: true });
});

// --- AUDIT TRAIL ---
app.get('/api/audit-trail', authMiddleware, (req: AuthedRequest, res) => {
  if (!['supervisor', 'manager', 'admin'].includes(req.user!.role)) {
    res.status(403).json({ error: 'Akses ditolak.' });
    return;
  }
  const rows = db
    .prepare(
      `SELECT a.*, u.name as changed_by_name
       FROM worklog_audit_trail a
       JOIN users u ON u.id = a.changed_by
       ORDER BY a.changed_at DESC LIMIT 50`
    )
    .all();
  res.json(rows);
});

// --- USER MANAGEMENT (ADMIN / MANAGER) ---
app.get('/api/users', authMiddleware, (req: AuthedRequest, res) => {
  const scopedIds = getScopedUserIds(req.user!);
  let sql = `
    SELECT u.id, u.employee_id, u.name, u.email, u.department, u.role, u.supervisor_id, u.status,
           s.name as supervisor_name
    FROM users u
    LEFT JOIN users s ON s.id = u.supervisor_id
    WHERE 1=1
  `;
  const params: unknown[] = [];
  if (scopedIds !== null) {
    sql += ` AND u.id IN (${scopedIds.map(() => '?').join(',')})`;
    params.push(...scopedIds);
  }
  sql += ' ORDER BY u.role, u.department, u.name';
  res.json(db.prepare(sql).all(...params));
});

app.post('/api/users', authMiddleware, (req: AuthedRequest, res) => {
  if (req.user!.role !== 'admin') {
    res.status(403).json({ error: 'Hanya Administrator yang dapat menambah pengguna.' });
    return;
  }
  const { employee_id, name, email, password, department, role, supervisor_id } = req.body as {
    employee_id: string;
    name: string;
    email: string;
    password?: string;
    department: string;
    role: string;
    supervisor_id?: number | null;
  };
  if (!employee_id || !name || !email || !department || !role) {
    res.status(400).json({ error: 'Data pengguna tidak lengkap.' });
    return;
  }
  try {
    const info = db
      .prepare(
        `INSERT INTO users (employee_id, name, email, password_hash, department, role, supervisor_id, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Active')`
      )
      .run(employee_id.trim(), name.trim(), email.trim(), hashPassword(password || 'Pharma2026!'), department, role, supervisor_id || null);
    res.status(201).json(
      db.prepare('SELECT id, employee_id, name, email, department, role, supervisor_id, status FROM users WHERE id = ?').get(info.lastInsertRowid)
    );
  } catch {
    res.status(409).json({ error: 'Email atau Employee ID sudah terdaftar.' });
  }
});

app.put('/api/users/:id', authMiddleware, (req: AuthedRequest, res) => {
  if (req.user!.role !== 'admin') {
    res.status(403).json({ error: 'Akses ditolak.' });
    return;
  }
  const { name, department, role, supervisor_id, status } = req.body as {
    name: string;
    department: string;
    role: string;
    supervisor_id: number | null;
    status: string;
  };
  db.prepare('UPDATE users SET name = ?, department = ?, role = ?, supervisor_id = ?, status = ? WHERE id = ?').run(
    name,
    department,
    role,
    supervisor_id || null,
    status,
    req.params.id
  );
  res.json(db.prepare('SELECT id, employee_id, name, email, department, role, supervisor_id, status FROM users WHERE id = ?').get(req.params.id));
});

// --- SERVER STARTUP ---
async function startServer() {
  const PORT = Number(process.env.PORT) || 3000;
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PD & ANDEV WORKLOG server running on http://localhost:${PORT}`);
  });
}

startServer();
