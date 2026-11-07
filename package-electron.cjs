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

console.log("[Electron Packager] Starting standalone Windows package creation in Classic-World/software...");

if (!fs.existsSync(electronDistDir)) {
  console.error("[Electron Packager] ERROR: electron/dist not found!");
  process.exit(1);
}

// 0. Remove legacy dist-electron folder to save disk space
if (fs.existsSync(oldDistDir)) {
  fs.rmSync(oldDistDir, { recursive: true, force: true });
}

// 1. Ensure destination directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// 2. Copy all electron dist files if missing
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
        if (!fs.existsSync(destPath)) {
          fs.copyFileSync(srcPath, destPath);
        }
      } catch (_) {}
    }
  }
}

console.log("[Electron Packager] Verifying Electron Windows binaries...");
copyDir(electronDistDir, outputDir);

// 3. Rename electron.exe to ClassicWorld-POS.exe
const defaultExe = path.join(outputDir, "electron.exe");
const targetExe = path.join(outputDir, "ClassicWorld-POS.exe");
if (fs.existsSync(defaultExe)) {
  try {
    if (fs.existsSync(targetExe)) {
      fs.unlinkSync(defaultExe);
    } else {
      fs.renameSync(defaultExe, targetExe);
      console.log("[Electron Packager] Renamed electron.exe -> ClassicWorld-POS.exe");
    }
  } catch (_) {}
}

// 4. Create resources/app
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

const electronFiles = ["main.cjs", "preload.cjs", "pos-bridge.cjs", "error.html"];
for (const file of electronFiles) {
  const src = path.join(rootDir, "electron", file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(resourcesAppDir, "electron", file));
  }
}

if (fs.existsSync(path.join(rootDir, "public", "logo.png"))) {
  fs.mkdirSync(path.join(resourcesAppDir, "public"), { recursive: true });
  fs.copyFileSync(
    path.join(rootDir, "public", "logo.png"),
    path.join(resourcesAppDir, "public", "logo.png")
  );
}

console.log("[Electron Packager] SUCCESS: Standalone Windows POS app packaged at:");
console.log(`  ${outputDir}\\ClassicWorld-POS.exe`);
