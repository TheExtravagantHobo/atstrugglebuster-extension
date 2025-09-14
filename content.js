// atstrugglebuster-extension/content.js

// Production environment
const DEBUG = false;
if (DEBUG) console.log('[AT DEBUG] content.js loaded');

let shadowHost = null;
let shadowRoot = null;
let floatingButton = null;
let scorePanel = null;
let cachedSelection = {
  text: '',
  range: null,
  rect: null
};
let lastEvaluation = null;

// Initialize extension
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

function init() {
  if (DEBUG) console.log('[AT DEBUG] Initializing extension');
  
  // Create shadow DOM for UI isolation
  createShadowContainer();
  
  // Handle text selection with 10ms delay for browser selection stabilization
  document.addEventListener('mouseup', (e) => {
    // Skip if clicking our UI
    if (e.target.closest('#atsb-shadow-host')) return;
    
    // Store mouse coordinates for button positioning
    const mouseX = e.clientX;
    const mouseY = e.clientY;
    
    setTimeout(() => {
      const selection = window.getSelection();
      const text = selection.toString().trim();
      
      if (DEBUG && text.length > 0) {
        console.log('[AT DEBUG] mouseup selection len=', text.length);
      }
      
      if (text.length > 100 && text.length < 10000) {
        handleTextSelection(selection, mouseX, mouseY);
      } else {
        hideFloatingButton();
      }
    }, 10);
  });
  
  // Track selection changes
  let selectionDebounce = null;
  document.addEventListener('selectionchange', () => {
    clearTimeout(selectionDebounce);
    selectionDebounce = setTimeout(() => {
      const selection = window.getSelection();
      const text = selection.toString().trim();
      
      if (text.length > 100) {
        cacheSelectionData(selection);
      }
    }, 300);
  });
  
  // Handle messages from background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'evaluate') {
      evaluateSelectedText(request.text);
    }
    if (request.action === 'creditsUpdated') {
      updateCreditsDisplay(request.credits);
    }
  });
}

