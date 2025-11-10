/**
 * Pairing/pattern management module for Tablio
 */

import { escapeHtml, showStatus, updateBulkActions, clearPairingDropIndicators, COLOR_EMOJI_OPTIONS } from './utils.js';

// Drag and drop state for pairings
let draggedPairing = null;

// Search/filter state
let searchQuery = '';
let selectedPairings = new Set();

// Debounce timer
let saveTimeout = null;

/**
 * Get current search query
 */
export function getSearchQuery() {
  return searchQuery;
}

/**
 * Set search query
 */
export function setSearchQuery(query) {
  searchQuery = query;
}

/**
 * Get selected pairings
 */
export function getSelectedPairings() {
  return selectedPairings;
}

/**
 * Clear selected pairings
 */
export function clearSelectedPairings() {
  selectedPairings.clear();
}

/**
 * Load and render pairings
 */
export async function loadPairings(browser) {
  const result = await browser.storage.local.get({ pairings: [], groups: [] });
  const pairings = result.pairings;
  const groups = result.groups;
  
  const container = document.getElementById('pairings-container');
  container.innerHTML = '';
  
  // Filter pairings based on search
  const filteredPairings = pairings.filter(p => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (p.url?.toLowerCase().includes(q) ||
            p.name?.toLowerCase().includes(q) ||
            p.group?.toLowerCase().includes(q));
  });

  if (filteredPairings.length === 0) {
    /* eslint-disable-next-line no-unsanitized/property */
    container.innerHTML = searchQuery
      ? `<div class="empty-state">No patterns match "${escapeHtml(searchQuery)}"</div>`
      : '<div class="empty-state">No URL patterns yet. Click "Add Pairing" to get started.</div>';
    updateBulkActions(selectedPairings);
    return;
  }

  filteredPairings.forEach(p => {
    const idx = pairings.indexOf(p);
    addPairingRow(p.url, p.name, p.emoji || '', p.group || '', groups, idx, browser);
  });

  updateBulkActions(selectedPairings);
}

/**
 * Add a new pairing row to the form
 */
