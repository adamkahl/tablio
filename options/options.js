// Chrome compatibility layer
if (typeof browser === 'undefined') {
  var browser = chrome;
}

// Search/filter and selection state
let searchQuery = '';
let selectedPairings = new Set();

// Load saved pairings and groups
async function loadPairings() {
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
    container.innerHTML = searchQuery
      ? `<div class="empty-state">No patterns match "${escapeHtml(searchQuery)}"</div>`
      : '<div class="empty-state">No URL patterns yet. Click "Add Pairing" to get started.</div>';
    updateBulkActions();
    return;
  }

  filteredPairings.forEach(p => {
    // Keep each item's original index so selection maps to storage order
    const idx = pairings.indexOf(p);
    addPairingRow(p.url, p.name, p.emoji || '', p.group || '', groups, idx);
  });

  updateBulkActions();
}

// Load settings
async function loadSettings() {
  const { autoTidyEnabled } = await browser.storage.local.get({ autoTidyEnabled: false });
  document.getElementById('auto-tidy-toggle').checked = autoTidyEnabled;
}

// Debounce function to prevent excessive saves
let saveTimeout = null;
function debouncedSave() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    savePairings();
  }, 500);
}

// Add a new pairing row to the form
// Add a centralized palette for color emojis (circles + squares)
const COLOR_EMOJI_OPTIONS = [
  '🔴','🟠','🟡','🟢','🔵','🟣','🟤','⚫','⚪'
];

// Add a centralized set of group category icons (first entry = none)
const GROUP_CATEGORY_ICONS = [
  '', '💼','📋','💬','💻','📖','🐞','🎮','🛒','📰','🎵','🎬','📚','🔧','🎓','🏥','💰','🎨','⚙️','🖥️'
];

