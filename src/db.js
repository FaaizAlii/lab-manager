'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const initSqlJs = require('sql.js');

const DEFAULT_USERNAME = 'Muhammad Tariq';
const DEFAULT_PASSWORD = 'Pak123pak';

const MONEY_SCALE = 100;
let db;
let databasePath;

class StatementCompat {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql;
  }

  run(...params) {
    this.database.run(this.sql, params);
    const changes = this.database.getRowsModified();
    const result = this.database.exec('SELECT last_insert_rowid() AS id');
    const lastInsertRowid = result[0] ? Number(result[0].values[0][0]) : 0;
    return { changes, lastInsertRowid };
  }

  get(...params) {
    const statement = this.database.prepare(this.sql);
    try {
      statement.bind(params);
      return statement.step() ? statement.getAsObject() : undefined;
    } finally {
      statement.free();
    }
  }

  all(...params) {
    const statement = this.database.prepare(this.sql);
    const rows = [];
    try {
      statement.bind(params);
      while (statement.step()) rows.push(statement.getAsObject());
      return rows;
    } finally {
      statement.free();
    }
  }
}

class DatabaseCompat {
  constructor(database) {
    this.database = database;
    this.isOpen = true;
  }

  exec(sql) {
    this.database.run(sql);
  }

  prepare(sql) {
    return new StatementCompat(this.database, sql);
  }

  export() {
    return this.database.export();
  }

  close() {
    this.database.close();
    this.isOpen = false;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function assertIsoDate(value, field = 'Date') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) {
    throw new Error(`${field} is required.`);
  }
}

function cents(value, field = 'Amount', allowZero = true) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || (!allowZero && number === 0)) {
    throw new Error(`${field} must be ${allowZero ? 'zero or greater' : 'greater than zero'}.`);
  }
  return Math.round(number * MONEY_SCALE);
}

function amount(value) {
  return Number(value || 0) / MONEY_SCALE;
}

function rateToBps(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100) {
    throw new Error('Commission rate must be between 0 and 100%.');
  }
  return Math.round(number * 100);
}

function bpsToRate(value) {
  return Number(value || 0) / 100;
}

