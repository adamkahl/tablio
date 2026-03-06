// Chrome compatibility layer
if (typeof browser === 'undefined') {
  var browser = chrome;
}

// Store original tab titles to prevent duplicate emoji prepending
const originalTitles = new Map();

// Debounce timer for auto-tidy
let autoTidyTimeout = null;
let tabGroupsUnsupportedLogged = false;
let tabGroupsFailureLogged = false;

const TAB_GROUP_COLORS = ['blue', 'green', 'yellow', 'orange', 'red', 'purple', 'pink', 'cyan', 'grey'];

function supportsTabGroupsApi() {
  return !!(browser?.tabs?.group);
}

function logTabGroupsFailureOnce(message, error = null) {
  if (tabGroupsFailureLogged) return;
  const suffix = error?.message ? ` (${error.message})` : '';
  console.warn(`[tablio] ${message}${suffix}`);
  tabGroupsFailureLogged = true;
}

function getGroupOrderMap(groups) {
  const groupOrderMap = new Map();
  groups.forEach((group, index) => {
    const groupName = typeof group === 'string' ? group : group.name;
    groupOrderMap.set(groupName, index);
  });
  return groupOrderMap;
}

function getGroupColor(groupName, groupOrderMap) {
  const idx = groupOrderMap.get(groupName) ?? 0;
  return TAB_GROUP_COLORS[idx % TAB_GROUP_COLORS.length];
}

async function autoGroupTabs(windowId, tabsWithGroups, groups) {
  if (!supportsTabGroupsApi()) {
    if (!tabGroupsUnsupportedLogged) {
      console.warn('[tablio] Automatic tab grouping skipped: tabs.group API is unavailable in this browser.');
      tabGroupsUnsupportedLogged = true;
    }
    return;
  }

  const groupedTabIds = new Map();
  const ungroupedTabIds = [];

  tabsWithGroups.forEach(({ tab, group }) => {
    if (!group) {
      ungroupedTabIds.push(tab.id);
      return;
    }
    if (!groupedTabIds.has(group)) groupedTabIds.set(group, []);
    groupedTabIds.get(group).push(tab.id);
  });

  const groupOrderMap = getGroupOrderMap(groups);
  const existingByTitle = new Map();
  if (browser?.tabGroups?.query) {
    try {
      const existingGroups = await browser.tabGroups.query({ windowId });
      existingGroups.forEach(group => {
        if (group.title && !existingByTitle.has(group.title)) {
          existingByTitle.set(group.title, group.id);
        }
      });
    } catch (error) {
      logTabGroupsFailureOnce('Could not query existing tab groups; continuing without reuse.', error);
    }
  }

  for (const [groupName, tabIds] of groupedTabIds.entries()) {
    if (!tabIds.length) continue;
    try {
      const existingGroupId = existingByTitle.get(groupName);
      let groupId = existingGroupId;

      if (typeof existingGroupId === 'number') {
        groupId = await browser.tabs.group({ groupId: existingGroupId, tabIds });
      } else {
        groupId = await browser.tabs.group({ tabIds, createProperties: { windowId } });
      }

      if (browser?.tabGroups?.update) {
        await browser.tabGroups.update(groupId, {
          title: groupName,
          color: getGroupColor(groupName, groupOrderMap)
        });
      }
    } catch (error) {
      logTabGroupsFailureOnce('Could not create or update one or more tab groups.', error);
    }
  }

  if (ungroupedTabIds.length > 0 && browser.tabs.ungroup) {
    try {
      await browser.tabs.ungroup(ungroupedTabIds);
    } catch (error) {
      logTabGroupsFailureOnce('Could not ungroup tabs that have no assigned group.', error);
    }
  }
}

// Find a pairing for a URL
function findPairing(pairings, url) {
  return pairings.find(p => p.url && url && url.includes(p.url));
}

// Find a group by name
function findGroup(groups, groupName) {
  if (!groupName) return null;
  return groups.find(g => {
    const name = typeof g === 'string' ? g : g.name;
    return name === groupName;
  });
}