function addPairingRow(url = '', name = '', emoji = '', group = '', groups = [], index = null, browser) {
  const container = document.getElementById('pairings-container');
  const div = document.createElement('div');
  div.className = 'pairing-item';
  div.draggable = true;
  if (index !== null) div.dataset.index = index;

  // Build group options
  const groupOptions = groups.map(g => {
    const groupName = typeof g === 'string' ? g : g.name;
    return `<option value="${escapeHtml(groupName)}" ${group === groupName ? 'selected' : ''}>${escapeHtml(groupName)}</option>`;
  }).join('');

  // Build color options
  const colorSet = new Set(COLOR_EMOJI_OPTIONS);
  if (emoji && !colorSet.has(emoji)) colorSet.add(emoji);
  const colorOptions = [''].concat(Array.from(colorSet)).map(val => {
    const selected = val === emoji ? 'selected' : '';
    return `<option value="${val}" ${selected}>${val || 'None'}</option>`;
  }).join('');

  const isSelected = index !== null && selectedPairings.has(index);
  const isExpanded = !url;

  // Apply selection styles to pairing-item
  if (isSelected) {
    div.style.borderColor = '#6366f1';
    div.style.background = '#eef2ff';
  }

  /* eslint-disable-next-line no-unsanitized/property */
  div.innerHTML = `
    <div class="pairing-header" style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.25rem;background:transparent;border-radius:8px;padding:0.375rem 0.5rem;transition:all .2s;min-height:34px;">
      <input type="checkbox" class="pairing-checkbox" ${isSelected ? 'checked' : ''} style="cursor:pointer;width:16px;height:16px;">
      <i class="bi bi-grip-vertical" style="color:#9ca3af;cursor:grab;"></i>
      <div class="pairing-summary d-flex align-items-center" style="flex:1;min-width:0;">
        ${emoji ? `<span class="emoji">${emoji}</span>` : ''}
        <code>${escapeHtml(url) || 'New Pattern'}</code>
        ${name ? `<i class="bi bi-chevron-right arrow" aria-hidden="true"></i><span class="name">${escapeHtml(name)}</span>` : ''}
        ${group ? `<span class="group-badge">${escapeHtml(group)}</span>` : ''}
      </div>
      <button class="btn-expand" type="button" title="${isExpanded ? 'Collapse' : 'Expand'}" style="background:none;border:none;color:#6b7280;cursor:pointer;padding:0.125rem 0.25rem;">
        <i class="bi bi-chevron-${isExpanded ? 'up' : 'down'}"></i>
      </button>
    </div>
    <div class="pairing-details" style="display:${isExpanded ? 'block' : 'none'};">
      <div class="pairing-inputs pairing-inputs-compact">
        <div class="input-group-custom">
          <label class="form-label form-label-compact">
            <span class="icon-label"><i class="bi bi-link"></i> URL</span>
          </label>
          <input type="text" class="form-control form-control-compact url-input" placeholder="github.com" value="${escapeHtml(url)}">
        </div>
        <div class="input-group-custom">
          <label class="form-label form-label-compact">
            <span class="icon-label"><i class="bi bi-tag"></i> Name</span>
          </label>
          <input type="text" class="form-control form-control-compact name-input" placeholder="GitHub" value="${escapeHtml(name)}">
        </div>
        <div class="input-group-custom" style="max-width:150px;">
          <label class="form-label form-label-compact">
            <span class="icon-label"><i class="bi bi-palette"></i> Color</span>
          </label>
          <select class="form-control form-control-compact emoji-input">
            ${colorOptions}
          </select>
        </div>
        <div class="input-group-custom" style="min-width:180px;">
          <label class="form-label form-label-compact">
            <span class="icon-label"><i class="bi bi-folder"></i> Group</span>
          </label>
          <select class="form-control form-control-compact group-input">
            <option value="">None</option>
            ${groupOptions}
          </select>
        </div>
        <div class="input-group-custom" style="flex:0 0 auto;min-width:auto;">
          <label class="form-label form-label-compact" style="visibility:hidden;">Remove</label>
          <button class="btn btn-remove btn-remove-compact" type="button" title="Delete">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>
    </div>
  `;

  // Selection checkbox
  const header = div.querySelector('.pairing-header');
  const checkbox = div.querySelector('.pairing-checkbox');
  checkbox.onclick = (e) => {
    e.stopPropagation();
    const idx = div.dataset.index ? parseInt(div.dataset.index) : null;
    const checked = checkbox.checked;
    if (idx !== null) {
      if (checked) selectedPairings.add(idx);
      else selectedPairings.delete(idx);
    }
    
    // Update styles on pairing-item only
    if (checked) {
      div.style.borderColor = '#6366f1';
      div.style.background = '#eef2ff';
    } else {
      div.style.borderColor = '';
      div.style.background = '';
    }
    
    updateBulkActions(selectedPairings);
  };

  // Expand/collapse
  const details = div.querySelector('.pairing-details');
  const expandBtn = div.querySelector('.btn-expand');
  const setChevron = (open) => {
    expandBtn.querySelector('i').className = `bi bi-chevron-${open ? 'up' : 'down'}`;
    expandBtn.title = open ? 'Collapse' : 'Expand';
  };
  expandBtn.onclick = (e) => {
    e.stopPropagation();
    const open = details.style.display !== 'none';
    details.style.display = open ? 'none' : 'block';
    setChevron(!open);
  };
  header.addEventListener('click', (e) => {
    if (e.target.closest('.pairing-checkbox')) return;
    expandBtn.click();
  });

  // Update header summary live
  const updateHeaderSummary = () => {
    const u = div.querySelector('.url-input').value.trim();
    const n = div.querySelector('.name-input').value.trim();
    const e = div.querySelector('.emoji-input').value.trim();
    const g = div.querySelector('.group-input').value.trim();

    const summary = div.querySelector('.pairing-summary');
    // Safe: All dynamic content is escaped via escapeHtml()
    /* eslint-disable-next-line no-unsanitized/property */
    summary.innerHTML = `
      ${e ? `<span class="emoji">${e}</span>` : ''}
      <code>${escapeHtml(u) || 'New Pattern'}</code>
      ${n ? `<i class="bi bi-chevron-right arrow" aria-hidden="true"></i><span class="name">${escapeHtml(n)}</span>` : ''}
      ${g ? `<span class="group-badge">${escapeHtml(g)}</span>` : ''}
    `;
  };

  div.querySelector('.url-input').addEventListener('input', () => { updateHeaderSummary(); debouncedSave(browser); });
  div.querySelector('.name-input').addEventListener('input', () => { updateHeaderSummary(); debouncedSave(browser); });
  div.querySelector('.emoji-input').addEventListener('change', () => { updateHeaderSummary(); debouncedSave(browser); });
  div.querySelector('.group-input').addEventListener('change', () => { updateHeaderSummary(); debouncedSave(browser); });

  div.querySelector('.btn-remove').onclick = () => {
    div.style.animation = 'slideOut 0.2s ease';
    setTimeout(() => {
      div.remove();
      debouncedSave(browser);
    }, 200);
  };

  // Gate dragging
  div._allowDrag = false;
  const grip = div.querySelector('.bi-grip-vertical');
  if (grip) {
    grip.addEventListener('mousedown', () => { div._allowDrag = true; });
  }
  div.addEventListener('mouseup', () => { div._allowDrag = false; });
  div.addEventListener('mouseleave', () => { div._allowDrag = false; });

  // Drag handlers
  div.addEventListener('dragstart', handlePairingDragStart);
  div.addEventListener('dragover', handlePairingDragOver);
  div.addEventListener('dragleave', handlePairingDragLeave);
  div.addEventListener('drop', (e) => handlePairingDragDrop(e, browser));
  div.addEventListener('dragend', handlePairingDragEnd);

  container.appendChild(div);
}

/**
 * Debounced save
 */
function debouncedSave(browser) {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    savePairings(browser);
  }, 500);
}

