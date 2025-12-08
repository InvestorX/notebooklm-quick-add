/**
 * NotebookLM Quick Add - Popup Script
 */

// DOM Elements
let elements = {};

// State
let currentPageData = null;
let youtubeData = null;

/**
 * Initialize DOM elements
 */
function initElements() {
  elements = {
    loading: document.getElementById('loading'),
    mainContent: document.getElementById('main-content'),
    errorState: document.getElementById('error-state'),
    successState: document.getElementById('success-state'),
    pageTypeBadge: document.getElementById('page-type-badge'),
    badgeIcon: document.getElementById('badge-icon'),
    badgeText: document.getElementById('badge-text'),
    pageTitle: document.getElementById('page-title'),
    pageUrl: document. getElementById('page-url'),
    playlistSection: document.getElementById('playlist-section'),
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
}

/**
 * Show only one state
 */
function showState(stateName) {
  // Hide all states
  elements.loading.classList.add('hidden');
  elements.mainContent.classList. add('hidden');
  elements. errorState.classList.add('hidden');
  elements.successState. classList.add('hidden');
  
  // Show requested state
  switch (stateName) {
    case 'loading':
      elements.loading.classList.remove('hidden');
      break;
    case 'main':
      elements.mainContent. classList.remove('hidden');
      break;
    case 'error':
      elements.errorState. classList.remove('hidden');
      break;
    case 'success':
      elements.successState. classList.remove('hidden');
      break;
  }
}

/**
 * Send message to background
 */
function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response || { success: false, error: 'No response' });
      }
    });
  });
}

/**
 * Get badge config for page type
 */
function getBadgeConfig(type) {
  const configs = {
    youtube_video: { icon: '▶️', text: 'YouTube動画', className: 'youtube' },
    youtube_playlist: { icon: '📋', text: 'プレイリスト', className: 'playlist' },
    youtube_video_in_playlist: { icon: '▶️', text: 'プレイリスト内動画', className: 'playlist' },
    webpage: { icon: '🌐', text: 'ウェブページ', className: 'webpage' },
    notebooklm: { icon: '📓', text: 'NotebookLM', className: 'webpage' }
  };
  return configs[type] || configs.webpage;
}

/**
 * Update page info UI
 */
function updatePageInfo() {
  const title = youtubeData?. title || currentPageData?.title || 'タイトル不明';
  const url = currentPageData?.url || '';
  const type = currentPageData?.type || 'webpage';
  
  elements.pageTitle.textContent = title;
  elements.pageUrl.textContent = url;
  
  const badge = getBadgeConfig(type);
  elements.badgeIcon. textContent = badge.icon;
  elements.badgeText.textContent = badge.text;
  elements.pageTypeBadge.className = 'page-type-badge ' + badge.className;
}

/**
 * Show playlist info
 */
function showPlaylistInfo(videos) {
  if (!videos || videos.length === 0) return;
  
  elements.playlistSection.classList.remove('hidden');
  elements.playlistCount.textContent = `${videos.length}本の動画を追加`;
}

/**
 * Load notebooks
 */
async function loadNotebooks() {
  const response = await sendMessage({ action: 'GET_NOTEBOOKS' });
  
  if (response.success && response.data && response.data.length > 0) {
    elements.notebookSelect.innerHTML = '<option value="">新しいノートブックを作成</option>';
    
    response.data. forEach(notebook => {
      const option = document.createElement('option');
      option.value = notebook. id;
      option.textContent = '📒 ' + notebook.name;
      elements.notebookSelect.appendChild(option);
    });
    
    elements.notebookHint.classList.add('hidden');
  } else {
    elements.notebookHint.classList.remove('hidden');
  }
}

/**
 * Handle YouTube content
 */
async function handleYouTubeContent(tab) {
  try {
    // Inject content script
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content/youtube-detector.js']
    });
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Get YouTube data
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: 'EXTRACT_YOUTUBE_DATA'
    });
    
    if (response && response.success && response.data) {
      youtubeData = response.data;
      
      if (youtubeData.playlistVideos && youtubeData.playlistVideos.length > 0) {
        showPlaylistInfo(youtubeData.playlistVideos);
      }
    }
  } catch (error) {
    console.warn('YouTube extraction failed:', error);
  }
}

/**
 * Handle add button click
 */
async function handleAdd() {
  elements.addBtn.disabled = true;
  elements.addBtn.innerHTML = '<div class="spinner-small"></div> 追加中... ';
  
  try {
    const sourceData = {
      url: currentPageData. url,
      title: currentPageData.title
    };
    
    if (youtubeData) {
      sourceData.youtubeData = youtubeData;
      if (youtubeData.playlistVideos) {
        sourceData.playlistVideos = youtubeData. playlistVideos;
      }
    }
    
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
      elements. successMessage.textContent = count > 1 
        ? `${count}件のソースを追加中...`
        : 'NotebookLMに追加中...';
      showState('success');
    } else {
      throw new Error(response.error || '追加に失敗しました');
    }
  } catch (error) {
    elements.errorMessage.textContent = error.message;
    showState('error');
  }
}

/**
 * Handle refresh notebooks
 */
async function handleRefresh() {
  elements.refreshNotebooks.disabled = true;
  elements.refreshNotebooks.textContent = '... ';
  
  try {
    const response = await sendMessage({ action: 'REFRESH_NOTEBOOKS' });
    if (response.success && response.data) {
      await loadNotebooks();
    }
  } finally {
    elements.refreshNotebooks.disabled = false;
    elements.refreshNotebooks.textContent = '↻';
  }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  elements.addBtn.addEventListener('click', handleAdd);
  elements.refreshNotebooks.addEventListener('click', handleRefresh);
  elements.retryBtn.addEventListener('click', () => location.reload());
  elements.openNotebookBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://notebooklm.google.com/' });
    window.close();
  });
}

/**
 * Main initialization
 */
async function init() {
  initElements();
  showState('loading');
  
  try {
    // Get current tab
    const [tab] = await chrome.tabs. query({ active: true, currentWindow: true });
    
    if (! tab || !tab.url) {
      throw new Error('タブ情報を取得できません');
    }
    
    // Get page info
    const response = await sendMessage({ action: 'GET_PAGE_INFO' });
    
    if (! response.success) {
      throw new Error(response.error || 'ページ情報の取得に失敗');
    }
    
    currentPageData = response.data;
    
    // Handle YouTube
    if (currentPageData.type && currentPageData.type. startsWith('youtube')) {
      await handleYouTubeContent(tab);
    }
    
    // Load notebooks
    await loadNotebooks();
    
    // Update UI
    updatePageInfo();
    setupEventListeners();
    
    showState('main');
    
  } catch (error) {
    console.error('Init error:', error);
    elements.errorMessage.textContent = error.message;
    showState('error');
  }
}

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', init);