// Calculate match score for a tab against a group's keywords
function calculateMatchScore(tab, keywords) {
  if (!keywords || keywords.length === 0) return 0;
  
  const searchText = `${tab.url} ${tab.title}`.toLowerCase();
  let score = 0;
  
  keywords.forEach(keyword => {
    const lowerKeyword = keyword.toLowerCase();
    if (searchText.includes(lowerKeyword)) {
      // Give more weight to exact matches and matches in URL
      const urlMatches = (tab.url.toLowerCase().match(new RegExp(lowerKeyword, 'g')) || []).length;
      const titleMatches = (tab.title.toLowerCase().match(new RegExp(lowerKeyword, 'g')) || []).length;
      score += (urlMatches * 2) + titleMatches; // URL matches count double
    }
  });
  
  return score;
}

// Find best matching group for a tab based on keywords
function findBestMatchingGroup(groups, tab) {
  let bestMatch = null;
  let bestScore = 0;
  
  groups.forEach(group => {
    if (typeof group === 'string') return; // Skip old format groups
    
    const keywords = group.keywords || [];
    if (keywords.length === 0) return; // Skip groups without keywords
    
    const score = calculateMatchScore(tab, keywords);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = group;
    }
  });
  
  return bestMatch;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripManagedPrefixes(title, groupCategory = '', pairingEmoji = '') {
  let normalized = title || '';
  const prefixTokens = [groupCategory, pairingEmoji].filter(Boolean).map(escapeRegExp);
  if (!prefixTokens.length) return normalized;

  const tokenPattern = `(?:${prefixTokens.join('|')})`;
  const prefixPattern = new RegExp(`^(?:\\s*${tokenPattern}\\s+)+`, 'u');

  while (prefixPattern.test(normalized)) {
    normalized = normalized.replace(prefixPattern, '');
  }

  return normalized.trimStart();
}

// Get or store the original title for a tab
function getOriginalTitle(tab, groupCategory = '', pairingEmoji = '') {
  const stored = originalTitles.get(tab.id);
  const hasEmojiPrefix = /^[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\s]+/u.test(tab.title);
  
  // If we have a stored title, check if the current title looks modified (has emojis)
  if (stored) {
    // If current title doesn't start with emoji characters, update the stored original
    // This handles cases where the page changed its title naturally
    if (!hasEmojiPrefix) {
      const normalized = stripManagedPrefixes(tab.title, groupCategory, pairingEmoji);
      originalTitles.set(tab.id, normalized || tab.title);
      return normalized || tab.title;
    }
    return stored;
  }
  
  // First time seeing this tab - store a normalized title as original
  const normalized = stripManagedPrefixes(tab.title, groupCategory, pairingEmoji);
  originalTitles.set(tab.id, normalized || tab.title);
  return normalized || tab.title;
}

// Rename a tab - handles both Chrome and Firefox
async function renameTab(tabId, title) {
  try {
    // Chrome MV3 uses chrome.scripting.executeScript
    if (typeof chrome !== 'undefined' && chrome.scripting && chrome.scripting.executeScript) {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: (newTitle) => { document.title = newTitle; },
        args: [title]
      });
    } else {
      // Firefox uses browser.tabs.executeScript
      await browser.tabs.executeScript(tabId, {
        code: `document.title = ${JSON.stringify(title)};`
      });
    }
  } catch (error) {
    // Silently fail for tabs we can't access (chrome://, about:, etc.)
    console.debug(`Could not rename tab ${tabId}:`, error.message);
  }
}

// Helper: Identify sidebar/bookmarked-style tabs that should not be auto-moved
const isBookmarkedTab = (tab) => {
  // Some browsers expose sidebar/bookmarked tabs via these properties
  if (tab.skipTabGroups === true) return true;
  if (tab.isInZenSidebar === true) return true;
  
  // Check for sidebar-specific cookie store
  if (tab.cookieStoreId && tab.cookieStoreId.includes('zen-sidebar')) {
    return true;
  }
  
  return false;
};

