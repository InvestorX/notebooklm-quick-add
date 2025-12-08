/**
 * NotebookLM Quick Add - Popup Script
 * Handles UI interactions and communicates with background service worker
 */

// DOM Elements
const elements = {
  loading: document.getElementById('loading'),
  mainContent: document.getElementById('main-content'),
  errorState: document.getElementById('error-state'),
  successState: document.getElementById('success-state'),
  pageTypeBadge: document.getElementById('page-type-badge'),
  pageTitle: document.getElementById('page-title'),
  pageUrl: document.getElementById('page-url'),
  playlistSection: document. getElementById('playlist-section'),
  playlistCount: document.getElementById('playlist-count'),
  notebookSelect: document.getElementById('notebook-select'),
  notebookHint: document.getElementById('notebook-hint'),
  refreshNotebooks: document.getElementById('refresh-notebooks'),
  addBtn: document.getElementById('add-btn'),
  retryBtn: document.getElementById('retry-btn'),
  openNotebookBtn: document.getElementById('open-notebook-btn'),
  errorMessage: document.getElementById('error-message'),
  successMessage: document.getElementById('success-message')
};

// Current page state
let currentPageData = null;
let youtubeData = null;

/**
 * Initialize popup on load
 */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initializePopup();
  } catch (error) {
    showError(error.message);
  }
});

/**
 * Main initialization function
 */
async function initializePopup() {
  showLoading();
  
  // Get current tab info
  const [tab] = await chrome.tabs. query({ active: true, currentWindow: true });
  
  if (!tab) {
    throw new Error('タブにアクセスできません');
  }
  
  // Get page info from background
  const pageInfoResponse = await sendMessage({ action: 'GET_PAGE_INFO' });
  
  if (!pageInfoResponse.success) {
    throw new Error(pageInfoResponse.error || 'ページ情報の取得に失敗しました');
  }
  
  currentPageData = pageInfoResponse.data;
  
  // Handle YouTube-specific content
  if (currentPageData. type. startsWith('youtube')) {
    await handleYouTubeContent(tab);
  }
  
  // Load cached notebooks
  await loadNotebooks();
  
  // Update UI
  updatePageInfo();
  setupEventListeners();
  
  showMainContent();
}

/**
 * Handle YouTube video or playlist content
 * @param {Object} tab - Current tab object
 */
async function handleYouTubeContent(tab) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/youtube-detector.js']
    });
    
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'EXTRACT_YOUTUBE_DATA'
    });
    
    if (response && response.success) {
      youtubeData = response.data;
      
      // Show playlist info if applicable
      if (youtubeData.playlistVideos && youtubeData.playlistVideos.length > 0) {
        displayPlaylistInfo(youtubeData.playlistVideos);
      }
    }
  } catch (error) {
    console.warn('YouTube data extraction failed:', error);
  }
}

/**
 * Display playlist information
 * @param {Array} videos - Array of video objects
 */
function displayPlaylistInfo(videos) {
  if (! videos || videos.length === 0) return;
  
  elements.playlistSection.classList.remove('hidden');
  elements.playlistCount.textContent = `${videos.length}本の動画を追加`;
}

/**
 * Update page information in UI
 */
function updatePageInfo() {
  const title = youtubeData?. title || currentPageData.title || 'タイトルなし';
  elements.pageTitle.textContent = title;
  elements.pageUrl. textContent = currentPageData.url;
  
  const badgeConfig = getPageTypeBadgeConfig(currentPageData.type);
  elements.pageTypeBadge.className = `page-type-badge ${badgeConfig.class}`;
  elements. pageTypeBadge.innerHTML = `
    <span class="badge-icon">${badgeConfig.icon}</span>
    <span class="badge-text">${badgeConfig. text}</span>
  `;
}

/**
 * Get badge configuration based on page type
 * @param {string} type - Page type identifier
 * @returns {Object} - Badge configuration
 */
function getPageTypeBadgeConfig(type) {
  const configs = {
    youtube_video: { icon: '▶️', text: 'YouTube動画', class: 'youtube' },
    youtube_playlist: { icon: '📋', text: 'YouTubeプレイリスト', class: 'playlist' },
    youtube_video_in_playlist: { icon: '▶️📋', text: 'プレイリスト内の動画', class: 'playlist' },
    webpage: { icon: '🌐', text: 'ウェブページ', class: 'webpage' },
    notebooklm: { icon: '📓', text: 'NotebookLM', class: 'webpage' },
    unknown: { icon: '📄', text: 'ページ', class: 'webpage' }
  };
  
  return configs[type] || configs.unknown;
}

