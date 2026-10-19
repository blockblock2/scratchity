// Clicking the toolbar icon opens Scratchity in Chrome's side panel.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(console.error);