// Update stored original title when tab URL or title changes naturally
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  console.log('Tab updated:', tabId, 'changeInfo:', changeInfo);
  
  // If title changed and doesn't have emoji prefix, update stored original
  if (changeInfo.title) {
    const hasEmojiPrefix = /^[\p{Extended_Pictographic}\p{Emoji_Presentation}\uFE0F\s]+/u.test(changeInfo.title);
    if (!hasEmojiPrefix) {
      originalTitles.set(tabId, changeInfo.title);
    }
  }
  
  // Don't trigger auto-tidy if the updated tab is bookmarked
  if (isBookmarkedTab(tab)) {
    console.debug('⏭️ Skipping auto-tidy: tab is a bookmarked tab', tab.id);
    return;
  }
  
  // Only trigger auto-tidy on URL or title changes (and only for regular tabs)
  if (changeInfo.url || changeInfo.title) {
    console.debug('✅ Triggering auto-tidy due to tab update');
    maybeAutoTidy();
  }
});

// Clean up stored titles for closed tabs
browser.tabs.onRemoved.addListener((tabId) => {
  originalTitles.delete(tabId);
});

// Listen for when tabs are attached/detached (moved between windows)
browser.tabs.onAttached.addListener(() => {
  maybeAutoTidy();
});

// Helper: only operate on normal browser windows (avoid popup/devtools)
async function getFocusedNormalWindow() {
  const win = await browser.windows.getLastFocused({ populate: true });
  if (!win) return null;

  // Rule 1: Explicitly ignore non-normal window types
  if (win.type && win.type !== 'normal') {
    console.debug('Ignoring non-normal window type:', win.type);
    return null;
  }

  return win;
}

