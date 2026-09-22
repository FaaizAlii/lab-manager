'use strict';

const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const ExcelJS = require('exceljs');
const store = require('./db');

// Wine/Bottles can leave Chromium's hardware-accelerated window permanently
// hidden even though the main process and database started successfully.
// Software rendering is more than sufficient for this application and also
// avoids driver-specific blank-window failures on older Windows computers.
if (process.platform === 'win32') app.disableHardwareAcceleration();

let mainWindow;
let dataDirectory;

function resolveDataDirectory() {
  if (process.env.FATIMA_LAB_DATA_DIR) return path.resolve(process.env.FATIMA_LAB_DATA_DIR);
  if (process.env.PORTABLE_EXECUTABLE_DIR) {
    return path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'Fatima Lab Data');
  }
  return path.join(app.getPath('documents'), 'Fatima Lab Data');
}

function makeDailyBackup() {
  try {
    const backupDir = path.join(dataDirectory, 'Backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    const destination = path.join(backupDir, `fatima-lab-${day}.db`);
    store.checkpoint();
    fs.copyFileSync(store.getDatabasePath(), destination);
    const backups = fs.readdirSync(backupDir)
      .filter((name) => /^fatima-lab-\d{4}-\d{2}-\d{2}\.db$/.test(name))
      .sort().reverse();
    for (const oldBackup of backups.slice(30)) fs.unlinkSync(path.join(backupDir, oldBackup));
  } catch (error) {
    console.error('Automatic backup failed:', error);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: '#f4f7fb',
    title: 'Fatima Lab Manager',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  const showWindow = () => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) mainWindow.show();
  };
  mainWindow.once('ready-to-show', showWindow);
  // `ready-to-show` is not reliable under every Wine/Bottles renderer. Never
  // leave the user with a running process and an invisible window.
  setTimeout(showWindow, 1200);
}

function register(channel, handler) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return await handler(...args);
    } catch (error) {
      console.error(channel, error);
      throw new Error(error && error.message ? error.message : String(error));
    }
  });
}