async function initialize(filePath) {
  databasePath = filePath;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const SQL = await initSqlJs({ locateFile: (file) => require.resolve(`sql.js/dist/${file}`) });
  const existing = fs.existsSync(filePath) ? new Uint8Array(fs.readFileSync(filePath)) : undefined;
  db = new DatabaseCompat(existing ? new SQL.Database(existing) : new SQL.Database());
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS doctors (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      commission_bps INTEGER NOT NULL DEFAULT 0 CHECK (commission_bps BETWEEN 0 AND 10000),
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY,
      visit_date TEXT NOT NULL,
      lab_no TEXT NOT NULL COLLATE NOCASE UNIQUE,
      patient_name TEXT NOT NULL,
      doctor_id INTEGER NOT NULL REFERENCES doctors(id),
      fee_paisa INTEGER NOT NULL CHECK (fee_paisa >= 0),
      discount_paisa INTEGER NOT NULL DEFAULT 0 CHECK (discount_paisa >= 0),
      paid_paisa INTEGER NOT NULL DEFAULT 0 CHECK (paid_paisa >= 0),
      commission_bps INTEGER NOT NULL DEFAULT 0 CHECK (commission_bps BETWEEN 0 AND 10000),
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY,
      expense_date TEXT NOT NULL,
      amount_paisa INTEGER NOT NULL CHECK (amount_paisa > 0),
      category TEXT NOT NULL DEFAULT 'General',
      description TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS expense_categories (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE INDEX IF NOT EXISTS idx_patients_date ON patients(visit_date);
    CREATE INDEX IF NOT EXISTS idx_patients_doctor_date ON patients(doctor_id, visit_date);
    CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(patient_name COLLATE NOCASE);
    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
  `);

  const timestamp = nowIso();
  db.prepare('INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)').run('next_lab_no', '1');
  db.prepare('INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)').run('lab_name', 'Fatima Lab');
  db.prepare(`
    INSERT OR IGNORE INTO doctors(name, commission_bps, active, notes, created_at, updated_at)
    VALUES ('SELF', 0, 1, 'Walk-in / self referral', ?, ?)
  `).run(timestamp, timestamp);
  const categoryCount = Number(db.prepare('SELECT COUNT(*) count FROM expense_categories').get().count);
  if (categoryCount === 0) {
    const insertCategory = db.prepare('INSERT OR IGNORE INTO expense_categories(name, active, created_at, updated_at) VALUES (?, 1, ?, ?)');
    ['General', 'Supplies', 'Utilities', 'Staff', 'Transport', 'Equipment', 'Outsourced Test', 'Other']
      .forEach((name) => insertCategory.run(name, timestamp, timestamp));
  }
  ensureAuthDefaults();
  return getSettings();
}

function close() {
  if (db && db.isOpen) {
    persist();
    db.close();
  }
  db = undefined;
}

function persist() {
  if (!db || !db.isOpen || !databasePath) return;
  const temporaryPath = `${databasePath}.tmp`;
  fs.writeFileSync(temporaryPath, Buffer.from(db.export()));
  fs.renameSync(temporaryPath, databasePath);
}

function getDatabasePath() {
  return databasePath;
}

function setting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function putSetting(key, value) {
  db.prepare('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, value);
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function ensureAuthDefaults() {
  if (setting('auth_password_hash', '')) return;
  const salt = crypto.randomBytes(16).toString('hex');
  putSetting('auth_username', DEFAULT_USERNAME);
  putSetting('auth_salt', salt);
  putSetting('auth_password_hash', hashPassword(DEFAULT_PASSWORD, salt));
}

function getAuthUsername() {
  return setting('auth_username', DEFAULT_USERNAME);
}

function verifyPassword(password) {
  const salt = setting('auth_salt', '');
  const hash = setting('auth_password_hash', '');
  if (!salt || !hash) return false;
  return hashPassword(String(password || ''), salt) === hash;
}

function changePassword(currentPassword, newPassword) {
  if (!verifyPassword(currentPassword)) throw new Error('Current password is incorrect.');
  if (!newPassword || String(newPassword).length < 4) throw new Error('New password must be at least 4 characters.');
  const salt = crypto.randomBytes(16).toString('hex');
  putSetting('auth_salt', salt);
  putSetting('auth_password_hash', hashPassword(String(newPassword), salt));
  persist();
  return true;
}

function getSettings() {
  return {
    nextLabNo: setting('next_lab_no', '1'),
    labName: setting('lab_name', 'Fatima Lab'),
    databasePath,
  };
}

function updateSettings(input) {
  const nextLabNo = String(input.nextLabNo || '').trim();
  const labName = String(input.labName || '').trim();
  if (!/^\d+$/.test(nextLabNo) || Number(nextLabNo) < 1) {
    throw new Error('Next Lab No must be a positive whole number.');
  }
  if (!labName) throw new Error('Lab name is required.');
  const put = db.prepare('INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  db.exec('BEGIN IMMEDIATE');
  try {
    put.run('next_lab_no', nextLabNo);
    put.run('lab_name', labName);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return getSettings();
}

function normalizeDoctor(row) {
  return {
    ...row,
    active: Boolean(row.active),
    commissionRate: bpsToRate(row.commission_bps),
    commission_bps: undefined,
  };
}

function listDoctors({ includeInactive = true } = {}) {
  const where = includeInactive ? '' : 'WHERE d.active = 1';
  return db.prepare(`
    SELECT d.*,
      COUNT(p.id) AS patient_count,
      COALESCE(SUM(p.paid_paisa), 0) AS paid_paisa,
      COALESCE(SUM(ROUND(p.paid_paisa * p.commission_bps / 10000.0)), 0) AS commission_paisa
    FROM doctors d
    LEFT JOIN patients p ON p.doctor_id = d.id
    ${where}
    GROUP BY d.id
    ORDER BY d.active DESC, d.name COLLATE NOCASE ASC
  `).all().map((row) => ({
    ...normalizeDoctor(row),
    paid: amount(row.paid_paisa),
    commission: amount(row.commission_paisa),
  }));
}

function saveDoctor(input) {
  const id = Number(input.id || 0);
  const name = String(input.name || '').trim().replace(/\s+/g, ' ');
  const notes = String(input.notes || '').trim();
  const active = input.active === false ? 0 : 1;
  const commissionBps = rateToBps(input.commissionRate || 0);
  if (!name) throw new Error('Doctor / referral name is required.');
  const timestamp = nowIso();
  try {
    if (id) {
      db.prepare(`UPDATE doctors SET name=?, commission_bps=?, active=?, notes=?, updated_at=? WHERE id=?`)
        .run(name, commissionBps, active, notes, timestamp, id);
    } else {
      db.prepare(`INSERT INTO doctors(name, commission_bps, active, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(name, commissionBps, active, notes, timestamp, timestamp);
    }
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) throw new Error('This doctor / referral already exists.');
    throw error;
  }
  const row = db.prepare('SELECT * FROM doctors WHERE id = ?').get(id || Number(db.prepare('SELECT last_insert_rowid() id').get().id));
  return normalizeDoctor(row);
}

