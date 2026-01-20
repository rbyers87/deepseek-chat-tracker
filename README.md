# DeepSeek Chat Tracker Extension

A browser extension that tracks your DeepSeek chat token usage, including file uploads, and warns you before hitting the 128K context limit.

![Extension Screenshot](https://img.shields.io/badge/status-active-success) ![Chrome](https://img.shields.io/badge/Chrome-V3-blue) ![Firefox](https://img.shields.io/badge/Firefox-V2-orange)

## 📋 Features

### 🔄 Token-Based Tracking
- **Not just message counting** - Accurately estimates token usage (DeepSeek's actual limit)
- **128K context window** tracking with real-time updates
- **Visual progress bar** with color-coded warnings:
  - 🟢 Green (<70% usage)
  - 🟠 Orange (70-89% usage)
  - 🔴 Red (≥90% usage)

### 📁 File Upload Detection
- **Automatic detection** of uploaded files in chat
- **Smart token estimation** based on file type:
  - Text/Code files: ~256-333 tokens per KB
  - PDF/Documents: ~200 tokens per KB
  - Images: ~100 tokens per KB (OCR text)
- **Manual file entry** for precise tracking
- **File history** per chat session

### ⚡ Real-Time Monitoring
- **Live badge counter** on extension icon
- **Auto-refreshing** popup display
- **Smart notifications** at 80% and 90% thresholds
- **Chat session detection** (new chats reset tracking)

### 🛠️ Controls & Settings
- **Manual chat reset** button
- **End chat session** option
- **Add file manually** for accurate tracking
- **Persistent storage** across browser sessions

## 📁 Folder Structure
deepseek-chat-tracker/
 ├── manifest.json # Extension configuration (Chrome V3)\
 ├── background.js # Background script with token tracking\
 ├── content.js # Content script for DeepSeek detection\
 ├── popup.html # Popup interface HTML\
 ├── popup.js # Popup functionality\
 └── icons/ # Extension icons\
 ├── icon16.png # 16x16 toolbar icon\
 ├── icon48.png # 48x48 extension icon\
 └── icon128.png # 128x128 store icon\

text

## 🚀 Installation

### For Chrome (Manifest V3)

1. **Download or clone the repository:**
   ```bash
   git clone https://github.com/yourusername/deepseek-chat-tracker.git
Open Chrome and navigate to:

text
chrome://extensions/
Enable Developer Mode:

Toggle the switch in the top-right corner

Load the extension:

Click "Load unpacked" button

Select the deepseek-chat-tracker folder

The extension will appear in your toolbar

Pin the extension:

Click the puzzle piece icon in toolbar

Find "DeepSeek Chat Tracker"

Click the pin icon 📌

For Firefox (Manifest V2)
Modify the manifest.json:

Change "manifest_version": 3 to "manifest_version": 2

Change "action" to "browser_action"

Add Firefox-specific settings (see note below)

Load in Firefox:

Navigate to about:debugging#/runtime/this-firefox

Click "Load Temporary Add-on"

Select the manifest.json file

Note: For permanent Firefox installation, package as .xpi file

🎯 How It Works
Token Estimation
The extension estimates token usage using:

Text messages: ~1 token per 4 characters

Code blocks: Additional 30% overhead

File uploads: Type-based estimation (see below)

URLs: Extra token allocation

File Upload Tracking
text
┌─────────────────────────────────────────┐
│ File Detection Methods                  │
├─────────────────────────────────────────┤
│ 1. File input detection                │
│ 2. Upload UI monitoring                │
│ 3. Periodic DOM scanning               │
│ 4. Manual user entry                   │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Token Estimation Matrix                 │
├──────────────┬──────────┬───────────────┤
│ File Type    │ Tokens/KB│ Example      │
├──────────────┼──────────┼───────────────┤
│ Text/Code    │ 256-333  │ .txt, .js    │
│ Documents    │ 200      │ .pdf, .docx  │
│ Images       │ 100      │ .jpg, .png   │
│ Spreadsheets │ 200-256  │ .csv, .xlsx  │
└──────────────┴──────────┴───────────────┘
Chat Session Management
Automatic detection of new chats via URL changes

Session isolation - each chat tracks independently

Daily history - track all chats from the day

Manual override - end/reset chats as needed

🖥️ Usage
1. Basic Tracking
Navigate to chat.deepseek.com

Start a conversation

Click the extension icon to see token usage

Watch the badge counter update as you chat

2. File Upload Tracking
Automatic Detection:
Upload files normally through DeepSeek interface

Extension automatically detects and estimates tokens

Files appear in the popup under "Uploaded Files"

Manual Entry (More Accurate):
Click the extension icon

Click "Add File" button

Enter filename (with extension)

Enter file size and unit (KB/MB)

Extension calculates token estimate

3. Managing Chats
Reset Chat: Clears token count for current chat

End Chat: Closes current session tracking

New Chat: Automatically detected when starting fresh

⚙️ Configuration
Default Settings
javascript
{
  tokenLimit: 128000,         // DeepSeek's 128K context
  warningThreshold: 102400,   // Warn at 80% (102.4K)
  criticalThreshold: 115200,  // Critical at 90% (115.2K)
  showNotifications: true,    // Desktop notifications
  trackFileUploads: true      // File tracking enabled
}
Customizing Limits
Open the extension popup

Modify the limit in the input field

Click "Set" to save

🐛 Troubleshooting
Common Issues
Issue	Solution
Extension not loading	Ensure manifest.json is valid JSON
Icons not showing	Check icons folder exists with PNG files
Token count not updating	Refresh the DeepSeek page
File uploads not detected	Use manual file entry for accuracy
Popup not opening	Right-click icon → "Inspect" for errors
Debug Mode
Open browser console (F12) and check:

Content script logs in DeepSeek tab

Background script logs in extension service worker

Popup console via right-click → "Inspect"

🔧 Development
Building from Source
Clone repository:

bash
git clone https://github.com/yourusername/deepseek-chat-tracker.git
cd deepseek-chat-tracker
Make changes:

Edit source files as needed

Test in browser developer mode

Package for distribution:

bash
# Chrome
chrome://extensions/ → "Pack extension"

# Firefox
zip -r deepseek-tracker.zip ./*
# Rename to .xpi for Firefox
File Descriptions
manifest.json: Extension configuration and permissions

background.js: Token tracking, storage, notifications

content.js: DeepSeek DOM monitoring, file detection

popup.html/popup.js: User interface and controls

📊 Token Estimation Accuracy
Factors Affecting Accuracy
Language: English text averages 4 chars/token

Code content: Additional punctuation increases tokens

File types: OCR quality varies by image/text clarity

Compression: ZIP/RAR files may contain more text

Improving Accuracy
Use manual file entry for important uploads

Reset tracking if estimates seem off

Consider a 20% buffer for safety

🤝 Contributing
Fork the repository

Create a feature branch

Make your changes

Test thoroughly

Submit a pull request

Development Guidelines
Follow existing code style

Add comments for complex logic

Test on both Chrome and Firefox

Update README for new features

📄 License
MIT License - see LICENSE file for details

🙏 Acknowledgments
Inspired by DeepSeek's 128K context limit

Token estimation based on OpenAI's guidelines

Icons from Feather Icons

📞 Support
Issues & Questions:

GitHub Issues

Email: your.email@example.com

Feature Requests:
Please create an issue with the "enhancement" label

🚨 Important Notes
Privacy
All data stored locally in browser storage

No data sent to external servers

File content never accessed, only metadata

Limitations
Token estimates are approximations

Image OCR token counts vary widely

Requires page refresh for new chat detection

Best Practices
Use manual file entry for large/important files

Reset tracking if switching between multiple chats

Keep a 10-20K token buffer for safety

Export data regularly if tracking long-term usage

Happy Chatting! 🚀

Remember: The 128K limit is per chat session. When you start a new chat, you get a fresh 128K tokens!

text

## 📋 Quick Start Guide (Condensed)

```markdown
## Quick Start

1. **Install Extension**
   - Chrome: `chrome://extensions/` → Load unpacked
   - Firefox: `about:debugging` → Load Temporary Add-on

2. **Start Tracking**
   - Go to `chat.deepseek.com`
   - Chat normally
   - Click extension icon to monitor usage

3. **Track Files**
   - Upload files as usual (auto-detected)
   - OR click "Add File" for manual entry

4. **Manage Limits**
   - Reset: Start fresh chat tracking
   - End: Close current session
   - Settings: Adjust token limit in popup
🎨 Badge Icons for README
You can add these badges to the top of your README:

markdown
![Chrome Web Store](https://img.shields.io/chrome-web-store/v/yourextensionid?label=Chrome)
![Firefox Add-on](https://img.shields.io/amo/v/yourextensionid?label=Firefox)
![License](https://img.shields.io/github/license/yourusername/deepseek-chat-tracker)
![Last Commit](https://img.shields.io/github/last-commit/yourusername/deepseek-chat-tracker)
📦 Distribution Checklist
Before sharing your extension:

Update version in manifest.json

Test on Chrome and Firefox

Create screenshots for store listing

Write detailed description

Set appropriate permissions

Add privacy policy if needed

Copy this entire README.md file and paste it into your project root folder. The formatting will render properly on GitHub and other markdown viewers.
