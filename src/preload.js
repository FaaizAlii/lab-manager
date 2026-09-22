'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('labAPI', {
  bootstrap: () => invoke('app:bootstrap'),
  auth: {
    getUsername: () => invoke('auth:get-username'),
    verify: (password) => invoke('auth:verify', password),
    changePassword: (currentPassword, newPassword) => invoke('auth:change-password', currentPassword, newPassword),
  },
  settings: {
    get: () => invoke('settings:get'),
    update: (input) => invoke('settings:update', input),
  },
  doctors: {
    list: (options) => invoke('doctors:list', options),
    save: (input) => invoke('doctors:save', input),
    setActive: (id, active) => invoke('doctors:set-active', id, active),
  },
  patients: {
    list: (filters) => invoke('patients:list', filters),
    get: (id) => invoke('patients:get', id),
    add: (input) => invoke('patients:add', input),
    update: (id, input) => invoke('patients:update', id, input),
    delete: (id) => invoke('patients:delete', id),
  },
  expenses: {
    list: (filters) => invoke('expenses:list', filters),
    save: (input) => invoke('expenses:save', input),
    delete: (id) => invoke('expenses:delete', id),
  },
  expenseCategories: {
    list: (options) => invoke('expense-categories:list', options),
    save: (input) => invoke('expense-categories:save', input),
    setActive: (id, active) => invoke('expense-categories:set-active', id, active),
  },
  dashboard: (month) => invoke('dashboard:get', month),
  doctorReport: (filters) => invoke('reports:doctor', filters),
  exportPatients: (filters) => invoke('export:patients', filters),
  data: {
    openFolder: () => invoke('data:open-folder'),
    backup: () => invoke('data:backup'),
    restore: () => invoke('data:restore'),
  },
});
