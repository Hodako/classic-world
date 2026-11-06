/**
 * Classic World - Ultimate Windows POS Desktop Application
 * Connected with Cloud (https://classicworld-pos.web.app) & Local Offline Server
 * 1-Click Silent Thermal Printing, Windows Printer Preferences & Native POS Hardware Integration
 */

const { app, BrowserWindow, ipcMain, session } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const http = require("http");
const https = require("https");
const { spawn, exec } = require("child_process");
const {
  startBridgeServer,
  getWindowsPrinters,
  setWindowsDefaultPrinter,
  openWindowsPrinterPreferences,
  openWindowsPrinterProperties,
} = require("./pos-bridge.cjs");

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

  // Intercept window.print() / iframe.contentWindow.print() and route through electronPOS.printSilent
  // while respecting the device's automatePrinting, printerName, and margin preferences!
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents
      .executeJavaScript(`
        (function() {
          if (window.__posSilentPrintHooked) return;
          window.__posSilentPrintHooked = true;
          function getDevicePrintPrefs() {
            try {
              const raw = localStorage.getItem("classicworld_pos_hardware_v1") || localStorage.getItem("dreamfashion_pos_hardware_v1") || "{}";
              const parsed = JSON.parse(raw);
              const widthMm = Number(parsed.paperWidthMm) || (parsed.paperSize === "58mm" ? 58 : parsed.paperSize === "a4" ? 210 : 80);
              return {
                printerName: parsed.devicePrinterName || "",
                silent: parsed.automatePrinting !== false,
                copies: Number(parsed.copies) || 1,
                scaleFactor: Number(parsed.printScale) || 100,
                pageSize: parsed.paperSize === "a4" ? "a4" : `${widthMm}mm`,
                paperWidthMm: widthMm,
                margins: {
                  topMm: parsed.marginTopMm ?? 0,
                  bottomMm: parsed.marginBottomMm ?? 0,
                  leftMm: parsed.marginLeftMm ?? 0,
                  rightMm: parsed.marginRightMm ?? 0,
                },
              };
            } catch (_) {
              return { printerName: "", silent: true, copies: 1, scaleFactor: 100, pageSize: "80mm", paperWidthMm: 80 };
            }
          }
          if (window.electronPOS && typeof window.electronPOS.printSilent === "function") {
            window.print = function() {
              const prefs = getDevicePrintPrefs();
              window.electronPOS.printSilent({
                html: document.documentElement.outerHTML,
                ...prefs,
              });
            };
            const hookIframe = (iframe) => {
              try {
                if (iframe && iframe.contentWindow) {
                  iframe.contentWindow.print = function() {
                    const doc = iframe.contentDocument || iframe.contentWindow.document;
                    if (doc && doc.documentElement) {
                      const prefs = getDevicePrintPrefs();
                      window.electronPOS.printSilent({
                        html: doc.documentElement.outerHTML,
                        ...prefs,
                      });
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

  // Ensure local Next.js engine on port 3142 is running first (instant speed + offline + cloud DB)
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
    if (validatedURL.startsWith("https://classicworld-pos.web.app")) {
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

// ── Windows OS Printer & Thermal Printing IPC Handlers ───────────────────────

// 1. Get installed Windows printers and identify default printer
ipcMain.handle("pos:get-printers", async () => {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const list = await mainWindow.webContents.getPrintersAsync();
      if (Array.isArray(list) && list.length > 0) return list;
    }
    return await getWindowsPrinters();
  } catch (err) {
    console.error("[Windows POS] Error fetching printers:", err);
    return await getWindowsPrinters();
  }
});

// 2. Get default Windows printer
ipcMain.handle("pos:get-default-printer", async () => {
  try {
    let list = [];
    if (mainWindow && !mainWindow.isDestroyed()) {
      list = await mainWindow.webContents.getPrintersAsync();
    }
    if (!list || list.length === 0) {
      list = await getWindowsPrinters();
    }
    return list.find((p) => p.isDefault) || list[0] || null;
  } catch (err) {
    console.error("[Windows POS] Error fetching default printer:", err);
    return null;
  }
});

// 3. Set real Windows OS default printer
ipcMain.handle("pos:set-default-printer", async (event, { printerName } = {}) => {
  return await setWindowsDefaultPrinter(printerName);
});

// 4. Open real Windows OS Printing Preferences dialog for a printer
ipcMain.handle("pos:open-printer-preferences", async (event, { printerName } = {}) => {
  return await openWindowsPrinterPreferences(printerName);
});

// 5. Open real Windows OS Printer Properties dialog for a printer
ipcMain.handle("pos:open-printer-properties", async (event, { printerName } = {}) => {
  return await openWindowsPrinterProperties(printerName);
});

// 6. Open Windows OS Printers & Scanners settings page
ipcMain.handle("pos:open-windows-printers-settings", async () => {
  exec("start ms-settings:printers");
  return { success: true };
});

// 7. Reliable Thermal Receipt Print (Supports both Silent 1-Click Print AND Windows Printing Preferences Dialog)
async function performSilentPrint(html, printerName, options = {}) {
  return new Promise(async (resolve) => {
    const useSilent = options.silent !== undefined ? Boolean(options.silent) : true;
    const copies = Math.max(1, Number(options.copies) || 1);
    const scaleFactor = Math.max(20, Math.min(250, Number(options.scaleFactor) || 100));
    const margins = options.margins || {};
    const topMm = margins.topMm !== undefined ? Number(margins.topMm) : 0;
    const bottomMm = margins.bottomMm !== undefined ? Number(margins.bottomMm) : 0;
    const leftMm = margins.leftMm !== undefined ? Number(margins.leftMm) : 0;
    const rightMm = margins.rightMm !== undefined ? Number(margins.rightMm) : 0;

    const rawPageSize = String(options.pageSize || "").toLowerCase();
    const isA4 = rawPageSize.includes("a4");
    const parsedMmMatch = rawPageSize.match(/(\d+)\s*mm/i);
    const parsedMm = parsedMmMatch ? parseInt(parsedMmMatch[1], 10) : Number(options.paperWidthMm);
    const widthMm = isA4 ? 210 : (Number.isFinite(parsedMm) && parsedMm > 0 ? parsedMm : 80);
    const cssPageSize = isA4 ? "A4 portrait" : `${widthMm}mm auto`;
    const widthMicrons = Math.max(15000, widthMm * 1000);

    // Prepare HTML: remove external font blocking that causes blank pages & enforce all-bold pure black thermal styling + margins
    let preparedHtml = String(html || "");
    preparedHtml = preparedHtml.replace(/display=swap/g, "display=optional");

    const thermalOverrideStyle = `
      <style id="pos-thermal-override">
        @page {
          size: ${cssPageSize} !important;
          margin: 0mm !important;
        }
        html, body {
          background: #ffffff !important;
          color: #000000 !important;
          font-weight: 800 !important;
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          margin: 0 !important;
          padding: 0 !important;
          width: 100% !important;
        }
        *, body, div, span, p, td, th, tr, table, strong, b, h1, h2, h3, h4, small {
          font-weight: 800 !important;
          color: #000000 !important;
          font-family: 'Nirmala UI', 'Hind Siliguri', 'Noto Sans Bengali', 'SolaimanLipi', 'Segoe UI', Arial, sans-serif !important;
        }
        .receipt-wrap {
          padding-top: ${topMm}mm !important;
          padding-bottom: ${bottomMm}mm !important;
          padding-left: ${leftMm}mm !important;
          padding-right: ${rightMm}mm !important;
          box-sizing: border-box !important;
          width: 100% !important;
        }
      </style>
    `;

    if (preparedHtml.includes("</head>")) {
      preparedHtml = preparedHtml.replace("</head>", `${thermalOverrideStyle}</head>`);
    } else {
      preparedHtml = `<!DOCTYPE html><html><head><meta charset="utf-8">${thermalOverrideStyle}</head><body>${preparedHtml}</body></html>`;
    }

    const tempFilePath = path.join(
      os.tmpdir(),
      `pos_receipt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.html`
    );

    let printWin = null;
    const cleanup = () => {
      if (printWin && !printWin.isDestroyed()) {
        try {
          printWin.close();
        } catch (_) {}
      }
      printWin = null;
      try {
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      } catch (_) {}
    };

    try {
      fs.writeFileSync(tempFilePath, preparedHtml, "utf8");

      const isInteractive = !useSilent;
      printWin = new BrowserWindow({
        show: isInteractive,
        x: isInteractive ? undefined : -20000,
        y: isInteractive ? undefined : -20000,
        width: 440,
        height: 780,
        title: "POS Receipt Print",
        autoHideMenuBar: true,
        focusable: isInteractive,
        frame: isInteractive,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          backgroundThrottling: false,
        },
      });

      // Positioned offscreen but active so Windows GDI compositor fully renders all text and lines!
      if (!isInteractive) {
        printWin.showInactive();
      }

      await printWin.loadFile(tempFilePath);

      // Ensure fonts and layout frames are 100% painted before triggering Windows print spooler
      await printWin.webContents
        .executeJavaScript(`
          new Promise((res) => {
            const finish = () => requestAnimationFrame(() => requestAnimationFrame(res));
            if (document.fonts && document.fonts.ready) {
              Promise.race([
                document.fonts.ready,
                new Promise((r) => setTimeout(r, 400))
              ]).then(finish).catch(finish);
            } else {
              finish();
            }
          });
        `)
        .catch(() => {});

      await new Promise((r) => setTimeout(r, 250));

      const printers = await printWin.webContents.getPrintersAsync();
      const defaultP = printers.find((p) => p.isDefault)?.name || printers[0]?.name || "";

      let targetPrinter = printerName || defaultP;
      if (targetPrinter && printers.length > 0) {
        const matched = printers.find(
          (p) => p.name.toLowerCase() === String(targetPrinter).trim().toLowerCase()
        );
        if (matched) {
          targetPrinter = matched.name;
        } else {
          targetPrinter = defaultP;
        }
      }

      const printConfig = {
        silent: useSilent,
        printBackground: true,
        copies,
        scaleFactor,
        margins: { marginType: "none" },
      };

      if (isA4) {
        printConfig.pageSize = "A4";
      } else {
        printConfig.pageSize = { width: widthMicrons, height: 297000 };
      }

      if (useSilent && targetPrinter) {
        printConfig.deviceName = targetPrinter;
      }

      printWin.webContents.print(printConfig, (success, failureReason) => {
        cleanup();
        if (success) {
          console.log(
            `[Windows POS] Receipt printed (${useSilent ? "SILENT" : "DIALOG"}) to: ${targetPrinter || "Windows Printer"}`
          );
          resolve({ success: true, printer: targetPrinter, silent: useSilent });
        } else {
          console.warn(`[Windows POS] Print cancelled or failed: ${failureReason}`);
          resolve({ success: false, error: failureReason });
        }
      });
    } catch (e) {
      cleanup();
      resolve({ success: false, error: e.message });
    }
  });
}

ipcMain.handle("pos:print-silent", async (event, options = {}) => {
  const { html, printerName, silent, margins, copies, scaleFactor, pageSize, paperWidthMm } = options;
  if (!html) return { success: false, error: "Empty HTML" };
  return await performSilentPrint(html, printerName, {
    silent,
    margins,
    copies,
    scaleFactor,
    pageSize,
    paperWidthMm,
  });
});
    copies,
    scaleFactor,
    pageSize,
  });
});

// 8. Open cash drawer via ESC/POS command
ipcMain.handle("pos:open-cash-drawer", async (event, { printerName } = {}) => {
  const drawerKickHtml = `
    <html>
      <head><style>@page { size: 10mm 10mm; margin: 0; }</style></head>
      <body>\x1b\x70\x00\x19\xfa</body>
    </html>
  `;
  return await performSilentPrint(drawerKickHtml, printerName, { silent: true });
});

app.whenReady().then(() => {
  // Start local bridge on port 9123 so even external browsers (Chrome/Edge) get 1-click silent print & Windows printer preferences!
  startBridgeServer((html, printerName, options) => performSilentPrint(html, printerName, options));
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (serverProcess) {
    try {
      serverProcess.kill();
    } catch (_) {}
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});
