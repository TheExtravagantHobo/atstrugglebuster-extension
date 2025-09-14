# ATStruggle Buster - Chrome Extension

A Chrome extension that instantly shows you how well your resume matches any job description using AI-powered ATS (Applicant Tracking System) scoring.

## Features

- 🎯 **Instant Match Score**: Select any job description text and get an immediate compatibility score (0-100%)
- 📊 **Detailed Analysis**: See your strengths and gaps for each position
- 🚀 **Works Everywhere**: Compatible with LinkedIn, Indeed, company career pages, and any job board
- 🔒 **Secure**: Your resume data stays private and secure

## Installation

### From Chrome Web Store (Recommended)
Coming soon - currently under review

### Manual Installation (For Development)
1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked"
5. Select the extension directory

## How to Use

1. **Connect Your Account**
   - Click the extension icon in Chrome
   - Click "Connect Account" to link with your ATStruggle Buster account
   - Or sign up at [atstrugglebuster.com](https://atstrugglebuster.com)

2. **Upload Your Resume without PII**
   - Go to [atstrugglebuster.com](https://atstrugglebuster.com)
   - Upload your current resume

3. **Evaluate Job Matches**
   - Go to any job listing
   - Select the job description text (minimum 100 characters)
   - Click the purple "AT" button that appears or right click
   - View your instant match score and recommendations

## Configuration

The extension connects to the ATStruggle Buster API. To use with your own deployment:

1. Update `API_BASE_URL` in:
   - `background.js`
   - `popup.js`
   - `content.js` (if needed)

2. Ensure your server implements these endpoints:
   - `/api/auth/extension` - Authentication
   - `/api/evaluate` - Resume evaluation
   - `/api/me/resume` - Fetch user resume
   - `/api/me/credits` - Credit balance

## Project Structure

```
├── manifest.json          # Extension configuration
├── background.js          # Service worker for API calls
├── content.js            # Content script for page interaction
├── popup.html            # Extension popup interface
├── popup.js              # Popup functionality
├── popup.css             # Popup styles
└── icons/                # Extension icons
    ├── icon-16.png
    ├── icon-32.png
    ├── icon-48.png
    └── icon-128.png
```

## Privacy & Permissions

This extension requires the following permissions:
- **activeTab**: To read selected job description text
- **storage**: To save your authentication locally
- **contextMenus**: To add right-click evaluation option
- **host_permissions**: To communicate with atstrugglebuster.com API

The extension only reads text you explicitly select and only sends data when you trigger an evaluation.

## Development

### Prerequisites
- Chrome browser
- ATStruggle Buster account for testing

### Making Changes
1. Edit the files as needed
2. Go to `chrome://extensions/`
3. Click the refresh icon on the extension card
4. Test your changes

### Building for Production
1. Set `DEBUG = false` in `content.js`
2. Ensure `API_BASE_URL` points to production
3. Create a `.zip` file of all extension files
4. Submit to Chrome Web Store

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

- For extension issues: [Create an issue](https://github.com/theextravaganthobo/atstrugglebuster-extension/issues)
- For account/service issues: Visit [atstrugglebuster.com/help](https://atstrugglebuster.com/help)

## License

MIT License - feel free to use this code for your own projects

## Author

Created by Alex Sonne

---

**Note**: This extension requires an account at [atstrugglebuster.com](https://atstrugglebuster.com) to function. The extension itself is free, but evaluations require credits purchased through the website. Four 4 are free to start.