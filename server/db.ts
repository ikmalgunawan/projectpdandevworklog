import Database from 'better-sqlite3';
import crypto from 'crypto';
import path from 'path';

const DB_PATH = path.resolve(process.cwd(), 'worklog.db');
export const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, key] = storedHash.split(':');
  if (!salt || !key) return false;
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(key, 'hex'), Buffer.from(derived, 'hex'));
}

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      department TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('staff', 'supervisor', 'manager', 'admin')),
      supervisor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'Active'
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS work_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_name TEXT UNIQUE NOT NULL,
      department TEXT NOT NULL DEFAULT 'All',
      status TEXT NOT NULL DEFAULT 'Active'
    );

    CREATE TABLE IF NOT EXISTS work_references (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference_type TEXT NOT NULL CHECK(reference_type IN ('UPB', 'UPV', 'Produk Eksisting')),
      reference_number TEXT UNIQUE NOT NULL,
      product_code TEXT NOT NULL,
      product_name TEXT NOT NULL,
      erp_source_id TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS worklogs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      work_date TEXT NOT NULL,
      category_id INTEGER NOT NULL REFERENCES work_categories(id),
      reference_id INTEGER REFERENCES work_references(id),
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      description TEXT NOT NULL,
      attachment_name TEXT,
      attachment_type TEXT,
      attachment_data TEXT,
      submission_status TEXT NOT NULL DEFAULT 'Belum Submit',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS daily_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      submission_date TEXT NOT NULL,
      total_activities INTEGER NOT NULL DEFAULT 0,
      total_duration_minutes INTEGER NOT NULL DEFAULT 0,
      submission_status TEXT NOT NULL DEFAULT 'Sudah Submit',
      revision_reason TEXT,
      submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, submission_date)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      notification_type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      read_status INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS worklog_audit_trail (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      worklog_id INTEGER NOT NULL,
      changed_by INTEGER NOT NULL REFERENCES users(id),
      previous_value TEXT NOT NULL,
      new_value TEXT NOT NULL,
      change_reason TEXT NOT NULL,
      changed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS erp_config (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      mode TEXT NOT NULL DEFAULT 'SIMULATION',
      base_url TEXT NOT NULL DEFAULT 'https://erp.internal.pharma.co.id/api/v1',
      auth_type TEXT NOT NULL DEFAULT 'Bearer Token (OAuth2 Client Credentials)',
      connected INTEGER NOT NULL DEFAULT 0,
      last_sync_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Safe migration for existing databases created before attachment columns existed
  const cols = (db.prepare('PRAGMA table_info(worklogs)').all() as Array<{ name: string }>).map((c) => c.name);
  if (!cols.includes('attachment_name')) db.exec('ALTER TABLE worklogs ADD COLUMN attachment_name TEXT');
  if (!cols.includes('attachment_type')) db.exec('ALTER TABLE worklogs ADD COLUMN attachment_type TEXT');
  if (!cols.includes('attachment_data')) db.exec('ALTER TABLE worklogs ADD COLUMN attachment_data TEXT');

  const userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number }).c;
  if (userCount > 0) return;

  const defaultPass = hashPassword('Pharma2026!');

  // 1. Seed Users
  const insertUser = db.prepare(`
    INSERT INTO users (employee_id, name, email, password_hash, department, role, supervisor_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'Active')
  `);

  const adminId = Number(insertUser.run('ADM-001', 'Arief Rahman', 'admin@pharma.co.id', defaultPass, 'IT / Admin', 'admin', null).lastInsertRowid);
  const managerId = Number(insertUser.run('MGR-001', 'Dr. Hendra Wijaya', 'manager@pharma.co.id', defaultPass, 'Management', 'manager', null).lastInsertRowid);
  const spvPdId = Number(insertUser.run('SPV-PD-01', 'Rina Kusuma, S.Farm., Apt.', 'spv.pd@pharma.co.id', defaultPass, 'Product Development', 'supervisor', managerId).lastInsertRowid);
  const spvAndevId = Number(insertUser.run('SPV-AD-01', 'Budi Santoso, M.Si.', 'spv.andev@pharma.co.id', defaultPass, 'Analytical Development', 'supervisor', managerId).lastInsertRowid);

  const ikmalId = Number(insertUser.run('PD-101', 'Muhammad Ikmal', 'ikmal@pharma.co.id', defaultPass, 'Product Development', 'staff', spvPdId).lastInsertRowid);
  const sitiId = Number(insertUser.run('PD-102', 'Siti Rahmawati', 'siti.pd@pharma.co.id', defaultPass, 'Product Development', 'staff', spvPdId).lastInsertRowid);
  const dimasId = Number(insertUser.run('PD-103', 'Dimas Pratama', 'dimas.pd@pharma.co.id', defaultPass, 'Product Development', 'staff', spvPdId).lastInsertRowid);

  const nadiaId = Number(insertUser.run('AD-201', 'Nadia Putri', 'nadia.andev@pharma.co.id', defaultPass, 'Analytical Development', 'staff', spvAndevId).lastInsertRowid);
  const fajarId = Number(insertUser.run('AD-202', 'Fajar Nugroho', 'fajar.andev@pharma.co.id', defaultPass, 'Analytical Development', 'staff', spvAndevId).lastInsertRowid);
  const ayuId = Number(insertUser.run('AD-203', 'Ayu Lestari', 'ayu.andev@pharma.co.id', defaultPass, 'Analytical Development', 'staff', spvAndevId).lastInsertRowid);

  void adminId;

  // 2. Seed Work Categories
  const categories = [
    ['Formulasi Produk', 'Product Development'],
    ['Pengembangan Produk Baru', 'Product Development'],
    ['Reformulasi Produk', 'Product Development'],
    ['Trial Produk', 'Product Development'],
    ['Analytical Testing', 'Analytical Development'],
    ['Stability Testing', 'Analytical Development'],
    ['Evaluasi Hasil Pengujian', 'All'],
    ['Dokumentasi', 'All'],
    ['Review Dokumen', 'All'],
    ['Penelitian dan Pengembangan', 'All'],
    ['Pekerjaan Administratif', 'All'],
    ['Lainnya', 'All'],
  ];
  const insertCat = db.prepare("INSERT INTO work_categories (category_name, department, status) VALUES (?, ?, 'Active')");
  const catIds: Record<string, number> = {};
  for (const [name, dept] of categories) {
    catIds[name] = Number(insertCat.run(name, dept).lastInsertRowid);
  }

  // 3. Seed ERP Work References (Simulation Data)
  const references: Array<[string, string, string, string, string]> = [
    ['UPB', 'UPB-001', 'NEW-PCM-500', 'Paracetamol 500mg Fast-Release Tablet', 'ERP-UPB-2026-001'],
    ['UPB', 'UPB-002', 'NEW-OMZ-20', 'Omeprazole 20mg Delayed-Release Capsule', 'ERP-UPB-2026-002'],
    ['UPB', 'UPB-003', 'NEW-MTF-500', 'Metformin HCl 500mg Extended-Release', 'ERP-UPB-2026-003'],
    ['UPB', 'UPB-004', 'NEW-AZT-500', 'Azithromycin 500mg Film-Coated Caplet', 'ERP-UPB-2026-004'],
    ['UPB', 'UPB-005', 'NEW-VTD-1000', 'Vitamin D3 1000 IU Softgel Capsule', 'ERP-UPB-2026-005'],
    ['UPV', 'UPV-001', 'VAL-AMX-500', 'Amoxicillin 500mg Capsule (Validasi Metode)', 'ERP-UPV-2026-001'],
    ['UPV', 'UPV-002', 'VAL-AML-10', 'Amlodipine Besylate 10mg Tablet', 'ERP-UPV-2026-002'],
    ['UPV', 'UPV-003', 'VAL-CTZ-10', 'Cetirizine HCl 10mg Oral Syrup', 'ERP-UPV-2026-003'],
    ['UPV', 'UPV-004', 'VAL-CFX-200', 'Cefixime Trihydrate 200mg Capsule', 'ERP-UPV-2026-004'],
    ['Produk Eksisting', 'PRD-001', 'PRD-ATR-20', 'Atorvastatin Calcium 20mg Film-Coated', 'ERP-PRD-1001'],
    ['Produk Eksisting', 'PRD-002', 'PRD-LSR-50', 'Losartan Potassium 50mg Tablet', 'ERP-PRD-1002'],
    ['Produk Eksisting', 'PRD-003', 'PRD-SIM-20', 'Simvastatin 20mg Tablet', 'ERP-PRD-1003'],
    ['Produk Eksisting', 'PRD-004', 'PRD-IBP-400', 'Ibuprofen 400mg Sugar-Coated Tablet', 'ERP-PRD-1004'],
  ];
  const insertRef = db.prepare(`
    INSERT INTO work_references (reference_type, reference_number, product_code, product_name, erp_source_id)
    VALUES (?, ?, ?, ?, ?)
  `);
  const refIds: Record<string, number> = {};
  for (const r of references) {
    refIds[r[1]] = Number(insertRef.run(...r).lastInsertRowid);
  }

  // 4. Seed Worklogs & Daily Submissions (Sep, Oct, Nov 2026)
  const insertLog = db.prepare(`
    INSERT INTO worklogs (user_id, work_date, category_id, reference_id, start_time, end_time, duration_minutes, description, submission_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertSub = db.prepare(`
    INSERT INTO daily_submissions (user_id, submission_date, total_activities, total_duration_minutes, submission_status, revision_reason)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const today = '2026-11-19';

  // Muhammad Ikmal (Today - Belum Submit so user can test adding/submitting, or already has 4 entries ready to submit!)
  insertLog.run(ikmalId, today, catIds['Trial Produk'], refIds['UPB-001'], '08:00', '09:30', 90, 'Trial formulasi produk batch lab skala 5 kg untuk evaluasi disintegrasi.', 'Belum Submit');
  insertLog.run(ikmalId, today, catIds['Evaluasi Hasil Pengujian'], refIds['UPV-002'], '09:30', '11:00', 90, 'Evaluasi hasil pengujian disolusi profil pembanding Amlodipine 10mg.', 'Belum Submit');
  insertLog.run(ikmalId, today, catIds['Stability Testing'], refIds['PRD-001'], '13:00', '14:30', 90, 'Review stabilitas produk bulan ke-6 kondisi accelerated 40°C/75% RH.', 'Belum Submit');
  insertLog.run(ikmalId, today, catIds['Dokumentasi'], refIds['UPB-003'], '14:30', '16:00', 90, 'Dokumentasi hasil trial formulasi dan penyusunan Master Formula Record.', 'Belum Submit');

  // Siti Rahmawati (Today - Sudah Submit)
  insertLog.run(sitiId, today, catIds['Formulasi Produk'], refIds['UPB-002'], '08:00', '10:30', 150, 'Optimasi coating enterik pellet Omeprazole 20mg menggunakan fluid bed coater.', 'Sudah Submit');
  insertLog.run(sitiId, today, catIds['Reformulasi Produk'], refIds['PRD-002'], '10:30', '12:00', 90, 'Substitusi eksipien binder untuk meningkatkan kekerasan tablet Losartan.', 'Sudah Submit');
  insertLog.run(sitiId, today, catIds['Review Dokumen'], refIds['UPB-004'], '13:30', '15:30', 120, 'Review protokol scale-up batch pilot Azithromycin 500mg.', 'Sudah Submit');
  insertSub.run(sitiId, today, 3, 360, 'Sudah Submit', null);

  // Dimas Pratama (Today - Menunggu Revisi)
  insertLog.run(dimasId, today, catIds['Pengembangan Produk Baru'], refIds['UPB-005'], '08:30', '11:30', 180, 'Studi kompatibilitas eksipien minyak pembawa Vitamin D3 1000 IU.', 'Menunggu Revisi');
  insertLog.run(dimasId, today, catIds['Dokumentasi'], refIds['UPB-001'], '13:00', '15:00', 120, 'Penyusunan laporan pra-formulasi dan spesifikasi bahan baku.', 'Menunggu Revisi');
  insertSub.run(dimasId, today, 2, 300, 'Menunggu Revisi', 'Perlu koreksi jam selesai aktivitas kedua menjadi 15:30 dan penambahan catatan COA.');

  // Nadia Putri - Andev (Today - Sudah Submit)
  insertLog.run(nadiaId, today, catIds['Analytical Testing'], refIds['UPV-001'], '08:00', '11:00', 180, 'Pengujian kadar Amoxicillin 500mg menggunakan HPLC-UV kolom C18.', 'Sudah Submit');
  insertLog.run(nadiaId, today, catIds['Evaluasi Hasil Pengujian'], refIds['UPB-001'], '13:00', '15:00', 120, 'Perhitungan persen recovery dan presisi intermediate metode assay.', 'Sudah Submit');
  insertLog.run(nadiaId, today, catIds['Dokumentasi'], refIds['UPV-003'], '15:00', '16:30', 90, 'Penyusunan Certificate of Analysis (CoA) internal sampel trial.', 'Sudah Submit');
  insertSub.run(nadiaId, today, 3, 390, 'Sudah Submit', null);

  // Fajar Nugroho - Andev (Today - Sudah Submit)
  insertLog.run(fajarId, today, catIds['Stability Testing'], refIds['PRD-001'], '08:00', '10:30', 150, 'Sampling dan pengujian kadar zat aktif stabilitas real-time 30°C/75% RH.', 'Sudah Submit');
  insertLog.run(fajarId, today, catIds['Analytical Testing'], refIds['UPV-004'], '13:00', '16:00', 180, 'Validasi metode disolusi Cefixime 200mg menggunakan spektrofotometer UV-Vis.', 'Sudah Submit');
  insertSub.run(fajarId, today, 2, 330, 'Sudah Submit', null);

  // Ayu Lestari - Andev (Today - Belum Submit, no entries yet)

  // Historical data for Sep, Oct, Nov 2026 for rich charts & Top 10 Products
  const historicalEntries: Array<[number, string, string, string, string, string, number, string]> = [
    [ikmalId, '2026-11-18', 'Formulasi Produk', 'UPB-001', '08:00', '11:00', 180, 'Penimbangan bahan aktif dan eksipien batch trial 02.'],
    [ikmalId, '2026-11-18', 'Trial Produk', 'UPB-002', '13:00', '16:00', 180, 'Proses granulasi basah dan pengeringan oven.'],
    [sitiId, '2026-11-18', 'Trial Produk', 'UPB-001', '08:30', '11:30', 180, 'Kompresi tablet dan uji friabilitas in-process control.'],
    [nadiaId, '2026-11-18', 'Analytical Testing', 'UPV-002', '08:00', '12:00', 240, 'Uji kesesuaian sistem HPLC dan analisis sampel stabilitas.'],
    [fajarId, '2026-11-18', 'Stability Testing', 'PRD-001', '09:00', '12:00', 180, 'Pengujian kadar air Karl Fischer sampel bulan ke-3.'],
    [ayuId, '2026-11-18', 'Analytical Testing', 'UPV-001', '08:00', '11:30', 210, 'Preparasi larutan standar dan kurva kalibrasi 5 titik.'],
    [ikmalId, '2026-10-22', 'Formulasi Produk', 'UPB-001', '08:00', '11:00', 180, 'Evaluasi profil pelepasan obat formula awal.'],
    [ikmalId, '2026-10-22', 'Dokumentasi', 'UPB-003', '13:00', '15:30', 150, 'Update dokumen protokol pengembangan produk.'],
    [sitiId, '2026-10-20', 'Reformulasi Produk', 'PRD-003', '08:00', '11:00', 180, 'Evaluasi stabilitas warna salut selaput Simvastatin.'],
    [dimasId, '2026-10-18', 'Trial Produk', 'UPB-002', '09:00', '12:00', 180, 'Trial skala lab kapsul Omeprazole.'],
    [nadiaId, '2026-10-15', 'Analytical Testing', 'UPV-002', '08:00', '11:30', 210, 'Pengujian impuritas terkait Amlodipine.'],
    [fajarId, '2026-10-12', 'Stability Testing', 'PRD-001', '08:30', '11:30', 180, 'Evaluasi organoleptik dan pH sampel stabilitas.'],
    [ayuId, '2026-10-10', 'Analytical Testing', 'UPV-003', '08:00', '11:00', 180, 'Validasi metode penetapan kadar sirup Cetirizine.'],
    [ikmalId, '2026-09-25', 'Penelitian dan Pengembangan', 'UPB-001', '08:00', '11:00', 180, 'Studi literatur dan pemilihan eksipien superdisintegrant.'],
    [sitiId, '2026-09-21', 'Formulasi Produk', 'UPB-004', '08:00', '11:30', 210, 'Pembuatan formula orientasi Azithromycin 500mg.'],
    [nadiaId, '2026-09-18', 'Analytical Testing', 'UPV-001', '08:00', '11:00', 180, 'Verifikasi metode farmakope Amoxicillin.'],
    [fajarId, '2026-09-14', 'Evaluasi Hasil Pengujian', 'PRD-002', '13:00', '16:00', 180, 'Kompilasi data tren stabilitas tahunan Losartan.'],
    [ayuId, '2026-09-10', 'Stability Testing', 'PRD-004', '08:30', '11:30', 180, 'Uji disolusi Ibuprofen 400mg batch komersial.'],
  ];

  for (const [uid, wdate, cname, rnum, st, et, dur, desc] of historicalEntries) {
    insertLog.run(uid, wdate, catIds[cname], refIds[rnum], st, et, dur, desc, 'Sudah Submit');
  }

  // Seed Notifications
  const insertNotif = db.prepare(`
    INSERT INTO notifications (recipient_id, notification_type, title, message, read_status)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertNotif.run(
    spvPdId,
    'SUBMITTED',
    'Worklog Submitted',
    'Siti Rahmawati dari Product Development telah melakukan submit pekerjaan harian pada 19/11/2026. Total Aktivitas: 3, Total Durasi: 6 Jam.',
    0
  );
  insertNotif.run(
    spvPdId,
    'REVISION_REQUEST',
    'Permintaan Revisi Worklog',
    'Dimas Pratama mengajukan revisi worklog tanggal 19/11/2026. Alasan: Perlu koreksi jam selesai aktivitas kedua menjadi 15:30.',
    0
  );
  insertNotif.run(
    spvAndevId,
    'SUBMITTED',
    'Worklog Submitted',
    'Nadia Putri dari Analytical Development telah melakukan submit pekerjaan harian pada 19/11/2026. Total Aktivitas: 3, Total Durasi: 6 Jam 30 Menit.',
    0
  );
  insertNotif.run(
    spvAndevId,
    'REMINDER',
    'Belum Submit Worklog',
    'Ayu Lestari dari Analytical Development belum melakukan pencatatan dan submit worklog untuk tanggal 19/11/2026.',
    0
  );
  insertNotif.run(
    managerId,
    'SUBMITTED',
    'Ringkasan Submit Harian',
    '3 dari 6 karyawan PD & Andev telah menyelesaikan submit worklog harian per 19/11/2026.',
    0
  );

  // Seed ERP Config
  db.prepare(`
    INSERT INTO erp_config (id, mode, base_url, auth_type, connected)
    VALUES (1, 'SIMULATION', 'https://erp.internal.pharma.co.id/api/v1', 'Bearer Token (OAuth2 Client Credentials)', 0)
  `).run();
}
