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
  openWindowsCashDrawer,
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
    backgroundColor: "#ffffff",
    show: true,
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

  // Keyboard shortcuts: F12 / Ctrl+Shift+I (DevTools), F5 / Ctrl+R (Reload), Ctrl+Shift+R (Hard Reload)
  mainWindow.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    if (input.key === "F12" || (input.control && input.shift && input.key.toLowerCase() === "i")) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    } else if (input.key === "F5" || (input.control && input.key.toLowerCase() === "r" && !input.shift)) {
      mainWindow.webContents.reload();
      event.preventDefault();
    } else if (input.control && input.shift && input.key.toLowerCase() === "r") {
      mainWindow.webContents.reloadIgnoringCache();
      event.preventDefault();
    }
  });

  // Capture all renderer console messages & errors to debug startup/blank screen issues
  mainWindow.webContents.on("console-message", (event, level, message, line, sourceId) => {
    console.log(`[Renderer Console][lvl ${level}] ${message} (${sourceId}:${line})`);
  });

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
              const heightMm = parsed.paperHeightMm !== undefined && parsed.paperHeightMm !== "auto" && Number(parsed.paperHeightMm) > 0 ? Number(parsed.paperHeightMm) : "auto";
              return {
                printerName: parsed.devicePrinterName || "",
                silent: parsed.automatePrinting !== false,
                copies: Number(parsed.copies) || 1,
                scaleFactor: Number(parsed.printScale) || 100,
                pageSize: parsed.paperSize === "a4" ? "a4" : (widthMm + "mm"),
                paperWidthMm: widthMm,
                paperHeightMm: heightMm,
                margins: {
                  topMm: parsed.marginTopMm != null ? Number(parsed.marginTopMm) : 0,
                  bottomMm: parsed.marginBottomMm != null ? Number(parsed.marginBottomMm) : 0,
                  leftMm: parsed.marginLeftMm != null ? Number(parsed.marginLeftMm) : 0,
                  rightMm: parsed.marginRightMm != null ? Number(parsed.marginRightMm) : 0,
                },
              };
            } catch (_) {
              return { printerName: "", silent: true, copies: 1, scaleFactor: 100, pageSize: "80mm", paperWidthMm: 80, paperHeightMm: "auto" };
            }
          }
          if (window.electronPOS && typeof window.electronPOS.printSilent === "function") {
            window.print = function() {
              const isReceiptPage = Boolean(document.querySelector(".receipt-wrap, .invoice-print-container, [data-pos-receipt]"));
              const prefs = isReceiptPage
                ? getDevicePrintPrefs()
                : { printerName: "", silent: false, copies: 1, scaleFactor: 100, pageSize: "a4", paperWidthMm: 210, paperHeightMm: "auto" };
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
                      const labelMode = doc.documentElement.getAttribute("data-pos-label-mode");
                      const isLabelDoc = Boolean(doc.querySelector(".pos-label-page") || labelMode);
                      if (isLabelDoc) {
                        const attrW = Number(doc.documentElement.getAttribute("data-label-width-mm"));
                        const attrH = Number(doc.documentElement.getAttribute("data-label-height-mm"));
                        if (labelMode === "a4_sheet") {
                          prefs.pageSize = "a4";
                          prefs.paperWidthMm = 210;
                          prefs.paperHeightMm = "auto";
                        } else {
                          if (attrW > 0) {
                            prefs.paperWidthMm = attrW;
                            prefs.pageSize = attrW + "mm";
                          }
                          if (attrH > 0) {
                            prefs.paperHeightMm = attrH;
                          }
                        }
                      }
                      window.electronPOS.printSilent({
                        html: doc.documentElement.outerHTML,
                        ...prefs,
                        isLabel: isLabelDoc,
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

  // Connect to production cloud URL (https://classicworld-pos.web.app) by default
  const preferLocal = process.env.POS_PREFER_LOCAL === "1";
  let targetUrl = CLOUD_URL;

  if (preferLocal) {
    const isLocalReady = await checkUrlReady(LOCAL_URL, 1000);
    if (isLocalReady) {
      targetUrl = LOCAL_URL;
    }
  }

  console.log(`[Windows POS] Connecting to POS Terminal at: ${targetUrl}...`);
  mainWindow.loadURL(targetUrl).catch(async (err) => {
    console.warn(`[Windows POS] Direct load failed for ${targetUrl}:`, err);
    const isLocalReady = await checkUrlReady(LOCAL_URL, 1000);
    if (isLocalReady) {
      console.log(`[Windows POS] Fallback to local server (${LOCAL_URL})...`);
      mainWindow.loadURL(LOCAL_URL).catch(() => {
        mainWindow.loadFile(path.join(__dirname, "error.html"));
      });
    } else {
      mainWindow.loadFile(path.join(__dirname, "error.html"));
    }
  });

  // Handle load failures gracefully (e.g. WiFi disconnected during load)
  mainWindow.webContents.on("did-fail-load", async (event, errorCode, errorDescription, validatedURL) => {
    console.warn(`[Windows POS] Navigation failed: ${validatedURL} [${errorCode}: ${errorDescription}]`);
    if (!validatedURL.includes("error.html")) {
      const isLocalReady = await checkUrlReady(LOCAL_URL, 800);
      if (isLocalReady) {
        mainWindow.loadURL(LOCAL_URL).catch(() => {
          mainWindow.loadFile(path.join(__dirname, "error.html"));
        });
      } else {
        mainWindow.loadFile(path.join(__dirname, "error.html"));
      }
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

// 7. Reliable Thermal Receipt & Barcode Label Print (Supports both Silent 1-Click Print AND Windows Printing Preferences Dialog)
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

    let preparedHtml = String(html || "");
    preparedHtml = preparedHtml.replace(/display=swap/g, "display=optional");

    const rawPageSize = String(options.pageSize || "").toLowerCase();
    const isA4 = rawPageSize.includes("a4") || preparedHtml.includes('data-pos-label-mode="a4_sheet"');
    const isLabel = Boolean(options.isLabel) || preparedHtml.includes("data-pos-label-mode=");
    const isThermalLabel = isLabel && !isA4;

    const parsedMmMatch = rawPageSize.match(/(\d+(?:\.\d+)?)\s*mm/i);
    const parsedMm = Number(options.paperWidthMm) || (parsedMmMatch ? Number(parsedMmMatch[1]) : 80);
    const widthMm = isA4 ? 210 : (Number.isFinite(parsedMm) && parsedMm > 0 ? parsedMm : 80);

    // Match the browser renderer's physical print-head limits for receipts; keep exact width for die-cut labels.
    const printableWidthMm = isThermalLabel
      ? widthMm
      : widthMm >= 148 ? widthMm
      : widthMm >= 80 ? Math.min(72, widthMm - 6)
      : widthMm >= 70 ? Math.min(63, widthMm - 6)
      : widthMm >= 56 ? Math.min(48, widthMm - 8)
      : widthMm >= 48 ? Math.min(42, widthMm - 6)
      : Math.max(1, widthMm - 4);
    const layoutWidthMm = printableWidthMm * 100 / scaleFactor;

    const userHeightMm =
      options.paperHeightMm !== undefined &&
      options.paperHeightMm !== "auto" &&
      Number.isFinite(Number(options.paperHeightMm)) &&
      Number(options.paperHeightMm) > 0
        ? Number(options.paperHeightMm)
        : null;

    const heightLabel = userHeightMm ? `${userHeightMm}mm` : "auto";

    const cssPageRule = isA4
      ? "size: A4 portrait !important;"
      : userHeightMm
      ? `size: ${widthMm}mm ${userHeightMm}mm !important;`
      : "size: auto !important;";

    if (!isThermalLabel && !isA4) {
      const thermalOverrideStyle = `
        <style id="pos-thermal-override">
          @page {
            ${cssPageRule}
            margin: 0mm !important;
            padding: 0mm !important;
          }
          html, body {
            background: #ffffff !important;
            color: #000000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            min-height: 0 !important;
            width: ${layoutWidthMm}mm !important;
            max-width: ${layoutWidthMm}mm !important;
            vertical-align: top !important;
          }
          html { zoom: 1 !important; }
          body { zoom: ${scaleFactor}% !important; }
          table { table-layout: fixed !important; width: 100% !important; max-width: 100% !important; }
          td, th { white-space: normal !important; }
          .receipt-wrap > *:first-child {
            margin-top: 0 !important;
            padding-top: 0 !important;
          }
          *, body, div, span, p, td, th, tr, table, strong, b, h1, h2, h3, h4, small {
            color: #000000 !important;
            margin-top: 0;
            word-break: normal !important;
            overflow-wrap: anywhere !important;
            box-sizing: border-box !important;
            font-family: 'Hind Siliguri', 'Noto Sans Bengali', 'SolaimanLipi', 'Segoe UI', 'Nirmala UI', Arial, sans-serif !important;
          }
          .receipt-wrap {
            padding-top: ${topMm}mm !important;
            padding-bottom: ${bottomMm}mm !important;
            padding-left: ${leftMm}mm !important;
            padding-right: ${rightMm}mm !important;
            box-sizing: border-box !important;
            width: ${layoutWidthMm}mm !important;
            max-width: 100% !important;
            margin: 0 !important;
            display: flow-root !important;
            overflow: visible !important;
          }
        </style>
      `;

      if (preparedHtml.includes("</head>")) {
        preparedHtml = preparedHtml.replace("</head>", `${thermalOverrideStyle}</head>`);
      } else {
        preparedHtml = `<!DOCTYPE html><html><head><meta charset="utf-8">${thermalOverrideStyle}</head><body>${preparedHtml}</body></html>`;
      }
    } else if (!preparedHtml.includes("<html")) {
      preparedHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${preparedHtml}</body></html>`;
    }

    const tempFilePath = path.join(
      os.tmpdir(),
      `pos_receipt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.html`
    );

    let printWin = null;
    let settled = false;
    let safetyTimer = null;

    const cleanup = () => {
      if (safetyTimer) {
        clearTimeout(safetyTimer);
        safetyTimer = null;
      }
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

    const finishOnce = (result) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    // Safety timeout so print job never hangs indefinitely
    safetyTimer = setTimeout(() => {
      console.warn("[Windows POS] Print operation timed out; cleaning up offscreen window.");
      finishOnce({ success: false, error: "Print timeout" });
    }, useSilent ? 35000 : 120000);

    try {
      fs.writeFileSync(tempFilePath, preparedHtml, "utf8");

      const isInteractive = !useSilent;
      printWin = new BrowserWindow({
        show: isInteractive,
        x: isInteractive ? undefined : -20000,
        y: isInteractive ? undefined : -20000,
        width: 520,
        height: 820,
        useContentSize: true,
        enableLargerThanScreen: true,
        title: isLabel ? "POS Label Print" : "POS Receipt Print",
        autoHideMenuBar: true,
        focusable: isInteractive,
        frame: isInteractive,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          backgroundThrottling: false,
        },
      });

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

      await new Promise((r) => setTimeout(r, 200));

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

      // High-DPI Thermal Rasterization (~200+ DPI):
      // Guarantees Chinese thermal/label drivers (Xprinter, Rongta, POS-58, POS-80) CANNOT substitute
      // hardware GBK Chinese characters, preserves crisp SVG barcodes, and enforces 0mm blank margins!
      if (isThermalLabel) {
        try {
          const labelBoxes = await printWin.webContents.executeJavaScript(`
            (function() {
              const pages = Array.from(document.querySelectorAll('.pos-label-page'));
              if (!pages.length) return null;
              return pages.map((el) => {
                const r = el.getBoundingClientRect();
                return {
                  x: Math.max(0, Math.floor(r.left)),
                  y: Math.max(0, Math.floor(r.top + window.scrollY)),
                  width: Math.max(60, Math.ceil(r.width)),
                  height: Math.max(40, Math.ceil(r.height)),
                };
              });
            })()
          `);
          if (Array.isArray(labelBoxes) && labelBoxes.length > 0) {
            const labelZoom = 2.8;
            printWin.webContents.setZoomFactor(labelZoom);
            const totalHeightCss = labelBoxes[labelBoxes.length - 1].y + labelBoxes[labelBoxes.length - 1].height + 20;
            const maxWidthCss = Math.max(...labelBoxes.map((b) => b.width)) + 10;
            printWin.setContentSize(
              Math.ceil(maxWidthCss * labelZoom),
              Math.min(8000, Math.ceil(totalHeightCss * labelZoom))
            );
            await new Promise((r) => setTimeout(r, 100));

            const capturedUrls = [];
            for (const box of labelBoxes) {
              // Scroll into view if batch has many stickers exceeding window height
              await printWin.webContents.executeJavaScript(`window.scrollTo(0, ${box.y});`);
              await new Promise((r) => setTimeout(r, 35));
              const relRect = await printWin.webContents.executeJavaScript(`
                (function() {
                  const el = document.querySelectorAll('.pos-label-page')[${capturedUrls.length}];
                  const r = el.getBoundingClientRect();
                  return { x: Math.max(0, Math.floor(r.left)), y: Math.max(0, Math.floor(r.top)), width: Math.ceil(r.width), height: Math.ceil(r.height) };
                })()
              `);
              const img = await printWin.webContents.capturePage({
                x: Math.floor(relRect.x * labelZoom),
                y: Math.floor(relRect.y * labelZoom),
                width: Math.max(40, Math.ceil(relRect.width * labelZoom)),
                height: Math.max(30, Math.ceil(relRect.height * labelZoom)),
              });
              capturedUrls.push(img.toDataURL());
            }

            printWin.webContents.setZoomFactor(1.0);
            const labelH = userHeightMm || 25;
            const labelRasterHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page { size: ${widthMm}mm ${labelH}mm !important; margin: 0mm !important; }
    html, body { margin: 0 !important; padding: 0 !important; background: #ffffff !important; width: ${widthMm}mm !important; }
    .label-raster-page {
      width: ${widthMm}mm !important;
      height: ${labelH}mm !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      page-break-after: always !important;
      break-after: page !important;
    }
    .label-raster-page:last-child {
      page-break-after: auto !important;
      break-after: auto !important;
    }
    img { width: 100% !important; height: 100% !important; object-fit: contain !important; display: block !important; image-rendering: -webkit-optimize-contrast; }
  </style>
</head>
<body>
  ${capturedUrls.map((u) => `<div class="label-raster-page"><img src="${u}" /></div>`).join("\n")}
</body>
</html>`;
            fs.writeFileSync(tempFilePath, labelRasterHtml, "utf8");
            await printWin.loadFile(tempFilePath);
            await new Promise((r) => setTimeout(r, 80));
          }
        } catch (labelRasterErr) {
          console.warn("[Windows POS] Label raster conversion error:", labelRasterErr);
          try { printWin.webContents.setZoomFactor(1.0); } catch (_) {}
        }
      }

      let measuredReceiptHeightMm = null;
      if (!isThermalLabel && !isA4) {
        try {
          printWin.webContents.setZoomFactor(1.0);
          await new Promise((r) => setTimeout(r, 60));
          const dims = await printWin.webContents.executeJavaScript(`
            (function() {
              const wrap = document.querySelector('.receipt-wrap') || document.body;
              const r = wrap.getBoundingClientRect();
              const w = Math.ceil(r.width || wrap.offsetWidth || 280);
              const h = Math.ceil(r.height || wrap.scrollHeight || wrap.offsetHeight || 360);
              return {
                x: Math.max(0, Math.floor(r.left)),
                y: Math.max(0, Math.floor(r.top)),
                width: Math.max(60, w),
                height: Math.max(40, h),
              };
            })()
          `);
          if (dims && dims.width > 0 && dims.height > 0) {
            printWin.setContentSize(Math.max(dims.width + 30, 360), Math.max(dims.height + 30, 480));
            await new Promise((r) => setTimeout(r, 80));
            const img = await printWin.webContents.capturePage({
              x: dims.x,
              y: dims.y,
              width: dims.width,
              height: dims.height,
            });
            const imgDataUrl = img.toDataURL();
            measuredReceiptHeightMm = Math.max(30, Math.ceil(dims.height * 0.264583) + 4);
            const rollH = userHeightMm ? `${userHeightMm}mm` : `${measuredReceiptHeightMm}mm`;
            const rasterHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @page { size: ${widthMm}mm ${rollH} !important; margin: 0mm !important; }
    html, body { margin: 0 !important; padding: 0 !important; background: #ffffff !important; width: ${printableWidthMm}mm !important; max-width: ${printableWidthMm}mm !important; overflow: hidden !important; }
    img { width: ${printableWidthMm}mm !important; max-width: 100% !important; height: auto !important; display: block !important; margin: 0 !important; image-rendering: -webkit-optimize-contrast; }
  </style>
</head>
<body>
  <img src="${imgDataUrl}" />
</body>
</html>`;
            fs.writeFileSync(tempFilePath, rasterHtml, "utf8");
            await printWin.loadFile(tempFilePath);
            await new Promise((r) => setTimeout(r, 80));
          }
        } catch (rasterErr) {
          console.warn("[Windows POS] Raster image conversion error:", rasterErr);
          try { printWin.webContents.setZoomFactor(1.0); } catch (_) {}
        }
      }

      const printConfig = {
        silent: useSilent,
        printBackground: true,
        copies,
        scaleFactor: 100,
        landscape: false,
        margins: {
          marginType: "none",
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
        },
        headerFooter: false,
      };

      if (isA4) {
        printConfig.pageSize = "A4";
      } else if (isThermalLabel) {
        const stickerH = Math.max(10, Number(userHeightMm) || 25);
        const stickerW = Math.max(12, Number(widthMm) || 38);
        printConfig.pageSize = {
          width: Math.round(stickerW * 1000),
          height: Math.round(stickerH * 1000),
        };
      } else {
        const rollW = Math.max(20, Math.min(100, Number(widthMm) || 80));
        const rollH = userHeightMm ? Number(userHeightMm) : (measuredReceiptHeightMm || 80);
        printConfig.pageSize = {
          width: Math.round(rollW * 1000),
          height: Math.round(rollH * 1000),
        };
      }

      if (useSilent && targetPrinter) {
        printConfig.deviceName = targetPrinter;
      }

      const runPrintWithFallback = (cfg, allowSizeFallback) => {
        printWin.webContents.print(cfg, (success, failureReason) => {
          try {
            if (success) {
              console.log(
                `[Windows POS] ${isLabel ? "Labels" : "Receipt"} printed (${useSilent ? "SILENT" : "DIALOG"}) to: ${targetPrinter || "Windows Printer"} [Size: ${widthMm}mm x ${heightLabel}]`
              );
              finishOnce({ success: true, printer: targetPrinter, silent: useSilent });
              return;
            }
            const reasonStr = String(failureReason || "");
            if (
              allowSizeFallback &&
              cfg.pageSize &&
              typeof cfg.pageSize === "object" &&
              /size|page|invalid|parameter/i.test(reasonStr)
            ) {
              console.warn(`[Windows POS] Custom sticker pageSize rejected by driver (${reasonStr}); retrying with CSS @page size...`);
              const retryCfg = { ...cfg };
              delete retryCfg.pageSize;
              runPrintWithFallback(retryCfg, false);
              return;
            }
            console.warn(`[Windows POS] Print cancelled or failed: ${failureReason}`);
            finishOnce({ success: false, error: failureReason || "Print cancelled" });
          } catch (cbErr) {
            console.error("[Windows POS] Print callback warning:", cbErr);
            finishOnce({ success: Boolean(success), printer: targetPrinter, silent: useSilent });
          }
        });
      };

      runPrintWithFallback(printConfig, isThermalLabel);
    } catch (e) {
      finishOnce({ success: false, error: e.message });
    }
  });
}

ipcMain.handle("pos:print-silent", async (event, options = {}) => {
  const { html, printerName, silent, margins, copies, scaleFactor, pageSize, paperWidthMm, paperHeightMm, isLabel } = options;
  if (!html) return { success: false, error: "Empty HTML" };
  return await performSilentPrint(html, printerName, {
    silent,
    margins,
    copies,
    scaleFactor,
    pageSize,
    paperWidthMm,
    paperHeightMm,
    isLabel,
  });
});

// 8. Open cash drawer via raw ESC/POS WinSpool pulse
ipcMain.handle("pos:open-cash-drawer", async (event, { printerName } = {}) => {
  return await openWindowsCashDrawer(printerName);
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
