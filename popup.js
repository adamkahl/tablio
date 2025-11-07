// Chrome compatibility
if (typeof browser === 'undefined') {
  globalThis.browser = chrome;
}

// Close button
document.getElementById('close-popup').addEventListener('click', () => {
  window.close();
});

// Tidy Now button
document.getElementById('tidy-now').addEventListener('click', () => {
  // Send message to background script to trigger tidy
  browser.runtime.sendMessage({ action: 'tidy' }, () => {
    // Close after message is sent
    window.close();
  });
});

// Settings button
document.getElementById('open-settings').addEventListener('click', () => {
  // Open options page - popup will auto-close
  if (browser.runtime.openOptionsPage) {
    browser.runtime.openOptionsPage();
  } else {
    const optionsUrl = browser.runtime.getURL('options/options.html');
    browser.tabs.create({ url: optionsUrl });
  }
  // Don't call window.close() - it will close automatically
});