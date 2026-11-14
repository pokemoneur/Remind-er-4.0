const { app, BrowserWindow, desktopCapturer, ipcMain, shell, screen, session } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { mouse, keyboard, getWindows, Button, Key, Point } = require("@nut-tree-fork/nut-js");
app.setPath("userData", path.join(app.getPath("appData"), "remind-er-4-desktop"));
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();
else app.on("second-instance", () => { if (windowRef) { if (windowRef.isMinimized()) windowRef.restore(); windowRef.show(); windowRef.focus(); windowRef.moveTop(); } });
let windowRef, sources = new Map(), selectedSource = null;
const stateFile = () => path.join(process.env.APPDATA || app.getPath("appData"), "remind-er-4-desktop", "reminder4-state.json");
ipcMain.handle("remi:load", () => { try { return JSON.parse(fs.readFileSync(stateFile(), "utf8")); } catch { return {}; } });
ipcMain.handle("remi:load-programs", () => { try { const data = JSON.parse(fs.readFileSync(stateFile(), "utf8")); return Array.isArray(data.programs) ? data.programs.filter(p => p && p.id && p.name) : []; } catch { return []; } });
ipcMain.handle("remi:save", (_event, data) => { fs.mkdirSync(app.getPath("userData"), { recursive: true }); fs.writeFileSync(stateFile(), JSON.stringify(data), "utf8"); return true; });
ipcMain.handle("remi:pick-screen", async () => { const list = await desktopCapturer.getSources({ types: ["window", "screen"], thumbnailSize: { width: 800, height: 500 }, fetchWindowIcons: true }); sources = new Map(list.map(source => [source.id, source])); return list.map(source => ({ id: source.id, name: source.name, thumbnail: source.thumbnail.toDataURL(), appIcon: source.appIcon?.toDataURL() || "" })); });
ipcMain.handle("remi:screen-choice", (_event, id) => { selectedSource = sources.get(id) || null; return Boolean(selectedSource); });
ipcMain.handle("remi:focus-selected", async () => { if (!selectedSource) return { ok: false, reason: "Choose a browser window first." }; try { const targetWindow = await findSelectedWindow(await getWindows()); if (!targetWindow) return { ok: false, reason: "The selected browser window is no longer available. Choose it again." }; await targetWindow.focus(); return { ok: true, target: selectedSource.name }; } catch (error) { return { ok: false, reason: "Could not bring the selected login page forward: " + String(error.message || error).slice(0, 160) }; } });
ipcMain.handle("remi:screen-clear", () => { selectedSource = null; return true; });
ipcMain.handle("remi:raise", () => { if (!windowRef) return false; if (windowRef.isMinimized()) windowRef.restore(); windowRef.show(); windowRef.focus(); windowRef.moveTop(); return true; });ipcMain.on("remi:resize", (_event, height) => { if (!windowRef) return; const display = screen.getDisplayMatching(windowRef.getBounds()), area = display.workArea, h = Math.min(area.height, Math.max(64, Math.round(height))), width = Math.min(area.width, h <= 72 ? 980 : 1080); windowRef.setBounds({ x: area.x + Math.round((area.width - width) / 2), y: area.y + area.height - h, width, height: h }); });
ipcMain.on("remi:open-url", (_event, value) => { try { const url = new URL(value); if (["http:", "https:"].includes(url.protocol)) shell.openExternal(url.href); } catch {} });
ipcMain.on("remi:quit", () => app.quit());
async function findSelectedWindow(windows) { const sourceHandle = /^window:(\d+)(?::|$)/.exec(String(selectedSource?.id || ""))?.[1]; for (const win of windows) { try { if (sourceHandle && Number(win.windowHandle) === Number(sourceHandle)) return win; if (String(await win.title).trim() === String(selectedSource?.name || "").trim()) return win; } catch {} } return null; }
ipcMain.handle("remi:actuate", async (_event, action) => { if (!selectedSource) return { ok: false, reason: "Choose an app window first." }; if (!action || !["click", "type", "key"].includes(action.type)) return { ok: false, reason: "Unsupported action." }; try { if (action.type === "click") { const display = screen.getDisplayMatching(windowRef.getBounds()), area = display.workArea; const windows = await getWindows(); const targetWindow = await findSelectedWindow(windows); if (!targetWindow) return { ok: false, reason: "Bring the selected app window to the front, then try again." }; await targetWindow.focus(); const bounds = await targetWindow.region; const x = Math.max(bounds.left, Math.min(bounds.left + bounds.width - 1, Math.round(Number(action.x) * bounds.width + bounds.left))), y = Math.max(bounds.top, Math.min(bounds.top + bounds.height - 1, Math.round(Number(action.y) * bounds.height + bounds.top))); windowRef.hide(); await new Promise(resolve => setTimeout(resolve, 250)); await mouse.setPosition(new Point(x, y)); await mouse.click(Button.LEFT); await new Promise(resolve => setTimeout(resolve, 350)); windowRef.show(); } else if (action.type === "type") { const value = String(action.value || ""); if (value.length > 500) return { ok: false, reason: "Text is too long." }; const windows = await getWindows(); const targetWindow = await findSelectedWindow(windows); if (!targetWindow) return { ok: false, reason: "Bring the selected app window to the front, then try again." }; await targetWindow.focus(); windowRef.hide(); await new Promise(resolve => setTimeout(resolve, 250)); await keyboard.type(value); windowRef.show(); } else { const keyMap = { enter: Key.Enter, tab: Key.Tab, escape: Key.Escape, backspace: Key.Backspace, space: Key.Space, up: Key.Up, down: Key.Down, left: Key.Left, right: Key.Right }; const key = keyMap[String(action.key || "").toLowerCase()]; if (!key) return { ok: false, reason: "That key is not approved for desktop control." }; const windows = await getWindows(); const targetWindow = await findSelectedWindow(windows); if (!targetWindow) return { ok: false, reason: "Bring the selected app window to the front, then try again." }; await targetWindow.focus(); windowRef.hide(); await new Promise(resolve => setTimeout(resolve, 250)); await keyboard.pressKey(key); await keyboard.releaseKey(key); windowRef.show(); } return { ok: true, target: selectedSource.name }; } catch (error) { windowRef?.show(); return { ok: false, reason: "Windows did not accept that action. " + String(error.message || error).slice(0, 180) }; } });
ipcMain.handle("remi:navigate", async (_event, action) => {
  if (!selectedSource) return { ok: false, reason: "Choose a browser window first." };
  if (!/\b(chrome|edge|firefox|brave|opera|vivaldi|chromium|browser)\b/i.test(selectedSource.name)) return { ok: false, reason: "Autonomous navigation is limited to a recognized browser window." };
  if (!action || !["click", "scroll", "search"].includes(action.type)) return { ok: false, reason: "Autonomous navigation supports safe clicks, scrolling, and approved searches." };
  const query = String(action.query || "").trim().replace(/\s+/g, " ");
  if (action.type === "search" && (query.length < 3 || query.length > 100 || /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(query) || /\b(password|passcode|api.?key|secret|token|ssn|credit.?card|bank.?account)\b/i.test(query) || /\b\d{9,}\b/.test(query))) return { ok: false, reason: "The proposed search query is empty, too long, or may contain sensitive data." };
  try {
    const windows = await getWindows(), targetWindow = await findSelectedWindow(windows);
    if (!targetWindow) return { ok: false, reason: "The selected browser window changed. Select it again before continuing." };
    await targetWindow.focus();
    const bounds = await targetWindow.region;
    if (action.type === "scroll") {
      await mouse.setPosition(new Point(Math.round(bounds.left + bounds.width / 2), Math.round(bounds.top + bounds.height / 2)));
      if (action.direction === "up") await mouse.scrollUp(4); else await mouse.scrollDown(4);
    } else {
      const px = Number(action.x), py = Number(action.y);
      if (!Number.isFinite(px) || !Number.isFinite(py) || px < 0.02 || px > 0.98 || py < 0.08 || py > 0.97) return { ok: false, reason: "The suggested target was outside the safe browser page area." };
      const x = Math.max(bounds.left, Math.min(bounds.left + bounds.width - 1, Math.round(bounds.left + px * bounds.width)));
      const y = Math.max(bounds.top, Math.min(bounds.top + bounds.height - 1, Math.round(bounds.top + py * bounds.height)));
      windowRef.hide(); await new Promise(resolve => setTimeout(resolve, 220)); await mouse.setPosition(new Point(x, y)); await mouse.click(Button.LEFT);
      if (action.type === "search") { await keyboard.type(query); await keyboard.pressKey(Key.Enter); }
      await new Promise(resolve => setTimeout(resolve, 350)); windowRef.show();
    }
    return { ok: true, target: selectedSource.name };
  } catch (error) { windowRef?.show(); return { ok: false, reason: "Browser navigation paused: " + String(error.message || error).slice(0, 160) }; }
});
function createWindow() {
  const area = screen.getPrimaryDisplay().workArea, width = Math.min(1080, area.width), height = Math.min(520, area.height);
  windowRef = new BrowserWindow({
    x: area.x + Math.round((area.width - width) / 2), y: area.y + area.height - height, width, height,
    minWidth: Math.min(700, width), minHeight: 64, frame: false, resizable: false, movable: false, alwaysOnTop: true, skipTaskbar: true,
    show: false, transparent: true, backgroundColor: "#00000000", focusable: true, hasShadow: true,
    webPreferences: { preload: path.join(__dirname, "desktop-preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  windowRef.loadFile(path.join(__dirname, "popup.html"));
  windowRef.once("ready-to-show", () => { windowRef.show(); windowRef.focus(); });
  windowRef.on("closed", () => { windowRef = null; });
}
if (hasSingleInstanceLock) app.whenReady().then(() => { session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => { if (selectedSource) callback({ video: selectedSource }); else callback({}); }, { useSystemPicker: false }); createWindow(); }); app.on("window-all-closed", () => app.quit());
