// atstrugglebuster-extension/background.js

// Configuration
const API_BASE_URL = 'https://atstrugglebuster.com';
const STORAGE_KEYS = {
  API_KEY: 'apiKey',
  USER_EMAIL: 'userEmail',
  CREDITS: 'credits',
  LAST_EVALUATION: 'lastEvaluation',
  AUTH_TOKEN: 'authToken'
};

// Initialize context menu on installation
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'evaluate-selection',
    title: 'Evaluate Job Match (ATStruggle Buster)',
    contexts: ['selection']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'evaluate-selection' && info.selectionText) {
    chrome.tabs.sendMessage(tab.id, {
      action: 'evaluate',
      text: info.selectionText
    });
  }
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'evaluateJob') {
    evaluateJob(request.jobText)
      .then(sendResponse)
      .catch(error => sendResponse({ error: error.message }));
    return true; // Keep channel open for async response
  }
  
  if (request.action === 'getCredits') {
    getCredits()
      .then(sendResponse)
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
  
  if (request.action === 'validateApiKey') {
    validateApiKey(request.apiKey)
      .then(sendResponse)
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
  
  if (request.action === 'authenticateExtension') {
    authenticateWithWebapp()
      .then(sendResponse)
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
  
  if (request.action === 'logout') {
    logout()
      .then(sendResponse)
      .catch(error => sendResponse({ error: error.message }));
    return true;
  }
});

// Magic Link authentication flow
async function authenticateWithWebapp() {
  try {
    // Generate unique token for this auth session
    const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
    
    // Store token temporarily
    await chrome.storage.local.set({ [STORAGE_KEYS.AUTH_TOKEN]: token });
    
    // Open webapp auth page
    const authUrl = `${API_BASE_URL}/auth/extension?token=${token}`;
    const tab = await chrome.tabs.create({ url: authUrl });
    
    // Poll for completion (2 minute timeout)
    for (let i = 0; i < 60; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      try {
        // Check auth status
        const response = await fetch(`${API_BASE_URL}/api/auth/extension?token=${token}`);
        
        if (response.ok) {
          const data = await response.json();
          
          // Store credentials
          await chrome.storage.sync.set({
            [STORAGE_KEYS.API_KEY]: data.apiKey,
            [STORAGE_KEYS.USER_EMAIL]: data.email || 'User'
          });
          
          // Clean up
          await chrome.storage.local.remove(STORAGE_KEYS.AUTH_TOKEN);
          
          // Close auth tab
          try {
            await chrome.tabs.remove(tab.id);
          } catch (e) {
            // Tab may already be closed
          }
          
          // Get initial credits
          const credits = await getCredits();
          
          // Pre-cache the resume to avoid first-run issues
          setTimeout(() => preCacheResume(), 1000);
          
          return { 
            success: true,
            email: data.email,
            credits: credits.credits
          };
        }
      } catch (e) {
        // Continue polling
      }
    }
    
    throw new Error('Authentication timeout. Please try again.');
    
  } catch (error) {
    console.error('Authentication error:', error);
    throw error;
  }
}

// Evaluate job description - ENHANCED VERSION WITH CACHING AND RETRIES
async function evaluateJob(jobText) {
  try {
    const { apiKey } = await chrome.storage.sync.get(STORAGE_KEYS.API_KEY);
    
    if (!apiKey) {
      throw new Error('Please connect your account in the extension popup');
    }
    
    // Check if we have cached resume first
    const cachedData = await chrome.storage.local.get(['cachedResume', 'resumeCacheTime']);
    const cacheAge = Date.now() - (cachedData.resumeCacheTime || 0);
    const cacheValid = cacheAge < 3600000; // 1 hour cache
    
    let resume_text;
    
    if (cachedData.cachedResume && cacheValid) {
      // Use cached resume
      resume_text = cachedData.cachedResume;
      console.log('Using cached resume');
    } else {
      // Fetch user's resume with retry logic
      let retries = 3;
      let resumeResponse;
      
      while (retries > 0) {
        resumeResponse = await fetch(`${API_BASE_URL}/api/me/resume`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
          }
        });
        
        if (resumeResponse.ok) {
          break;
        }
        
        if (resumeResponse.status === 401) {
          // Clear invalid key and retry won't help
          await chrome.storage.sync.remove(STORAGE_KEYS.API_KEY);
          throw new Error('Session expired. Please reconnect your account.');
        }
        
        retries--;
        if (retries > 0) {
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 1000 * (3 - retries)));
        }
      }
      
      if (!resumeResponse || !resumeResponse.ok) {
        throw new Error('Unable to fetch your resume. Please ensure it is uploaded on the website.');
      }
      
      const resumeData = await resumeResponse.json();
      resume_text = resumeData.resume_text;
      
      // Cache the resume
      await chrome.storage.local.set({
        cachedResume: resume_text,
        resumeCacheTime: Date.now()
      });
      console.log('Resume fetched and cached');
    }
    
    // Evaluate match with retry logic
    let evalRetries = 2;
    let response;
    
    while (evalRetries > 0) {
      response = await fetch(`${API_BASE_URL}/api/evaluate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          job_text: jobText,
          candidate_text: resume_text
        })
      });
      
      if (response.ok) {
        break;
      }
      
      // Handle specific error codes
      if (response.status === 401) {
        // Try to clear cache and retry once
        if (evalRetries === 2) {
          await chrome.storage.local.remove(['cachedResume', 'resumeCacheTime']);
          await chrome.storage.sync.remove(STORAGE_KEYS.API_KEY);
          throw new Error('Invalid API key. Please reconnect your account.');
        }
      }
      
      if (response.status === 402) {
        throw new Error('No credits remaining. Please purchase more credits.');
      }
      
      evalRetries--;
      if (evalRetries > 0) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    if (!response || !response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || 'Evaluation failed. Please try again.');
    }
    
    const result = await response.json();
    
    // Cache evaluation
    await chrome.storage.local.set({
      [STORAGE_KEYS.LAST_EVALUATION]: {
        result,
        timestamp: Date.now(),
        jobText: jobText.substring(0, 200)
      }
    });
    
    // Update credits
    await updateCredits();
    
    // Track daily evaluations
    const today = new Date().toDateString();
    const { evaluationStats = {} } = await chrome.storage.local.get('evaluationStats');
    
    if (evaluationStats.date === today) {
      evaluationStats.count = (evaluationStats.count || 0) + 1;
    } else {
      evaluationStats.date = today;
      evaluationStats.count = 1;
    }
    
    await chrome.storage.local.set({ evaluationStats });
    
    return result;
  } catch (error) {
    console.error('Evaluation error:', error);
    throw error;
  }
}

// Pre-cache resume when user connects
async function preCacheResume() {
  try {
    const { apiKey } = await chrome.storage.sync.get(STORAGE_KEYS.API_KEY);
    if (!apiKey) return;
    
    const response = await fetch(`${API_BASE_URL}/api/me/resume`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const { resume_text } = await response.json();
      await chrome.storage.local.set({
        cachedResume: resume_text,
        resumeCacheTime: Date.now()
      });
      console.log('Resume pre-cached successfully');
    }
  } catch (error) {
    console.error('Pre-cache error:', error);
  }
}

// Get credit balance
async function getCredits() {
  try {
    const { apiKey } = await chrome.storage.sync.get(STORAGE_KEYS.API_KEY);
    
    if (!apiKey) {
      return { credits: 0, authenticated: false };
    }
    
    const response = await fetch(`${API_BASE_URL}/api/me/credits`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        await chrome.storage.sync.remove(STORAGE_KEYS.API_KEY);
        return { credits: 0, authenticated: false };
      }
      throw new Error('Failed to fetch credits');
    }
    
    const data = await response.json();
    
    // Cache credits
    await chrome.storage.local.set({
      [STORAGE_KEYS.CREDITS]: data.credits
    });
    
    return { credits: data.credits, authenticated: true };
  } catch (error) {
    console.error('Get credits error:', error);
    // Return cached value
    const cached = await chrome.storage.local.get(STORAGE_KEYS.CREDITS);
    return { credits: cached.credits || 0, authenticated: false };
  }
}

// Update and broadcast credits
async function updateCredits() {
  try {
    const result = await getCredits();
    
    // Notify tabs about credit update
    chrome.runtime.sendMessage({
      action: 'creditsUpdated',
      credits: result.credits
    }).catch(() => {
      // Ignore if no listeners
    });
    
    return result;
  } catch (error) {
    console.error('Update credits error:', error);
  }
}

// Validate API key (manual entry fallback) - ENHANCED
async function validateApiKey(apiKey) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/me/credits`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Invalid API key');
      }
      throw new Error('Failed to validate API key');
    }
    
    const data = await response.json();
    
    // Store credentials
    await chrome.storage.sync.set({
      [STORAGE_KEYS.API_KEY]: apiKey,
      [STORAGE_KEYS.USER_EMAIL]: data.email || 'User'
    });
    
    await chrome.storage.local.set({
      [STORAGE_KEYS.CREDITS]: data.credits
    });
    
    // Pre-cache the resume after successful validation
    setTimeout(() => preCacheResume(), 1000);
    
    return { 
      success: true, 
      credits: data.credits,
      email: data.email 
    };
  } catch (error) {
    console.error('Validate API key error:', error);
    throw error;
  }
}

// Logout - clear stored data
async function logout() {
  try {
    await chrome.storage.sync.clear();
    await chrome.storage.local.clear();
    return { success: true };
  } catch (error) {
    console.error('Logout error:', error);
    throw error;
  }
}

// Open website helper
function openWebsite(path = '') {
  chrome.tabs.create({
    url: `${API_BASE_URL}${path}`
  });
}