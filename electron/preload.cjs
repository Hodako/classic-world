const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronPOS", {
  isDesktopApp: true,
  // 1-Click Silent Print or Dialog Print directly to selected/default Windows thermal/POS printer
  printSilent: (options) => ipcRenderer.invoke("pos:print-silent", options),
  // List all connected Windows printers
  getPrinters: () => ipcRenderer.invoke("pos:get-printers"),
  // Get default Windows printer
  getDefaultPrinter: () => ipcRenderer.invoke("pos:get-default-printer"),
  // Set real Windows OS default printer
  setDefaultPrinter: (printerName) => ipcRenderer.invoke("pos:set-default-printer", { printerName }),
  // Open real Windows OS Printing Preferences dialog for a printer
  openPrinterPreferences: (printerName) => ipcRenderer.invoke("pos:open-printer-preferences", { printerName }),
  // Open real Windows OS Printer Properties dialog for a printer
  openPrinterProperties: (printerName) => ipcRenderer.invoke("pos:open-printer-properties", { printerName }),
  // Open Windows OS Printers & Scanners Settings
  openWindowsPrinterSettings: () => ipcRenderer.invoke("pos:open-windows-printers-settings"),
  // Trigger cash drawer kick via ESC/POS
  openCashDrawer: (printerName) => ipcRenderer.invoke("pos:open-cash-drawer", { printerName }),
});
