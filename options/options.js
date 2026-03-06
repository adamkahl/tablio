// Import utilities FIRST
import {
  escapeHtml,
  showStatus,
  updateBulkActions,
  exportSettings,
  importSettings,
  loadRecommendedDefaults,
  clearAllSettings
} from './utils.js';

import { loadGroups, showGroupEditModal } from './groups.js';

import {
  loadPairings,
  bulkDelete,
  bulkAssignGroup,
  setSearchQuery,
  clearSelectedPairings,
  getSelectedPairings
} from './pairings.js';

// Chrome compatibility layer - use globalThis to avoid redeclaration
if (typeof browser === 'undefined') {
  globalThis.browser = chrome;
}

function supportsTabGroupsApi() {
  return !!(browser?.tabs?.group && browser?.tabGroups?.update && browser?.tabGroups?.query);
}

// Load settings
async function loadSettings() {
  const { autoTidyEnabled, autoGroupTabsEnabled } = await browser.storage.local.get({ autoTidyEnabled: false, autoGroupTabsEnabled: true });
  const groupToggle = document.getElementById('auto-group-tabs-toggle');
  const groupDesc = document.getElementById('auto-group-tabs-description');
  const tabGroupsSupported = supportsTabGroupsApi();

  document.getElementById('auto-tidy-toggle').checked = autoTidyEnabled;
  groupToggle.checked = tabGroupsSupported && autoGroupTabsEnabled;
  groupToggle.disabled = !tabGroupsSupported;

  if (groupDesc) {
    groupDesc.textContent = tabGroupsSupported
      ? 'Automatically create browser tab groups based on your configured Groups'
      : 'Your browser does not support extension-controlled tab groups';
  }
}

function handleSearch(query) {
  setSearchQuery(query);
  clearSelectedPairings();
  loadPairings(browser);
}

function addGroup() {
  showGroupEditModal('', '', [], true, browser, (browser, loadPairingsFunc) => loadGroups(browser, loadPairingsFunc), () => loadPairings(browser));
}

// Event listeners
document.getElementById('auto-tidy-toggle').addEventListener('change', async (e) => {
  const autoTidyEnabled = e.target.checked;
  await browser.storage.local.set({ autoTidyEnabled });
  showStatus(autoTidyEnabled ? 'Auto-tidy enabled' : 'Auto-tidy disabled');
});

document.getElementById('auto-group-tabs-toggle').addEventListener('change', async (e) => {
  if (!supportsTabGroupsApi()) {
    e.target.checked = false;
    showStatus('Tab groups are not supported in this browser');
    return;
  }
  const autoGroupTabsEnabled = e.target.checked;
  await browser.storage.local.set({ autoGroupTabsEnabled });
  showStatus(autoGroupTabsEnabled ? 'Automatic tab grouping enabled' : 'Automatic tab grouping disabled');
});

document.getElementById('add-pairing').addEventListener('click', async () => {
  const result = await browser.storage.local.get({ groups: [] });
  // Trigger adding a new empty pairing
  await browser.storage.local.set({ pairings: [...(await browser.storage.local.get({ pairings: [] })).pairings, { url: '', name: '', emoji: '', group: '' }] });
  await loadPairings(browser);
});

document.getElementById('add-group').addEventListener('click', addGroup);
document.getElementById('export-settings').addEventListener('click', () => exportSettings(browser));
document.getElementById('import-settings').addEventListener('click', () => {
  const fileInput = document.getElementById('import-file');
  fileInput.value = '';
  fileInput.click();
});
document.getElementById('import-file').addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    importSettings(e.target.files[0], browser, (b, lp) => loadGroups(b, lp), () => loadPairings(browser), loadSettings);
  }
});
document.getElementById('load-defaults').addEventListener('click', () => 
  loadRecommendedDefaults(browser, (b, lp) => loadGroups(b, lp), () => loadPairings(browser), loadSettings)
);
document.getElementById('clear-all').addEventListener('click', () => 
  clearAllSettings(browser, (b, lp) => loadGroups(b, lp), () => loadPairings(browser), loadSettings)
);

document.getElementById('pattern-search').addEventListener('input', (e) => {
  handleSearch(e.target.value.trim());
});
document.getElementById('bulk-delete').addEventListener('click', () => bulkDelete(browser, loadPairings));
document.getElementById('bulk-assign-group').addEventListener('click', () => bulkAssignGroup(browser, loadPairings));
document.getElementById('bulk-deselect').addEventListener('click', () => {
  const selected = getSelectedPairings();
  selected.clear();
  document.querySelectorAll('.pairing-item .pairing-checkbox').forEach(cb => { cb.checked = false; });
  document.querySelectorAll('.pairing-item .pairing-header').forEach(h => { h.style.background = '#f8f9fa'; h.style.borderColor = 'transparent'; });
  updateBulkActions(selected);
});

loadPairings(browser);
loadGroups(browser, () => loadPairings(browser));
loadSettings();
