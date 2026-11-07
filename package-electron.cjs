/**
 * Packager script to produce standalone Windows Desktop POS Executable / Package
 * Builds self-contained ClassicWorld-POS-win-x64
 */

const fs = require("fs");
const path = require("path");

const rootDir = __dirname;
const localElectron = path.join(rootDir, "node_modules", "electron", "dist");
const parentElectron = path.join(rootDir, "..", "node_modules", "electron", "dist");
const electronDistDir = fs.existsSync(localElectron) ? localElectron : parentElectron;
const oldDistDir = path.join(rootDir, "dist-electron");
const outputDir = path.join(rootDir, "software");
const resourcesAppDir = path.join(outputDir, "resources", "app");

console.log("[Electron Packager] Starting fresh standalone Windows package creation in Classic-World/software...");

if (!fs.existsSync(electronDistDir)) {
  console.error("[Electron Packager] ERROR: electron/dist not found!");
  process.exit(1);
}

// 0. Completely remove old dist-electron and software folders for a clean build
if (fs.existsSync(oldDistDir)) {
  console.log("[Electron Packager] Removing legacy dist-electron...");
  fs.rmSync(oldDistDir, { recursive: true, force: true });
}
if (fs.existsSync(outputDir)) {
  console.log("[Electron Packager] Removing old software directory for clean rebuild...");
  fs.rmSync(outputDir, { recursive: true, force: true });
}

// 1. Create fresh output directory
fs.mkdirSync(outputDir, { recursive: true });

// 2. Copy all electron dist files fresh
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      try {
        fs.copyFileSync(srcPath, destPath);
      } catch (err) {
        console.warn(`[Electron Packager] Warning copying ${entry.name}:`, err.message);
      }
    }
  }
}

console.log("[Electron Packager] Copying fresh Electron Windows binaries...");
copyDir(electronDistDir, outputDir);

// 3. Rename electron.exe to ClassicWorld-POS.exe
const defaultExe = path.join(outputDir, "electron.exe");
const targetExe = path.join(outputDir, "ClassicWorld-POS.exe");
if (fs.existsSync(defaultExe)) {
  try {
    fs.renameSync(defaultExe, targetExe);
    console.log("[Electron Packager] Renamed electron.exe -> ClassicWorld-POS.exe");
  } catch (err) {
    console.error("[Electron Packager] Failed to rename executable:", err);
  }
}

// 4. Create fresh resources/app
fs.mkdirSync(resourcesAppDir, { recursive: true });
fs.mkdirSync(path.join(resourcesAppDir, "electron"), { recursive: true });

const embeddedPackageJson = {
  name: "classicworld-pos",
  version: "2.2.0",
  main: "electron/main.cjs",
  description: "Classic World Ultimate Windows POS Terminal",
};
fs.writeFileSync(
  path.join(resourcesAppDir, "package.json"),
  JSON.stringify(embeddedPackageJson, null, 2),
  "utf8"
);

// Copy updated electron scripts
const electronFiles = ["main.cjs", "preload.cjs", "pos-bridge.cjs", "error.html"];
for (const file of electronFiles) {
  const src = path.join(rootDir, "electron", file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(resourcesAppDir, "electron", file));
  }
}

// Copy public assets if available
if (fs.existsSync(path.join(rootDir, "public"))) {
  copyDir(path.join(rootDir, "public"), path.join(resourcesAppDir, "public"));
}

// Copy static export out if available
const outDir = path.join(rootDir, "out");
if (fs.existsSync(outDir)) {
  console.log("[Electron Packager] Bundling latest out/ into resources/app/out for offline support...");
  copyDir(outDir, path.join(resourcesAppDir, "out"));
}

console.log("[Electron Packager] SUCCESS: Brand new Standalone Windows POS app packaged at:");
console.log(`  ${targetExe}`);
