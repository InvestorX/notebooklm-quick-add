/**
 * Background Service Worker
 * Handles message passing, context menus, and NotebookLM interactions
 */

// Storage keys
const STORAGE_KEYS = {
  NOTEBOOKS: 'cached_notebooks',
  LAST_NOTEBOOK: 'last_used_notebook',
  SETTINGS: 'user_settings'
};

// Context menu IDs
const MENU_IDS = {
  ADD_TO_NOTEBOOKLM: 'add-to-notebooklm',
  ADD_TO_NOTEBOOK_PREFIX: 'add-to-notebook-'
};

/**
 * Initialize extension on install
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await chrome.storage.local.set({
      [STORAGE_KEYS.SETTINGS]: {
        autoDetect: true,
        showNotifications: true,
        defaultAction: 'popup'
      }
    });
  }
  
  await createContextMenus();
  console.log('NotebookLM Quick Add: Initialized');
});

/**
 * Create right-click context menus
 */
async function createContextMenus() {
  await chrome.contextMenus.removeAll();
  
  chrome.contextMenus.create({
    id: MENU_IDS.ADD_TO_NOTEBOOKLM,
    title: 'NotebookLMに追加',
    contexts: ['page', 'link', 'video', 'selection']
  });
  
  chrome.contextMenus.create({
    id: 'separator-1',
    type: 'separator',
    parentId: MENU_IDS. ADD_TO_NOTEBOOKLM,
    contexts: ['page', 'link', 'video', 'selection']
  });
  
  chrome.contextMenus.create({
    id: `${MENU_IDS.ADD_TO_NOTEBOOK_PREFIX}new`,
    title: '📓 新しいノートブックを作成',
    parentId: MENU_IDS. ADD_TO_NOTEBOOKLM,
    contexts: ['page', 'link', 'video', 'selection']
  });
  
  await updateNotebookMenuItems();
}

/**
 * Update context menu with notebook list
 */
async function updateNotebookMenuItems() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.NOTEBOOKS);
  const notebooks = result[STORAGE_KEYS.NOTEBOOKS] || [];
  
  // Remove old items
  try {
    await chrome.contextMenus.remove('separator-notebooks');
  } catch (e) {}
  
  for (const notebook of notebooks) {
    try {
      await chrome.contextMenus.remove(`${MENU_IDS.ADD_TO_NOTEBOOK_PREFIX}${notebook.id}`);
    } catch (e) {}
  }
  
  if (notebooks.length > 0) {
    chrome.contextMenus.create({
      id: 'separator-notebooks',
      type: 'separator',
      parentId: MENU_IDS. ADD_TO_NOTEBOOKLM,
      contexts: ['page', 'link', 'video', 'selection']
    });
    
    notebooks.forEach(notebook => {
      chrome.contextMenus.create({
        id: `${MENU_IDS.ADD_TO_NOTEBOOK_PREFIX}${notebook.id}`,
        title: `📒 ${notebook.name}`,
        parentId: MENU_IDS.ADD_TO_NOTEBOOKLM,
        contexts: ['page', 'link', 'video', 'selection']
      });
    });
  }
}

/**
 * Handle context menu clicks
 */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const menuItemId = info.menuItemId;
  let notebookId = null;
  
  if (menuItemId === `${MENU_IDS.ADD_TO_NOTEBOOK_PREFIX}new`) {
    notebookId = null;
  } else if (typeof menuItemId === 'string' && menuItemId.startsWith(MENU_IDS.ADD_TO_NOTEBOOK_PREFIX)) {
    notebookId = menuItemId.replace(MENU_IDS.ADD_TO_NOTEBOOK_PREFIX, '');
  } else if (menuItemId === MENU_IDS.ADD_TO_NOTEBOOKLM) {
    const lastResult = await chrome.storage.local. get(STORAGE_KEYS. LAST_NOTEBOOK);
    notebookId = lastResult[STORAGE_KEYS.LAST_NOTEBOOK] || null;
  }
  
  const targetUrl = info.linkUrl || info. pageUrl || tab?. url;
  const targetTitle = tab?.title || 'Untitled';
  
  if (targetUrl) {
    await handleContextMenuAdd(targetUrl, targetTitle, notebookId, tab);
  }
});

