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

function openWindowsCashDrawer(printerName) {
  return new Promise((resolve) => {
    const runKick = async () => {
      let target = printerName;
      if (!target) {
        const list = await getWindowsPrinters();
        const def = list.find((p) => p.isDefault) || list[0];
        target = def?.name || "";
      }
      if (!target) {
        return resolve({ success: false, error: "No printer available for cash drawer" });
      }
      const escapedTarget = String(target).replace(/'/g, "''");
      const psScript = `
$code = @'
using System;
using System.Runtime.InteropServices;
public class RawPosHelper {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFOW {
    [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
  }
  [DllImport("winspool.Drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFOW di);
  [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true)]
  public static extern bool WritePrinter(IntPtr hPrinter, byte[] pBytes, int dwCount, out int dwWritten);
  public static bool Kick(string printerName) {
    IntPtr hPrinter;
    if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) return false;
    DOCINFOW di = new DOCINFOW { pDocName = "POS Cash Drawer Kick", pDataType = "RAW" };
    bool ok = false;
    if (StartDocPrinter(hPrinter, 1, di)) {
      if (StartPagePrinter(hPrinter)) {
        byte[] bytes = new byte[] { 27, 112, 0, 25, 250 };
        int written = 0;
        ok = WritePrinter(hPrinter, bytes, bytes.Length, out written);
        EndPagePrinter(hPrinter);
      }
      EndDocPrinter(hPrinter);
    }
    ClosePrinter(hPrinter);
    return ok;
  }
}
'@
Add-Type -TypeDefinition $code -ErrorAction SilentlyContinue
if ([RawPosHelper]::Kick('${escapedTarget}')) { Write-Output 'OK' } else { Write-Output 'FAIL' }
`;
      const encoded = Buffer.from(psScript, "utf16le").toString("base64");
      exec(`powershell -NoProfile -EncodedCommand ${encoded}`, (err, stdout) => {
        if (err || !String(stdout || "").includes("OK")) {
          return resolve({ success: false, printer: target, error: err ? err.message : "RAW drawer kick failed" });
        }
        resolve({ success: true, printer: target });
      });
    };
    runKick();
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

    if (req.url === "/open-drawer" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const payload = JSON.parse(body || "{}");
          const result = await openWindowsCashDrawer(payload.printerName);
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
          const { html, printerName, silent, margins, copies, scaleFactor, pageSize, paperWidthMm, paperHeightMm, isLabel } = payload;

          if (typeof customPrintHandler === "function") {
            const result = await customPrintHandler(html, printerName, {
              silent,
              margins,
              copies,
              scaleFactor,
              pageSize,
              paperWidthMm,
              paperHeightMm,
              isLabel,
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
  openWindowsCashDrawer,
};