// Main action: rename tabs based on pairings and organize by groups
async function tidy() {
  console.log('=== TIDY OPERATION STARTED ===');
  
  const currentWindow = await getFocusedNormalWindow();
  if (!currentWindow) {
    console.log('❌ No valid window found, aborting tidy');
    return;
  }

  console.log('✅ Operating on window:', currentWindow.id);

  const [{ pairings, groups, autoGroupTabsEnabled }] = await Promise.all([
    browser.storage.local.get({ pairings: [], groups: [], autoGroupTabsEnabled: true })
  ]);

  const tabs = await browser.tabs.query({
    windowId: currentWindow.id
  });

  // Separate tabs into categories
  const pinnedTabs = tabs.filter(tab => tab.pinned);
  const bookmarkedTabs = tabs.filter(tab => !tab.pinned && isBookmarkedTab(tab));
  const regularTabs = tabs.filter(tab => !tab.pinned && !isBookmarkedTab(tab));
  
  console.log('Tab categories:', {
    pinned: pinnedTabs.length,
    bookmarked: bookmarkedTabs.length,
    regular: regularTabs.length
  });

  if (regularTabs.length === 0) return;

  // Find the safe starting index: after all pinned and bookmarked tabs
  // This is where regular tabs should start
  const allImmovableTabs = [...pinnedTabs, ...bookmarkedTabs];
  const safeStartIndex = allImmovableTabs.length > 0 
    ? Math.max(...allImmovableTabs.map(t => t.index)) + 1
    : 0;

  // Create a map of group names to their order based on groups array
  const groupOrderMap = getGroupOrderMap(groups);
  const pairingOrderMap = new Map();
  pairings.forEach((pairing, index) => pairingOrderMap.set(pairing, index));

  // Associate tabs with their pairings and groups (only regular tabs)
  const tabsWithGroups = regularTabs.map(tab => {
    const pairing = findPairing(pairings, tab.url);
    let groupName = pairing?.group || '';
    let group = findGroup(groups, groupName);
    
    // If no explicit group from pairing, try keyword matching
    if (!groupName) {
      const matchedGroup = findBestMatchingGroup(groups, tab);
      if (matchedGroup) {
        group = matchedGroup;
        groupName = matchedGroup.name;
      }
    }
    
    const hasPairingName = pairing && pairing.name && pairing.name.trim();
    const hasGroupCategory = group && typeof group === 'object' && group.category;

    // Determine if the title should be modified at all
    const shouldModifyTitle = hasPairingName || hasGroupCategory || (pairing && pairing.emoji);
    
    // Always use the original title as the base
    const originalTitle = getOriginalTitle(tab, hasGroupCategory ? group.category : '', pairing?.emoji || '');
    let displayTitle = originalTitle;

    if (shouldModifyTitle) {
      const titleParts = [];

      // 1. Add group category emoji if it exists
      if (hasGroupCategory) {
        titleParts.push(group.category);
      }

      // 2. Add color emoji from pairing if it exists
      if (pairing && pairing.emoji) {
        titleParts.push(pairing.emoji);
      }

      // 3. Add the main title part
      if (hasPairingName) {
        // Use the custom name from the pairing
        titleParts.push(pairing.name);
      } else {
        // Use the tab's original title
        titleParts.push(originalTitle);
      }
      
      displayTitle = titleParts.join(' ');
    }

    // Get group order (ungrouped tabs go to end)
    const groupOrder = groupName ? (groupOrderMap.get(groupName) ?? groups.length) : groups.length;
    const pairingOrder = pairing ? (pairingOrderMap.get(pairing) ?? Number.MAX_SAFE_INTEGER) : Number.MAX_SAFE_INTEGER;
    
    return {
      tab,
      pairing,
      group: groupName,
      displayTitle,
      groupOrder,
      pairingOrder,
      shouldRename: shouldModifyTitle
    };
  });

  // Sort tabs: first by group order, then URL pattern order, then alphabetically
  tabsWithGroups.sort((a, b) => {
    // First, sort by group order
    if (a.groupOrder !== b.groupOrder) {
      return a.groupOrder - b.groupOrder;
    }

    // Within same group, honor URL pattern order from the pairings list
    if (a.pairingOrder !== b.pairingOrder) {
      return a.pairingOrder - b.pairingOrder;
    }
    
    // Fallback sort alphabetically by display title
    return a.displayTitle.toLowerCase().localeCompare(b.displayTitle.toLowerCase());
  });

  // Rename tabs that match pairings (only if they have a name)
  await Promise.allSettled(
    tabsWithGroups.map(({ tab, shouldRename, displayTitle }) => {
      if (!shouldRename) return Promise.resolve();
      return renameTab(tab.id, displayTitle);
    })
  );

  // Move tabs into their sorted order, starting from the safe index
  // This ensures we NEVER move tabs above pinned/bookmarked tabs
  let tabIds = tabsWithGroups.map(({ tab }) => tab.id);
  // Also do not move any tab that currently sits in the immovable area
  tabIds = tabIds.filter(id => {
    const t = tabs.find(tt => tt.id === id);
    if (!t) return false;
    if (t.index < safeStartIndex) {
      console.debug(`Skipping move for tab ${id} because current index ${t.index} < safeStartIndex ${safeStartIndex}`);
      return false;
    }
    return true;
  });
  if (tabIds.length > 0) {
    await browser.tabs.move(tabIds, { index: safeStartIndex });
  }

  if (autoGroupTabsEnabled) {
    await autoGroupTabs(currentWindow.id, tabsWithGroups, groups);
  }
}

// Debounced auto-tidy to prevent excessive operations
function scheduleAutoTidy() {
  clearTimeout(autoTidyTimeout);
  autoTidyTimeout = setTimeout(() => {
    tidy();
  }, 1000);
}

// Check if auto-tidy is enabled and trigger if so
async function maybeAutoTidy() {
  const { autoTidyEnabled } = await browser.storage.local.get({ autoTidyEnabled: false });
  if (!autoTidyEnabled) return;

  // Use the full check to see if we are in a valid window
  const win = await getFocusedNormalWindow();
  if (!win) {
    console.debug('Auto-tidy skipped for non-normal window.');
    return;
  }

  scheduleAutoTidy();
}

// Listen for messages from popup
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'tidy') {
    tidy();
    sendResponse({ success: true });
  }
  return true; // Keep the message channel open for async response
});

// Listen for tab events
browser.tabs.onCreated.addListener(() => {
  maybeAutoTidy();
});

// Toolbar button click handler (fallback for browsers without popup)
const action = browser.action || browser.browserAction;
action.onClicked.addListener(() => {
  tidy();
});