/**
 * Handle adding source from context menu
 */
async function handleContextMenuAdd(url, title, notebookId, tab) {
  try {
    const pageType = detectPageType(url);
    let sourceData = { url, title, type: pageType };
    
    if (pageType. startsWith('youtube') && tab?. id) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content/youtube-detector. js']
        });
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const response = await chrome.tabs.sendMessage(tab.id, {
          action: 'EXTRACT_YOUTUBE_DATA'
        });
        
        if (response?. success && response.data) {
          sourceData.youtubeData = response.data;
          if (response.data.playlistVideos?. length > 0) {
            sourceData.playlistVideos = response.data.playlistVideos;
          }
        }
      } catch (e) {
        console.warn('YouTube extraction failed:', e);
      }
    }
    
    if (notebookId) {
      await chrome.storage.local. set({
        [STORAGE_KEYS.LAST_NOTEBOOK]: notebookId
      });
    }
    
    await addToNotebookLM({
      sourceType: pageType,
      sourceData: sourceData,
      notebookId: notebookId
    });
    
    await showBadgeNotification('✓', '#34a853');
    
  } catch (error) {
    console.error('Context menu add failed:', error);
    await showBadgeNotification('✗', '#ea4335');
  }
}

/**
 * Show badge notification
 */
async function showBadgeNotification(text, color) {
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
  setTimeout(async () => {
    await chrome.action.setBadgeText({ text: '' });
  }, 3000);
}

/**
 * Message handler
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => {
      console. error('Message handling error:', error);
      sendResponse({ success: false, error: error.message });
    });
  return true;
});

/**
 * Process incoming messages
 */
async function handleMessage(message, sender) {
  const { action, data } = message;
  
  switch (action) {
    case 'GET_PAGE_INFO':
      return await getPageInfoFromActiveTab();
    
    case 'GET_YOUTUBE_DATA':
      return await getYouTubeDataFromActiveTab();
    
    case 'ADD_TO_NOTEBOOKLM':
      return await addToNotebookLM(data);
    
    case 'GET_NOTEBOOKS':
      return await getCachedNotebooks();
    
    case 'SAVE_NOTEBOOKS':
      await saveNotebooks(data);
      await updateNotebookMenuItems();
      return { success: true };
    
    case 'REFRESH_NOTEBOOKS':
      return await refreshNotebooksFromPage();
    
    case 'GET_SETTINGS':
      return await getSettings();
    
    case 'SAVE_SETTINGS':
      return await saveSettings(data);
    
    case 'UPDATE_CONTEXT_MENU':
      await updateNotebookMenuItems();
      return { success: true };
    
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}

/**
 * Get current active tab
 */
async function getActiveTab() {
  const [tab] = await chrome.tabs. query({ active: true, currentWindow: true });
  return tab;
}

/**
 * Get page info from active tab (not from sender)
 */
async function getPageInfoFromActiveTab() {
  const tab = await getActiveTab();
  
  if (!tab || !tab. url) {
    throw new Error('アクティブなタブが見つかりません');
  }
  
  return {
    success: true,
    data: {
      url: tab.url,
      title: tab.title || 'Untitled',
      type: detectPageType(tab.url)
    }
  };
}

/**
 * Get YouTube data from active tab
 */
async function getYouTubeDataFromActiveTab() {
  const tab = await getActiveTab();
  
  if (!tab?. id) {
    return { success: false, error: 'No active tab' };
  }
  
  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'EXTRACT_YOUTUBE_DATA'
    });
    return { success: true, data: response };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Detect page type from URL
 */
