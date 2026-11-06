const fs = require("fs");
const path = require("path");

const filePath = path.join(__dirname, "..", "src", "app", "whois2uperadmin", "page.tsx");
let content = fs.readFileSync(filePath, "utf8");

// Normalize line endings to LF temporarily for matching
const hadCRLF = content.includes("\r\n");
content = content.replace(/\r\n/g, "\n");

// 1. Add imports
const importTarget = `  Plus,
  Radio,
} from "lucide-react";
import { SpeedLoader } from "@/components/speed-loader";
import { fmtDateTime } from "@/lib/format";`;

const importReplacement = `  Plus,
  Radio,
  Menu,
  FolderTree,
} from "lucide-react";
import { SpeedLoader } from "@/components/speed-loader";
import { fmtDateTime } from "@/lib/format";
import { AdminBlogsManager } from "@/components/admin-blogs-manager";
import { AdminMenusManager } from "@/components/admin-menus-manager";
import { AdminDivisionsManager } from "@/components/admin-divisions-manager";
import { AdminSettingsManager } from "@/components/admin-settings-manager";`;

if (content.includes(importTarget)) {
  content = content.replace(importTarget, importReplacement);
  console.log("Imports replaced successfully.");
} else {
  console.error("Import target not found!");
}

// 2. Update activeTab state definition
const tabStateTarget = `const [activeTab, setActiveTab] = useState<"feed" | "businesses" | "users" | "licenses" | "recycle_bin" | "sms_gateway" | "settings">("feed");`;
const tabStateReplacement = `const [activeTab, setActiveTab] = useState<"feed" | "businesses" | "users" | "blogs" | "menus" | "divisions" | "licenses" | "recycle_bin" | "sms_gateway" | "settings">("feed");`;

if (content.includes(tabStateTarget)) {
  content = content.replace(tabStateTarget, tabStateReplacement);
  console.log("activeTab state updated successfully.");
} else {
  console.error("tabStateTarget not found!");
}

// 3. Add Tab Buttons
const tabButtonsTarget = `            <button
              onClick={() => setActiveTab("users")}
              className={\`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center shrink-0 \${
                activeTab === "users" ? "bg-card text-foreground shadow-xs border border-border/60" : "text-muted-foreground hover:text-foreground"
              }\`}
            >
              <Users className="size-3.5 inline mr-1.5 text-indigo-500" />
              Users ({filteredUsers.length})
            </button>`;

const tabButtonsReplacement = `            <button
              onClick={() => setActiveTab("users")}
              className={\`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center shrink-0 \${
                activeTab === "users" ? "bg-card text-foreground shadow-xs border border-border/60" : "text-muted-foreground hover:text-foreground"
              }\`}
            >
              <Users className="size-3.5 inline mr-1.5 text-indigo-500" />
              Users ({filteredUsers.length})
            </button>
            <button
              onClick={() => setActiveTab("blogs")}
              className={\`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center shrink-0 \${
                activeTab === "blogs" ? "bg-card text-foreground shadow-xs border border-border/60" : "text-muted-foreground hover:text-foreground"
              }\`}
            >
              <MessageSquare className="size-3.5 inline mr-1.5 text-pink-500" />
              ব্লগ ও প্রশ্নোত্তর (Quora Blog)
            </button>
            <button
              onClick={() => setActiveTab("menus")}
              className={\`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center shrink-0 \${
                activeTab === "menus" ? "bg-card text-foreground shadow-xs border border-border/60" : "text-muted-foreground hover:text-foreground"
              }\`}
            >
              <Menu className="size-3.5 inline mr-1.5 text-emerald-500" />
              মেনু ম্যানেজার (Menus)
            </button>
            <button
              onClick={() => setActiveTab("divisions")}
              className={\`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center shrink-0 \${
                activeTab === "divisions" ? "bg-card text-foreground shadow-xs border border-border/60" : "text-muted-foreground hover:text-foreground"
              }\`}
            >
              <FolderTree className="size-3.5 inline mr-1.5 text-orange-500" />
              বিভাগ ও স্পেস (Divisions)
            </button>`;

