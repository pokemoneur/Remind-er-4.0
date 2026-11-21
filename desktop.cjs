const { app, BrowserWindow, desktopCapturer, ipcMain, shell, screen, session, net } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { mouse, keyboard, getWindows, Button, Key, Point } = require("@nut-tree-fork/nut-js");
app.setPath("userData", path.join(app.getPath("appData"), "remind-er-4-desktop-repair-v2"));
app.setAppUserModelId("com.reminder4.desktop.repair.v2");
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();
else app.on("second-instance", () => { if (windowRef) { if (windowRef.isMinimized()) windowRef.restore(); windowRef.show(); windowRef.focus(); windowRef.moveTop(); } });
let windowRef, sources = new Map(), selectedSource = null;
const stateFile = () => path.join(app.getPath("userData"), "reminder4-state.json");
const profileLibraryFile = () => path.join(app.getPath("userData"), "reminder4-profiles.json");
function currentSnapshotsOnly(candidates){let newestStable=0;for(const file of candidates)if(!/\.\d+\.tmp$/.test(file))try{newestStable=Math.max(newestStable,fs.statSync(file).mtimeMs)}catch{}return[...new Set(candidates.filter(file=>{if(!/\.\d+\.tmp$/.test(file))return true;try{return fs.statSync(file).mtimeMs>newestStable}catch{return false}}))]}
function selectCurrentSnapshots(rows,stableLimit=2){const stable=rows.filter(row=>!/\.\d+\.tmp$/.test(row.file)).sort((a,b)=>b.modified-a.modified||a.order-b.order),newestStable=stable[0]?.modified||0,pending=rows.filter(row=>/\.\d+\.tmp$/.test(row.file)&&row.modified>newestStable).sort((a,b)=>b.modified-a.modified||a.order-b.order).slice(0,2);return[...stable.slice(0,stableLimit),...pending].sort((a,b)=>b.modified-a.modified||a.order-b.order)}
const profileLibraryCandidates = () => {
  const appData = process.env.APPDATA || app.getPath("appData"), name = path.basename(profileLibraryFile());
  const directories = [...new Set([path.dirname(profileLibraryFile()), path.join(appData, "Remind-er 4.0"), path.join(appData, "Remind-er"), path.join(appData, "remind-er-4-desktop"), path.join(appData, "remind-er-4-desktop-repair")])];
  const candidates = [];
  for (const directory of directories) {
    const file = path.join(directory, name), prefix = name + ".";
    candidates.push(file, file + ".bak");
    try { candidates.push(...fs.readdirSync(directory).filter(entry => entry.startsWith(prefix) && /^\d+\.tmp$/.test(entry.slice(prefix.length))).map(entry => path.join(directory, entry))); } catch {}
  }
  return currentSnapshotsOnly(candidates);
};
const stateCandidates = () => {
  const appData = process.env.APPDATA || app.getPath("appData");
  const primary = stateFile(), tempPrefix = path.basename(primary) + ".";
  let interruptedWrites = [];
  try {
    interruptedWrites = fs.readdirSync(path.dirname(primary))
      .filter(name => name.startsWith(tempPrefix) && /^\d+\.tmp$/.test(name.slice(tempPrefix.length)))
      .map(name => path.join(path.dirname(primary), name));
  } catch {}
  return currentSnapshotsOnly([...new Set([
    primary, primary + ".bak", ...interruptedWrites,
    path.join(appData, "remind-er-4-desktop", "reminder4-state.json"),
    path.join(appData, "remind-er-4-desktop", "reminder4-state.json.bak"),
    path.join(appData, "remind-er-4-desktop-repair", "reminder4-state.json"),
    path.join(appData, "remind-er-4-desktop-repair", "reminder4-state.json.bak"),
    path.join(appData, "Remind-er 4.0", "reminder4-state.json"),
    path.join(appData, "Remind-er 4.0", "reminder4-state.json.bak"),
    path.join(appData, "Remind-er 4.0", "remind-er-state.json"),
    path.join(appData, "Remind-er", "reminder4-state.json"),
  ])]);
};
async function readState(){const io=fs.promises,candidates=[];for(const[order,file]of stateCandidates().entries())try{const stat=await io.stat(file);candidates.push({file,order,modified:stat.mtimeMs})}catch{}const snapshots=[];for(const candidate of selectCurrentSnapshots(candidates)){try{const data=JSON.parse(await io.readFile(candidate.file,"utf8"));if(data&&typeof data==="object"&&!Array.isArray(data))snapshots.push({...candidate,data})}catch{}}const newest=snapshots[0]?.data||{},combined={...newest};for(const snapshot of snapshots.slice(1))for(const[key,value]of Object.entries(snapshot.data))if(!Object.prototype.hasOwnProperty.call(combined,key))combined[key]=value;const chronological=snapshots.slice().reverse().map(item=>item.data);combined.programs=mergeSavedProfiles(...chronological.map(item=>item.programs));combined.demos=mergeSavedRows(...chronological.map(item=>item.demos));try{const library=await readProfileLibrary();combined.programs=mergeSavedProfiles(combined.programs,library.programs)}catch(error){console.warn("Remind-er profile library could not be refreshed:",error?.message||error)}return combined}
function mergeSavedProfiles(...lists) {
  const rows = [], positions = new Map();
  for (const list of lists) for (const row of Array.isArray(list) ? list : []) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const id = String(row.id || "").trim(), key = id || (String(row.name || "").trim().toLowerCase() + "|" + String(row.version || "version not provided").trim().toLowerCase());
    if (!key || key === "|") { rows.push(row); continue; }
    if (!positions.has(key)) { positions.set(key, rows.length); rows.push(row); continue; }
    const index = positions.get(key), merged = { ...rows[index] };
    for (const [field, value] of Object.entries(row)) {
      const empty = value == null || typeof value === "string" && !value.trim() || Array.isArray(value) && !value.length;
      if (!empty || merged[field] == null || typeof merged[field] === "string" && !merged[field].trim() || Array.isArray(merged[field]) && !merged[field].length) merged[field] = value;
    }
    rows[index] = merged;
  }
  return rows;
}
function mergeSavedRows(...lists) {
  const rows = [], positions = new Map();
  for (const list of lists) for (const row of Array.isArray(list) ? list : []) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const key = String(row.id || "").trim();
    if (!key || !positions.has(key)) { if (key) positions.set(key, rows.length); rows.push(row); continue; }
    const index = positions.get(key), merged = { ...rows[index] };
    for (const [field, value] of Object.entries(row)) {
      const empty = value == null || typeof value === "string" && !value.trim() || Array.isArray(value) && !value.length;
      if (!empty || merged[field] == null || typeof merged[field] === "string" && !merged[field].trim() || Array.isArray(merged[field]) && !merged[field].length) merged[field] = value;
    }
    rows[index] = merged;
  }
  return rows;
}
async function readProfileLibrary(){const io=fs.promises,candidates=[];for(const[order,file]of profileLibraryCandidates().entries())try{const stat=await io.stat(file);candidates.push({file,order,modified:stat.mtimeMs})}catch{}const snapshots=[];for(const candidate of selectCurrentSnapshots(candidates)){try{const data=JSON.parse(await io.readFile(candidate.file,"utf8"));if(data&&typeof data==="object"&&!Array.isArray(data)&&Array.isArray(data.programs))snapshots.push(data.programs)}catch{}}return{programs:mergeSavedProfiles(...snapshots.reverse()),found:snapshots.length>0}}
async function writeProfileLibrary(programs) {
  const file = profileLibraryFile(), backup = file + ".bak", temp = file + "." + process.pid + ".tmp", io = fs.promises;
  const normalized = Array.isArray(programs) ? programs : [];
  const current = await readProfileLibrary();
  if (current.found && JSON.stringify(current.programs) === JSON.stringify(normalized)) return true;
  await io.mkdir(path.dirname(file), { recursive: true });
  await io.writeFile(temp, JSON.stringify({ programs: normalized }), "utf8");
  try {
    try { await io.rm(backup, { force: true }); await io.rename(file, backup); }
    catch { try { await io.copyFile(file, backup); await io.unlink(file); } catch (error) { if (error?.code !== "ENOENT") throw error; } }
    await io.rename(temp, file);
  } catch (error) {
    try {
      const pending = JSON.parse(await io.readFile(temp, "utf8"));
      if (!pending || !Array.isArray(pending.programs)) throw error;
      await io.utimes(temp, new Date(), new Date());
      try {
        await io.copyFile(temp, file);
        const installed = JSON.parse(await io.readFile(file, "utf8"));
        if (installed && Array.isArray(installed.programs)) { await io.rm(temp, { force: true }); return true; }
      } catch {}
      return true;
    } catch { try { await io.rm(temp, { force: true }); } catch {} throw error; }
  }
  return true;
}
ipcMain.handle("remi:load", () => readState());
ipcMain.handle("remi:load-programs", async () => (await readState()).programs);
let saveQueue = Promise.resolve();
ipcMain.handle("remi:save", (_event, data) => {
  const pending = saveQueue.then(() => saveState(data));
  saveQueue = pending.catch(() => {});
  return pending;
});
ipcMain.handle("remi:purge-profile-data", async (event, profile = {}) => {
  if (event.sender !== windowRef?.webContents) throw new Error("This profile deletion is not from Remind-er.");
  const id = String(profile.id || ""), name = String(profile.name || "").trim().toLowerCase(), version = String(profile.version || "version not provided");
  if (!id || !name) throw new Error("A saved profile identifier is required.");
  const belongsToProfile = row => String(row?.programId || row?.frameProgramId || "") === id || String(row?.program || row?.program_name || "").trim().toLowerCase() === name && String(row?.version || row?.program_version || "version not provided") === version;
  const removeCopies = async () => {
    const io = fs.promises;
    for (const file of [...stateCandidates(), ...profileLibraryCandidates()]) {
      let state;
      try { state = JSON.parse(await io.readFile(file, "utf8")); } catch { continue; }
      if (!state || typeof state !== "object" || Array.isArray(state)) continue;
      state.programs = (Array.isArray(state.programs) ? state.programs : []).filter(row => !(String(row?.id || "") === id || String(row?.name || "").trim().toLowerCase() === name && String(row?.version || "version not provided") === version));
      state.demos = (Array.isArray(state.demos) ? state.demos : []).filter(row => !belongsToProfile(row));
      if (state.selfLearning && (String(state.selfLearning.program?.id || "") === id || String(state.selfLearning.program?.name || "").trim().toLowerCase() === name && String(state.selfLearning.program?.version || "version not provided") === version)) state.selfLearning = null;
      const temp = file + ".purge-" + process.pid + ".tmp";
      await io.writeFile(temp, JSON.stringify(state), "utf8");
      await io.rename(temp, file);
    }
  };
  const pending = saveQueue.then(removeCopies);
  saveQueue = pending.catch(() => {});
  return pending;
});
async function saveState(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Refusing to save an invalid Remind-er data file.");
  await writeProfileLibrary(data.programs);
  const file = stateFile(), backup = file + ".bak", temp = file + "." + process.pid + ".tmp";
  const io = fs.promises;
  await io.mkdir(path.dirname(file), { recursive: true });
  await io.writeFile(temp, JSON.stringify(data), "utf8");
  let hasValidCurrent = false;
  try { const prior = JSON.parse(await io.readFile(file, "utf8")); hasValidCurrent = Boolean(prior && typeof prior === "object" && !Array.isArray(prior)); } catch {}
  try {
    if (hasValidCurrent) {
      await io.rm(backup, { force: true });
      try { await io.rename(file, backup); }
      catch { await io.copyFile(file, backup); await io.unlink(file); }
    } else {
      const damaged = file + ".corrupt-" + Date.now();
      try { await io.rename(file, damaged); } catch { try { await io.rm(file, { force: true }); } catch {} }
    }
    await io.rename(temp, file);
  } catch (error) {
    // A completed, synced temp file is itself a durable save. Keep it when
    // Windows or an antivirus lock prevents the final rename; readState()
    // includes these recovery files and selects the newest valid snapshot.
    try {
      const pending = JSON.parse(await io.readFile(temp, "utf8"));
      if (!pending || typeof pending !== "object" || Array.isArray(pending)) throw error;
      await io.utimes(temp, new Date(), new Date());
      try {
        await io.copyFile(temp, file);
        const installed = JSON.parse(await io.readFile(file, "utf8"));
        if (installed && typeof installed === "object" && !Array.isArray(installed)) { await io.rm(temp, { force: true }); return true; }
      } catch {}
      try { await io.access(file); }
      catch {
        try { await io.rename(backup, file); }
        catch { try { await io.copyFile(backup, file); } catch {} }
      }
      return true;
    } catch {
      try { await io.access(file); }
      catch {
        try { await io.rename(backup, file); }
        catch { try { await io.copyFile(backup, file); } catch {} }
      }
      try { await io.rm(temp, { force: true }); } catch {}
      throw error;
    }
  }
  return true;
}
ipcMain.handle("remi:ai-request", async (event, request = {}) => {
  if (event.sender !== windowRef?.webContents) throw new Error("This AI request is not from Remind-er.");
  const fail = (message, status = 400) => ({ ok: false, status, statusText: "Request setup failed", error: String(message) });
  const provider = request.provider === "nvidia" ? "nvidia" : "openai";
  const endpoint = String(request.endpoint || "").trim(), key = String(request.key || "").trim(), body = String(request.body || "");
  let target; try { target = new URL(endpoint); } catch { return fail("Enter a valid " + (provider === "nvidia" ? "NVIDIA" : "OpenAI") + " API address in Settings."); }
  const expectedHost = provider === "nvidia" ? "integrate.api.nvidia.com" : "api.openai.com";
  const expectedPath = provider === "nvidia" ? "/v1/chat/completions" : "/v1/responses";
  const acceptablePaths = new Set(["/", "/v1", expectedPath, expectedPath + "/"]);
  if (target.protocol !== "https:" || target.hostname.toLowerCase() !== expectedHost || target.username || target.password || !acceptablePaths.has(target.pathname)) return fail("Use https://" + expectedHost + expectedPath + " in Settings. Current address has host " + target.host + " and path " + target.pathname + ".");
  target.pathname = expectedPath; target.search = ""; target.hash = "";
  if (!key) return fail("Add your " + (provider === "nvidia" ? "NVIDIA" : "OpenAI") + " API key in Settings first.");
  if (!body || body.length > 150_000_000) return fail("This " + (provider === "nvidia" ? "NVIDIA" : "OpenAI") + " request is empty or too large.");
  const controller = new AbortController(), timeoutMs = request.testConnection ? 25_000 : Math.min(300_000, Math.max(90_000, Number(request.timeoutMs) || 90_000));
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let modelListed = null, availableModels = [];
    if (request.testConnection && provider === "nvidia") {
      const modelsUrl = new URL("/v1/models", target.origin);
      const catalogResponse = await net.fetch(modelsUrl.href, { method: "GET", headers: { "Authorization": "Bearer " + key, "Accept": "application/json" }, signal: controller.signal });
      const catalogText = await catalogResponse.text();
      if (!catalogResponse.ok) return fail("NVIDIA model-list check returned HTTP " + catalogResponse.status + ". The key or NVIDIA API access was rejected before testing inference.", catalogResponse.status);
      let catalog = {}; try { catalog = JSON.parse(catalogText); } catch {}
      const requestedModel = String(request.model || "").trim();
      availableModels = Array.isArray(catalog.data) ? [...new Set(catalog.data.map(item => String(item?.id || "").trim()).filter(Boolean))].slice(0, 30) : [];
      modelListed = availableModels.includes(requestedModel);

    }
    const response = await net.fetch(target.href, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key, "Accept": "application/json" }, body, signal: controller.signal });
    let responseBody = (await response.text()).slice(0, 32_000_000);
    if (!response.ok && provider === "nvidia" && availableModels.length) { let parsed = {}; try { parsed = JSON.parse(responseBody); } catch {} const original = parsed.error, detail = typeof original === "string" ? original : original?.message || parsed.message || "NVIDIA rejected this model for the selected key."; parsed.error = { message: detail, available_models: availableModels }; responseBody = JSON.stringify(parsed); }
    return { ok: response.ok, status: response.status, statusText: response.statusText, body: responseBody, modelListed, availableModels };
  } catch (error) {
    if (controller.signal.aborted) return fail((request.testConnection ? "Connection test" : "AI request") + " timed out after " + Math.round(timeoutMs / 1000) + " seconds while reaching " + expectedHost + ". Check internet access, firewall, and the API address.", 408);
    return fail("Could not reach " + expectedHost + ". Check your internet connection or firewall. " + String(error?.message || error).slice(0, 180), 0);
  } finally { clearTimeout(timeout); }
});
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
    minWidth: Math.min(700, width), minHeight: 64, frame: false, resizable: false, movable: false, alwaysOnTop: true, skipTaskbar: false, icon: path.join(__dirname, "assets", "reminder4-icon.ico"),
    show: false, transparent: true, backgroundColor: "#00000000", roundedCorners: true, focusable: true, hasShadow: true,
    webPreferences: { preload: path.join(__dirname, "desktop-preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true, webviewTag: true }
  });
  windowRef.on("focus", () => { if (windowRef && windowRef.getBounds().height <= 72) windowRef.webContents.send("remi:taskbar-activate"); });
  windowRef.loadFile(path.join(__dirname, "popup.html"));
  windowRef.once("ready-to-show", () => { windowRef.show(); windowRef.focus(); });
  windowRef.on("closed", () => { windowRef = null; });
}
if (hasSingleInstanceLock) app.whenReady().then(() => { session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => { if (selectedSource) callback({ video: selectedSource }); else callback({}); }, { useSystemPicker: false }); createWindow(); }); app.on("window-all-closed", () => app.quit());
let quitDrainStarted = false;
app.on("before-quit", event => {
  if (quitDrainStarted) return;
  event.preventDefault();
  quitDrainStarted = true;
  saveQueue.finally(() => app.quit());
});
