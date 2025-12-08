/**
 * YouTube Detector Content Script
 * Extracts video and playlist information from YouTube pages
 */

(function() {
  'use strict';
  
  // Prevent multiple injections
  if (window.__notebookLMYoutubeDetector) return;
  window.__notebookLMYoutubeDetector = true;
  
  /**
   * Extract video ID from URL
   * @param {string} url - YouTube URL
   * @returns {string|null} - Video ID or null
   */
  function extractVideoId(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.searchParams.get('v');
    } catch (e) {
      return null;
    }
  }
  
  /**
   * Extract playlist ID from URL
   * @param {string} url - YouTube URL
   * @returns {string|null} - Playlist ID or null
   */
  function extractPlaylistId(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.searchParams.get('list');
    } catch (e) {
      return null;
    }
  }
  
  /**
   * Get video metadata from the current page
   * @returns {Object} - Video metadata
   */
  function getVideoMetadata() {
    // Get title - try multiple selectors
    const titleSelectors = [
      'h1. ytd-video-primary-info-renderer',
      'h1.ytd-watch-metadata',
      'h1 yt-formatted-string',
      '#title h1',
      'meta[name="title"]'
    ];
    
    let title = '';
    for (const selector of titleSelectors) {
      const el = document.querySelector(selector);
      if (el) {
        title = el.content || el.textContent?. trim();
        if (title) break;
      }
    }
    title = title || document.title. replace(' - YouTube', '');
    
    // Get channel name
    const channelSelectors = [
      '#channel-name a',
      'ytd-channel-name a',
      '#owner #channel-name',
      'a. yt-simple-endpoint.style-scope. yt-formatted-string'
    ];
    
    let channelName = '';
    for (const selector of channelSelectors) {
      const el = document. querySelector(selector);
      if (el) {
        channelName = el.textContent?.trim();
        if (channelName) break;
      }
    }
    
    // Get video duration
    const durationEl = document.querySelector('. ytp-time-duration');
    const duration = durationEl?. textContent || '';
    
    // Get description (first 500 chars)
    const descEl = document.querySelector('#description-inline-expander, #description');
    const description = descEl?. textContent?. trim()?.substring(0, 500) || '';
    
    return {
      videoId: extractVideoId(window.location.href),
      title,
      channelName,
      duration,
      description,
      url: window.location.href
    };
  }
  
  /**
   * Get all playlist videos from the current page
   * @returns {Array} - Array of video objects in playlist
   */
  function getPlaylistVideos() {
    const videos = [];
    const seenIds = new Set();
    
    // Selectors for playlist items
    const playlistItemSelectors = [
      'ytd-playlist-panel-video-renderer',
      'ytd-playlist-video-renderer',
      '#items ytd-playlist-panel-video-renderer',
      'ytd-playlist-video-list-renderer ytd-playlist-video-renderer'
    ];
    
    let playlistItems = [];
    for (const selector of playlistItemSelectors) {
      playlistItems = document.querySelectorAll(selector);
      if (playlistItems.length > 0) break;
    }
    
    playlistItems.forEach((item, index) => {
      // Get video link
      const linkEl = item.querySelector('a#video-title, a. yt-simple-endpoint');
      const href = linkEl?.href || '';
      
      // Extract video ID
      let videoId = null;
      try {
        if (href) {
          const urlObj = new URL(href);
          videoId = urlObj. searchParams.get('v');
        }
      } catch (e) {
        // Invalid URL
      }
      
      // Skip duplicates
      if (!videoId || seenIds.has(videoId)) return;
      seenIds.add(videoId);
      
      // Get title
      const title = linkEl?.textContent?. trim() || `Video ${index + 1}`;
      
      // Get duration
      const durationEl = item.querySelector(
        'span.ytd-thumbnail-overlay-time-status-renderer, ' +
        '#text. ytd-thumbnail-overlay-time-status-renderer, ' +
        'ytd-thumbnail-overlay-time-status-renderer span'
      );
      const duration = durationEl?.textContent?. trim() || '';
      
      // Get channel
      const channelEl = item. querySelector('#video-owner, . ytd-channel-name, #byline');
      const channelName = channelEl?.textContent?. trim() || '';
      
      videos.push({
        id: videoId,
        title,
        duration,
        channelName,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        index: videos.length + 1
      });
    });
    
    return videos;
  }
  
  /**
   * Get playlist metadata
   * @returns {Object} - Playlist metadata
   */
  function getPlaylistMetadata() {
    // Playlist title
    const titleSelectors = [
      'h1#title. ytd-playlist-header-renderer',
      '. metadata-wrapper h1',
      'yt-formatted-string. ytd-playlist-sidebar-primary-info-renderer',
      '#title yt-formatted-string'
    ];
    
    let title = '';
    for (const selector of titleSelectors) {
      const el = document.querySelector(selector);
      if (el) {
        title = el.textContent?.trim();
        if (title) break;
      }
    }
    
    // Playlist owner
    const ownerEl = document.querySelector('#owner-text a, #channel-name a');
    const owner = ownerEl?.textContent?.trim() || '';
    
    // Video count
    const countEl = document.querySelector(
      '. metadata-stats span, ' +
      '#stats . ytd-playlist-sidebar-primary-info-renderer, ' +
      '. byline-item'
    );
    const videoCount = countEl?.textContent?. trim() || '';
    
    return {
      playlistId: extractPlaylistId(window. location.href),
      title,
      owner,
      videoCount,
      url: window.location.href
    };
  }
  
  /**
   * Wait for playlist to load completely
   * @returns {Promise<void>}
   */
  async function waitForPlaylistLoad() {
    // Wait for initial playlist items
    let attempts = 0;
    while (attempts < 10) {
      const items = document.querySelectorAll(
        'ytd-playlist-panel-video-renderer, ytd-playlist-video-renderer'
      );
      if (items. length > 0) {
        // Wait a bit more for all items to load
        await new Promise(resolve => setTimeout(resolve, 500));
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 300));
      attempts++;
    }
  }
  
  /**
   * Main extraction function
   * @returns {Object} - Complete YouTube data
   */
  async function extractYouTubeData() {
    const url = window.location.href;
    const isVideo = url.includes('/watch');
    const isPlaylistPage = url.includes('/playlist');
    const hasPlaylist = url.includes('list=');
    
    // Wait for playlist to load if applicable
    if (hasPlaylist || isPlaylistPage) {
      await waitForPlaylistLoad();
    }
    
    const result = {
      success: true,
      data: {
        url,
        isVideo,
        isPlaylistPage,
        isPlaylist: isPlaylistPage || hasPlaylist
      }
    };
    
    // Get video data if on video page
    if (isVideo) {
      const videoData = getVideoMetadata();
      result.data = { ...result.data, ...videoData };
    }
    
    // Get playlist data if playlist is present
    if (hasPlaylist || isPlaylistPage) {
      const playlistMetadata = getPlaylistMetadata();
      const playlistVideos = getPlaylistVideos();
      
      result.data. playlist = playlistMetadata;
      result. data.playlistVideos = playlistVideos;
      
      // Use playlist title if on playlist page
      if (isPlaylistPage && playlistMetadata.title) {
        result.data.title = playlistMetadata.title;
      }
    }
    
    return result;
  }
  
  /**
   * Listen for messages from popup/background
   */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'EXTRACT_YOUTUBE_DATA') {
      extractYouTubeData()
        .then(data => sendResponse(data))
        .catch(error => {
          sendResponse({
            success: false,
            error: error.message
          });
        });
      
      // Return true for async response
      return true;
    }
  });
  
  console.log('NotebookLM Quick Add: YouTube detector loaded');
  
})();