function registerIpc() {
  register('app:bootstrap', () => ({
    settings: store.getSettings(),
    doctors: store.listDoctors({ includeInactive: true }),
    version: app.getVersion(),
  }));
  register('auth:get-username', () => store.getAuthUsername());
  register('auth:verify', (password) => store.verifyPassword(password));
  register('auth:change-password', (currentPassword, newPassword) => {
    const result = store.changePassword(currentPassword, newPassword);
    makeDailyBackup();
    return result;
  });
  register('settings:get', () => store.getSettings());
  register('settings:update', (input) => {
    const result = store.updateSettings(input); makeDailyBackup(); return result;
  });
  register('doctors:list', (options) => store.listDoctors(options));
  register('doctors:save', (input) => {
    const result = store.saveDoctor(input); makeDailyBackup(); return result;
  });
  register('doctors:set-active', (id, active) => {
    const result = store.setDoctorActive(id, active); makeDailyBackup(); return result;
  });
  register('patients:list', (filters) => store.listPatients(filters));
  register('patients:get', (id) => store.getPatient(id));
  register('patients:add', (input) => {
    const record = store.addPatient(input);
    makeDailyBackup();
    return { record, settings: store.getSettings() };
  });
  register('patients:update', (id, input) => {
    const result = store.updatePatient(id, input); makeDailyBackup(); return result;
  });
  register('patients:delete', (id) => {
    const result = store.deletePatient(id); makeDailyBackup(); return result;
  });
  register('expenses:list', (filters) => store.listExpenses(filters));
  register('expenses:save', (input) => {
    const record = store.saveExpense(input);
    makeDailyBackup();
    return record;
  });
  register('expenses:delete', (id) => {
    const result = store.deleteExpense(id); makeDailyBackup(); return result;
  });
  register('expense-categories:list', (options) => store.listExpenseCategories(options));
  register('expense-categories:save', (input) => {
    const result = store.saveExpenseCategory(input); makeDailyBackup(); return result;
  });
  register('expense-categories:set-active', (id, active) => {
    const result = store.setExpenseCategoryActive(id, active); makeDailyBackup(); return result;
  });
  register('dashboard:get', (month) => store.dashboard(month));
  register('reports:doctor', (filters) => store.doctorReport(filters));
  register('data:open-folder', () => shell.openPath(dataDirectory));

  register('data:backup', async () => {
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save database backup',
      defaultPath: path.join(app.getPath('documents'), `fatima-lab-backup-${stamp}.db`),
      filters: [{ name: 'Fatima Lab Database', extensions: ['db'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    store.checkpoint();
    fs.copyFileSync(store.getDatabasePath(), result.filePath);
    return { canceled: false, filePath: result.filePath };
  });

  register('data:restore', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Restore database backup',
      properties: ['openFile'],
      filters: [{ name: 'Fatima Lab Database', extensions: ['db'] }],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const selected = result.filePaths[0];
    if (path.resolve(selected) === path.resolve(store.getDatabasePath())) {
      throw new Error('The active database is already open. Select a separate backup file.');
    }
    const confirm = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['Cancel', 'Restore'],
      defaultId: 0,
      cancelId: 0,
      title: 'Restore backup?',
      message: 'Current data will be replaced by the selected backup.',
      detail: 'A safety copy of the current database will be created first.',
    });
    if (confirm.response !== 1) return { canceled: true };
    const safety = `${store.getDatabasePath()}.before-restore-${Date.now()}`;
    store.checkpoint();
    fs.copyFileSync(store.getDatabasePath(), safety);
    store.close();
    try {
      fs.copyFileSync(selected, path.join(dataDirectory, 'fatima-lab.db'));
      await store.initialize(path.join(dataDirectory, 'fatima-lab.db'));
      return { canceled: false, safetyCopy: safety };
    } catch (error) {
      fs.copyFileSync(safety, path.join(dataDirectory, 'fatima-lab.db'));
      await store.initialize(path.join(dataDirectory, 'fatima-lab.db'));
      throw error;
    }
  });

  register('export:patients', async (filters = {}) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Export patient records',
      defaultPath: path.join(app.getPath('documents'), `patient-records-${filters.month || 'all'}.xlsx`),
      filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    const rows = [];
    let offset = 0;
    while (true) {
      const page = store.listPatients({ ...filters, limit: 1000, offset });
      rows.push(...page.rows);
      offset += page.rows.length;
      if (!page.rows.length || offset >= page.total) break;
    }
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Fatima Lab Manager';
    const sheet = workbook.addWorksheet('Patient Records', { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = [
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Lab No', key: 'labNo', width: 14 },
      { header: 'Patient Name', key: 'patientName', width: 30 },
      { header: 'Ref By', key: 'doctorName', width: 25 },
      { header: 'Fee', key: 'fee', width: 14 },
      { header: 'Discount', key: 'discount', width: 14 },
      { header: 'Net', key: 'net', width: 14 },
      { header: 'Paid', key: 'paid', width: 14 },
      { header: 'Due', key: 'due', width: 14 },
      { header: 'Commission %', key: 'commissionRate', width: 16 },
      { header: 'Commission', key: 'commission', width: 16 },
      { header: 'Notes', key: 'notes', width: 32 },
    ];
    rows.forEach((row) => sheet.addRow(row));
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17324D' } };
    ['E', 'F', 'G', 'H', 'I', 'K'].forEach((column) => { sheet.getColumn(column).numFmt = '#,##0.00'; });
    sheet.getColumn('J').numFmt = '0.00';
    sheet.autoFilter = { from: 'A1', to: 'L1' };
    await workbook.xlsx.writeFile(result.filePath);
    return { canceled: false, filePath: result.filePath, count: rows.length };
  });
}

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) app.quit();

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  dataDirectory = resolveDataDirectory();
  fs.mkdirSync(dataDirectory, { recursive: true });
  await store.initialize(path.join(dataDirectory, 'fatima-lab.db'));
  makeDailyBackup();
  registerIpc();
  createWindow();
});

app.on('window-all-closed', () => {
  store.close();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
