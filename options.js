// Load saved pairings and groups
async function loadPairings() {
  const result = await browser.storage.local.get({ pairings: [], groups: [] });
  const pairings = result.pairings;
  const groups = result.groups;
  
  const container = document.getElementById('pairings-container');
  container.innerHTML = '';
  
  if (pairings.length === 0) {
    addPairingRow('', '', '', '', groups);
  } else {
    pairings.forEach(p => addPairingRow(p.url, p.name, p.emoji || '', p.group || '', groups));
  }
}

// Debounce function to prevent excessive saves
let saveTimeout = null;
function debouncedSave() {
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    savePairings();
  }, 500); // Wait 500ms after last change before saving
}

// Add a new pairing row to the form
function addPairingRow(url = '', name = '', emoji = '', group = '', groups = []) {
  const container = document.getElementById('pairings-container');
  const div = document.createElement('div');
  div.className = 'pairing-item';
  
  const groupOptions = groups.map(g => 
    `<option value="${escapeHtml(g.name)}" ${group === g.name ? 'selected' : ''}>${escapeHtml(g.name)}</option>`
  ).join('');
  
  div.innerHTML = `
    <div class="pairing-inputs">
        <div class="input-group-custom">
            <label class="form-label">
                <span class="icon-label">
                    <i class="fas fa-link"></i> URL Pattern
                </span>
            </label>
            <input type="text" class="form-control url-input" placeholder="github.com" value="${escapeHtml(url)}">
        </div>
        <div class="input-group-custom">
            <label class="form-label">
                <span class="icon-label">
                    <i class="fas fa-tag"></i> Tab Name
                </span>
            </label>
            <input type="text" class="form-control name-input" placeholder="GitHub" value="${escapeHtml(name)}">
        </div>
        <div class="input-group-custom">
            <label class="form-label">
                <span class="icon-label">
                    <i class="fas fa-palette"></i> Color
                </span>
            </label>
            <select class="form-control emoji-input">
                <option value="">None</option>
                <option value="🟢" ${emoji === '🟢' ? 'selected' : ''}>🟢</option>
                <option value="🟡" ${emoji === '🟡' ? 'selected' : ''}>🟡</option>
                <option value="🔴" ${emoji === '🔴' ? 'selected' : ''}>🔴</option>
                <option value="🔵" ${emoji === '🔵' ? 'selected' : ''}>🔵</option>
                <option value="🟣" ${emoji === '🟣' ? 'selected' : ''}>🟣</option>
            </select>
        </div>
        <div class="input-group-custom">
            <label class="form-label">
                <span class="icon-label">
                    <i class="fas fa-folder"></i> Group
                </span>
            </label>
            <select class="form-control group-input">
                <option value="">None</option>
                ${groupOptions}
            </select>
        </div>
        <div class="input-group-custom" style="flex: 0 0 auto; min-width: auto;">
            <label class="form-label" style="visibility: hidden;">
                Remove
            </label>
            <button class="btn btn-remove" type="button">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    </div>
  `;
  
  // Add auto-save listeners to all inputs
  div.querySelector('.url-input').addEventListener('input', debouncedSave);
  div.querySelector('.name-input').addEventListener('input', debouncedSave);
  div.querySelector('.emoji-input').addEventListener('change', debouncedSave);
  div.querySelector('.group-input').addEventListener('change', debouncedSave);
  
  div.querySelector('.btn-remove').onclick = () => {
    div.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => {
      div.remove();
      debouncedSave(); // Save after removal
    }, 300);
  };
  
  container.appendChild(div);
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
    
    const div = document.createElement('div');
    div.className = 'group-item';
    div.draggable = true;
    div.dataset.index = index;
    div.style.cssText = 'display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem; background: #f8f9fa; border-radius: 8px; margin-bottom: 0.5rem; cursor: move;';
    
    div.innerHTML = `
      <i class="fas fa-grip-vertical" style="color: #9ca3af; cursor: grab;"></i>
      <span style="font-size: 1.25rem;">${groupCategory || '📁'}</span>
      <span class="group-name" style="flex: 1; font-weight: 500; cursor: pointer;">${escapeHtml(groupName)}</span>
      <button class="btn btn-sm btn-edit" type="button" style="padding: 0.25rem 0.75rem; font-size: 0.85rem; background: transparent; border: 2px solid #6366f1; color: #6366f1; border-radius: 6px; transition: all 0.3s ease;">
        <i class="fas fa-edit"></i>
      </button>
      <button class="btn btn-sm btn-remove" type="button" style="padding: 0.25rem 0.75rem; font-size: 0.85rem;">
        <i class="fas fa-trash"></i>
      </button>
    `;
    
    // Edit button handler
    const editBtn = div.querySelector('.btn-edit');
    const groupNameSpan = div.querySelector('.group-name');
    
    const editGroup = async () => {
      // Create modal for editing
      showGroupEditModal(groupName, groupCategory, false);
    };
    
    editBtn.onclick = editGroup;
    groupNameSpan.onclick = editGroup;
    
    // Remove button handler
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
    
    // Drag and drop handlers
    div.addEventListener('dragstart', handleDragStart);
    div.addEventListener('dragover', handleDragOver);
    div.addEventListener('drop', handleDrop);
    div.addEventListener('dragend', handleDragEnd);
    
    container.appendChild(div);
  });
}

