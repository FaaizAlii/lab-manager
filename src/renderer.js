'use strict';

const api = window.labAPI;
const state = {
  settings: null,
  doctors: [],
  patientPage: 0,
  patientPageSize: 250,
  patientTotal: 0,
  currentPatientRows: [],
  currentReportRows: [],
  currentExpenses: [],
  categories: [],
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];


function localIso(day = new Date()) {
  const y = day.getFullYear();
  const m = String(day.getMonth() + 1).padStart(2, '0');
  const d = String(day.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function currentMonth() {
  return localIso().slice(0, 7);
}

function monthStart(month) {
  return `${month}-01`;
}

function monthEnd(month) {
  const [year, number] = month.split('-').map(Number);
  return localIso(new Date(year, number, 0));
}

function money(value) {
  return `Rs ${Number(value || 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatDate(value) {
  if (!value) return '—';
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function cleanError(error) {
  return String(error && error.message ? error.message : error)
    .replace(/^Error invoking remote method '[^']+': Error: /, '')
    .replace(/^Error: /, '');
}

function toast(title, message = '', type = 'success') {
  const item = document.createElement('div');
  item.className = `toast ${type === 'error' ? 'error' : ''}`;
  item.innerHTML = `<strong>${escapeHtml(title)}</strong>${message ? `<span>${escapeHtml(message)}</span>` : ''}`;
  $('#toast-stack').append(item);
  setTimeout(() => item.remove(), 3800);
}

async function run(task, successMessage) {
  try {
    const result = await task();
    if (successMessage) toast(successMessage);
    return result;
  } catch (error) {
    toast('Could not complete the action', cleanError(error), 'error');
    throw error;
  }
}

const pageMeta = {
  dashboard: ['Dashboard', 'Your lab at a glance'],
  entry: ['New Patient', 'Fast keyboard-friendly patient entry'],
  patients: ['Patient Records', 'Search, filter, update or delete records'],
  expenses: ['Expenses', 'Daily expense entry and records'],
  doctors: ['Doctors / Ref By', 'Referral sources and commission rates'],
  reports: ['Doctor Report', 'Patients, payments and commission by doctor'],
  settings: ['Settings & Backup', 'Numbering, storage and data protection'],
};

async function navigate(page) {
  $$('.page').forEach((node) => node.classList.toggle('active', node.id === `page-${page}`));
  $$('.nav-item[data-page]').forEach((node) => node.classList.toggle('active', node.dataset.page === page));
  $('#page-title').textContent = pageMeta[page][0];
  $('#page-subtitle').textContent = pageMeta[page][1];
  $('.content').scrollTo({ top: 0, behavior: 'smooth' });
  if (page === 'dashboard') await loadDashboard();
  if (page === 'patients') await loadPatients();
  if (page === 'expenses') await loadExpenses();
  if (page === 'doctors') await loadDoctors();
  if (page === 'reports') await loadReport();
  if (page === 'entry') setTimeout(() => $('#patient-name').focus(), 80);
}

function metricCards(items) {
  const colors = ['teal', 'blue', 'amber', 'green', 'coral'];
  return items.map((item, index) => `
    <div class="metric-card ${item.color || colors[index % colors.length]}">
      <span>${escapeHtml(item.label)}</span><strong>${item.money === false ? escapeHtml(item.value) : money(item.value)}</strong>
      ${item.note ? `<small>${escapeHtml(item.note)}</small>` : ''}
    </div>`).join('');
}

async function loadDashboard() {
  const month = $('#dashboard-month').value || currentMonth();
  const data = await run(() => api.dashboard(month));
  $('#dashboard-metrics').innerHTML = metricCards([
    { label: 'Patients', value: data.patients, money: false, note: 'Selected month' },
    { label: 'Gross fees', value: data.fee },
    { label: 'Net payable', value: data.net },
    { label: 'Paid sales', value: data.paid },
    { label: 'Outstanding due', value: data.due },
    { label: 'Expenses', value: data.expenses },
    { label: 'Cash balance', value: data.balance },
    { label: 'Doctor commission', value: data.commission, note: 'Calculated from paid' },
  ]);
  renderActivityChart(month, data.daily);
  const recent = await run(() => api.patients.list({ limit: 8, sort: 'desc' }));
  $('#recent-patients').innerHTML = recent.rows.length ? recent.rows.map((row) => `
    <tr><td>${formatDate(row.date)}</td><td>${escapeHtml(row.labNo)}</td><td class="patient-cell"><strong>${escapeHtml(row.patientName)}</strong></td><td>${escapeHtml(row.doctorName)}</td><td class="num">${money(row.paid)}</td><td class="num">${money(row.due)}</td></tr>
  `).join('') : emptyRow(6, 'No patients yet. Add the first patient to begin.');
}

function renderActivityChart(month, rows) {
  const [year, number] = month.split('-').map(Number);
  const days = new Date(year, number, 0).getDate();
  const map = new Map(rows.map((row) => [Number(row.date.slice(-2)), row]));
  const full = Array.from({ length: days }, (_, index) => map.get(index + 1) || { paid: 0, expense: 0 });
  const max = Math.max(1, ...full.flatMap((row) => [row.paid, row.expense]));
  $('#activity-chart').innerHTML = full.map((row, index) => {
    const paidHeight = Math.max(row.paid ? 2 : 0, (row.paid / max) * 100);
    const expenseHeight = Math.max(row.expense ? 2 : 0, (row.expense / max) * 100);
    const date = `${month}-${String(index + 1).padStart(2, '0')}`;
    return `<div class="day-bar" data-date="${date}" data-tip="${index + 1}: ${money(row.paid)} paid · ${money(row.expense)} expense · click for detail"><i class="paid" style="height:${paidHeight}%"></i><i class="expense" style="height:${expenseHeight}%"></i>${(index + 1) % 5 === 0 || index === 0 ? `<small>${index + 1}</small>` : ''}</div>`;
  }).join('');
}

async function showDayDetail(date) {
  const [patients, expenses] = await Promise.all([
    run(() => api.patients.list({ day: date, sort: 'asc', limit: 1000 })),
    run(() => api.expenses.list({ day: date, sort: 'asc' })),
  ]);
  const paid = patients.rows.reduce((sum, row) => sum + row.paid, 0);
  const due = patients.rows.reduce((sum, row) => sum + row.due, 0);
  const expenseTotal = expenses.reduce((sum, row) => sum + row.amount, 0);
  $('#day-detail-date').textContent = formatDate(date);
  $('#day-detail-totals').textContent = `${patients.rows.length} patient${patients.rows.length === 1 ? '' : 's'} · ${money(paid)} paid · ${money(due)} due · ${money(expenseTotal)} expenses`;
  $('#day-detail-patients').innerHTML = patients.rows.length ? patients.rows.map((row) => `<tr><td>${escapeHtml(row.labNo)}</td><td>${escapeHtml(row.patientName)}</td><td>${escapeHtml(row.doctorName)}</td><td class="num">${money(row.paid)}</td><td class="num">${money(row.due)}</td></tr>`).join('') : emptyRow(5, 'No patients on this date.');
  $('#day-detail-expenses').innerHTML = expenses.length ? expenses.map((row) => `<tr><td>${escapeHtml(row.category)}</td><td>${escapeHtml(row.description)}</td><td class="num">${money(row.amount)}</td></tr>`).join('') : emptyRow(3, 'No expenses on this date.');
  $('#day-detail-panel').hidden = false;
  $('#day-detail-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function activeDoctors() {
  return state.doctors.filter((doctor) => doctor.active);
}

function optionMarkup(doctors, { all = false, selected = '' } = {}) {
  const options = all ? '<option value="">All doctors / referrals</option>' : '';
  return options + doctors.map((doctor) => `<option value="${doctor.id}" ${String(doctor.id) === String(selected) ? 'selected' : ''}>${escapeHtml(doctor.name)}${doctor.active ? '' : ' (Inactive)'}</option>`).join('');
}

function refreshDoctorSelects() {
  const active = activeDoctors();
  const entryValue = $('#patient-doctor').value;
  $('#patient-doctor').innerHTML = optionMarkup(active, { selected: entryValue });
  if (!$('#patient-doctor').value) {
    const self = active.find((doctor) => doctor.name.toUpperCase() === 'SELF');
    if (self) $('#patient-doctor').value = self.id;
  }
  const patientFilter = $('#patient-doctor-filter').value;
  $('#patient-doctor-filter').innerHTML = optionMarkup(state.doctors, { all: true, selected: patientFilter });
  const reportValue = $('#report-doctor').value;
  $('#report-doctor').innerHTML = optionMarkup(state.doctors, { all: true, selected: reportValue });
}

function patientPayload() {
  return {
    date: $('#patient-date').value,
    labNo: $('#patient-lab').value,
    patientName: $('#patient-name').value,
    doctorId: Number($('#patient-doctor').value),
    fee: Number($('#patient-fee').value || 0),
    discount: Number($('#patient-discount').value || 0),
    paid: Number($('#patient-paid').value || 0),
    notes: $('#patient-notes').value,
  };
}

function calculatePatient() {
  const fee = Number($('#patient-fee').value || 0);
  const discount = Number($('#patient-discount').value || 0);
  const paid = Number($('#patient-paid').value || 0);
  const net = fee - discount;
  const due = net - paid;
  const doctor = state.doctors.find((item) => item.id === Number($('#patient-doctor').value));
  const rate = doctor ? doctor.commissionRate : 0;
  $('#calc-fee').textContent = money(fee);
  $('#calc-discount').textContent = money(discount);
  $('#calc-net').textContent = money(net);
  $('#calc-paid').textContent = money(paid);
  $('#calc-due').textContent = money(due);
  $('#calc-rate').textContent = `${rate.toLocaleString('en-PK', { maximumFractionDigits: 2 })}%`;
  $('#calc-commission').textContent = money(paid * rate / 100);
}

function resetPatientForm({ keepDateDoctor = true } = {}) {
  const date = keepDateDoctor ? $('#patient-date').value : localIso();
  const doctor = keepDateDoctor ? $('#patient-doctor').value : '';
  $('#patient-form').reset();
  $('#patient-id').value = '';
  $('#patient-date').value = date || localIso();
  $('#patient-lab').value = state.settings.nextLabNo;
  refreshDoctorSelects();
  if (doctor && activeDoctors().some((item) => String(item.id) === doctor)) $('#patient-doctor').value = doctor;
  $('#patient-form-title').textContent = 'New patient record';
  $('#patient-submit-label').textContent = 'Save patient';
  $('#patient-discount').value = '0';
  $('#patient-paid').value = '0';
  calculatePatient();
}

async function submitPatient(event) {
  event.preventDefault();
  if (!$('#patient-form').reportValidity()) return;
  const input = patientPayload();
  if (input.discount > input.fee) {
    toast('Discount is too high', 'Discount cannot be greater than the fee.', 'error');
    $('#patient-discount').focus(); return;
  }
  const id = Number($('#patient-id').value || 0);
  try {
    if (id) {
      await run(() => api.patients.update(id, input), 'Patient record updated');
      state.settings = await api.settings.get();
      resetPatientForm({ keepDateDoctor: false });
    } else {
      const result = await run(() => api.patients.add(input), 'Patient saved');
      state.settings = result.settings;
      resetPatientForm({ keepDateDoctor: true });
    }
    $('#patient-name').focus();
  } catch (_) { /* toast handled by run */ }
}

async function editPatient(id) {
  const row = await run(() => api.patients.get(id));
  await navigate('entry');
  $('#patient-id').value = row.id;
  $('#patient-date').value = row.date;
  $('#patient-lab').value = row.labNo;
  $('#patient-name').value = row.patientName;
  if (!activeDoctors().some((doctor) => doctor.id === row.doctorId)) {
    $('#patient-doctor').insertAdjacentHTML('beforeend', `<option value="${row.doctorId}">${escapeHtml(row.doctorName)} (Inactive)</option>`);
  }
  $('#patient-doctor').value = row.doctorId;
  $('#patient-fee').value = row.fee;
  $('#patient-discount').value = row.discount;
  $('#patient-paid').value = row.paid;
  $('#patient-notes').value = row.notes;
  $('#patient-form-title').textContent = `Edit Lab No ${row.labNo}`;
  $('#patient-submit-label').textContent = 'Update patient';
  calculatePatient();
  $('#patient-name').focus();
}

function patientFilters() {
  return {
    search: $('#patient-search').value,
    month: $('#patient-month-filter').value,
    day: $('#patient-day-filter').value,
    doctorId: $('#patient-doctor-filter').value,
    sort: $('#patient-sort').value,
    duesOnly: $('#patient-dues-only').checked,
    limit: state.patientPageSize,
    offset: state.patientPage * state.patientPageSize,
  };
}

async function loadPatients() {
  const result = await run(() => api.patients.list(patientFilters()));
  state.currentPatientRows = result.rows;
  state.patientTotal = result.total;
  $('#patient-result-count').textContent = `${result.total.toLocaleString()} record${result.total === 1 ? '' : 's'}`;
  $('#patients-table').innerHTML = result.rows.length ? result.rows.map(patientTableRow).join('') : emptyRow(9, 'No records match these filters.');
  const pages = Math.max(1, Math.ceil(result.total / state.patientPageSize));
  $('#patients-page-label').textContent = `Page ${state.patientPage + 1} of ${pages}`;
  $('#patients-prev').disabled = state.patientPage === 0;
  $('#patients-next').disabled = state.patientPage + 1 >= pages;
}

function patientTableRow(row) {
  return `<tr data-id="${row.id}">
    <td>${formatDate(row.date)}</td><td><strong>${escapeHtml(row.labNo)}</strong></td>
    <td class="patient-cell"><strong>${escapeHtml(row.patientName)}</strong>${row.notes ? `<small>${escapeHtml(row.notes)}</small>` : ''}</td>
    <td>${escapeHtml(row.doctorName)}</td><td class="num">${money(row.fee)}</td><td class="num">${money(row.paid)}</td>
    <td class="num">${money(row.due)}</td><td class="num">${money(row.commission)}</td>
    <td class="actions"><button class="row-action edit-patient">Edit</button><button class="row-action delete delete-patient">Delete</button></td></tr>`;
}

function emptyRow(columns, message) {
  return `<tr class="empty-row"><td colspan="${columns}">${escapeHtml(message)}</td></tr>`;
}

function expensePayload() {
  return {
    id: Number($('#expense-id').value || 0), date: $('#expense-date').value,
    amount: Number($('#expense-amount').value || 0), category: $('#expense-category').value,
    description: $('#expense-description').value, notes: $('#expense-notes').value,
  };
}

function resetExpenseForm() {
  $('#expense-form').reset();
  $('#expense-id').value = '';
  $('#expense-date').value = localIso();
  const fallback = state.categories.find((item) => item.active) || state.categories[0];
  if (fallback) $('#expense-category').value = fallback.name;
  $('#expense-form-title').textContent = 'Add expense';
  $('#expense-submit-label').textContent = 'Save expense';
}

function refreshCategorySelect() {
  const active = state.categories.filter((item) => item.active);
  const current = $('#expense-category').value;
  $('#expense-category').innerHTML = active.map((item) => `<option value="${escapeHtml(item.name)}" ${item.name === current ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('');
  if (current && active.some((item) => item.name === current)) $('#expense-category').value = current;
}

async function loadCategories() {
  state.categories = await run(() => api.expenseCategories.list({ includeInactive: true }));
  refreshCategorySelect();
  $('#categories-table').innerHTML = state.categories.map((item) => `<tr data-id="${item.id}"><td>${escapeHtml(item.name)}</td><td><span class="status ${item.active ? 'active' : 'inactive'}">${item.active ? 'Active' : 'Inactive'}</span></td><td class="actions"><button class="row-action rename-category">Rename</button>${item.name.toUpperCase() === 'GENERAL' ? '' : `<button class="row-action toggle-category">${item.active ? 'Deactivate' : 'Activate'}</button>`}</td></tr>`).join('');
}

async function loadExpenses() {
  const rows = await run(() => api.expenses.list({ month: $('#expense-month-filter').value, search: $('#expense-search').value, sort: 'desc' }));
  state.currentExpenses = rows;
  $('#expense-count').textContent = `${rows.length} expense${rows.length === 1 ? '' : 's'}`;
  $('#expense-total').textContent = money(rows.reduce((sum, row) => sum + row.amount, 0));
  $('#expenses-table').innerHTML = rows.length ? rows.map((row) => `<tr data-id="${row.id}"><td>${formatDate(row.date)}</td><td>${escapeHtml(row.category)}</td><td class="patient-cell"><strong>${escapeHtml(row.description)}</strong>${row.notes ? `<small>${escapeHtml(row.notes)}</small>` : ''}</td><td class="num">${money(row.amount)}</td><td class="actions"><button class="row-action edit-expense">Edit</button><button class="row-action delete delete-expense">Delete</button></td></tr>`).join('') : emptyRow(5, 'No expenses match this month or search.');
}

async function loadDoctors() {
  state.doctors = await run(() => api.doctors.list({ includeInactive: true }));
  refreshDoctorSelects();
  $('#active-doctor-count').textContent = `${activeDoctors().length} active`;
  $('#doctors-table').innerHTML = state.doctors.map((doctor) => `<tr data-id="${doctor.id}"><td class="patient-cell"><strong>${escapeHtml(doctor.name)}</strong>${doctor.notes ? `<small>${escapeHtml(doctor.notes)}</small>` : ''}</td><td class="num">${doctor.commissionRate.toLocaleString('en-PK', { maximumFractionDigits: 2 })}%</td><td class="num">${doctor.patient_count || 0}</td><td class="num">${money(doctor.paid)}</td><td class="num">${money(doctor.commission)}</td><td><span class="status ${doctor.active ? 'active' : 'inactive'}">${doctor.active ? 'Active' : 'Inactive'}</span></td><td class="actions"><button class="row-action edit-doctor">Edit</button>${doctor.name.toUpperCase() === 'SELF' ? '' : `<button class="row-action toggle-doctor">${doctor.active ? 'Deactivate' : 'Activate'}</button>`}</td></tr>`).join('');
}

function resetDoctorForm() {
  $('#doctor-form').reset();
  $('#doctor-id').value = '';
  $('#doctor-rate').value = '0';
  $('#doctor-active').checked = true;
  $('#doctor-form-title').textContent = 'Add doctor / referral';
}

async function loadReport() {
  const filters = {
    doctorId: $('#report-doctor').value,
    from: $('#report-from').value,
    to: $('#report-to').value,
    sort: 'asc', limit: 1000,
  };
  const [summary, result] = await Promise.all([
    run(() => api.doctorReport(filters)),
    run(() => api.patients.list(filters)),
  ]);
  state.currentReportRows = result.rows;
  $('#report-metrics').innerHTML = metricCards([
    { label: 'Patients', value: summary.patients, money: false }, { label: 'Gross fees', value: summary.fee },
    { label: 'Discount', value: summary.discount }, { label: 'Net payable', value: summary.net },
    { label: 'Paid', value: summary.paid }, { label: 'Due', value: summary.due },
    { label: 'Commission', value: summary.commission, note: 'From paid only' },
  ]);
  $('#report-table').innerHTML = result.rows.length ? result.rows.map((row) => `<tr><td>${formatDate(row.date)}</td><td>${escapeHtml(row.labNo)}</td><td>${escapeHtml(row.patientName)}</td><td class="num">${money(row.net)}</td><td class="num">${money(row.paid)}</td><td class="num">${money(row.due)}</td><td class="num">${money(row.commission)}</td></tr>`).join('') : emptyRow(7, 'No patients match this doctor and date range.');
}

function confirmAction(title, message, button = 'Delete') {
  return new Promise((resolve) => {
    const dialog = $('#confirm-dialog');
    $('#confirm-title').textContent = title;
    $('#confirm-message').textContent = message;
    $('#confirm-ok').textContent = button;
    const finish = (value) => {
      $('#confirm-ok').onclick = null; $('#confirm-cancel').onclick = null;
      dialog.close(); resolve(value);
    };
    $('#confirm-ok').onclick = () => finish(true);
    $('#confirm-cancel').onclick = () => finish(false);
    dialog.showModal();
  });
}

function debounce(fn, delay = 250) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

async function bootstrap() {
  const data = await api.bootstrap();
  state.settings = data.settings;
  state.doctors = data.doctors;
  $('#brand-name').textContent = data.settings.labName;
  $('#setting-lab-name').value = data.settings.labName;
  $('#setting-next-lab').value = data.settings.nextLabNo;
  $('#database-path').textContent = data.settings.databasePath;
  $('#app-version').textContent = data.version;
  $('#today-label').textContent = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  $('#dashboard-month').value = currentMonth();
  $('#patient-month-filter').value = currentMonth();
  $('#expense-month-filter').value = currentMonth();
  $('#report-from').value = monthStart(currentMonth());
  $('#report-to').value = monthEnd(currentMonth());
  $('#patient-date').value = localIso();
  $('#expense-date').value = localIso();
  refreshDoctorSelects();
  state.categories = await api.expenseCategories.list({ includeInactive: true });
  refreshCategorySelect();
  resetPatientForm({ keepDateDoctor: true });
  await loadDashboard();
  $('#loading-overlay').classList.add('hidden');
}

function wireEvents() {
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-page]'); if (button) navigate(button.dataset.page);
  });
  document.addEventListener('click', (event) => {
    const go = event.target.closest('[data-go]'); if (go) navigate(go.dataset.go);
  });
  $('#dashboard-refresh').addEventListener('click', loadDashboard);
  $('#dashboard-month').addEventListener('change', loadDashboard);
  $('#activity-chart').addEventListener('click', (event) => {
    const bar = event.target.closest('.day-bar'); if (bar) showDayDetail(bar.dataset.date);
  });
  $('#day-detail-close').addEventListener('click', () => { $('#day-detail-panel').hidden = true; });

  $('#patient-form').addEventListener('submit', submitPatient);
  $('#patient-form').addEventListener('input', calculatePatient);
  $('#patient-form').addEventListener('change', calculatePatient);
  $('#patient-form').addEventListener('focusin', (event) => {
    // Selection APIs are unsupported on type="number" inputs, so clearing a
    // default "0" on focus is what actually lets typing override it instead
    // of appending after it (e.g. "0" + "5" becoming "05").
    if (event.target.tagName === 'INPUT' && event.target.type === 'number' && event.target.value === '0') {
      event.target.value = '';
    }
  });
  $('#patient-clear').addEventListener('click', () => resetPatientForm({ keepDateDoctor: true }));
  $('#patient-form').addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.key === 'Enter') { event.preventDefault(); $('#patient-form').requestSubmit(); return; }
    if (event.key !== 'Enter' || event.shiftKey) return;
    const controls = ['patient-date', 'patient-lab', 'patient-name', 'patient-doctor', 'patient-fee', 'patient-discount', 'patient-paid', 'patient-notes'];
    const index = controls.indexOf(event.target.id);
    if (index < 0) return;
    event.preventDefault();
    if (index === controls.length - 1) $('#patient-form').requestSubmit();
    else $(`#${controls[index + 1]}`).focus();
  });
  $('#quick-add-doctor').addEventListener('click', async () => { await navigate('doctors'); resetDoctorForm(); $('#doctor-name').focus(); });

  const reloadPatients = debounce(() => { state.patientPage = 0; loadPatients(); });
  $('#patient-search').addEventListener('input', reloadPatients);
  ['patient-month-filter', 'patient-day-filter', 'patient-doctor-filter', 'patient-sort', 'patient-dues-only'].forEach((id) => $(`#${id}`).addEventListener('change', reloadPatients));
  $('#patients-reset').addEventListener('click', () => { $('#patient-search').value = ''; $('#patient-month-filter').value = ''; $('#patient-day-filter').value = ''; $('#patient-doctor-filter').value = ''; $('#patient-sort').value = 'desc'; $('#patient-dues-only').checked = false; state.patientPage = 0; loadPatients(); });
  $('#patients-prev').addEventListener('click', () => { if (state.patientPage > 0) { state.patientPage--; loadPatients(); } });
  $('#patients-next').addEventListener('click', () => { state.patientPage++; loadPatients(); });
  $('#patients-export').addEventListener('click', async () => { const result = await run(() => api.exportPatients(patientFilters())); if (!result.canceled) toast('Excel file exported', `${result.count} records saved.`); });
  $('#patients-table').addEventListener('click', async (event) => {
    const row = event.target.closest('tr[data-id]'); if (!row) return;
    const id = Number(row.dataset.id);
    if (event.target.closest('.edit-patient')) editPatient(id);
    if (event.target.closest('.delete-patient') && await confirmAction('Delete patient record?', 'This permanently removes the patient record.')) {
      await run(() => api.patients.delete(id), 'Patient record deleted'); loadPatients();
    }
  });

  $('#expense-form').addEventListener('submit', async (event) => {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return;
    try { await run(() => api.expenses.save(expensePayload()), $('#expense-id').value ? 'Expense updated' : 'Expense saved'); resetExpenseForm(); await loadExpenses(); } catch (_) {}
  });
  $('#expense-clear').addEventListener('click', resetExpenseForm);
  const reloadExpenses = debounce(loadExpenses);
  $('#expense-month-filter').addEventListener('change', loadExpenses);
  $('#expense-search').addEventListener('input', reloadExpenses);
  $('#expenses-table').addEventListener('click', async (event) => {
    const rowNode = event.target.closest('tr[data-id]'); if (!rowNode) return;
    const id = Number(rowNode.dataset.id); const row = state.currentExpenses.find((item) => item.id === id);
    if (event.target.closest('.edit-expense')) {
      $('#expense-id').value = row.id; $('#expense-date').value = row.date; $('#expense-amount').value = row.amount;
      $('#expense-category').value = row.category; $('#expense-description').value = row.description; $('#expense-notes').value = row.notes;
      $('#expense-form-title').textContent = 'Edit expense'; $('#expense-submit-label').textContent = 'Update expense'; $('#expense-amount').focus();
    }
    if (event.target.closest('.delete-expense') && await confirmAction('Delete expense?', 'This permanently removes the expense record.')) {
      await run(() => api.expenses.delete(id), 'Expense deleted'); loadExpenses();
    }
  });

  $('#expense-category-manage').addEventListener('click', async () => { $('#category-manage-panel').hidden = false; await loadCategories(); });
  $('#category-manage-close').addEventListener('click', () => { $('#category-manage-panel').hidden = true; });
  $('#category-add').addEventListener('click', async () => {
    const name = $('#category-new-name').value.trim();
    if (!name) return;
    try { await run(() => api.expenseCategories.save({ name }), 'Category added'); $('#category-new-name').value = ''; await loadCategories(); } catch (_) {}
  });
  $('#categories-table').addEventListener('click', async (event) => {
    const node = event.target.closest('tr[data-id]'); if (!node) return;
    const category = state.categories.find((item) => item.id === Number(node.dataset.id));
    if (event.target.closest('.rename-category')) {
      const name = window.prompt('Rename category', category.name);
      if (name && name.trim() && name.trim() !== category.name) {
        try { await run(() => api.expenseCategories.save({ id: category.id, name: name.trim() }), 'Category renamed'); await loadCategories(); } catch (_) {}
      }
    }
    if (event.target.closest('.toggle-category')) {
      const verb = category.active ? 'Deactivate' : 'Activate';
      if (await confirmAction(`${verb} ${category.name}?`, category.active ? 'It will disappear from the expense form but past expenses remain unchanged.' : 'It will return to the expense form.', verb)) {
        await run(() => api.expenseCategories.setActive(category.id, !category.active), `Category ${verb.toLowerCase()}d`); await loadCategories();
      }
    }
  });

  $('#doctor-form').addEventListener('submit', async (event) => {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return;
    const input = { id: Number($('#doctor-id').value || 0), name: $('#doctor-name').value, commissionRate: Number($('#doctor-rate').value || 0), notes: $('#doctor-notes').value, active: $('#doctor-active').checked };
    try { await run(() => api.doctors.save(input), input.id ? 'Doctor updated' : 'Doctor added'); resetDoctorForm(); await loadDoctors(); } catch (_) {}
  });
  $('#doctor-clear').addEventListener('click', resetDoctorForm);
  $('#doctors-table').addEventListener('click', async (event) => {
    const node = event.target.closest('tr[data-id]'); if (!node) return;
    const doctor = state.doctors.find((item) => item.id === Number(node.dataset.id));
    if (event.target.closest('.edit-doctor')) {
      $('#doctor-id').value = doctor.id; $('#doctor-name').value = doctor.name; $('#doctor-rate').value = doctor.commissionRate;
      $('#doctor-notes').value = doctor.notes || ''; $('#doctor-active').checked = doctor.active; $('#doctor-form-title').textContent = `Edit ${doctor.name}`; $('#doctor-name').focus();
    }
    if (event.target.closest('.toggle-doctor')) {
      const verb = doctor.active ? 'Deactivate' : 'Activate';
      if (await confirmAction(`${verb} ${doctor.name}?`, doctor.active ? 'The name will disappear from new-entry dropdowns but old records remain unchanged.' : 'The name will return to new-entry dropdowns.', verb)) {
        await run(() => api.doctors.setActive(doctor.id, !doctor.active), `Doctor ${verb.toLowerCase()}d`); await loadDoctors();
      }
    }
  });

  $('#report-run').addEventListener('click', loadReport);
  $('#report-export').addEventListener('click', async () => { const filters = { doctorId: $('#report-doctor').value, from: $('#report-from').value, to: $('#report-to').value, sort: 'asc' }; const result = await run(() => api.exportPatients(filters)); if (!result.canceled) toast('Doctor report exported', `${result.count} records saved.`); });

  $('#settings-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      state.settings = await run(() => api.settings.update({ labName: $('#setting-lab-name').value, nextLabNo: $('#setting-next-lab').value }), 'Settings saved');
      $('#brand-name').textContent = state.settings.labName; if (!$('#patient-id').value) $('#patient-lab').value = state.settings.nextLabNo;
    } catch (_) {}
  });
  $('#open-data-folder').addEventListener('click', () => api.data.openFolder());
  $('#backup-data').addEventListener('click', async () => { const result = await run(() => api.data.backup()); if (!result.canceled) toast('Backup created', result.filePath); });
  $('#restore-data').addEventListener('click', async () => {
    const result = await run(() => api.data.restore());
    if (!result.canceled) { toast('Backup restored', 'The app data has been reloaded.'); setTimeout(() => location.reload(), 700); }
  });
  $('#change-password-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const current = $('#current-password').value;
    const next = $('#new-password').value;
    const confirm = $('#confirm-password').value;
    if (next !== confirm) { toast('Password change failed', 'New password and confirmation do not match.'); return; }
    try {
      await api.auth.changePassword(current, next);
      $('#change-password-form').reset();
      toast('Password changed', 'Use the new password next time you log in.');
    } catch (error) {
      toast('Password change failed', cleanError(error));
    }
  });
}

async function startApp() {
  $('#login-overlay').classList.add('hidden');
  $('#app-shell').style.display = '';
  wireEvents();
  bootstrap().catch((error) => {
    $('#loading-overlay').innerHTML = `<strong>Could not start Fatima Lab Manager</strong><span>${escapeHtml(cleanError(error))}</span>`;
  });
}

(async function login() {
  const username = await api.auth.getUsername();
  $('#login-username').value = username;
  $('#login-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const password = $('#login-password').value;
    const ok = await api.auth.verify(password);
    if (ok) {
      await startApp();
    } else {
      $('#login-error').textContent = 'Incorrect password.';
      $('#login-password').value = '';
      $('#login-password').focus();
    }
  });
})();