// Create shadow DOM container
function createShadowContainer() {
  // Remove existing if present
  const existing = document.getElementById('atsb-shadow-host');
  if (existing) existing.remove();
  
  // Create host element
  shadowHost = document.createElement('div');
  shadowHost.id = 'atsb-shadow-host';
  shadowHost.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 0;
    height: 0;
    z-index: 999999;
    pointer-events: none;
  `;
  
  // Attach shadow root with closed mode for isolation
  shadowRoot = shadowHost.attachShadow({ mode: 'closed' });
  
  // Add styles
  const styleSheet = document.createElement('style');
  styleSheet.textContent = getShadowStyles();
  shadowRoot.appendChild(styleSheet);
  
  document.body.appendChild(shadowHost);
}

// Cache selection data for later use
function cacheSelectionData(selection) {
  if (!selection || selection.rangeCount === 0) return;
  
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  
  cachedSelection = {
    text: selection.toString().trim(),
    range: range.cloneRange(),
    rect: {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      width: rect.width,
      height: rect.height
    }
  };
  
  if (DEBUG) {
    console.log('[AT DEBUG] Cached selection len=', cachedSelection.text.length);
  }
}

// Handle text selection and show button near mouse cursor
function handleTextSelection(selection, mouseX, mouseY) {
  // Cache the selection
  cacheSelectionData(selection);
  
  if (!cachedSelection.text || cachedSelection.text.length < 100) return;
  
  // Position button near mouse cursor with offset
  const buttonSize = 48;
  const offset = 15;
  
  // Position to the lower-right of cursor
  let x = mouseX + offset;
  let y = mouseY + offset;
  
  // Adjust if button would go off screen
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  if (x + buttonSize > viewportWidth) {
    x = mouseX - buttonSize - offset;
  }
  
  if (y + buttonSize > viewportHeight) {
    y = mouseY - buttonSize - offset;
  }
  
  // Ensure button stays on screen
  if (x < 0) x = offset;
  if (y < 0) y = offset;
  
  showFloatingButton(x, y);
}

// Show floating action button
function showFloatingButton(x, y) {
  if (!floatingButton) {
    createFloatingButton();
  }
  
  floatingButton.style.left = `${x}px`;
  floatingButton.style.top = `${y}px`;
  floatingButton.style.display = 'flex';
  floatingButton.style.pointerEvents = 'auto';
  floatingButton.style.animation = 'atsb-fade-in 0.2s ease-out';
  
  if (DEBUG) {
    console.log('[AT DEBUG] Button shown at', x, y, 'for text len=', cachedSelection.text.length);
  }
}

// Create floating action button
function createFloatingButton() {
  floatingButton = document.createElement('div');
  floatingButton.className = 'atsb-floating-button';
  floatingButton.innerHTML = `
    <div class="atsb-fab-icon">AT</div>
    <div class="atsb-fab-tooltip">Evaluate with ATStruggle Buster</div>
  `;
  
  floatingButton.addEventListener('click', (e) => {
    e.stopPropagation();
    
    if (DEBUG) {
      console.log('[AT DEBUG] Button clicked, cached text len=', cachedSelection.text?.length || 0);
    }
    
    if (cachedSelection.text && cachedSelection.text.length > 100) {
      evaluateSelectedText(cachedSelection.text);
    } else {
      // Fallback to current selection
      const selection = window.getSelection();
      const text = selection.toString().trim();
      
      if (text.length > 100) {
        evaluateSelectedText(text);
      } else {
        showErrorPanel('Please select text to evaluate (minimum 100 characters)');
      }
    }
  });
  
  // Prevent selection clearing on mousedown
  floatingButton.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  
  shadowRoot.appendChild(floatingButton);
}

// Hide floating button
function hideFloatingButton() {
  if (floatingButton) {
    floatingButton.style.display = 'none';
    floatingButton.style.pointerEvents = 'none';
  }
}

// Evaluate selected text against resume
async function evaluateSelectedText(text) {
  if (DEBUG) console.log('[AT DEBUG] Evaluating text length:', text.length);
  hideFloatingButton();
  showLoadingPanel();
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'evaluateJob',
      jobText: text
    });
    
    if (response.error) {
      showErrorPanel(response.error);
    } else {
      lastEvaluation = response;
      showScorePanel(response);
    }
  } catch (error) {
    console.error('Evaluation error:', error);
    showErrorPanel('Failed to evaluate. Please check your connection and try again.');
  }
}

// Show loading panel
function showLoadingPanel() {
  if (!scorePanel) {
    createScorePanel();
  }
  
  scorePanel.innerHTML = `
    <div class="atsb-panel-header">
      <div class="atsb-panel-logo">
        <div class="atsb-logo-icon">AT</div>
        <span>ATStruggle Buster</span>
      </div>
      <button class="atsb-close-btn">&times;</button>
    </div>
    <div class="atsb-panel-loading">
      <div class="atsb-spinner"></div>
      <p>Analyzing job match...</p>
    </div>
  `;
  
  scorePanel.style.display = 'block';
  scorePanel.style.pointerEvents = 'auto';
  scorePanel.style.animation = 'atsb-slide-in 0.3s ease-out';
  
  scorePanel.querySelector('.atsb-close-btn').addEventListener('click', hideScorePanel);
}

// Show score panel with evaluation results
function showScorePanel(evaluation) {
  if (!scorePanel) {
    createScorePanel();
  }
  
  const scoreColor = evaluation.score >= 70 ? '#10b981' : 
                     evaluation.score >= 50 ? '#f59e0b' : '#ef4444';
  
  const recommendation = evaluation.overall_recommendation === 'move_forward' ? 'Strong Match' :
                         evaluation.overall_recommendation === 'consider' ? 'Good Match' : 
                         'Weak Match';
  
  scorePanel.innerHTML = `
    <div class="atsb-panel-header">
      <div class="atsb-panel-logo">
        <div class="atsb-logo-icon">AT</div>
        <span>ATStruggle Buster</span>
      </div>
      <button class="atsb-close-btn">&times;</button>
    </div>
    
    <div class="atsb-score-section">
      <div class="atsb-score-ring">
        <svg viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" fill="none" stroke="#e5e7eb" stroke-width="8"/>
          <circle cx="50" cy="50" r="40" fill="none" stroke="${scoreColor}" stroke-width="8"
                  stroke-dasharray="${251.2 * evaluation.score / 100} 251.2"
                  stroke-linecap="round"
                  transform="rotate(-90 50 50)"/>
        </svg>
        <div class="atsb-score-text">${evaluation.score}%</div>
      </div>
      <div class="atsb-score-label">${recommendation}</div>
    </div>
    
    <div class="atsb-details-section">
      ${evaluation.reasons?.length > 0 ? `
        <div class="atsb-detail-block">
          <div class="atsb-detail-header atsb-strengths-header">
            <span class="atsb-icon-check">✓</span> Strengths
          </div>
          <ul class="atsb-detail-list">
            ${evaluation.reasons.slice(0, 3).map(reason => 
              `<li class="atsb-detail-item">${reason}</li>`
            ).join('')}
          </ul>
        </div>
      ` : ''}
      
      ${evaluation.gaps?.length > 0 ? `
        <div class="atsb-detail-block">
          <div class="atsb-detail-header atsb-gaps-header">
            <span class="atsb-icon-warning">!</span> Gaps to Address
          </div>
          <ul class="atsb-detail-list">
            ${evaluation.gaps.slice(0, 3).map(gap => 
              `<li class="atsb-detail-item">${gap}</li>`
            ).join('')}
          </ul>
        </div>
      ` : ''}
    </div>
    
    <div class="atsb-action-buttons">
      <button class="atsb-btn atsb-btn-primary" id="viewFullAnalysis">
        View Full Analysis →
      </button>
      <button class="atsb-btn atsb-btn-secondary" id="viewCredits">
        Credits: <span class="atsb-credits-count">--</span>
      </button>
    </div>
  `;
  
  scorePanel.style.display = 'block';
  scorePanel.style.pointerEvents = 'auto';
  scorePanel.style.animation = 'atsb-slide-in 0.3s ease-out';
  
  // Add event handlers
  scorePanel.querySelector('.atsb-close-btn').addEventListener('click', hideScorePanel);
  scorePanel.querySelector('#viewFullAnalysis').addEventListener('click', openFullAnalysis);
  scorePanel.querySelector('#viewCredits').addEventListener('click', openCreditsPage);
  
  updateCreditsDisplay();
}

// Show error panel
function showErrorPanel(error) {
  if (!scorePanel) {
    createScorePanel();
  }
  
  scorePanel.innerHTML = `
    <div class="atsb-panel-header">
      <div class="atsb-panel-logo">
        <div class="atsb-logo-icon">AT</div>
        <span>ATStruggle Buster</span>
      </div>
      <button class="atsb-close-btn">&times;</button>
    </div>
    
    <div class="atsb-panel-error">
      <div class="atsb-error-icon">!</div>
      <p class="atsb-error-message">${error}</p>
      ${error.includes('connect your account') ? `
        <button class="atsb-btn atsb-btn-primary" id="openSettings">
          Connect Account →
        </button>
      ` : error.includes('credits') ? `
        <button class="atsb-btn atsb-btn-primary" id="buyCredits">
          Buy Credits →
        </button>
      ` : ''}
    </div>
  `;
  
  scorePanel.style.display = 'block';
  scorePanel.style.pointerEvents = 'auto';
  scorePanel.style.animation = 'atsb-slide-in 0.3s ease-out';
  
  scorePanel.querySelector('.atsb-close-btn').addEventListener('click', hideScorePanel);
  
  const settingsBtn = scorePanel.querySelector('#openSettings');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'openPopup' });
    });
  }
  
  const creditsBtn = scorePanel.querySelector('#buyCredits');
  if (creditsBtn) {
    creditsBtn.addEventListener('click', openCreditsPage);
  }
}

// Create score panel container
function createScorePanel() {
  scorePanel = document.createElement('div');
  scorePanel.className = 'atsb-score-panel';
  shadowRoot.appendChild(scorePanel);
}

// Hide score panel
function hideScorePanel() {
  if (scorePanel) {
    scorePanel.style.animation = 'atsb-slide-out 0.3s ease-out';
    setTimeout(() => {
      scorePanel.style.display = 'none';
      scorePanel.style.pointerEvents = 'none';
    }, 300);
  }
}

// Update credits display in panel
async function updateCreditsDisplay(credits) {
  if (!credits) {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'getCredits' });
      credits = response.credits || 0;
    } catch (e) {
      credits = '--';
    }
  }
  
  const creditsElements = shadowRoot.querySelectorAll('.atsb-credits-count');
  creditsElements.forEach(el => {
    el.textContent = credits;
  });
}

// Open full analysis page
function openFullAnalysis() {
  if (lastEvaluation) {
    chrome.storage.local.set({ 
      pendingAnalysis: {
        evaluation: lastEvaluation,
        jobText: cachedSelection.text
      }
    });
  }
  
  window.open('https://atstrugglebuster.com/history', '_blank');
}

// Open credits page
function openCreditsPage() {
  window.open('https://atstrugglebuster.com/credits', '_blank');
}

// Get all styles for shadow DOM
function getShadowStyles() {
  return `
    /* Reset and base styles */
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    /* Floating Action Button */
    .atsb-floating-button {
      position: fixed;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
      cursor: pointer;
      display: none;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      pointer-events: auto !important;
    }
    
    .atsb-floating-button:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5);
    }
    
    .atsb-fab-icon {
      color: white;
      font-weight: 700;
      font-size: 16px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      pointer-events: none;
      user-select: none;
    }
    
    .atsb-fab-tooltip {
      position: absolute;
      bottom: 60px;
      left: 50%;
      transform: translateX(-50%);
      background: #1a1a1a;
      color: white;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 12px;
      white-space: nowrap;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    
    .atsb-floating-button:hover .atsb-fab-tooltip {
      opacity: 1;
    }
    
    /* Score Panel */
    .atsb-score-panel {
      position: fixed;
      top: 20px;
      right: 20px;
      width: 320px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
      border: 1px solid #e5e7eb;
      display: none;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      overflow: hidden;
      pointer-events: auto !important;
    }
    
    /* Panel Header */
    .atsb-panel-header {
      background: #1a1a1a;
      color: white;
      padding: 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    
    .atsb-panel-logo {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 600;
      font-size: 14px;
    }
    
    .atsb-logo-icon {
      width: 24px;
      height: 24px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 700;
      color: white;
    }
    
    .atsb-close-btn {
      background: none;
      border: none;
      color: #9ca3af;
      font-size: 24px;
      cursor: pointer;
      padding: 0;
      width: 28px;
      height: 28px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s ease;
    }
    
    .atsb-close-btn:hover {
      background: rgba(255, 255, 255, 0.1);
      color: white;
    }
    
    /* Loading State */
    .atsb-panel-loading {
      padding: 48px;
      text-align: center;
    }
    
    .atsb-spinner {
      width: 48px;
      height: 48px;
      border: 4px solid #f3f4f6;
      border-top: 4px solid #667eea;
      border-radius: 50%;
      margin: 0 auto 16px;
      animation: atsb-spin 1s linear infinite;
    }
    
    .atsb-panel-loading p {
      color: #6b7280;
      font-size: 14px;
      margin: 0;
    }
    
    /* Score Section */
    .atsb-score-section {
      padding: 24px;
      text-align: center;
      background: linear-gradient(135deg, #f8faff 0%, #f0f4ff 100%);
    }
    
    .atsb-score-ring {
      width: 100px;
      height: 100px;
      margin: 0 auto 16px;
      position: relative;
    }
    
    .atsb-score-ring svg {
      width: 100%;
      height: 100%;
    }
    
    .atsb-score-text {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 28px;
      font-weight: 700;
      color: #1a1a1a;
    }
    
    .atsb-score-label {
      font-size: 16px;
      font-weight: 600;
      color: #4f46e5;
    }
    
    /* Details Section */
    .atsb-details-section {
      padding: 20px;
      max-height: 300px;
      overflow-y: auto;
    }
    
    .atsb-detail-block {
      margin-bottom: 20px;
    }
    
    .atsb-detail-block:last-child {
      margin-bottom: 0;
    }
    
    .atsb-detail-header {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .atsb-strengths-header {
      color: #059669;
    }
    
    .atsb-gaps-header {
      color: #dc2626;
    }
    
    .atsb-icon-check,
    .atsb-icon-warning {
      font-weight: 700;
      font-size: 14px;
    }
    
    .atsb-detail-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    
    .atsb-detail-item {
      font-size: 13px;
      color: #374151;
      margin-bottom: 6px;
      padding-left: 20px;
      position: relative;
      line-height: 1.4;
    }
    
    .atsb-detail-item:before {
      content: "•";
      position: absolute;
      left: 8px;
      font-weight: bold;
    }
    
    .atsb-strengths-header + .atsb-detail-list .atsb-detail-item:before {
      color: #059669;
    }
    
    .atsb-gaps-header + .atsb-detail-list .atsb-detail-item:before {
      color: #dc2626;
    }
    
    /* Action Buttons */
    .atsb-action-buttons {
      padding: 16px;
      border-top: 1px solid #f3f4f6;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    
    .atsb-btn {
      padding: 12px 16px;
      border-radius: 8px;
      border: none;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      text-align: center;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font-family: inherit;
    }
    
    .atsb-btn-primary {
      background: #1a1a1a;
      color: white;
    }
    
    .atsb-btn-primary:hover {
      background: #2a2a2a;
      transform: translateY(-1px);
    }
    
    .atsb-btn-secondary {
      background: #f8faff;
      color: #4f46e5;
      border: 1px solid #e5e7eb;
    }
    
    .atsb-btn-secondary:hover {
      background: #f0f4ff;
      border-color: #d1d5db;
    }
    
    /* Error State */
    .atsb-panel-error {
      padding: 32px;
      text-align: center;
    }
    
    .atsb-error-icon {
      display: inline-block;
      width: 48px;
      height: 48px;
      line-height: 48px;
      font-size: 24px;
      font-weight: 700;
      color: #dc2626;
      background: #fef2f2;
      border-radius: 50%;
      margin-bottom: 16px;
    }
    
    .atsb-error-message {
      color: #374151;
      font-size: 14px;
      line-height: 1.5;
      margin: 0 0 20px 0;
    }
    
    /* Animations */
    @keyframes atsb-fade-in {
      from {
        opacity: 0;
        transform: scale(0.8);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }
    
    @keyframes atsb-slide-in {
      from {
        opacity: 0;
        transform: translateX(100%);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }
    
    @keyframes atsb-slide-out {
      from {
        opacity: 1;
        transform: translateX(0);
      }
      to {
        opacity: 0;
        transform: translateX(100%);
      }
    }
    
    @keyframes atsb-spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    
    /* Credits Count */
    .atsb-credits-count {
      font-weight: 700;
      color: #667eea;
    }
  `;
}