function setDoctorActive(id, active) {
  const doctorId = Number(id);
  const row = db.prepare('SELECT name FROM doctors WHERE id=?').get(doctorId);
  if (!row) throw new Error('Doctor not found.');
  if (row.name.toUpperCase() === 'SELF' && !active) throw new Error('SELF cannot be deactivated.');
  db.prepare('UPDATE doctors SET active=?, updated_at=? WHERE id=?').run(active ? 1 : 0, nowIso(), doctorId);
  return true;
}

function listExpenseCategories({ includeInactive = true } = {}) {
  const where = includeInactive ? '' : 'WHERE active = 1';
  return db.prepare(`SELECT * FROM expense_categories ${where} ORDER BY active DESC, name COLLATE NOCASE ASC`)
    .all().map((row) => ({ ...row, active: Boolean(row.active) }));
}

function saveExpenseCategory(input) {
  const id = Number(input.id || 0);
  const name = String(input.name || '').trim().replace(/\s+/g, ' ');
  if (!name) throw new Error('Category name is required.');
  const timestamp = nowIso();
  try {
    if (id) {
      db.prepare('UPDATE expense_categories SET name=?, updated_at=? WHERE id=?').run(name, timestamp, id);
    } else {
      db.prepare('INSERT INTO expense_categories(name, active, created_at, updated_at) VALUES (?, 1, ?, ?)')
        .run(name, timestamp, timestamp);
    }
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) throw new Error('This category already exists.');
    throw error;
  }
  const row = db.prepare('SELECT * FROM expense_categories WHERE id = ?').get(id || Number(db.prepare('SELECT last_insert_rowid() id').get().id));
  return { ...row, active: Boolean(row.active) };
}

function setExpenseCategoryActive(id, active) {
  const categoryId = Number(id);
  const row = db.prepare('SELECT name FROM expense_categories WHERE id=?').get(categoryId);
  if (!row) throw new Error('Category not found.');
  if (row.name.toUpperCase() === 'GENERAL' && !active) throw new Error('General cannot be deactivated.');
  db.prepare('UPDATE expense_categories SET active=?, updated_at=? WHERE id=?').run(active ? 1 : 0, nowIso(), categoryId);
  return true;
}

function patientSelectSql() {
  return `
    SELECT p.id, p.visit_date, p.lab_no, p.patient_name, p.doctor_id,
      d.name AS doctor_name, p.fee_paisa, p.discount_paisa, p.paid_paisa,
      (p.fee_paisa - p.discount_paisa) AS net_paisa,
      (p.fee_paisa - p.discount_paisa - p.paid_paisa) AS due_paisa,
      p.commission_bps,
      ROUND(p.paid_paisa * p.commission_bps / 10000.0) AS commission_paisa,
      p.notes, p.created_at, p.updated_at
    FROM patients p JOIN doctors d ON d.id = p.doctor_id
  `;
}

