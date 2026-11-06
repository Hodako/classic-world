/**
 * Classic World - Ultimate Windows POS Desktop Application
 * Connected with Cloud (https://classicworld-pos.web.app) & Local Offline Server
 * 1-Click Silent Thermal Printing & Native POS Hardware Integration
 */

const { app, BrowserWindow, ipcMain, session } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const https = require("https");
const { spawn } = require("child_process");
const { startBridgeServer } = require("./pos-bridge.cjs");

// Find project root containing server.js whether running from electron/ or software/resources/app/electron/
function findProjectRootWithServer() {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(dir, "server.js"))) {
      return dir;
    }
    dir = path.resolve(dir, "..");
  }
  return path.resolve(__dirname, "..");
}

// Enable native Chromium Kiosk Silent Printing - ZERO print confirm messages or dialog popups!
app.commandLine.appendSwitch("kiosk-printing");
app.commandLine.appendSwitch("disable-print-preview");

let mainWindow = null;
let serverProcess = null;

const CLOUD_URL = process.env.POS_CLOUD_URL || "https://classicworld-pos.web.app";
const LOCAL_PORT = process.env.PORT || 3142;
const LOCAL_URL = `http://127.0.0.1:${LOCAL_PORT}`;

// Check if an HTTP/HTTPS endpoint is responding
function checkUrlReady(targetUrl, timeoutMs = 1500) {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(targetUrl);
      const client = parsed.protocol === "https:" ? https : http;
      const req = client.get(targetUrl, (res) => {
        resolve(res.statusCode >= 200 && res.statusCode < 500);
      });
      req.on("error", () => resolve(false));
      req.setTimeout(timeoutMs, () => {
        req.abort();
        resolve(false);
      });
    } catch (_) {
      resolve(false);
    }
  });
}

// Start Next.js server locally if not already running
async function ensureLocalServerRunning() {
  const isRunning = await checkUrlReady(LOCAL_URL, 800);
  if (isRunning) {
    console.log(`[Windows POS] Local server is already running on ${LOCAL_URL}`);
    return;
  }

  const rootDir = findProjectRootWithServer();
  if (!fs.existsSync(path.join(rootDir, "server.js"))) {
    console.log(`[Windows POS] No local server.js found, using Cloud (${CLOUD_URL})`);
    return;
  }

  console.log(`[Windows POS] Starting local Next.js POS server on port ${LOCAL_PORT}...`);

  serverProcess = spawn("node", ["server.js"], {
    cwd: rootDir,
    env: { ...process.env, PORT: String(LOCAL_PORT), NODE_ENV: "production" },
    shell: true,
    stdio: "ignore",
    windowsHide: true,
  });

  serverProcess.on("error", (err) => {
    console.error("[Windows POS] Failed to spawn local server:", err);
  });

  // Wait for local server to become ready
  let attempts = 0;
  while (attempts < 25) {
    await new Promise((r) => setTimeout(r, 400));
    const ready = await checkUrlReady(LOCAL_URL, 600);
    if (ready) {
      console.log(`[Windows POS] Local server became ready after ${attempts * 400}ms!`);
      return;
    }
    attempts++;
  }
}

