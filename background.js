// Chrome compatibility layer
if (typeof browser === 'undefined') {
  var browser = chrome;
}

// Store original tab titles to prevent duplicate emoji prepending
const originalTitles = new Map();

// Track tabs that were detected as Glance tabs
const glanceTabIds = new Set();

// Debounce timer for auto-tidy
let autoTidyTimeout = null;

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

// Get or store the original title for a tab
function getOriginalTitle(tab) {
  const stored = originalTitles.get(tab.id);
  
  // If we have a stored title, check if the current title looks modified (has emojis)
  if (stored) {
    // If current title doesn't start with emoji characters, update the stored original
    // This handles cases where the page changed its title naturally
    const hasEmojiPrefix = /^[\p{Emoji}\s]+/u.test(tab.title);
    if (!hasEmojiPrefix) {
      originalTitles.set(tab.id, tab.title);
      return tab.title;
    }
    return stored;
  }
  
  // First time seeing this tab - store its current title as original
  originalTitles.set(tab.id, tab.title);
  return tab.title;
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

// Helper: Check if a tab is a Zen Browser Glance tab
function isGlanceTab(tab) {
  // Log ALL properties of the tab for debugging
  console.log('=== GLANCE TAB DETECTION DEBUG ===');
  console.log('Tab ID:', tab.id);
  console.log('Tab properties:', {
    id: tab.id,
    index: tab.index,
    windowId: tab.windowId,
    highlighted: tab.highlighted,
    active: tab.active,
    pinned: tab.pinned,
    status: tab.status,
    incognito: tab.incognito,
    width: tab.width,
    height: tab.height,
    discarded: tab.discarded,
    autoDiscardable: tab.autoDiscardable,
    mutedInfo: tab.mutedInfo,
    url: tab.url,
    title: tab.title,
    favIconUrl: tab.favIconUrl,
    pendingUrl: tab.pendingUrl,
    sessionId: tab.sessionId,
    // Zen-specific properties
    hidden: tab.hidden,
    skipTabGroups: tab.skipTabGroups,
    isInZenSidebar: tab.isInZenSidebar,
    cookieStoreId: tab.cookieStoreId,
    // Any other properties
    ...Object.keys(tab).reduce((acc, key) => {
      if (!['id', 'index', 'windowId', 'highlighted', 'active', 'pinned', 'status', 
            'incognito', 'width', 'height', 'discarded', 'autoDiscardable', 'mutedInfo',
            'url', 'title', 'favIconUrl', 'pendingUrl', 'sessionId', 'hidden', 
            'skipTabGroups', 'isInZenSidebar', 'cookieStoreId'].includes(key)) {
        acc[key] = tab[key];
      }
      return acc;
    }, {})
  });

  // First check if this tab has any current Glance markers
  const checks = {
    skipTabGroups: tab.skipTabGroups === true,
    isInZenSidebar: tab.isInZenSidebar === true,
    hidden: tab.hidden === true,
    cookieStoreIdGlance: tab.cookieStoreId && tab.cookieStoreId.includes('zen-glance'),
    cookieStoreIdSidebar: tab.cookieStoreId && tab.cookieStoreId.includes('zen-sidebar'),
    urlAboutBlank: tab.url && tab.url.startsWith('about:blank'),
    urlZen: tab.url && tab.url.startsWith('zen://'),
    urlChrome: tab.url && tab.url.startsWith('chrome://'),
    loadingNewTab: tab.status === 'loading' && (!tab.title || tab.title === 'New Tab')
  };

  console.log('Glance detection checks:', checks);

  const hasCurrentGlanceMarkers = Object.values(checks).some(v => v);
  console.log('Has current Glance markers:', hasCurrentGlanceMarkers);
  console.log('Previously tracked as Glance:', glanceTabIds.has(tab.id));

  // If tab was previously tracked as Glance but no longer has markers, remove it
  if (glanceTabIds.has(tab.id) && !hasCurrentGlanceMarkers) {
    console.log('❌ Tab no longer has Glance markers, removing from tracking:', tab.id);
    glanceTabIds.delete(tab.id);
    return false;
  }

  // If tab has current markers, add to tracking
  if (hasCurrentGlanceMarkers) {
    console.log('✅ Tab identified as Glance, adding to tracking:', tab.id);
    glanceTabIds.add(tab.id);
    return true;
  }

  console.log('❌ Tab is NOT a Glance tab:', tab.id);
  console.log('=================================\n');
  return false;
}

// Helper: Check if a tab is bookmarked in Zen Browser
const isBookmarkedTab = (tab) => {
  // Zen Browser specific: bookmarked tabs have skipTabGroups or are in a special container
  if (tab.skipTabGroups === true) return true;
  if (tab.isInZenSidebar === true) return true;
  
  // Check for sidebar-specific cookie store
  if (tab.cookieStoreId && tab.cookieStoreId.includes('zen-sidebar')) {
    return true;
  }
  
  return false;
};

// Update stored original title when tab URL or title changes naturally
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  console.log('Tab updated:', tabId, 'changeInfo:', changeInfo);
  
  // If title changed and doesn't have emoji prefix, update stored original
  if (changeInfo.title) {
    const hasEmojiPrefix = /^[\p{Emoji}\s]+/u.test(changeInfo.title);
    if (!hasEmojiPrefix) {
      originalTitles.set(tabId, changeInfo.title);
    }
  }
  
  // Check if this is a Glance tab (this will also update tracking)
  const isGlance = isGlanceTab(tab);
  
  // IMPORTANT: Don't trigger auto-tidy if the updated tab is a Glance tab
  if (isGlance) {
    console.debug('⏭️ Skipping auto-tidy: tab is a Glance tab', tab.id);
    return;
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
  glanceTabIds.delete(tabId); // Also clean up Glance tab tracking
});