function normalizePatient(row) {
  if (!row) return null;
  return {
    id: row.id,
    date: row.visit_date,
    labNo: row.lab_no,
    patientName: row.patient_name,
    doctorId: row.doctor_id,
    doctorName: row.doctor_name,
    fee: amount(row.fee_paisa),
    discount: amount(row.discount_paisa),
    net: amount(row.net_paisa),
    paid: amount(row.paid_paisa),
    due: amount(row.due_paisa),
    commissionRate: bpsToRate(row.commission_bps),
    commission: amount(row.commission_paisa),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validatePatient(input) {
  assertIsoDate(input.date, 'Visit date');
  const labNo = String(input.labNo || '').trim();
  const patientName = String(input.patientName || '').trim().replace(/\s+/g, ' ');
  const doctorId = Number(input.doctorId);
  if (!labNo) throw new Error('Lab No is required.');
  if (!patientName) throw new Error('Patient name is required.');
  if (!Number.isInteger(doctorId) || doctorId < 1) throw new Error('Referred By is required.');
  const doctor = db.prepare('SELECT * FROM doctors WHERE id=?').get(doctorId);
  if (!doctor) throw new Error('Selected doctor / referral no longer exists.');
  const feePaisa = cents(input.fee, 'Fee');
  const discountPaisa = cents(input.discount || 0, 'Discount');
  const paidPaisa = cents(input.paid || 0, 'Paid amount');
  if (discountPaisa > feePaisa) throw new Error('Discount cannot be greater than the fee.');
  return {
    date: input.date,
    labNo,
    patientName,
    doctorId,
    feePaisa,
    discountPaisa,
    paidPaisa,
    commissionBps: doctor.commission_bps,
    notes: String(input.notes || '').trim(),
  };
}

function addPatient(input) {
  const data = validatePatient(input);
  const timestamp = nowIso();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = db.prepare(`
      INSERT INTO patients(visit_date, lab_no, patient_name, doctor_id, fee_paisa, discount_paisa, paid_paisa, commission_bps, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(data.date, data.labNo, data.patientName, data.doctorId, data.feePaisa, data.discountPaisa,
      data.paidPaisa, data.commissionBps, data.notes, timestamp, timestamp);

    const currentNext = Number(setting('next_lab_no', '1'));
    if (/^\d+$/.test(data.labNo)) {
      const candidate = Number(data.labNo) + 1;
      if (Number.isSafeInteger(candidate) && candidate > currentNext) {
        db.prepare('UPDATE settings SET value=? WHERE key=?').run(String(candidate), 'next_lab_no');
      } else if (Number(data.labNo) === currentNext) {
        db.prepare('UPDATE settings SET value=? WHERE key=?').run(String(currentNext + 1), 'next_lab_no');
      }
    }
    db.exec('COMMIT');
    return getPatient(Number(result.lastInsertRowid));
  } catch (error) {
    db.exec('ROLLBACK');
    if (String(error.message).includes('UNIQUE')) throw new Error(`Lab No ${data.labNo} already exists.`);
    throw error;
  }
}

function updatePatient(id, input) {
  const patientId = Number(id);
  const data = validatePatient(input);
  try {
    db.prepare(`
      UPDATE patients SET visit_date=?, lab_no=?, patient_name=?, doctor_id=?, fee_paisa=?,
        discount_paisa=?, paid_paisa=?, commission_bps=?, notes=?, updated_at=? WHERE id=?
    `).run(data.date, data.labNo, data.patientName, data.doctorId, data.feePaisa, data.discountPaisa,
      data.paidPaisa, data.commissionBps, data.notes, nowIso(), patientId);
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) throw new Error(`Lab No ${data.labNo} already exists.`);
    throw error;
  }
  return getPatient(patientId);
}

function getPatient(id) {
  return normalizePatient(db.prepare(`${patientSelectSql()} WHERE p.id=?`).get(Number(id)));
}

function deletePatient(id) {
  const result = db.prepare('DELETE FROM patients WHERE id=?').run(Number(id));
  if (!result.changes) throw new Error('Patient record not found.');
  return true;
}

function buildPatientWhere(filters = {}) {
  const parts = ['1=1'];
  const params = [];
  if (!filters.day && filters.month && /^\d{4}-\d{2}$/.test(filters.month)) {
    parts.push("p.visit_date >= ? AND p.visit_date < date(?, '+1 month')");
    params.push(`${filters.month}-01`, `${filters.month}-01`);
  }
  if (filters.from) {
    assertIsoDate(filters.from, 'From date');
    parts.push('p.visit_date >= ?'); params.push(filters.from);
  }
  if (filters.to) {
    assertIsoDate(filters.to, 'To date');
    parts.push('p.visit_date <= ?'); params.push(filters.to);
  }
  if (filters.day) {
    assertIsoDate(filters.day, 'Day');
    parts.push('p.visit_date = ?'); params.push(filters.day);
  }
  if (Number(filters.doctorId)) {
    parts.push('p.doctor_id = ?'); params.push(Number(filters.doctorId));
  }
  if (filters.duesOnly) {
    parts.push('(p.fee_paisa - p.discount_paisa - p.paid_paisa) > 0');
  }
  const search = String(filters.search || '').trim();
  if (search) {
    parts.push('(p.patient_name LIKE ? COLLATE NOCASE OR p.lab_no LIKE ? COLLATE NOCASE OR d.name LIKE ? COLLATE NOCASE)');
    const term = `%${search}%`; params.push(term, term, term);
  }
  return { sql: parts.join(' AND '), params };
}

function listPatients(filters = {}) {
  const where = buildPatientWhere(filters);
  const direction = filters.sort === 'asc' ? 'ASC' : 'DESC';
  const orderBy = filters.sort === 'due'
    ? `(p.fee_paisa - p.discount_paisa - p.paid_paisa) DESC, p.visit_date DESC`
    : `p.visit_date ${direction}, p.id ${direction}`;
  const limit = Math.min(Math.max(Number(filters.limit) || 250, 1), 1000);
  const offset = Math.max(Number(filters.offset) || 0, 0);
  const rows = db.prepare(`${patientSelectSql()} WHERE ${where.sql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`)
    .all(...where.params, limit, offset).map(normalizePatient);
  const total = Number(db.prepare(`SELECT COUNT(*) count FROM patients p JOIN doctors d ON d.id=p.doctor_id WHERE ${where.sql}`).get(...where.params).count);
  return { rows, total, limit, offset };
}

function normalizeExpense(row) {
  if (!row) return null;
  return {
    id: row.id,
    date: row.expense_date,
    amount: amount(row.amount_paisa),
    category: row.category,
    description: row.description,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validateExpense(input) {
  assertIsoDate(input.date, 'Expense date');
  const description = String(input.description || '').trim();
  if (!description) throw new Error('Expense description is required.');
  return {
    date: input.date,
    amountPaisa: cents(input.amount, 'Expense amount', false),
    category: String(input.category || 'General').trim() || 'General',
    description,
    notes: String(input.notes || '').trim(),
  };
}

function saveExpense(input) {
  const data = validateExpense(input);
  const id = Number(input.id || 0);
  const timestamp = nowIso();
  if (id) {
    db.prepare(`UPDATE expenses SET expense_date=?, amount_paisa=?, category=?, description=?, notes=?, updated_at=? WHERE id=?`)
      .run(data.date, data.amountPaisa, data.category, data.description, data.notes, timestamp, id);
  } else {
    db.prepare(`INSERT INTO expenses(expense_date, amount_paisa, category, description, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(data.date, data.amountPaisa, data.category, data.description, data.notes, timestamp, timestamp);
  }
  const expenseId = id || Number(db.prepare('SELECT last_insert_rowid() id').get().id);
  return normalizeExpense(db.prepare('SELECT * FROM expenses WHERE id=?').get(expenseId));
}

function deleteExpense(id) {
  const result = db.prepare('DELETE FROM expenses WHERE id=?').run(Number(id));
  if (!result.changes) throw new Error('Expense record not found.');
  return true;
}

function listExpenses(filters = {}) {
  const parts = ['1=1'];
  const params = [];
  if (filters.day) {
    assertIsoDate(filters.day, 'Day');
    parts.push('expense_date = ?'); params.push(filters.day);
  } else if (filters.month && /^\d{4}-\d{2}$/.test(filters.month)) {
    parts.push("expense_date >= ? AND expense_date < date(?, '+1 month')");
    params.push(`${filters.month}-01`, `${filters.month}-01`);
  }
  const search = String(filters.search || '').trim();
  if (search) {
    parts.push('(description LIKE ? COLLATE NOCASE OR category LIKE ? COLLATE NOCASE)');
    const term = `%${search}%`; params.push(term, term);
  }
  const sort = filters.sort === 'asc' ? 'ASC' : 'DESC';
  const rows = db.prepare(`SELECT * FROM expenses WHERE ${parts.join(' AND ')} ORDER BY expense_date ${sort}, id ${sort} LIMIT 1000`).all(...params).map(normalizeExpense);
  return rows;
}

function monthBounds(month) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) throw new Error('Select a valid month.');
  return [`${month}-01`, `${month}-01`];
}

function dashboard(month) {
  const [start, base] = monthBounds(month);
  const patient = db.prepare(`
    SELECT COUNT(*) patients,
      COALESCE(SUM(fee_paisa),0) fee,
      COALESCE(SUM(discount_paisa),0) discount,
      COALESCE(SUM(fee_paisa-discount_paisa),0) net,
      COALESCE(SUM(paid_paisa),0) paid,
      COALESCE(SUM(fee_paisa-discount_paisa-paid_paisa),0) due,
      COALESCE(SUM(ROUND(paid_paisa*commission_bps/10000.0)),0) commission
    FROM patients WHERE visit_date >= ? AND visit_date < date(?, '+1 month')
  `).get(start, base);
  const expense = db.prepare(`SELECT COALESCE(SUM(amount_paisa),0) total FROM expenses WHERE expense_date >= ? AND expense_date < date(?, '+1 month')`).get(start, base);
  const dailyPatients = db.prepare(`
    SELECT visit_date date, COUNT(*) patients, SUM(paid_paisa) paid, SUM(fee_paisa-discount_paisa-paid_paisa) due,
      SUM(ROUND(paid_paisa*commission_bps/10000.0)) commission
    FROM patients WHERE visit_date >= ? AND visit_date < date(?, '+1 month') GROUP BY visit_date ORDER BY visit_date
  `).all(start, base);
  const dailyExpenses = db.prepare(`
    SELECT expense_date date, SUM(amount_paisa) expense
    FROM expenses WHERE expense_date >= ? AND expense_date < date(?, '+1 month') GROUP BY expense_date ORDER BY expense_date
  `).all(start, base);
  const byDate = new Map();
  for (const row of dailyPatients) byDate.set(row.date, { date: row.date, patients: Number(row.patients), paid: amount(row.paid), due: amount(row.due), commission: amount(row.commission), expense: 0 });
  for (const row of dailyExpenses) {
    const value = byDate.get(row.date) || { date: row.date, patients: 0, paid: 0, due: 0, commission: 0, expense: 0 };
    value.expense = amount(row.expense); byDate.set(row.date, value);
  }
  const daily = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).map((row) => ({ ...row, balance: row.paid - row.expense }));
  return {
    month,
    patients: Number(patient.patients),
    fee: amount(patient.fee),
    discount: amount(patient.discount),
    net: amount(patient.net),
    paid: amount(patient.paid),
    due: amount(patient.due),
    expenses: amount(expense.total),
    balance: amount(patient.paid) - amount(expense.total),
    commission: amount(patient.commission),
    daily,
  };
}

function doctorReport(filters = {}) {
  const where = buildPatientWhere(filters);
  const summary = db.prepare(`
    SELECT COUNT(*) patients, COALESCE(SUM(p.fee_paisa),0) fee,
      COALESCE(SUM(p.discount_paisa),0) discount,
      COALESCE(SUM(p.fee_paisa-p.discount_paisa),0) net,
      COALESCE(SUM(p.paid_paisa),0) paid,
      COALESCE(SUM(p.fee_paisa-p.discount_paisa-p.paid_paisa),0) due,
      COALESCE(SUM(ROUND(p.paid_paisa*p.commission_bps/10000.0)),0) commission
    FROM patients p JOIN doctors d ON d.id=p.doctor_id WHERE ${where.sql}
  `).get(...where.params);
  return {
    patients: Number(summary.patients), fee: amount(summary.fee), discount: amount(summary.discount),
    net: amount(summary.net), paid: amount(summary.paid), due: amount(summary.due), commission: amount(summary.commission),
  };
}

function checkpoint() {
  persist();
}

module.exports = {
  initialize, close, getDatabasePath, getSettings, updateSettings,
  listDoctors, saveDoctor, setDoctorActive,
  addPatient, updatePatient, getPatient, deletePatient, listPatients,
  saveExpense, deleteExpense, listExpenses,
  listExpenseCategories, saveExpenseCategory, setExpenseCategoryActive,
  dashboard, doctorReport, checkpoint,
  getAuthUsername, verifyPassword, changePassword,
};
