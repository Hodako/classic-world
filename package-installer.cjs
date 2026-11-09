const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const projectDir = path.resolve(__dirname);
const appName = "Classic World";
const exeName = "ClassicWorld-POS.exe";
const softwareDir = path.join(projectDir, "software");
const publicDir = path.join(projectDir, "public");
const sfxModule = "C:\\Users\\Windows\\scoop\\apps\\7zip\\26.00\\7z.sfx";

console.log("[Packager] Preparing shortcut installer script...");
const shortcutScript = `@echo off
setlocal
set APP_DIR=%~dp0
set EXE_PATH=%APP_DIR%${exeName}

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell; " ^
  "$desktop = [Environment]::GetFolderPath('Desktop'); " ^
  "$s1 = $ws.CreateShortcut(\\"$desktop\\${appName}.lnk\\"); " ^
  "$s1.TargetPath = \\"%EXE_PATH%\\"; " ^
  "$s1.WorkingDirectory = \\"%APP_DIR%\\"; " ^
  "$s1.IconLocation = \\"%EXE_PATH%,0\\"; " ^
  "$s1.Save(); " ^
  "$programs = [Environment]::GetFolderPath('Programs'); " ^
  "$s2 = $ws.CreateShortcut(\\"$programs\\${appName}.lnk\\"); " ^
  "$s2.TargetPath = \\"%EXE_PATH%\\"; " ^
  "$s2.WorkingDirectory = \\"%APP_DIR%\\"; " ^
  "$s2.IconLocation = \\"%EXE_PATH%,0\\"; " ^
  "$s2.Save();"

start "" "%EXE_PATH%"
exit
`;
fs.writeFileSync(path.join(softwareDir, "create-shortcuts.cmd"), shortcutScript, "utf8");

const sfxConfig = `;!@Install@!UTF-8!
Title="${appName} POS Setup"
BeginPrompt="Install ${appName} POS on your computer?"
Progress="yes"
InstallPath="%%LOCALAPPDATA%%\\\\Programs\\\\ClassicWorld"
RunProgram="create-shortcuts.cmd"
;!@InstallEnd@!
`;
const configPath = path.join(projectDir, "_sfx_config.txt");
fs.writeFileSync(configPath, sfxConfig, "utf8");

console.log("[Packager] Compressing Classic-World software into 7z archive...");
const archive7z = path.join(projectDir, "_package_temp.7z");
if (fs.existsSync(archive7z)) fs.unlinkSync(archive7z);

execSync(`7z a -t7z -mx=5 "${archive7z}" "${softwareDir}\\*" -x!*-Setup.exe -x!*.zip`, { stdio: "inherit" });

const setupExeName = "ClassicWorld-POS-Setup.exe";
const setupExePath = path.join(softwareDir, setupExeName);

console.log(`[Packager] Creating single-file installer binary: ${setupExeName}...`);
const sfxBuf = fs.readFileSync(sfxModule);
const cfgBuf = fs.readFileSync(configPath);
const archiveBuf = fs.readFileSync(archive7z);
fs.writeFileSync(setupExePath, Buffer.concat([sfxBuf, cfgBuf, archiveBuf]));

if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
if (fs.existsSync(archive7z)) fs.unlinkSync(archive7z);

const zipName = "ClassicWorld-POS-win-x64.zip";
const zipPath = path.join(softwareDir, zipName);
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

console.log(`[Packager] Creating portable zip: ${zipName}...`);
execSync(`7z a -tzip -mx=5 "${zipPath}" "${softwareDir}\\*" -x!*.zip`, { stdio: "inherit" });

// Copy to downloads/ for file server & tunnel
const downloadsDir = path.resolve(__dirname, "..", "downloads");
if (fs.existsSync(downloadsDir)) {
  fs.copyFileSync(setupExePath, path.join(downloadsDir, setupExeName));
  fs.copyFileSync(setupExePath, path.join(downloadsDir, "ClassicWorld-POS.exe"));
  fs.copyFileSync(zipPath, path.join(downloadsDir, zipName));
  console.log(`[Packager] Copied to ${downloadsDir}`);
  // Clean up software directory copy of zip to save disk space
  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
}

console.log(`[Packager] SUCCESS! Single-file installer ready at:`);
console.log(`  ${setupExePath}`);
console.log(`  Size: ${(fs.statSync(setupExePath).size / (1024 * 1024)).toFixed(2)} MB`);