/**
 * Load notebooks from cache/storage
 */
async function loadNotebooks() {
  const response = await sendMessage({ action: 'GET_NOTEBOOKS' });
  
  if (response.success && response.data. length > 0) {
    populateNotebookSelect(response.data);
    elements.notebookHint.classList.add('hidden');
  } else {
    elements.notebookHint.classList.remove('hidden');
  }
}

/**
 * Populate notebook select dropdown
 * @param {Array} notebooks - Array of notebook objects
 */
function populateNotebookSelect(notebooks) {
  elements.notebookSelect.innerHTML = '<option value="">新しいノートブックを作成</option>';
  
  notebooks.forEach(notebook => {
    const option = document.createElement('option');
    option.value = notebook.id;
    option.textContent = `📒 ${notebook.name}`;
    elements.notebookSelect.appendChild(option);
  });
}

/**
 * Setup event listeners for UI interactions
 */
function setupEventListeners() {
  elements.addBtn.addEventListener('click', handleAddToNotebookLM);
  elements. refreshNotebooks.addEventListener('click', handleRefreshNotebooks);
  elements.retryBtn.addEventListener('click', () => location.reload());
  elements.openNotebookBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://notebooklm.google.com/' });
    window.close();
  });
}

/**
 * Handle add to NotebookLM action
 */
async function handleAddToNotebookLM() {
  elements.addBtn.disabled = true;
  elements.addBtn.innerHTML = '<span class="spinner-small"></span> 追加中... ';
  
  try {
    const sourceData = prepareSourceData();
    
    const response = await sendMessage({
      action: 'ADD_TO_NOTEBOOKLM',
      data: {
        sourceType: currentPageData.type,
        sourceData: sourceData,
        notebookId: elements.notebookSelect.value || null
      }
    });
    
    if (response.success) {
      const count = response.sourcesCount || 1;
      elements.successMessage.textContent = 
        count > 1 
          ? `${count}件のソースをNotebookLMに追加中...`
          : 'NotebookLMに追加中...';
      showSuccess();
    } else {
      throw new Error(response.error || '追加に失敗しました');
    }
  } catch (error) {
    showError(error.message);
  }
}

/**
 * Prepare source data based on page type
 * @returns {Object} - Formatted source data
 */
function prepareSourceData() {
  const baseData = {
    url: currentPageData.url,
    title: currentPageData.title
  };
  
  if (youtubeData) {
    baseData.youtubeData = {
      videoId: youtubeData.videoId,
      title: youtubeData.title,
      channelName: youtubeData.channelName,
      duration: youtubeData.duration
    };
    
    // プレイリストの全動画を含める
    if (youtubeData. playlistVideos && youtubeData.playlistVideos.length > 0) {
      baseData.playlistVideos = youtubeData.playlistVideos;
    }
  }
  
  return baseData;
}

/**
 * Handle refresh notebooks action
 */
async function handleRefreshNotebooks() {
  elements.refreshNotebooks.disabled = true;
  elements.refreshNotebooks.textContent = '... ';
  
  try {
    const response = await sendMessage({ action: 'REFRESH_NOTEBOOKS' });
    
    if (response.success && response.data) {
      populateNotebookSelect(response.data);
      elements.notebookHint. classList.add('hidden');
    } else {
      elements.notebookHint.classList.remove('hidden');
    }
  } finally {
    elements.refreshNotebooks.disabled = false;
    elements.refreshNotebooks.textContent = '↻';
  }
}

/**
 * Send message to background service worker
 * @param {Object} message - Message to send
 * @returns {Promise<Object>} - Response from background
 */
async function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime. sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError. message });
      } else {
        resolve(response || { success: false, error: 'No response' });
      }
    });
  });
}

// UI State Management
function showLoading() {
  elements.loading.classList.remove('hidden');
  elements.mainContent.classList.add('hidden');
  elements.errorState.classList.add('hidden');
  elements.successState.classList.add('hidden');
}

function showMainContent() {
  elements.loading.classList.add('hidden');
  elements.mainContent.classList. remove('hidden');
  elements. errorState.classList.add('hidden');
  elements.successState. classList.add('hidden');
}

function showError(message) {
  elements.loading.classList. add('hidden');
  elements. mainContent.classList.add('hidden');
  elements.errorState. classList.remove('hidden');
  elements.successState.classList.add('hidden');
  elements.errorMessage.textContent = message;
}

function showSuccess() {
  elements.loading.classList.add('hidden');
  elements.mainContent.classList.add('hidden');
  elements.errorState.classList.add('hidden');
  elements.successState.classList.remove('hidden');
}