if (content.includes(tabButtonsTarget)) {
  content = content.replace(tabButtonsTarget, tabButtonsReplacement);
  console.log("Tab buttons added successfully.");
} else {
  console.error("tabButtonsTarget not found!");
}

// 4. Add Tab Contents and replace Settings tab content
const settingsTabTarget = `        {/* ─── TAB 5: ADMIN SETTINGS ─────────────────────────────────── */}
        {activeTab === "settings" && (
          <div className="max-w-xl mx-auto space-y-6">
            <Card className="p-6 rounded-2xl bg-card border-border/80 shadow-xs space-y-4">
              <div className="space-y-1">
                <h3 className="text-base font-bold flex items-center gap-2">
                  <Lock className="size-5 text-primary" />
                  Change Super Administrator Password
                </h3>
                <p className="text-xs text-muted-foreground">
                  Update the master password used to access this console.
                </p>
              </div>

              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Current Password</Label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={superAdminCurrentPass}
                    onChange={(e) => setSuperAdminCurrentPass(e.target.value)}
                    className="rounded-xl text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">New Master Password</Label>
                  <Input
                    type="password"
                    placeholder="Minimum 6 characters"
                    value={superAdminNewPass}
                    onChange={(e) => setSuperAdminNewPass(e.target.value)}
                    className="rounded-xl text-xs"
                  />
                </div>

                <Button
                  onClick={async () => {
                    if (!superAdminNewPass || superAdminNewPass.length < 6) {
                      toast.error("Password must be at least 6 characters");
                      return;
                    }
                    setSuperAdminPassBusy(true);
                    try {
                      await changeSuperAdminPasswordFn({
                        data: {
                          currentPassword: superAdminCurrentPass,
                          newPassword: superAdminNewPass,
                        },
                      });
                      toast.success("Master password updated successfully!");
                      setSuperAdminCurrentPass("");
                      setSuperAdminNewPass("");
                    } catch (err: any) {
                      toast.error(err.message || "Failed to update password");
                    } finally {
                      setSuperAdminPassBusy(false);
                    }
                  }}
                  disabled={superAdminPassBusy}
                  className="w-full rounded-xl beveled-button"
                >
                  {superAdminPassBusy ? "Updating..." : "Update Master Password"}
                </Button>
              </div>
            </Card>
          </div>
        )}`;

const settingsTabReplacement = `        {/* ─── TAB: QUORA BLOG & QA EDITOR ─────────────────────────────── */}
        {activeTab === "blogs" && (
          <div className="animate-in fade-in duration-200">
            <AdminBlogsManager />
          </div>
        )}

        {/* ─── TAB: MENUS MANAGER ───────────────────────────────────────── */}
        {activeTab === "menus" && (
          <div className="animate-in fade-in duration-200">
            <AdminMenusManager />
          </div>
        )}

        {/* ─── TAB: DIVISIONS & SPACES ──────────────────────────────────── */}
        {activeTab === "divisions" && (
          <div className="animate-in fade-in duration-200">
            <AdminDivisionsManager />
          </div>
        )}

        {/* ─── TAB: ADMIN & STORE SETTINGS ─────────────────────────────── */}
        {activeTab === "settings" && (
          <div className="animate-in fade-in duration-200">
            <AdminSettingsManager />
          </div>
        )}`;

if (content.includes(settingsTabTarget)) {
  content = content.replace(settingsTabTarget, settingsTabReplacement);
  console.log("Tab contents added and settings replaced successfully.");
} else {
  console.error("settingsTabTarget not found!");
}

// Write back with CRLF if original had it
if (hadCRLF) {
  content = content.replace(/\n/g, "\r\n");
}
fs.writeFileSync(filePath, content, "utf8");
console.log("File written successfully!");