function detectPageType(url) {
  if (! url) return 'unknown';
  
  if (url.includes('youtube.com/playlist')) {
    return 'youtube_playlist';
  }
  if (url.includes('youtube.com/watch') && url.includes('list=')) {
    return 'youtube_video_in_playlist';
  }
  if (url.includes('youtube.com/watch')) {
    return 'youtube_video';
  }
  if (url.includes('notebooklm.google.com')) {
    return 'notebooklm';
  }
  return 'webpage';
}

/**
 * Add source to NotebookLM
 */
async function addToNotebookLM(data) {
  const { sourceType, sourceData, notebookId } = data;
  
  let sourcesToAdd = [];
  
  // Handle playlists - add all videos
  if ((sourceType === 'youtube_playlist' || sourceType === 'youtube_video_in_playlist') 
      && sourceData.playlistVideos?.length > 0) {
    sourcesToAdd = sourceData.playlistVideos. map(video => ({
      type: 'youtube_video',
      url: video.url,
      title: video.title,
      videoId: video.id
    }));
  } else {
    sourcesToAdd = [{
      type: sourceType,
      url: sourceData.url,
      title: sourceData.title,
      youtubeData: sourceData.youtubeData
    }];
  }
  
  // Store pending sources
  await chrome.storage.local.set({
    pending_sources: {
      sources: sourcesToAdd,
      notebookId: notebookId,
      timestamp: Date.now()
    }
  });
  
  // Open or focus NotebookLM tab
  const notebookUrl = notebookId 
    ? `https://notebooklm.google.com/notebook/${notebookId}`
    : 'https://notebooklm.google.com/';
  
  const tabs = await chrome.tabs.query({ url: 'https://notebooklm.google.com/*' });
  
  if (tabs.length > 0) {
    await chrome.tabs.update(tabs[0].id, { active: true });
    
    if (notebookId && ! tabs[0].url.includes(notebookId)) {
      await chrome.tabs.update(tabs[0].id, { url: notebookUrl });
    }
    
    // Try to send message to content script
    try {
      await chrome.tabs.sendMessage(tabs[0].id, { action: 'ADD_PENDING_SOURCES' });
    } catch (e) {
      // Content script will check on load
    }
  } else {
    await chrome.tabs.create({ url: notebookUrl });
  }
  
  return { success: true, sourcesCount: sourcesToAdd.length };
}

/**
 * Get cached notebooks
 */
async function getCachedNotebooks() {
  const result = await chrome.storage. local.get(STORAGE_KEYS.NOTEBOOKS);
  return {
    success: true,
    data: result[STORAGE_KEYS.NOTEBOOKS] || []
  };
}

/**
 * Save notebooks
 */
async function saveNotebooks(notebooks) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.NOTEBOOKS]: notebooks
  });
}

/**
 * Refresh notebooks from NotebookLM page
 */
async function refreshNotebooksFromPage() {
  try {
    const tabs = await chrome.tabs.query({ url: 'https://notebooklm.google.com/*' });
    
    if (tabs.length === 0) {
      return { success: false, error: 'NotebookLMを開いてください' };
    }
    
    const response = await chrome.tabs.sendMessage(tabs[0].id, {
      action: 'GET_NOTEBOOKS'
    });
    
    if (response?. success && response.data) {
      await saveNotebooks(response.data);
      await updateNotebookMenuItems();
      return { success: true, data: response.data };
    }
    
    return { success: false, error: 'ノートブックを取得できませんでした' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Get settings
 */
async function getSettings() {
  const result = await chrome.storage.local.get(STORAGE_KEYS. SETTINGS);
  return {
    success: true,
    data: result[STORAGE_KEYS. SETTINGS] || {}
  };
}

/**
 * Save settings
 */
async function saveSettings(settings) {
  await chrome.storage.local.set({
    [STORAGE_KEYS.SETTINGS]: settings
  });
  return { success: true };
}
