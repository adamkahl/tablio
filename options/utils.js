// Utility functions for Tablio options page

/**
 * Escape HTML to prevent XSS
 */
export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Show temporary status message
 */
export function showStatus(message = 'Saved') {
  const status = document.getElementById('status');
  if (!status) return;
  
  const span = status.querySelector('span');
  if (span) span.textContent = message;
  status.style.display = 'flex';
  
  clearTimeout(status.hideTimeout);
  status.hideTimeout = setTimeout(() => {
    status.style.display = 'none';
  }, 2000);
}

/**
 * Update bulk actions bar visibility and count
 */
export function updateBulkActions(selectedPairings) {
  const bar = document.getElementById('bulk-actions-bar');
  if (!bar) return;
  const count = selectedPairings.size;
  bar.style.display = count > 0 ? 'flex' : 'none';
  const span = bar.querySelector('.bulk-count');
  if (span) span.textContent = `${count} selected`;
}

/**
 * Clear group drop indicators for drag and drop
 */
export function clearGroupDropIndicators() {
  document.querySelectorAll('.group-item.drop-before, .group-item.drop-after')
    .forEach(el => el.classList.remove('drop-before', 'drop-after'));
}

/**
 * Export settings to JSON file
 */
export async function exportSettings(browser) {
  const data = await browser.storage.local.get({ pairings: [], groups: [], autoTidyEnabled: false, autoGroupTabsEnabled: true });
  
  const exportData = {
    version: '1.1',
    exportDate: new Date().toISOString(),
    pairings: data.pairings,
    groups: data.groups,
    autoTidyEnabled: data.autoTidyEnabled,
    autoGroupTabsEnabled: data.autoGroupTabsEnabled
  };
  
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tablio-settings-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showStatus('Settings exported');
}

/**
 * Load recommended defaults from config file
 */
export async function loadRecommendedDefaults(browser, loadGroups, loadPairings, loadSettings) {
  try {
    const resp = await fetch('../default-config.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const importData = await resp.json();

    if (!confirm('This will replace all current settings with the recommended defaults. Continue?')) {
      return;
    }

    await browser.storage.local.set({
      pairings: importData.pairings || [],
      groups: importData.groups || [],
      autoTidyEnabled: importData.autoTidyEnabled ?? false,
      autoGroupTabsEnabled: importData.autoGroupTabsEnabled ?? true
    });

    await loadGroups(browser);  // Add browser parameter
    await loadPairings(browser);  // Add browser parameter
    await loadSettings();
    showStatus('Recommended defaults loaded');
  } catch (error) {
    alert(`Failed to load recommended defaults: ${error.message}`);
  }
}

/**
 * Import settings from JSON file
 */
export async function importSettings(file, browser, loadGroups, loadPairings, loadSettings) {
  try {
    const text = await file.text();
    const importData = JSON.parse(text);
    
    if (!importData.pairings || !Array.isArray(importData.pairings)) {
      throw new Error('Invalid settings file: missing or invalid pairings');
    }
    
    if (!importData.groups || !Array.isArray(importData.groups)) {
      throw new Error('Invalid settings file: missing or invalid groups');
    }
    
    if (!confirm('This will replace all current settings. Continue?')) {
      return;
    }
    
    await browser.storage.local.set({
      pairings: importData.pairings,
      groups: importData.groups,
      autoTidyEnabled: importData.autoTidyEnabled ?? false,
      autoGroupTabsEnabled: importData.autoGroupTabsEnabled ?? true
    });
    
    await loadGroups(browser);  // Add browser parameter
    await loadPairings(browser);  // Add browser parameter
    await loadSettings();
    
    showStatus('Settings imported successfully');
  } catch (error) {
    alert(`Import failed: ${error.message}`);
  }
}

/**
 * Clear all settings with double confirmation
 */
export async function clearAllSettings(browser, loadGroups, loadPairings, loadSettings) {
  if (!confirm('This will delete ALL patterns, groups, and settings. This cannot be undone. Continue?')) {
    return;
  }

  if (!confirm('Are you absolutely sure? All your configuration will be permanently deleted.')) {
    return;
  }

  await browser.storage.local.set({
    pairings: [],
    groups: [],
    autoTidyEnabled: false,
    autoGroupTabsEnabled: true
  });

  await loadGroups(browser);  // Add browser parameter
  await loadPairings(browser);  // Add browser parameter
  await loadSettings();
  showStatus('All settings cleared');
}

/**
 * Reorder groups after drag and drop
 */
export async function reorderGroups(fromIndex, toIndex, browser, loadGroups) {
  if (Number.isNaN(fromIndex) || Number.isNaN(toIndex)) return;

  const { groups } = await browser.storage.local.get({ groups: [] });
  if (fromIndex < 0 || fromIndex >= groups.length) return;

  const item = groups.splice(fromIndex, 1)[0];
  const clampedTo = Math.max(0, Math.min(toIndex, groups.length));
  groups.splice(clampedTo, 0, item);

  await browser.storage.local.set({ groups });
  await loadGroups(browser); // Pass browser parameter
  showStatus('Saved');
}

/**
 * Constants
 */
export const COLOR_EMOJI_OPTIONS = [
  '🔴','🟠','🟡','🟢','🔵','🟣','🟤','⚫','⚪'
];

export const GROUP_CATEGORY_ICONS = [
  '', '💼','📋','💬','💻','📖','🐞','🎮','🛒','📰','🎵','🎬','📚','🔧','🎓','🏥','💰','🎨','⚙️','🖥️'
];

// Pairing drag and drop state/handlers
let draggedPairing = null;

// Remove this duplicate function - it's already imported from utils.js
// function clearPairingDropIndicators() {
//   document.querySelectorAll('.pairing-item.drop-before, .pairing-item.drop-after')
//     .forEach(el => el.classList.remove('drop-before', 'drop-after'));
// }

function handlePairingDragStart(e) {
  const item = e.currentTarget; // the .pairing-item
  // Only allow drag if mousedown originated on the grip icon
  if (!item._allowDrag) {
    e.preventDefault();
    return;
  }
  // reset the gate for future drags
  item._allowDrag = false;

  draggedPairing = item;
  item.style.opacity = '0.4';

  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    // Required for Firefox: must set some data to keep the drag alive
    try { e.dataTransfer.setData('text/plain', item.dataset.index || ''); } catch (_) {}
  }
}


export function clearPairingDropIndicators() {
  document.querySelectorAll('.pairing-item.drop-before, .pairing-item.drop-after')
    .forEach(el => el.classList.remove('drop-before', 'drop-after'));
}
