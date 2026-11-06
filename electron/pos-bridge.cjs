/**
 * DreamFashion Windows POS Bridge Server
 * Runs a lightweight local HTTP daemon on 127.0.0.1:9123
 * Allows 1-Click Silent Printing directly to the Windows default printer
 * from both the Electron Desktop App and regular Windows browsers (Chrome/Edge).
 */

const http = require("http");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const PORT = 9123;
const HOST = "127.0.0.1";

// Helper to get Windows printers via PowerShell
function getWindowsPrinters() {
  return new Promise((resolve) => {
    const cmd = `powershell -NoProfile -Command "Get-CimInstance Win32_Printer | Select-Object Name, Default, PrinterStatus, PortName | ConvertTo-Json"`;
    exec(cmd, { windowsHide: true }, (err, stdout) => {
      if (err || !stdout.trim()) {
        resolve([]);
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        const list = Array.isArray(parsed) ? parsed : [parsed];
        resolve(
          list.map((p) => ({
            name: p.Name,
            isDefault: Boolean(p.Default),
            status: p.PrinterStatus,
            port: p.PortName,
          }))
        );
      } catch (e) {
        resolve([]);
      }
    });
  });
}

// Print HTML directly to Windows printer using invisible Edge/rundll32 or PDF print
function printHtmlWindows(html, printerName) {
  return new Promise(async (resolve, reject) => {
    try {
      const tempHtmlPath = path.join(os.tmpdir(), `receipt_${Date.now()}.html`);
      fs.writeFileSync(tempHtmlPath, html, "utf8");

      // Use PowerShell to execute default print command
      const printerArg = printerName ? `-PrinterName "${printerName}"` : "";
      const psScript = `
        $printer = "${printerName || ""}";
        if (-not $printer) {
          $printer = (Get-CimInstance Win32_Printer | Where-Object { $_.Default -eq $true }).Name;
        }
        Start-Process -FilePath "msedge.exe" -ArgumentList "--headless", "--disable-gpu", "--print-to-pdf-no-header", "--print-to-printer", "--printer-name='$printer'", "${tempHtmlPath}" -Wait -NoNewWindow;
      `;

      exec(`powershell -NoProfile -Command "${psScript.replace(/\r?\n/g, " ")}"`, { windowsHide: true }, (err) => {
        // Clean up temp file after brief delay
        setTimeout(() => {
          try { fs.unlinkSync(tempHtmlPath); } catch (_) {}
        }, 3000);

        if (err) {
          resolve({ success: false, error: err.message });
        } else {
          resolve({ success: true, printer: printerName || "Default" });
        }
      });
    } catch (e) {
      resolve({ success: false, error: e.message });
    }
  });
}

function startBridgeServer(customPrintHandler) {
  const server = http.createServer(async (req, res) => {
    // Enable CORS for localhost / web app
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${HOST}:${PORT}`);

    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", service: "DreamFashion POS Bridge", platform: process.platform }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/printers") {
      const printers = await getWindowsPrinters();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ printers, defaultPrinter: printers.find((p) => p.isDefault) || null }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/print") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const { html, printerName } = JSON.parse(body || "{}");
          if (!html) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: "Missing receipt html" }));
            return;
          }

          let result;
          if (customPrintHandler) {
            result = await customPrintHandler(html, printerName);
          } else {
            result = await printHtmlWindows(html, printerName);
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (e) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Endpoint not found" }));
  });

  server.listen(PORT, HOST, () => {
    console.log(`[POS Bridge] Running on http://${HOST}:${PORT} for 1-Click Silent Thermal Printing`);
  });

  return server;
}

if (require.main === module) {
  startBridgeServer();
}

module.exports = { startBridgeServer, getWindowsPrinters, printHtmlWindows };