// Show group edit modal
function showGroupEditModal(currentName, currentCategory, isAdding) {
  const modal = document.createElement('div');
  modal.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    padding: 2rem;
  `;
  
  modal.innerHTML = `
    <div style="
      background: white;
      border-radius: 16px;
      padding: 2rem;
      max-width: 500px;
      width: 100%;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    ">
      <h2 style="margin: 0 0 1.5rem 0; color: #1f2937; font-size: 1.5rem;">
        <i class="fas fa-${isAdding ? 'plus' : 'edit'}" style="color: #6366f1;"></i> ${isAdding ? 'Add' : 'Edit'} Group
      </h2>
      
      <div style="margin-bottom: 1rem;">
        <label style="display: block; font-weight: 600; margin-bottom: 0.5rem; color: #4b5563;">
          Group Name
        </label>
        <input 
          type="text" 
          id="modal-group-name" 
          value="${escapeHtml(currentName)}"
          style="
            width: 100%;
            padding: 0.75rem;
            border: 2px solid #e5e7eb;
            border-radius: 8px;
            font-size: 1rem;
          "
        />
      </div>
      
      <div style="margin-bottom: 1.5rem;">
        <label style="display: block; font-weight: 600; margin-bottom: 0.5rem; color: #4b5563;">
          Category Icon
        </label>
        <select 
          id="modal-group-category"
          style="
            width: 100%;
            padding: 0.75rem;
            border: 2px solid #e5e7eb;
            border-radius: 8px;
            font-size: 1rem;
          "
        >
          <option value="">None</option>
          <option value="💼" ${currentCategory === '💼' ? 'selected' : ''}>💼 Work</option>
          <option value="🎮" ${currentCategory === '🎮' ? 'selected' : ''}>🎮 Gaming</option>
          <option value="🛒" ${currentCategory === '🛒' ? 'selected' : ''}>🛒 Shopping</option>
          <option value="📰" ${currentCategory === '📰' ? 'selected' : ''}>📰 News</option>
          <option value="🎵" ${currentCategory === '🎵' ? 'selected' : ''}>🎵 Music</option>
          <option value="🎬" ${currentCategory === '🎬' ? 'selected' : ''}>🎬 Video</option>
          <option value="📚" ${currentCategory === '📚' ? 'selected' : ''}>📚 Reading</option>
          <option value="🔧" ${currentCategory === '🔧' ? 'selected' : ''}>🔧 Tools</option>
          <option value="💬" ${currentCategory === '💬' ? 'selected' : ''}>💬 Social</option>
          <option value="📧" ${currentCategory === '📧' ? 'selected' : ''}>📧 Email</option>
          <option value="🎓" ${currentCategory === '🎓' ? 'selected' : ''}>🎓 Education</option>
          <option value="🏥" ${currentCategory === '🏥' ? 'selected' : ''}>🏥 Health</option>
          <option value="💰" ${currentCategory === '💰' ? 'selected' : ''}>💰 Finance</option>
          <option value="🎨" ${currentCategory === '🎨' ? 'selected' : ''}>🎨 Design</option>
          <option value="⚙️" ${currentCategory === '⚙️' ? 'selected' : ''}>⚙️ Settings</option>
          <option value="🖥️" ${currentCategory === '🖥️' ? 'selected' : ''}>🖥️ Development</option>
        </select>
      </div>
      
      <div style="display: flex; gap: 0.75rem; justify-content: flex-end;">
        <button id="modal-cancel-btn" style="
          background: #e5e7eb;
          color: #1f2937;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
        ">
          Cancel
        </button>
        <button id="modal-save-btn" style="
          background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
        ">
          Save
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Focus the name input
  setTimeout(() => {
    document.getElementById('modal-group-name').focus();
    document.getElementById('modal-group-name').select();
  }, 100);
  
  // Cancel button
  modal.querySelector('#modal-cancel-btn').onclick = () => {
    modal.remove();
  };
  
  // Save button
  modal.querySelector('#modal-save-btn').onclick = async () => {
    const newName = document.getElementById('modal-group-name').value.trim();
    const newCategory = document.getElementById('modal-group-category').value;
    
    if (!newName) {
      alert('Group name cannot be empty!');
      return;
    }
    
    const result = await browser.storage.local.get({ groups: [], pairings: [] });
    const groups = result.groups;
    const pairings = result.pairings;
    
    // Normalize groups to objects
    const normalizedGroups = groups.map(g => 
      typeof g === 'string' ? { name: g, category: '' } : g
    );
    
    // Check if new name already exists
    const nameExists = normalizedGroups.some(g => g.name === newName);
    if (nameExists && (!isAdding || newName !== currentName)) {
      alert('A group with that name already exists!');
      return;
    }
    
    if (isAdding) {
      // Adding a new group
      normalizedGroups.push({ name: newName, category: newCategory });
    } else {
      // Updating existing group
      const groupIndex = normalizedGroups.findIndex(g => g.name === currentName);
      if (groupIndex === -1) {
        alert('Group not found. It may have been deleted.');
        modal.remove();
        return;
      }
      
      const oldName = normalizedGroups[groupIndex].name;
      
      // Update the group
      normalizedGroups[groupIndex] = { name: newName, category: newCategory };
      
      // Update all pairings that use this group
      if (oldName !== newName) {
        pairings.forEach(pairing => {
          if (pairing.group === oldName) {
            pairing.group = newName;
          }
        });
      }
    }
    
    await browser.storage.local.set({ groups: normalizedGroups, pairings });
    await loadGroups();
    await loadPairings();
    showStatus(isAdding ? 'Group added' : 'Group updated');
    modal.remove();
  };
  
  // Close on background click
  modal.onclick = (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  };
  
  // Close on Escape key
  const escapeHandler = (e) => {
    if (e.key === 'Escape') {
      modal.remove();
      document.removeEventListener('keydown', escapeHandler);
    }
  };
  document.addEventListener('keydown', escapeHandler);
}

