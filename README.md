# deepseek-chat-tracker
To track your chat length and help begin a new one without losing your progress

deepseek-chat-tracker/
# ├── manifest.json
# ├── background.js
# ├── popup/
# │   ├── popup.html
# │   ├── popup.js
# │   └── popup.css
# ├── content.js
# ├── options/
# │   ├── options.html
# │   ├── options.js
# │   └── options.css
# └── icons/
#     ├── icon16.png
#     ├── icon48.png
#     └── icon128.png

##  Installation Instructions
For Chrome:
Go to chrome://extensions/

Enable "Developer mode" (top right)

Click "Load unpacked"

Select the deepseek-chat-tracker folder

For Firefox:
Go to about:debugging#/runtime/this-firefox

Click "Load Temporary Add-on"

Select the manifest.json file

For Safari:
Enable Safari Developer menu (Preferences → Advanced)

Show Extension Builder (Develop → Show Extension Builder)

Click "+" → Add Extension

Select the folder

10. Features Included:
Real-time tracking of chat messages

Visual progress bar showing usage percentage

Notifications when approaching limits (80% threshold)

Daily auto-reset at midnight

Manual counter reset option

Export data as JSON

Cross-browser compatible (Chrome, Firefox, Safari)

Customizable limit (default 30, but you can adjust)

11. To Improve Detection Accuracy:
Since DeepSeek's DOM structure might change, you may need to update the selectors in content.js. The extension includes multiple detection methods:

DOM mutation observer

Send button click detection

Enter key detection in text areas

You can test and adjust selectors by:

Open DeepSeek chat

Right-click → Inspect

Look for message container elements

Update selectors in content.js

This extension will help you track your usage and prevent unexpected interruptions by giving you warnings before hitting limits!