async function createWindow() {
  // Use persistent partition so auth cookies and localStorage survive app restarts
  const partition = "persist:classicworld_pos";
  const customSession = session.fromPartition(partition);

  // Clear HTTP cache & stale service workers on startup so UI updates always appear immediately
  try {
    await customSession.clearCache();
    await customSession.clearStorageData({ storages: ["serviceworkers", "cachestorage"] });
  } catch (err) {
    console.warn("[Windows POS] Cache clear warning:", err);
  }

  mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    title: "Classic World — Ultimate POS System",
    icon: path.join(__dirname, "../public/logo.png"),
    backgroundColor: "#0f172a",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      session: customSession,
      backgroundThrottling: false, // Keep POS hardware and scan listeners alive in background
    },
  });

  // Hide default menu bar for clean, professional POS screen
  mainWindow.setMenuBarVisibility(false);

  // Intercept any window.print() or iframe.contentWindow.print() so the Windows Print Confirm Dialog NEVER shows!
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents
      .executeJavaScript(`
        (function() {
          if (window.__posSilentPrintHooked) return;
          window.__posSilentPrintHooked = true;
          if (window.electronPOS && typeof window.electronPOS.printSilent === "function") {
            window.print = function() {
              window.electronPOS.printSilent({ html: document.documentElement.outerHTML });
            };
            const hookIframe = (iframe) => {
              try {
                if (iframe && iframe.contentWindow) {
                  iframe.contentWindow.print = function() {
                    const doc = iframe.contentDocument || iframe.contentWindow.document;
                    if (doc && doc.documentElement) {
                      window.electronPOS.printSilent({ html: doc.documentElement.outerHTML });
                    }
                  };
                }
              } catch (_) {}
            };
            const obs = new MutationObserver((mutations) => {
              for (const m of mutations) {
                for (const node of m.addedNodes) {
                  if (node && node.tagName === "IFRAME") {
                    hookIframe(node);
                    node.addEventListener("load", () => hookIframe(node));
                  }
                }
              }
            });
            if (document.body) {
              obs.observe(document.body, { childList: true, subtree: true });
            }
          }
        })();
      `)
      .catch(() => {});
  });

  // Ensure local Next.js engine on port 3141 is running first (instant speed + offline + cloud DB)
  await ensureLocalServerRunning();
  const isLocalReady = await checkUrlReady(LOCAL_URL, 1500);

  if (isLocalReady) {
    console.log(`[Windows POS] Connected to Local Next.js Engine (${LOCAL_URL})!`);
    mainWindow.loadURL(LOCAL_URL);
  } else {
    console.log(`[Windows POS] Local engine unavailable, connecting to cloud: ${CLOUD_URL}...`);
    const isCloudOnline = await checkUrlReady(CLOUD_URL, 2500);
    if (isCloudOnline) {
      mainWindow.loadURL(CLOUD_URL);
    } else {
      mainWindow.loadFile(path.join(__dirname, "error.html"));
    }
  }

  // Handle load failures gracefully (e.g. WiFi disconnected during load)
  mainWindow.webContents.on("did-fail-load", async (event, errorCode, errorDescription, validatedURL) => {
    console.warn(`[Windows POS] Failed to load ${validatedURL} [${errorCode}: ${errorDescription}]`);
    if (validatedURL.startsWith("https://hakim.qzz.io")) {
      console.log("[Windows POS] Cloud failed, switching to local offline POS server...");
      await ensureLocalServerRunning();
      mainWindow.loadURL(LOCAL_URL).catch(() => {
        mainWindow.loadFile(path.join(__dirname, "error.html"));
      });
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ── Silent Printing IPC Handlers ────────────────────────────

// 1. Get installed Windows printers and identify default printer
ipcMain.handle("pos:get-printers", async () => {
  if (!mainWindow) return [];
  try {
    const list = await mainWindow.webContents.getPrintersAsync();
    return list;
  } catch (err) {
    console.error("[Windows POS] Error fetching printers:", err);
    return [];
  }
});

// 2. Get default Windows printer
ipcMain.handle("pos:get-default-printer", async () => {
  if (!mainWindow) return null;
  try {
    const list = await mainWindow.webContents.getPrintersAsync();
    return list.find((p) => p.isDefault) || list[0] || null;
  } catch (err) {
    console.error("[Windows POS] Error fetching default printer:", err);
    return null;
  }
});

// 3. 1-Click Silent Print without ANY print dialog!
async function performSilentPrint(html, printerName) {
  return new Promise(async (resolve) => {
    let printWin = new BrowserWindow({
      show: false,
      width: 320,
      height: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    printWin.on("closed", () => {
      printWin = null;
    });

    try {
      await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      await new Promise((r) => setTimeout(r, 120));

      const printers = await printWin.webContents.getPrintersAsync();
      const defaultP = printers.find((p) => p.isDefault)?.name || printers[0]?.name || "";
      const targetPrinter = printerName || defaultP;

      printWin.webContents.print(
        {
          silent: true,
          printBackground: true,
          deviceName: targetPrinter,
          margins: { marginType: "none" },
        },
        (success, failureReason) => {
          if (printWin) {
            printWin.close();
          }
          if (success) {
            console.log(`[Windows POS] Receipt printed silently to: ${targetPrinter}`);
            resolve({ success: true, printer: targetPrinter });
          } else {
            console.warn(`[Windows POS] Silent print failed: ${failureReason}`);
            resolve({ success: false, error: failureReason });
          }
        }
      );
    } catch (e) {
      if (printWin) printWin.close();
      resolve({ success: false, error: e.message });
    }
  });
}

ipcMain.handle("pos:print-silent", async (event, options = {}) => {
  const { html, printerName } = options;
  if (!html) return { success: false, error: "Empty HTML" };
  return await performSilentPrint(html, printerName);
});

// 4. Open cash drawer via ESC/POS command
ipcMain.handle("pos:open-cash-drawer", async (event, { printerName } = {}) => {
  const drawerKickHtml = `
    <html>
      <head><style>@page { size: 10mm 10mm; margin: 0; }</style></head>
      <body>\x1b\x70\x00\x19\xfa</body>
    </html>
  `;
  return await performSilentPrint(drawerKickHtml, printerName);
});

// 5. Server switching
ipcMain.on("pos:switch-server", (event, target) => {
  if (!mainWindow) return;
  if (target === "cloud") {
    mainWindow.loadURL(CLOUD_URL);
  } else if (target === "local") {
    ensureLocalServerRunning().then(() => {
      mainWindow.loadURL(LOCAL_URL);
    });
  }
});

// ── App Lifecycle ───────────────────────────────────────────

app.whenReady().then(async () => {
  // Start local POS bridge HTTP server on 127.0.0.1:9123
  try {
    startBridgeServer(performSilentPrint);
  } catch (e) {
    console.warn("[Windows POS] Could not start POS bridge:", e);
  }

  // Create main UI window
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    if (serverProcess) {
      try {
        serverProcess.kill();
      } catch (_) {}
    }
    app.quit();
  }
});