// Listen for when tabs are attached/detached (moved between windows)
// This can happen when a Glance tab becomes a regular tab
browser.tabs.onAttached.addListener((tabId, attachInfo) => {
  // When a tab is attached to a new window, re-check if it's still a Glance tab
  browser.tabs.get(tabId).then(tab => {
    // isGlanceTab will automatically update tracking based on current markers
    const stillGlance = isGlanceTab(tab);
    if (!stillGlance) {
      console.debug('Tab promoted from Glance during attach, triggering tidy:', tabId);
      maybeAutoTidy();
    }
  });
});

// Helper: only operate on normal browser windows (avoid Glance/popup/devtools)
async function getFocusedNormalWindow() {
  const win = await browser.windows.getLastFocused({ populate: true });
  if (!win) return null;

  // Rule 1: Explicitly ignore non-normal window types
  if (win.type && win.type !== 'normal') {
    console.debug('Ignoring non-normal window type:', win.type);
    return null;
  }

  // Rule 2: Heuristic for Zen Browser's "Glance" feature.
  // Assume that a window with only one tab and no pinned tabs is a temporary Glance window.
  const isLikelyGlanceWindow = win.tabs && win.tabs.length <= 1 && !win.tabs.some(t => t.pinned);
  if (isLikelyGlanceWindow) {
    console.debug('Ignoring likely Glance window.');
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

  const [{ pairings, groups }] = await Promise.all([
    browser.storage.local.get({ pairings: [], groups: [] })
  ]);

  const tabs = await browser.tabs.query({
    windowId: currentWindow.id
  });

  // DEBUG: Log all tabs to see their properties
  console.log('=== ALL TABS IN WINDOW ===');
  tabs.forEach(tab => {
    console.log(`Tab ${tab.id} (index ${tab.index}):`, {
      title: tab.title,
      url: tab.url,
      pinned: tab.pinned,
      hidden: tab.hidden,
      skipTabGroups: tab.skipTabGroups,
      isInZenSidebar: tab.isInZenSidebar,
      cookieStoreId: tab.cookieStoreId,
      status: tab.status,
      discarded: tab.discarded,
      isTrackedGlance: glanceTabIds.has(tab.id),
      active: tab.active,
      highlighted: tab.highlighted
    });
  });
  console.log('========================\n');

  // Separate tabs into categories
  const pinnedTabs = tabs.filter(tab => tab.pinned);
  const bookmarkedTabs = tabs.filter(tab => !tab.pinned && isBookmarkedTab(tab));
  const glanceTabs = tabs.filter(tab => !tab.pinned && !isBookmarkedTab(tab) && isGlanceTab(tab));
  const regularTabs = tabs.filter(tab => 
    !tab.pinned && 
    !isBookmarkedTab(tab) && 
    !isGlanceTab(tab)
  );
  
  console.log('Tab categories:', {
    pinned: pinnedTabs.length,
    bookmarked: bookmarkedTabs.length,
    glance: glanceTabs.length,
    regular: regularTabs.length
  });
  
  if (regularTabs.length === 0) return;

  // Find the safe starting index: after all pinned, bookmarked, and Glance tabs
  // This is where regular tabs should start
  const allImmovableTabs = [...pinnedTabs, ...bookmarkedTabs, ...glanceTabs];
  const safeStartIndex = allImmovableTabs.length > 0 
    ? Math.max(...allImmovableTabs.map(t => t.index)) + 1
    : 0;

  // Create a map of group names to their order based on groups array
  const groupOrderMap = new Map();
  groups.forEach((group, index) => {
    const groupName = typeof group === 'string' ? group : group.name;
    groupOrderMap.set(groupName, index);
  });

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
    const originalTitle = getOriginalTitle(tab);
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
    
    return {
      tab,
      pairing,
      group: groupName,
      displayTitle,
      groupOrder,
      shouldRename: shouldModifyTitle
    };
  });

  // Sort tabs: first by group order, then alphabetically within groups
  tabsWithGroups.sort((a, b) => {
    // First, sort by group order
    if (a.groupOrder !== b.groupOrder) {
      return a.groupOrder - b.groupOrder;
    }
    
    // Within same group, sort alphabetically by display title
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
  // This ensures we NEVER move tabs above pinned/bookmarked/Glance tabs
  const tabIds = tabsWithGroups.map(({ tab }) => tab.id);
  
  if (tabIds.length > 0) {
    await browser.tabs.move(tabIds, { index: safeStartIndex });
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
    // If getFocusedNormalWindow returns null, it's a Glance window or other invalid type.
    // Do not schedule a tidy operation.
    console.debug('Auto-tidy skipped for non-normal or Glance window.');
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