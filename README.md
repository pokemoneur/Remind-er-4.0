# Remind-er 4.0 Desktop

A standalone Windows desktop companion based on Remind-er 3.7.7. It runs independently of websites and keeps an always-on-top bar centered above the taskbar. **Design 1** is the default: a compact, translucent glass dock with the original Remind-er tools and a panel that slides upward when a tool is selected.

## Run in development

1. Install Node.js 22 or later.
2. Double-click the **Remind-er 4.0** desktop shortcut for normal use; it launches Electron directly without opening a Command Prompt window.
3. To run from a terminal, open PowerShell in this folder and run `npm start` (do not type the angle-bracket npm help examples).
4. In Settings, enter your own OpenAI or NVIDIA API key to enable AI actions.

Settings, saved programs, demos, and learning checkpoints are stored under the app's private user-data folder. Use `npm run dist` to build Windows installer and portable versions.

## Websites and desktop programs

Click the **+** dock button, then choose **app / screen** to select a website browser window, desktop application, or display. In **New Programs/Websites**, the Self-Learning and Live Recording sections also have their own target-picker buttons. Choose a browser window with the website tab you want active, or choose a desktop program/window to record.

Self-Learning has two separate permissions: sharing the selected screen with the AI provider, and allowing Remi to navigate a selected browser window for that session. The second permission is required for autonomous browser exploration. The embedded-page option only works when the bar is embedded in a compatible same-origin page; in the standalone app, choose a browser window. Remi will pause at login for you to sign in. Autonomous mode is limited to scrolling and clearly identified page-navigation links; Remi does not type or submit forms and pauses when uncertain. Desktop programs are observe-only in Self-Learning. Live Recording can capture a selected browser window, program, application, or display; it records no audio. Periodic screen samples are sent during recording, and reviewed frames/notes are sent only if you choose Analyze afterward. Website URLs open in the user's browser.

Live Tutorial and ordinary desktop guidance show each click, typed text, or navigation key in an approval dialog. **Approve once** runs only that action; **Cancel** discards it. An audit list shows approved actions. The only exception is explicitly consented Self-Learning in a selected browser: that session may scroll or follow a clearly safe page-navigation link without stopping for each click. It never types or submits forms and pauses when unsure. Stop or pause the session at any time.

Suggestions are short and adapt to the selected site or app. They include training tasks for Vincent, contact and case tasks for CRMs, and common file, task, and dashboard tasks for workplace tools. In **Settings → Remi’s knowledge**, expand **What Remi knows** or **What Remi doesn’t know yet**. The latter contains an expandable question form. Replies use the current interface language; you can ask without a saved guide, and Remi will mark what it cannot confirm.

Previously created demos are saved locally and recalled when the same task is chosen again. To share demos and learned step-by-step workflows across Remi users, configure the Supabase shared demo library in **Settings** and run the included SQL setup. Screenshots and API keys are not shared. Learn more adds material to the selected saved program; select the program once and Remi keeps its name and version filled in.

## Support and limitations

Remind-er 4.0 can visually assist with websites, workplace web apps such as CRMs, and desktop programs by selecting their window or display. It works from screenshots and visible context; it is not a direct integration with every product. It cannot read hidden CRM records, private app state, or website DOM from an external browser window. Keep the target window visible and select it again if its title changes or the picker gets stale.

Manual actions are limited to supported clicks, typing (up to 500 characters), and a small set of navigation keys, and require approval one at a time. Autonomous Self-Learning has a separate session consent and is limited to scrolling and safe-looking browser navigation links. Window matching, screen scaling, elevated apps, secure desktops, protected video, and apps that block capture or simulated input can prevent guidance or actions. Remi may miss controls or misunderstand screenshots, and a learning session cannot guarantee that every page or workflow was covered. Email addresses and long numbers in extracted text are masked, but arbitrary names and private text inside screenshot images are not automatically blurred; check the selected screen before sharing it. Sensitive actions may trigger a second confirmation when Remi recognizes them, but recognition is not guaranteed; handle sign-in and high-risk account changes yourself.

AI features require your own provider API key, an internet connection, and provider support for requests from the desktop app; usage may incur charges. Screen samples, questions, selected guide data, or files are sent to the configured AI provider only when the feature and consent flow requests them. Direct DOM reading only works within a compatible same-origin embedded page, not arbitrary external websites.