// Drag and drop state
let draggedElement = null;

function handleDragStart(e) {
  draggedElement = this;
  this.style.opacity = '0.4';
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }
  e.dataTransfer.dropEffect = 'move';
  
  const draggedOver = e.currentTarget;
  if (draggedElement !== draggedOver) {
    draggedOver.style.borderTop = '3px solid #6366f1';
  }
  
  return false;
}

function handleDrop(e) {
  if (e.stopPropagation) {
    e.stopPropagation();
  }
  
  const draggedOver = e.currentTarget;
  draggedOver.style.borderTop = '';
  
  if (draggedElement !== draggedOver) {
    const fromIndex = parseInt(draggedElement.dataset.index);
    const toIndex = parseInt(draggedOver.dataset.index);
    
    reorderGroups(fromIndex, toIndex);
  }
  
  return false;
}

function handleDragEnd(e) {
  this.style.opacity = '1';
  
  // Remove all border highlights
  document.querySelectorAll('.group-item').forEach(item => {
    item.style.borderTop = '';
  });
  
  draggedElement = null;
}

async function reorderGroups(fromIndex, toIndex) {
  const result = await browser.storage.local.get({ groups: [] });
  const groups = result.groups;
  
  // Remove the item from the old position
  const [movedGroup] = groups.splice(fromIndex, 1);
  
  // Insert it at the new position
  groups.splice(toIndex, 0, movedGroup);
  
  await browser.storage.local.set({ groups });
  await loadGroups();
  await loadPairings();
  showStatus('Groups reordered');
}

