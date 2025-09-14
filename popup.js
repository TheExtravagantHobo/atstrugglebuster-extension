// atstrugglebuster-extension/popup.js

const API_BASE_URL = 'https://atstrugglebuster.com';

// DOM Elements
const loginSection = document.getElementById('loginSection');
const dashboardSection = document.getElementById('dashboardSection');
const apiKeyInput = document.getElementById('apiKeyInput');
const connectBtn = document.getElementById('connectBtn');
const signupBtn = document.getElementById('signupBtn');
const magicLinkBtn = document.getElementById('magicLinkBtn');
const connectionStatus = document.getElementById('connectionStatus');
const toggleAdvanced = document.getElementById('toggleAdvanced');
const advancedContent = document.getElementById('advancedContent');
const errorMessage = document.getElementById('errorMessage');
const userEmail = document.getElementById('userEmail');
const creditsCount = document.getElementById('creditsCount');
const evaluationsCount = document.getElementById('evaluationsCount');
const logoutBtn = document.getElementById('logoutBtn');
const buyCreditsBtn = document.getElementById('buyCreditsBtn');
const viewHistoryBtn = document.getElementById('viewHistoryBtn');
const updateResumeBtn = document.getElementById('updateResumeBtn');
const helpBtn = document.getElementById('helpBtn');

// Initialize popup
document.addEventListener('DOMContentLoaded', init);

async function init() {
  // Check authentication status
  const { apiKey } = await chrome.storage.sync.get('apiKey');
  
  if (apiKey) {
    showDashboard();
    loadUserData();
  } else {
    showLogin();
  }
  
  // Set up event listeners
  magicLinkBtn.addEventListener('click', handleMagicLink);
  connectBtn.addEventListener('click', handleManualConnect);
  signupBtn.addEventListener('click', () => openWebsite('/signin'));
  toggleAdvanced.addEventListener('click', toggleAdvancedSection);
  logoutBtn.addEventListener('click', handleLogout);
  buyCreditsBtn.addEventListener('click', () => openWebsite('/credits'));
  viewHistoryBtn.addEventListener('click', () => openWebsite('/history'));
  updateResumeBtn.addEventListener('click', () => openWebsite('/'));
  helpBtn.addEventListener('click', () => openWebsite('/help'));
  
  // Allow Enter key submission for API key
  apiKeyInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleManualConnect();
    }
  });
}

// Show login section
function showLogin() {
  loginSection.style.display = 'block';
  dashboardSection.style.display = 'none';
}

// Show dashboard section
function showDashboard() {
  loginSection.style.display = 'none';
  dashboardSection.style.display = 'block';
}

// Toggle advanced section visibility
function toggleAdvancedSection() {
  const isHidden = advancedContent.style.display === 'none';
  advancedContent.style.display = isHidden ? 'block' : 'none';
  toggleAdvanced.classList.toggle('expanded');
}

// Handle Magic Link authentication
async function handleMagicLink() {
  // Update UI state
  magicLinkBtn.style.display = 'none';
  connectionStatus.style.display = 'block';
  hideError();
  
  try {
    // Initiate authentication
    const response = await chrome.runtime.sendMessage({
      action: 'authenticateExtension'
    });
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    // Success - update UI
    showDashboard();
    userEmail.textContent = response.email || 'Connected';
    creditsCount.textContent = response.credits || 0;
    
    showSuccess('Successfully connected!');
    
  } catch (error) {
    showError(error.message || 'Failed to connect. Please try again.');
    // Reset UI
    magicLinkBtn.style.display = 'block';
    connectionStatus.style.display = 'none';
  }
}

// Handle manual API key connection
async function handleManualConnect() {
  const apiKey = apiKeyInput.value.trim();
  
  if (!apiKey) {
    showError('Please enter your API key');
    return;
  }
  
  // Update button state
  connectBtn.disabled = true;
  connectBtn.textContent = 'Connecting...';
  hideError();
  
  try {
    // Validate API key
    const response = await chrome.runtime.sendMessage({
      action: 'validateApiKey',
      apiKey: apiKey
    });
    
    if (response.error) {
      throw new Error(response.error);
    }
    
    // Success - update UI
    showDashboard();
    userEmail.textContent = response.email || 'Connected';
    creditsCount.textContent = response.credits || 0;
    
    apiKeyInput.value = '';
    showSuccess('Successfully connected!');
    
  } catch (error) {
    showError(error.message || 'Failed to connect. Please check your API key.');
  } finally {
    connectBtn.disabled = false;
    connectBtn.textContent = 'Connect with API Key';
  }
}

// Load user data
async function loadUserData() {
  try {
    // Get stored email
    const { userEmail: email } = await chrome.storage.sync.get('userEmail');
    if (email) {
      userEmail.textContent = email;
    }
    
    // Get credits
    const response = await chrome.runtime.sendMessage({ action: 'getCredits' });
    
    if (response.credits !== undefined) {
      creditsCount.textContent = response.credits;
    }
    
    // Get today's evaluation count
    const today = new Date().toDateString();
    const { evaluationStats = {} } = await chrome.storage.local.get('evaluationStats');
    
    if (evaluationStats.date === today) {
      evaluationsCount.textContent = evaluationStats.count || 0;
    } else {
      evaluationsCount.textContent = 0;
      // Reset for new day
      chrome.storage.local.set({
        evaluationStats: { date: today, count: 0 }
      });
    }
    
  } catch (error) {
    console.error('Error loading user data:', error);
  }
}

// Handle logout
async function handleLogout() {
  if (!confirm('Are you sure you want to disconnect your account?')) {
    return;
  }
  
  try {
    await chrome.runtime.sendMessage({ action: 'logout' });
    showLogin();
    // Reset UI
    magicLinkBtn.style.display = 'block';
    connectionStatus.style.display = 'none';
    advancedContent.style.display = 'none';
    toggleAdvanced.classList.remove('expanded');
    showSuccess('Successfully logged out');
  } catch (error) {
    showError('Failed to logout. Please try again.');
  }
}

// Show error message
function showError(message) {
  errorMessage.textContent = message;
  errorMessage.style.display = 'block';
  errorMessage.style.background = '#fef2f2';
  errorMessage.style.color = '#dc2626';
  
  // Auto-hide after 5 seconds
  setTimeout(hideError, 5000);
}

// Hide error message
function hideError() {
  errorMessage.style.display = 'none';
  errorMessage.textContent = '';
}

// Show success message
function showSuccess(message) {
  errorMessage.textContent = message;
  errorMessage.style.display = 'block';
  errorMessage.style.background = '#d1fae5';
  errorMessage.style.color = '#059669';
  
  setTimeout(() => {
    hideError();
  }, 3000);
}

// Open website in new tab
function openWebsite(path = '') {
  chrome.tabs.create({
    url: `${API_BASE_URL}${path}`
  });
  window.close();
}

// Listen for credit updates
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'creditsUpdated') {
    creditsCount.textContent = request.credits;
  }
  
  // Handle authentication completion
  if (request.action === 'authenticationComplete') {
    showDashboard();
    userEmail.textContent = request.email || 'Connected';
    creditsCount.textContent = request.credits || 0;
    connectionStatus.style.display = 'none';
    magicLinkBtn.style.display = 'block';
  }
});