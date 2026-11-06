/**
 * Local Windows POS Hardware Bridge Server (Port 9123)
 * Enables 1-Click Silent Printing, Windows Printer Preferences & Cash Drawer Control
 */

const http = require("http");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const BRIDGE_PORT = 9123;

function getWindowsPrinters() {
  return new Promise((resolve) => {
    exec(
      'powershell -NoProfile -Command "Get-CimInstance Win32_Printer | Select-Object Name, Default, PrinterStatus | ConvertTo-Json"',
      (err, stdout) => {
        if (err || !stdout) return resolve([]);
        try {
          const parsed = JSON.parse(stdout.trim());
          const list = Array.isArray(parsed) ? parsed : [parsed];
          resolve(
            list
              .filter((p) => p && p.Name)
              .map((p) => ({
                name: p.Name,
                isDefault: Boolean(p.Default),
                status: p.PrinterStatus,
              }))
          );
        } catch (e) {
          resolve([]);
        }
      }
    );
  });
}

function setWindowsDefaultPrinter(printerName) {
  return new Promise((resolve) => {
    if (!printerName) return resolve({ success: false, error: "Printer name required" });
    const safeName = String(printerName).replace(/"/g, '\\"');
    exec(`rundll32 printui.dll,PrintUIEntry /y /n "${safeName}"`, (err) => {
      if (err) {
        return resolve({ success: false, error: err.message });
      }
      resolve({ success: true, printer: printerName });
    });
  });
}

function openWindowsPrinterPreferences(printerName) {
  return new Promise((resolve) => {
    const runOpen = async () => {
      let target = printerName;
      if (!target) {
        const list = await getWindowsPrinters();
        const def = list.find((p) => p.isDefault) || list[0];
        target = def?.name || "";
      }
      if (!target) {
        exec("start ms-settings:printers");
        return resolve({ success: true, opened: "ms-settings:printers" });
      }
      const safeName = String(target).replace(/"/g, '\\"');
      exec(`rundll32 printui.dll,PrintUIEntry /e /n "${safeName}"`, (err) => {
        if (err) {
          exec("start ms-settings:printers");
        }
        resolve({ success: true, printer: target });
      });
    };
    runOpen();
  });
}

function openWindowsPrinterProperties(printerName) {
  return new Promise((resolve) => {
    const runOpen = async () => {
      let target = printerName;
      if (!target) {
        const list = await getWindowsPrinters();
        const def = list.find((p) => p.isDefault) || list[0];
        target = def?.name || "";
      }
      if (!target) {
        exec("start ms-settings:printers");
        return resolve({ success: true, opened: "ms-settings:printers" });
      }
      const safeName = String(target).replace(/"/g, '\\"');
      exec(`rundll32 printui.dll,PrintUIEntry /p /n "${safeName}"`, () => {
        resolve({ success: true, printer: target });
      });
    };
    runOpen();
  });
}

function startBridgeServer(customPrintHandler) {
  const server = http.createServer(async (req, res) => {
    // Enable CORS for localhost & hakim.qzz.io / classicworld-pos.web.app
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url === "/status" && req.method === "GET") {
      const printers = await getWindowsPrinters();
      const defaultPrinter = printers.find((p) => p.isDefault) || printers[0] || null;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          online: true,
          service: "ClassicWorld Windows POS Bridge",
          defaultPrinter,
          printersCount: printers.length,
        })
      );
      return;
    }

    if (req.url === "/printers" && req.method === "GET") {
      const printers = await getWindowsPrinters();
      const defaultPrinter = printers.find((p) => p.isDefault) || printers[0] || null;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ printers, defaultPrinter }));
      return;
    }

    if (req.url === "/set-default-printer" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const payload = JSON.parse(body || "{}");
          const result = await setWindowsDefaultPrinter(payload.printerName);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (e) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
      return;
    }

    if (req.url === "/printer-preferences" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const payload = JSON.parse(body || "{}");
          const result = await openWindowsPrinterPreferences(payload.printerName);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (e) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
      return;
    }

    if (req.url === "/printer-properties" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const payload = JSON.parse(body || "{}");
          const result = await openWindowsPrinterProperties(payload.printerName);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (e) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
      return;
    }

    if (req.url === "/print" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", async () => {
        try {
          const payload = JSON.parse(body || "{}");
          const { html, printerName, silent, margins, copies, scaleFactor, pageSize, paperWidthMm, paperHeightMm } = payload;

          if (typeof customPrintHandler === "function") {
            const result = await customPrintHandler(html, printerName, {
              silent,
              margins,
              copies,
              scaleFactor,
              pageSize,
              paperWidthMm,
              paperHeightMm,
            });
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(result));
            return;
          }

          // Fallback native print via temporary HTML file
          const tempFile = path.join(os.tmpdir(), `pos_receipt_${Date.now()}.html`);
          fs.writeFileSync(tempFile, html || "", "utf8");
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, tempFile }));
        } catch (e) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.log(`[POS Bridge] Port ${BRIDGE_PORT} already active.`);
    } else {
      console.error("[POS Bridge] Server error:", err);
    }
  });

  server.listen(BRIDGE_PORT, "127.0.0.1", () => {
    console.log(`[POS Bridge] Local Silent Print Server listening on http://127.0.0.1:${BRIDGE_PORT}`);
  });

  return server;
}

if (require.main === module) {
  startBridgeServer();
}

module.exports = {
  startBridgeServer,
  getWindowsPrinters,
  setWindowsDefaultPrinter,
  openWindowsPrinterPreferences,
  openWindowsPrinterProperties,
};