function addPairingRow(url = '', name = '', emoji = '', group = '', groups = [], index = null) {
  const container = document.getElementById('pairings-container');
  const div = document.createElement('div');
  div.className = 'pairing-item';
  div.draggable = true; // Make the entire element draggable
  if (index !== null) div.dataset.index = index;

  // Build group options
  const groupOptions = groups.map(g => {
    const groupName = typeof g === 'string' ? g : g.name;
    return `<option value="${escapeHtml(groupName)}" ${group === groupName ? 'selected' : ''}>${escapeHtml(groupName)}</option>`;
  }).join('');

  // Build color options (ensure saved emoji stays selectable even if not in palette)
  const colorSet = new Set(COLOR_EMOJI_OPTIONS);
  if (emoji && !colorSet.has(emoji)) colorSet.add(emoji);
  const colorOptions = [''].concat(Array.from(colorSet)).map(val => {
    const selected = val === emoji ? 'selected' : '';
    return `<option value="${val}" ${selected}>${val || 'None'}</option>`;
  }).join('');

  const isSelected = index !== null && selectedPairings.has(index);
  const isExpanded = !url;

  div.innerHTML = `
    <div class="pairing-header" style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.25rem;background:${isSelected ? '#e0e7ff' : '#f8f9fa'};border-radius:8px;padding:0.375rem 0.5rem;border:2px solid ${isSelected ? '#6366f1' : 'transparent'};transition:all .2s;min-height:34px;">
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
    header.style.background = checked ? '#e0e7ff' : '#f8f9fa';
    header.style.borderColor = checked ? '#6366f1' : 'transparent';
    updateBulkActions();
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
    if (e.target.closest('.pairing-checkbox')) return; // ignore when clicking checkbox
    expandBtn.click();
  });

  // Update header summary live
  const updateHeaderSummary = () => {
    const u = div.querySelector('.url-input').value.trim();
    const n = div.querySelector('.name-input').value.trim();
    const e = div.querySelector('.emoji-input').value.trim();
    const g = div.querySelector('.group-input').value.trim();

    const summary = div.querySelector('.pairing-summary');
    summary.innerHTML = `
      ${e ? `<span class="emoji">${e}</span>` : ''}
      <code>${escapeHtml(u) || 'New Pattern'}</code>
      ${n ? `<i class="bi bi-chevron-right arrow" aria-hidden="true"></i><span class="name">${escapeHtml(n)}</span>` : ''}
      ${g ? `<span class="group-badge">${escapeHtml(g)}</span>` : ''}
    `;
  };

  div.querySelector('.url-input').addEventListener('input', () => { updateHeaderSummary(); debouncedSave(); });
  div.querySelector('.name-input').addEventListener('input', () => { updateHeaderSummary(); debouncedSave(); });
  div.querySelector('.emoji-input').addEventListener('change', () => { updateHeaderSummary(); debouncedSave(); });
  div.querySelector('.group-input').addEventListener('change', () => { updateHeaderSummary(); debouncedSave(); });

  div.querySelector('.btn-remove').onclick = () => {
    div.style.animation = 'slideOut 0.2s ease';
    setTimeout(() => {
      div.remove();
      debouncedSave();
    }, 200);
  };

  // Gate dragging so it only starts when the handle is pressed
  div._allowDrag = false;
  const grip = div.querySelector('.bi-grip-vertical');
  if (grip) {
    grip.addEventListener('mousedown', () => { div._allowDrag = true; });
  }
  // Reset the gate when mouse released or leaves the item
  div.addEventListener('mouseup', () => { div._allowDrag = false; });
  div.addEventListener('mouseleave', () => { div._allowDrag = false; });

  // Pairing drag and drop handlers
  div.addEventListener('dragstart', handlePairingDragStart);
  div.addEventListener('dragover', handlePairingDragOver);
  div.addEventListener('dragleave', handlePairingDragLeave);
  div.addEventListener('drop', handlePairingDragDrop);
  div.addEventListener('dragend', handlePairingDragEnd);

  container.appendChild(div);
}

// Pairing drag and drop state/handlers
let draggedPairing = null;

function clearPairingDropIndicators() {
  document.querySelectorAll('.pairing-item.drop-before, .pairing-item.drop-after')
    .forEach(el => el.classList.remove('drop-before', 'drop-after'));
}

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

function handlePairingDragOver(e) {
  if (e.preventDefault) e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  const over = e.currentTarget;
  if (!draggedPairing || draggedPairing === over) return false;

  // Show top/bottom indicator depending on mouse position
  const rect = over.getBoundingClientRect();
  const isAfter = (e.clientY - rect.top) > (rect.height / 2);

  clearPairingDropIndicators();
  over.classList.add(isAfter ? 'drop-after' : 'drop-before');

  return false;
}

function handlePairingDragLeave() {
  this.classList.remove('drop-before', 'drop-after');
}

function handlePairingDragDrop(e) {
  if (e.stopPropagation) e.stopPropagation();
  const over = e.currentTarget;

  if (draggedPairing && draggedPairing !== over) {
    const rect = over.getBoundingClientRect();
    const isAfter = (e.clientY - rect.top) > (rect.height / 2);

    // Insert before or after the hovered item
    if (isAfter) {
      over.parentNode.insertBefore(draggedPairing, over.nextSibling);
    } else {
      over.parentNode.insertBefore(draggedPairing, over);
    }

    // Reindex dataset after reorder; clear selection to avoid index drift
    const container = document.getElementById('pairings-container');
    Array.from(container.querySelectorAll('.pairing-item')).forEach((item, idx) => {
      item.dataset.index = idx;
      const cb = item.querySelector('.pairing-checkbox');
      if (cb) cb.checked = false;
      const hdr = item.querySelector('.pairing-header');
      if (hdr) { hdr.style.background = '#f8f9fa'; hdr.style.borderColor = 'transparent'; }
    });
    selectedPairings.clear();
    updateBulkActions();

    // Persist new order
    savePairings();
  }

  clearPairingDropIndicators();
  return false;
}

function handlePairingDragEnd() {
  this.style.opacity = '1';
  clearPairingDropIndicators();
  draggedPairing = null;
}

// Load and render groups
async function loadGroups() {
  const result = await browser.storage.local.get({ groups: [] });
  const groups = result.groups;
  
  const container = document.getElementById('groups-container');
  container.innerHTML = '';
  
  if (groups.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding: 1rem; color: #6b7280;">No groups created yet</div>';
    return;
  }
  
  groups.forEach((group, index) => {
    const groupName = typeof group === 'string' ? group : group.name;
    const groupCategory = typeof group === 'object' ? group.category : '';
    const keywordCount = typeof group === 'object' && group.keywords ? group.keywords.length : 0;
    
    const div = document.createElement('div');
    div.className = 'group-item';
    div.draggable = true;
    div.dataset.index = index;
    div.style.cssText = 'display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem; background: #f8f9fa; border-radius: 8px; margin-bottom: 0.5rem; cursor: move;';
    
    div.innerHTML = `
      <i class="bi bi-grip-vertical" style="color: #9ca3af; cursor: grab;"></i>
      <span class="group-icon" aria-hidden="true">${groupCategory ? escapeHtml(groupCategory) : ''}</span>
      <span class="group-name" style="flex: 1; font-weight: 500; cursor: pointer;">${escapeHtml(groupName)}</span>
      ${keywordCount > 0 ? `<span style="background: #6366f1; color: white; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600;">${keywordCount} keyword${keywordCount !== 1 ? 's' : ''}</span>` : ''}
      <button class="btn btn-sm btn-edit" type="button" style="padding: 0.25rem 0.75rem; font-size: 0.85rem; background: transparent; border: 2px solid #6366f1; color: #6366f1; border-radius: 6px; transition: all 0.3s ease;">
        <i class="bi bi-pencil"></i>
      </button>
      <button class="btn btn-sm btn-remove" type="button" style="padding: 0.25rem 0.75rem; font-size: 0.85rem;">
        <i class="bi bi-trash"></i>
      </button>
    `;
    
    const editBtn = div.querySelector('.btn-edit');
    const groupNameSpan = div.querySelector('.group-name');
    
    const editGroup = async () => {
      showGroupEditModal(groupName, groupCategory, typeof group === 'object' ? group.keywords : [], false);
    };
    
    editBtn.onclick = editGroup;
    groupNameSpan.onclick = editGroup;
    
    div.querySelector('.btn-remove').onclick = async () => {
      if (confirm(`Delete group "${groupName}"? Pairings in this group will not be deleted.`)) {
        const result = await browser.storage.local.get({ groups: [] });
        const updatedGroups = result.groups.filter((g, i) => i !== index);
        await browser.storage.local.set({ groups: updatedGroups });
        await loadGroups();
        await loadPairings();
        showStatus('Group deleted');
      }
    };
    
    div.addEventListener('dragstart', handleDragStart);
    div.addEventListener('dragover', handleDragOver);
    div.addEventListener('drop', handleDrop);
    div.addEventListener('dragend', handleDragEnd);
    
    container.appendChild(div);
  });
}

// Show group edit modal
function showGroupEditModal(currentName, currentCategory, currentKeywords = [], isAdding) {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex; align-items: center; justify-content: center;
    z-index: 10000; padding: 2rem;
  `;

  const keywordsHtml = currentKeywords.map(kw =>
    `<span class="keyword-tag">${escapeHtml(kw)}<button class="keyword-remove" data-keyword="${escapeHtml(kw)}">×</button></span>`
  ).join('');

  // Build icon-only picker tiles (no names)
  const iconTiles = GROUP_CATEGORY_ICONS.map(icon => {
    const isSelected = icon === (currentCategory || '');
    const visual = icon || '∅'; // visual for "none" without label
    const aria = icon ? icon : 'None';
    return `
      <button type="button"
              class="icon-option ${isSelected ? 'selected' : ''}"
              data-icon="${escapeHtml(icon)}"
              aria-label="${aria}"
              title="${aria}">
        ${visual}
      </button>`;
  }).join('');

  modal.innerHTML = `
    <div style="
      background: white; border-radius: 16px; padding: 2rem;
      max-width: 600px; width: 100%; max-height: 90vh; overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    ">
      <h2 style="margin: 0 0 1.5rem 0; color: #1f2937; font-size: 1.5rem;">
        <i class="bi bi-${isAdding ? 'plus' : 'edit'}" style="color: #6366f1;"></i> ${isAdding ? 'Add' : 'Edit'} Group
      </h2>

      <div style="margin-bottom: 1rem;">
        <label style="display: block; font-weight: 600; margin-bottom: 0.5rem; color: #4b5563;">
          Group Name
        </label>
        <input
          type="text"
          id="modal-group-name"
          value="${escapeHtml(currentName)}"
          style="width: 100%; padding: 0.75rem; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 1rem;"
        />
      </div>

      <div style="margin-bottom: 1rem;">
        <label style="display: block; font-weight: 600; margin-bottom: 0.5rem; color: #4b5563;">
          Category Icon
        </label>
        <div id="modal-icon-picker" class="icon-picker">
          ${iconTiles}
        </div>
      </div>

      <div style="margin-bottom: 1.5rem;">
        <label style="display: block; font-weight: 600; margin-bottom: 0.5rem; color: #4b5563;">
          Keywords for Auto-Matching
          <span style="font-weight: normal; font-size: 0.875rem; color: #6b7280;">(optional)</span>
        </label>
        <p style="margin: 0 0 0.5rem 0; font-size: 0.875rem; color: #6b7280;">
          Tabs matching these keywords will automatically be grouped. Matches in URLs are weighted higher.
        </p>
        <div style="display: flex; gap: 0.5rem; margin-bottom: 0.5rem;">
          <input type="text" id="modal-keyword-input" placeholder="e.g., github.com, pull request"
                 style="flex: 1; padding: 0.5rem; border: 2px solid #e5e7eb; border-radius: 6px; font-size: 0.95rem;" />
          <button id="modal-add-keyword" style="background: #6366f1; color: white; border: none; padding: 0.5rem 1rem; border-radius: 6px; font-weight: 600; cursor: pointer;">
            Add
          </button>
        </div>
        <div id="modal-keywords-container" style="display: flex; flex-wrap: wrap; gap: 0.5rem; min-height: 2rem;">
          ${keywordsHtml}
        </div>
      </div>

      <div style="display: flex; gap: 0.75rem; justify-content: flex-end;">
        <button id="modal-cancel-btn" style="background: #e5e7eb; color: #1f2937; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; font-weight: 600; cursor: pointer;">
          Cancel
        </button>
        <button id="modal-save-btn" style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; font-weight: 600; cursor: pointer;">
          Save
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Icon picker selection logic
  let selectedCategory = currentCategory || '';
  const picker = modal.querySelector('#modal-icon-picker');
  picker.addEventListener('click', (e) => {
    const btn = e.target.closest('.icon-option');
    if (!btn) return;
    selectedCategory = btn.dataset.icon; // '' means none
    picker.querySelectorAll('.icon-option').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  });

  // Keyword management (unchanged)
  const keywordInput = modal.querySelector('#modal-keyword-input');
  const keywordsContainer = modal.querySelector('#modal-keywords-container');
  const addKeyword = () => {
    const keyword = keywordInput.value.trim();
    if (!keyword) return;
    const existing = Array.from(keywordsContainer.querySelectorAll('.keyword-tag'))
      .map(tag => tag.textContent.replace('×', '').trim());
    if (existing.includes(keyword)) { keywordInput.value = ''; return; }
    const tag = document.createElement('span');
    tag.className = 'keyword-tag';
    tag.innerHTML = `${escapeHtml(keyword)}<button class="keyword-remove" data-keyword="${escapeHtml(keyword)}">×</button>`;
    keywordsContainer.appendChild(tag);
    tag.querySelector('.keyword-remove').onclick = () => tag.remove();
    keywordInput.value = '';
  };
  modal.querySelector('#modal-add-keyword').onclick = addKeyword;
  keywordInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } });
  keywordsContainer.querySelectorAll('.keyword-remove').forEach(btn => { btn.onclick = () => btn.closest('.keyword-tag').remove(); });

  setTimeout(() => {
    const nameEl = document.getElementById('modal-group-name');
    nameEl.focus(); nameEl.select();
  }, 100);

  modal.querySelector('#modal-cancel-btn').onclick = () => modal.remove();

  modal.querySelector('#modal-save-btn').onclick = async () => {
    const newName = document.getElementById('modal-group-name').value.trim();
    const keywords = Array.from(keywordsContainer.querySelectorAll('.keyword-tag'))
      .map(tag => tag.textContent.replace('×', '').trim());
    if (!newName) { alert('Group name cannot be empty!'); return; }

    const result = await browser.storage.local.get({ groups: [], pairings: [] });
    const groups = result.groups;
    const pairings = result.pairings;

    const normalizedGroups = groups.map(g => typeof g === 'string' ? ({ name: g, category: '', keywords: [] }) : g);
    const nameExistsInAnother = normalizedGroups.some(g => g.name === newName && (isAdding || g.name !== currentName));
    if (nameExistsInAnother) { alert('A group with that name already exists!'); return; }

    if (isAdding) {
      normalizedGroups.push({ name: newName, category: selectedCategory, keywords });
    } else {
      const groupIndex = normalizedGroups.findIndex(g => g.name === currentName);
      if (groupIndex === -1) { alert('Group not found. It may have been deleted.'); modal.remove(); return; }
      const oldName = normalizedGroups[groupIndex].name;
      normalizedGroups[groupIndex] = { name: newName, category: selectedCategory, keywords };
      if (oldName !== newName) {
        pairings.forEach(p => { if (p.group === oldName) p.group = newName; });
      }
    }

    await browser.storage.local.set({ groups: normalizedGroups, pairings });
    await loadGroups();
    await loadPairings();
    showStatus(isAdding ? 'Group added' : 'Group updated');
    modal.remove();
  };

  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  const escapeHandler = (e) => { if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', escapeHandler); } };
  document.addEventListener('keydown', escapeHandler);
}

// Drag and drop state (Groups)
let draggedElement = null;

function clearGroupDropIndicators() {
  document.querySelectorAll('.group-item.drop-before, .group-item.drop-after')
    .forEach(el => el.classList.remove('drop-before', 'drop-after'));
}

function handleDragStart(e) {
  draggedElement = this;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', this.dataset.index || ''); } catch (_) {}
}

function handleDragOver(e) {
  if (e.preventDefault) e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  const over = e.currentTarget;
  if (!draggedElement || draggedElement === over) return false;

  const rect = over.getBoundingClientRect();
  const isAfter = (e.clientY - rect.top) > (rect.height / 2);

  clearGroupDropIndicators();
  over.classList.add(isAfter ? 'drop-after' : 'drop-before');
  return false;
}

function handleDrop(e) {
  if (e.stopPropagation) e.stopPropagation();
  const over = e.currentTarget;
  if (!draggedElement || draggedElement === over) {
    clearGroupDropIndicators();
    return false;
  }

  const fromIndex = parseInt(draggedElement.dataset.index, 10);
  const rect = over.getBoundingClientRect();
  const isAfter = (e.clientY - rect.top) > (rect.height / 2);

  // Reorder in DOM first (so we can compute the new index reliably)
  const parent = over.parentNode;
  if (isAfter) {
    parent.insertBefore(draggedElement, over.nextSibling);
  } else {
    parent.insertBefore(draggedElement, over);
  }

  const nodes = Array.from(parent.querySelectorAll('.group-item'));
  const toIndex = nodes.indexOf(draggedElement);

  // Persist the new order
  reorderGroups(fromIndex, toIndex);

  clearGroupDropIndicators();
  return false;
}

function handleDragEnd() {
  this.classList.remove('dragging');
  clearGroupDropIndicators();
  draggedElement = null;
}

// Move groups[fromIndex] to toIndex and save
async function reorderGroups(fromIndex, toIndex) {
  if (Number.isNaN(fromIndex) || Number.isNaN(toIndex)) return;

  const { groups } = await browser.storage.local.get({ groups: [] });
  if (fromIndex < 0 || fromIndex >= groups.length) return;

  const item = groups.splice(fromIndex, 1)[0];
  const clampedTo = Math.max(0, Math.min(toIndex, groups.length));
  groups.splice(clampedTo, 0, item);

  await browser.storage.local.set({ groups });
  await loadGroups();
  showStatus('Saved');
}

async function savePairings() {
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

function showStatus(message = 'Saved') {
  const status = document.getElementById('status');
  status.querySelector('span').textContent = message;
  status.style.display = 'flex';
  
  clearTimeout(status.hideTimeout);
  status.hideTimeout = setTimeout(() => {
    status.style.display = 'none';
  }, 2000);
}

async function exportSettings() {
  const data = await browser.storage.local.get({ pairings: [], groups: [], autoTidyEnabled: false });
  
  const exportData = {
    version: '1.1',
    exportDate: new Date().toISOString(),
    pairings: data.pairings,
    groups: data.groups,
    autoTidyEnabled: data.autoTidyEnabled
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

async function importSettings(file) {
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
      autoTidyEnabled: importData.autoTidyEnabled ?? false
    });
    
    await loadGroups();
    await loadPairings();
    await loadSettings();
    
    showStatus('Settings imported successfully');
  } catch (error) {
    alert(`Import failed: ${error.message}`);
  }
}

async function loadRecommendedDefaults() {
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
      autoTidyEnabled: importData.autoTidyEnabled ?? false
    });

    await loadGroups();
    await loadPairings();
    await loadSettings();
    showStatus('Recommended defaults loaded');
  } catch (error) {
    alert(`Failed to load recommended defaults: ${error.message}`);
  }
}

async function clearAllSettings() {
  if (!confirm('This will delete ALL patterns, groups, and settings. This cannot be undone. Continue?')) {
    return;
  }

  // Double confirmation for safety
  if (!confirm('Are you absolutely sure? All your configuration will be permanently deleted.')) {
    return;
  }

  await browser.storage.local.set({
    pairings: [],
    groups: [],
    autoTidyEnabled: false
  });

  await loadGroups();
  await loadPairings();
  await loadSettings();
  showStatus('All settings cleared');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Bulk actions helpers
function updateBulkActions() {
  const bar = document.getElementById('bulk-actions-bar');
  if (!bar) return;
  const count = selectedPairings.size;
  bar.style.display = count > 0 ? 'flex' : 'none';
  const span = bar.querySelector('.bulk-count');
  if (span) span.textContent = `${count} selected`;
}

async function bulkDelete() {
  if (selectedPairings.size === 0) return;
  if (!confirm(`Delete ${selectedPairings.size} selected pattern(s)?`)) return;

  const { pairings } = await browser.storage.local.get({ pairings: [] });
  const indices = Array.from(selectedPairings).sort((a, b) => b - a);
  indices.forEach(i => { if (i >= 0 && i < pairings.length) pairings.splice(i, 1); });

  await browser.storage.local.set({ pairings });
  selectedPairings.clear();
  await loadPairings();
  showStatus('Deleted');
}

async function bulkAssignGroup() {
  const { groups, pairings } = await browser.storage.local.get({ groups: [], pairings: [] });

  // Modal
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
    await loadPairings();
    showStatus('Updated');
  };
}

function handleSearch(query) {
  searchQuery = query;
  selectedPairings.clear();
  loadPairings();
}

// Add a new group via the modal
function addGroup() {
  // name, category, keywords, isAdding=true
  showGroupEditModal('', '', [], true);
}

// Auto-tidy toggle handler
document.getElementById('auto-tidy-toggle').addEventListener('change', async (e) => {
  const autoTidyEnabled = e.target.checked;
  await browser.storage.local.set({ autoTidyEnabled });
  showStatus(autoTidyEnabled ? 'Auto-tidy enabled' : 'Auto-tidy disabled');
});

document.getElementById('add-pairing').addEventListener('click', async () => {
  const result = await browser.storage.local.get({ groups: [] });
  addPairingRow('', '', '', '', result.groups);
});

document.getElementById('add-group').addEventListener('click', addGroup);
document.getElementById('export-settings').addEventListener('click', exportSettings);
document.getElementById('import-settings').addEventListener('click', () => {
  const fileInput = document.getElementById('import-file');
  // Reset the input to allow re-importing the same file
  fileInput.value = '';
  fileInput.click();
});
document.getElementById('import-file').addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    importSettings(e.target.files[0]);
  }
});
document.getElementById('load-defaults').addEventListener('click', loadRecommendedDefaults);
document.getElementById('clear-all').addEventListener('click', clearAllSettings);

// New listeners: search + bulk actions
document.getElementById('pattern-search').addEventListener('input', (e) => {
  handleSearch(e.target.value.trim());
});
document.getElementById('bulk-delete').addEventListener('click', bulkDelete);
document.getElementById('bulk-assign-group').addEventListener('click', bulkAssignGroup);
document.getElementById('bulk-deselect').addEventListener('click', () => {
  selectedPairings.clear();
  document.querySelectorAll('.pairing-item .pairing-checkbox').forEach(cb => { cb.checked = false; });
  document.querySelectorAll('.pairing-item .pairing-header').forEach(h => { h.style.background = '#f8f9fa'; h.style.borderColor = 'transparent'; });
  updateBulkActions();
});

loadPairings();
loadGroups();
loadSettings();
