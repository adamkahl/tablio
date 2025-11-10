/**
 * Group management module for Tablio
 */

import { escapeHtml, showStatus, clearGroupDropIndicators, reorderGroups, GROUP_CATEGORY_ICONS } from './utils.js';

// Drag and drop state for groups
let draggedElement = null;

/**
 * Load and render groups
 */
export async function loadGroups(browser, loadPairings) {
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
    
    // Create elements programmatically instead of innerHTML
    const gripIcon = document.createElement('i');
    gripIcon.className = 'bi bi-grip-vertical';
    gripIcon.style.cssText = 'color: #9ca3af; cursor: grab;';
    
    const groupIcon = document.createElement('span');
    groupIcon.className = 'group-icon';
    groupIcon.setAttribute('aria-hidden', 'true');
    groupIcon.textContent = groupCategory || '';
    
    const groupNameSpan = document.createElement('span');
    groupNameSpan.className = 'group-name';
    groupNameSpan.style.cssText = 'flex: 1; font-weight: 500; cursor: pointer;';
    groupNameSpan.textContent = groupName;
    
    const keywordBadge = document.createElement('span');
    if (keywordCount > 0) {
      keywordBadge.style.cssText = 'background: #6366f1; color: white; padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.75rem; font-weight: 600;';
      keywordBadge.textContent = `${keywordCount} keyword${keywordCount !== 1 ? 's' : ''}`;
    }
    
    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-sm btn-edit';
    editBtn.type = 'button';
    editBtn.style.cssText = 'padding: 0.25rem 0.75rem; font-size: 0.85rem; background: transparent; border: 2px solid #6366f1; color: #6366f1; border-radius: 6px; transition: all 0.3s ease;';
    editBtn.innerHTML = '<i class="bi bi-pencil"></i>';
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn-sm btn-remove';
    removeBtn.type = 'button';
    removeBtn.style.cssText = 'padding: 0.25rem 0.75rem; font-size: 0.85rem;';
    removeBtn.innerHTML = '<i class="bi bi-trash"></i>';
    
    div.appendChild(gripIcon);
    div.appendChild(groupIcon);
    div.appendChild(groupNameSpan);
    if (keywordCount > 0) div.appendChild(keywordBadge);
    div.appendChild(editBtn);
    div.appendChild(removeBtn);
    
    const editGroup = () => {
      showGroupEditModal(groupName, groupCategory, typeof group === 'object' ? group.keywords : [], false, browser, loadGroups, loadPairings);
    };
    
    editBtn.onclick = editGroup;
    groupNameSpan.onclick = editGroup;
    
    removeBtn.onclick = async () => {
      if (confirm(`Delete group "${groupName}"? Pairings in this group will not be deleted.`)) {
        const result = await browser.storage.local.get({ groups: [] });
        const updatedGroups = result.groups.filter((g, i) => i !== index);
        await browser.storage.local.set({ groups: updatedGroups });
        await loadGroups(browser, loadPairings);
        await loadPairings();
        showStatus('Group deleted');
      }
    };
    
    div.addEventListener('dragstart', handleDragStart);
    div.addEventListener('dragover', handleDragOver);
    div.addEventListener('drop', (e) => handleDrop(e, browser, loadGroups));
    div.addEventListener('dragend', handleDragEnd);
    
    container.appendChild(div);
  });
}

/**
 * Show group edit modal
 */
export function showGroupEditModal(currentName, currentCategory, currentKeywords = [], isAdding, browser, loadGroups, loadPairings) {
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

  /* eslint-disable-next-line no-unsanitized/property */
  modal.innerHTML = `
    <div style="
      background: white; border-radius: 16px; padding: 2rem;
      max-width: 600px; width: 100%; max-height: 90vh; overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    ">
      <h2 style="margin: 0 0 1.5rem 0; color: #1f2937; font-size: 1.5rem;">
        <i class="bi bi-${isAdding ? 'plus' : 'pencil'}" style="color: #6366f1;"></i> ${isAdding ? 'Add' : 'Edit'} Group
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

  // Keyword management
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
    await loadGroups(browser, loadPairings);
    await loadPairings();
    showStatus(isAdding ? 'Group added' : 'Group updated');
    modal.remove();
  };

  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
  const escapeHandler = (e) => { if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', escapeHandler); } };
  document.addEventListener('keydown', escapeHandler);
}

/**
 * Group drag and drop handlers
 */
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

function handleDrop(e, browser, loadGroups) {
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
  reorderGroups(fromIndex, toIndex, browser, loadGroups);

  clearGroupDropIndicators();
  return false;
}

function handleDragEnd() {
  this.classList.remove('dragging');
  clearGroupDropIndicators();
  draggedElement = null;
}