/**
 * Save pairings
 */
async function savePairings(browser) {
  const pairingDivs = document.querySelectorAll('.pairing-item');
  const pairings = [];

  pairingDivs.forEach(div => {
    const url = div.querySelector('.url-input')?.value.trim() || '';
    const name = div.querySelector('.name-input')?.value.trim() || '';
    const emoji = div.querySelector('.emoji-input')?.value.trim() || '';
    const group = div.querySelector('.group-input')?.value.trim() || '';
    if (url) pairings.push({ url, name, emoji, group });
  });

  await browser.storage.local.set({ pairings });
  showStatus('Saved');
}

/**
 * Drag handlers
 */
function handlePairingDragStart(e) {
  const item = e.currentTarget;
  if (!item._allowDrag) {
    e.preventDefault();
    return;
  }
  item._allowDrag = false;

  draggedPairing = item;
  item.style.opacity = '0.4';

  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', item.dataset.index || ''); } catch (_) {}
  }
}

function handlePairingDragOver(e) {
  if (e.preventDefault) e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  const over = e.currentTarget;
  if (!draggedPairing || draggedPairing === over) return false;

  const rect = over.getBoundingClientRect();
  const isAfter = (e.clientY - rect.top) > (rect.height / 2);

  clearPairingDropIndicators();
  over.classList.add(isAfter ? 'drop-after' : 'drop-before');

  return false;
}

function handlePairingDragLeave() {
  this.classList.remove('drop-before', 'drop-after');
}

function handlePairingDragDrop(e, browser) {
  if (e.stopPropagation) e.stopPropagation();
  const over = e.currentTarget;

  if (draggedPairing && draggedPairing !== over) {
    const rect = over.getBoundingClientRect();
    const isAfter = (e.clientY - rect.top) > (rect.height / 2);

    if (isAfter) {
      over.parentNode.insertBefore(draggedPairing, over.nextSibling);
    } else {
      over.parentNode.insertBefore(draggedPairing, over);
    }

    const container = document.getElementById('pairings-container');
    Array.from(container.querySelectorAll('.pairing-item')).forEach((item, idx) => {
      item.dataset.index = idx;
      const cb = item.querySelector('.pairing-checkbox');
      if (cb) cb.checked = false;
      // Reset pairing-item styles only
      item.style.borderColor = '';
      item.style.background = '';
    });
    selectedPairings.clear();
    updateBulkActions(selectedPairings);

    savePairings(browser);
  }

  clearPairingDropIndicators();
  return false;
}

function handlePairingDragEnd() {
  this.style.opacity = '1';
  clearPairingDropIndicators();
  draggedPairing = null;
}

/**
 * Bulk delete pairings
 */
export async function bulkDelete(browser, loadPairings) {
  if (selectedPairings.size === 0) return;
  if (!confirm(`Delete ${selectedPairings.size} selected pattern(s)?`)) return;

  const { pairings } = await browser.storage.local.get({ pairings: [] });
  const indices = Array.from(selectedPairings).sort((a, b) => b - a);
  indices.forEach(i => { if (i >= 0 && i < pairings.length) pairings.splice(i, 1); });

  await browser.storage.local.set({ pairings });
  selectedPairings.clear();
  await loadPairings(browser);
  showStatus('Deleted');
}

/**
 * Bulk assign group
 */
export async function bulkAssignGroup(browser, loadPairings) {
  const { groups, pairings } = await browser.storage.local.get({ groups: [], pairings: [] });

  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;z-index:10000;';
  const options = groups.map(g => {
    const n = typeof g === 'string' ? g : g.name;
    return `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`;
  }).join('');
  modal.innerHTML = `
    <div style="background:#fff;border-radius:12px;padding:1.25rem;max-width:420px;width:100%;">
      <h3 style="margin:0 0 .75rem 0;">Assign ${selectedPairings.size} pattern(s) to group</h3>
      <select id="bulk-group-select" style="width:100%;padding:.5rem;border:2px solid #e5e7eb;border-radius:8px;margin-bottom:1rem;">
        <option value="">None (remove from group)</option>
        ${options}
      </select>
      <div style="display:flex;gap:.5rem;justify-content:flex-end;">
        <button id="bulk-cancel" style="background:#e5e7eb;border:none;padding:.5rem 1rem;border-radius:6px;cursor:pointer;">Cancel</button>
        <button id="bulk-apply" style="background:#6366f1;color:#fff;border:none;padding:.5rem 1rem;border-radius:6px;cursor:pointer;">Assign</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelector('#bulk-cancel').onclick = () => modal.remove();
  modal.querySelector('#bulk-apply').onclick = async () => {
    const selectedGroup = document.getElementById('bulk-group-select').value;
    Array.from(selectedPairings).forEach(i => {
      if (pairings[i]) pairings[i].group = selectedGroup;
    });
    await browser.storage.local.set({ pairings });
    selectedPairings.clear();
    modal.remove();
    await loadPairings(browser);
    showStatus('Updated');
  };
}