// Add a new group
async function addGroup() {
  showGroupEditModal('', '', true);
}

// Save pairings to storage
async function savePairings() {
  const pairingDivs = document.querySelectorAll('.pairing-item');
  const pairings = [];
  
  pairingDivs.forEach(div => {
    const url = div.querySelector('.url-input').value.trim();
    const name = div.querySelector('.name-input').value.trim();
    const emoji = div.querySelector('.emoji-input').value.trim();
    const group = div.querySelector('.group-input').value.trim();
    
    // Save if URL is provided (name is now optional)
    if (url) {
      pairings.push({ url, name, emoji, group });
    }
  });
  
  await browser.storage.local.set({ pairings });
  showStatus('Saved');
}

// Show status message
function showStatus(message = 'Saved') {
  const status = document.getElementById('status');
  status.querySelector('span').textContent = message;
  status.style.display = 'flex';
  
  clearTimeout(status.hideTimeout);
  status.hideTimeout = setTimeout(() => {
    status.style.display = 'none';
  }, 2000);
}

// Export settings to JSON file
async function exportSettings() {
  const data = await browser.storage.local.get({ pairings: [], groups: [] });
  
  const exportData = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    pairings: data.pairings,
    groups: data.groups
  };
  
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `zen-tidy-settings-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showStatus('Settings exported');
}

// Import settings from JSON file
async function importSettings(file) {
  try {
    const text = await file.text();
    const importData = JSON.parse(text);
    
    // Validate the structure
    if (!importData.pairings || !Array.isArray(importData.pairings)) {
      throw new Error('Invalid settings file: missing or invalid pairings');
    }
    
    if (!importData.groups || !Array.isArray(importData.groups)) {
      throw new Error('Invalid settings file: missing or invalid groups');
    }
    
    // Confirm before overwriting
    if (!confirm('This will replace all current settings. Continue?')) {
      return;
    }
    
    // Save imported data
    await browser.storage.local.set({
      pairings: importData.pairings,
      groups: importData.groups
    });
    
    // Reload the UI
    await loadGroups();
    await loadPairings();
    
    showStatus('Settings imported successfully');
  } catch (error) {
    alert(`Import failed: ${error.message}`);
  }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Event listeners
document.getElementById('add-pairing').addEventListener('click', async () => {
  const result = await browser.storage.local.get({ groups: [] });
  addPairingRow('', '', '', '', result.groups);
  // Don't auto-save empty rows
});

document.getElementById('add-group').addEventListener('click', addGroup);
document.getElementById('export-settings').addEventListener('click', exportSettings);
document.getElementById('import-settings').addEventListener('click', () => {
  document.getElementById('import-file').click();
});
document.getElementById('import-file').addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    importSettings(e.target.files[0]);
    e.target.value = ''; // Reset file input
  }
});

// Load pairings and groups on page load
loadPairings();
loadGroups();

// Add slide out animation
const style = document.createElement('style');
style.textContent = `
  @keyframes slideOut {
    to {
      opacity: 0;
      transform: translateX(20px);
    }
  }
`;
document.head.appendChild(style);