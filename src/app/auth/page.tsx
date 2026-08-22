"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppLogo } from "@/components/app-logo";
import { SpeedLoader } from "@/components/speed-loader";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { loginFn, registerFn } from "@/lib/rpc";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "@/lib/firebase";
import type { AuthUser } from "@/hooks/use-auth";

export default function AuthPage() {
  const { user, loading, login } = useAuth();
  const { t, lang, setLang } = useT();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<"signin" | "signup">("signin");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !loading) {
      if (user?.activated) {
        router.replace("/dashboard");
      } else if (user && !user.activated) {
        router.replace("/activate");
      }
    }
  }, [user, loading, router, mounted]);

  if (!mounted || loading || user) return <SpeedLoader />;

  function afterAuth(u: AuthUser | null) {
    if (!u) return;
    login(u);
    router.replace(u.activated ? "/dashboard" : "/activate");
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await loginFn({ data: { email, password } });
      afterAuth(data.user as AuthUser);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const data = await registerFn({ data: { email, password, fullName } });
      toast.success(lang === "bn" ? "একাউন্ট তৈরি — লাইসেন্স দিয়ে সক্রিয় করুন" : "Account created — activate with license");
      afterAuth(data.user as AuthUser);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    setBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const res = await signInWithPopup(auth, provider);
      const fbUser = res.user;
      const gEmail = (fbUser.email || "").trim().toLowerCase();

      let existingProfile: any = null;
      if (typeof window !== "undefined") {
        const stored = window.localStorage.getItem("classicworld_auth_profile") || window.localStorage.getItem("hz-auth-profile");
        if (stored) {
          try {
            existingProfile = JSON.parse(stored);
          } catch (_) {}
        }
      }

      const authUser: AuthUser = {
        id: fbUser.uid || existingProfile?.id || "cw_" + Date.now(),
        email: gEmail,
        full_name: fbUser.displayName || existingProfile?.full_name || gEmail.split("@")[0] || "Classic World User",
        business_name: "Classic World",
        role: existingProfile?.role || "owner",
        activated: true,
        license_key: existingProfile?.license_key || "HZ-GOOGLE-AUTH",
        avatar_url: fbUser.photoURL || undefined,
        logo_url: "/logo.svg",
      };

      if (typeof window !== "undefined") {
        window.localStorage.setItem("classicworld_auth_profile", JSON.stringify(authUser));
        window.localStorage.setItem("hz-auth-profile", JSON.stringify(authUser));
        window.localStorage.setItem("auth_token", "cw_google_" + fbUser.uid);
      }

      toast.success(lang === "bn" ? "গুগল সাইন-ইন সফল হয়েছে!" : "Google sign-in successful!");
      afterAuth(authUser);
    } catch (err: unknown) {
      console.error("Google sign in error:", err);
      const msg = err instanceof Error ? err.message : "Google sign-in failed";
      if (!msg.includes("popup-closed-by-user")) {
        toast.error(msg);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    if (activeTab === "signin") {
      await signIn(e);
    } else {
      await signUp(e);
    }
  }

  return (
    <div className="auth-page fixed inset-0 w-full h-full z-50 overflow-hidden grid grid-cols-1 md:grid-cols-12 select-none">
      {/* Dynamic Scoped Styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        html:has(.auth-page), body:has(.auth-page) {
          overflow: hidden !important;
          height: 100% !important;
          max-height: 100vh !important;
        }
        .auth-page .form {
          display: flex;
          flex-direction: column;
          gap: 5px;
          background-color: #ffffff;
          padding: 18px 22px;
          width: 100%;
          max-width: 420px;
          border-radius: 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
          box-shadow: 0 4px 20px -2px rgba(0,0,0,0.05);
        }
        @media (max-width: 640px) {
          .auth-page .form {
            padding: 14px 12px;
            gap: 4px;
          }
        }
        .dark .auth-page .form {
          background-color: #18181b;
          border: 1px solid #27272a;
          box-shadow: 0 4px 20px -2px rgba(0,0,0,0.35);
        }

        .auth-page ::placeholder {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
        }

        .auth-page .form button {
          align-self: flex-end;
        }

        .auth-page .flex-column > label {
          color: #151717;
          font-weight: 600;
          font-size: 13px;
        }
        .dark .auth-page .flex-column > label {
          color: #e4e4e7;
        }

        .auth-page .inputForm {
          border: 1.5px solid #ecedec;
          border-radius: 10px;
          height: 42px;
          display: flex;
          align-items: center;
          padding-left: 10px;
          transition: 0.2s ease-in-out;
          background-color: #ffffff;
        }
        .dark .auth-page .inputForm {
          border: 1.5px solid #27272a;
          background-color: #09090b;
        }

        .auth-page .input {
          margin-left: 10px;
          border-radius: 10px;
          border: none;
          width: 85%;
          height: 100%;
          font-size: 13px;
          background-color: transparent !important;
          color: #151717 !important;
        }
        .dark .auth-page .input {
          color: #fafafa !important;
        }

        .auth-page .input:focus {
          outline: none;
        }

        .auth-page .inputForm:focus-within {
          border: 1.5px solid #2d79f3;
        }

        .auth-page .flex-row {
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 10px;
          justify-content: space-between;
        }

        .auth-page .flex-row > div > label {
          font-size: 12px;
          color: black;
          font-weight: 400;
        }
        .dark .auth-page .flex-row > div > label {
          color: #a1a1aa;
        }

        .auth-page .span {
          font-size: 12px;
          margin-left: 5px;
          color: #2d79f3;
          font-weight: 500;
          cursor: pointer;
        }
        .auth-page .span:hover {
          text-decoration: underline;
        }

        .auth-page .button-submit {
          margin: 10px 0 4px 0;
          background-color: #151717;
          border: none;
          color: white;
          font-size: 14px;
          font-weight: 600;
          border-radius: 10px;
          height: 42px;
          width: 100%;
          cursor: pointer;
          transition: background-color 0.2s ease-in-out;
        }
        .auth-page .button-submit:hover {
          background-color: #252727;
        }
        .dark .auth-page .button-submit {
          background-color: #fafafa;
          color: #18181b;
        }
        .dark .auth-page .button-submit:hover {
          background-color: #e4e4e7;
        }

        .auth-page .p {
          text-align: center;
          color: black;
          font-size: 12px;
          margin: 3px 0;
        }
        .dark .auth-page .p {
          color: #a1a1aa;
        }

        .auth-page .btn {
          margin-top: 6px;
          width: 100%;
          height: 40px;
          border-radius: 10px;
          display: flex;
          justify-content: center;
          align-items: center;
          font-weight: 500;
          font-size: 13px;
          gap: 10px;
          border: 1px solid #ededef;
          background-color: white;
          color: #18181b;
          cursor: pointer;
          transition: 0.2s ease-in-out;
        }
        .dark .auth-page .btn {
          background-color: #18181b;
          border: 1px solid #27272a;
          color: #f4f4f5;
        }

        .auth-page .btn:hover {
          border: 1px solid #2d79f3;
          background-color: #f8fafc;
        }
        .dark .auth-page .btn:hover {
          background-color: #242427;
        }

        .auth-page .inputForm svg {
          fill: #9ca3af;
        }
      ` }} />

      {/* Left panel: Minimalist natural fashion illustration with soft linen backdrop */}
      <div 
        className="hidden md:flex md:col-span-6 lg:col-span-7 relative flex-col justify-between p-8 lg:p-10 text-white select-none overflow-hidden bg-cover bg-center h-full max-h-[100dvh]"
        style={{ backgroundImage: `linear-gradient(rgba(9, 9, 11, 0.72), rgba(9, 9, 11, 0.8)), url('/login_illustration.jpg')` }}
      >
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

        {/* Top brand header */}
        <div className="flex items-center gap-3 relative z-10 shrink-0">
          <AppLogo size="md" alt="HakimQzz" />
          <span className="font-serif text-2xl font-bold tracking-tight bg-gradient-to-r from-emerald-400 to-indigo-300 bg-clip-text text-transparent">HakimQzz</span>
        </div>

        {/* Middle minimalist description */}
        <div className="space-y-4 lg:space-y-5 relative z-10 max-w-lg my-auto">
          <span className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs px-3 py-1 rounded-full font-semibold uppercase tracking-wider">
            {lang === "bn" ? "পোশাক ব্যবসায়ীদের আস্থার প্রতীক" : "Designed for Fashion Retailers"}
          </span>
          <h2 className="text-3xl lg:text-4xl font-bold font-serif leading-tight">
            {lang === "bn" 
              ? `"HakimQzz" ইনভেন্টরি ম্যানেজমেন্ট এবং প্রোডাক্টস সলিউশন`
              : `"HakimQzz" inventory management and products solutions`}
          </h2>
          <p className="text-xs lg:text-sm text-zinc-300 leading-relaxed max-w-md">
            {lang === "bn" 
              ? "স্টক মূল্যায়ন, ক্যাশ ফ্লো, কাস্টম ইনভয়েস এবং বিক্রয় ট্র্যাকিং সহজতর করার এক নির্ভরযোগ্য মাধ্যম।" 
              : "Modern stock valuation, cashbox ledger, custom invoices, and sales profit margin tracking in one simple workspace."}
          </p>
        </div>

        {/* Bottom copyright & developer info footer (PC view) */}
        <div className="space-y-0.5 relative z-10 text-xs text-zinc-400 border-t border-white/10 pt-3 font-balooda shrink-0">
          <p className="text-zinc-200 font-semibold text-xs">
            made with love by <span className="font-bold text-white">Azizul Hakim Khan</span>.
          </p>
          <p className="text-[11px] text-zinc-400">
            @2026 - infinite all rights reserved by <span className="font-bold text-zinc-200">Hakim Qzz</span>.
          </p>
          <p className="text-xs font-mono font-bold text-emerald-400 flex items-center gap-1">
            <span>Whatsapp Number :</span>
            <a href="https://wa.me/8801783501427" target="_blank" rel="noopener noreferrer" className="hover:underline text-emerald-400">+8801783501427</a>
          </p>
        </div>
      </div>

      {/* Right panel: Form input and Language selectors */}
      <div className="col-span-12 md:col-span-6 lg:col-span-5 flex flex-col justify-between p-3 sm:p-5 lg:p-6 bg-slate-50 dark:bg-zinc-950 h-full max-h-[100dvh] overflow-hidden">
        
        {/* Top Row: Language switcher */}
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 md:hidden">
            <AppLogo size="sm" alt="HakimQzz" />
            <span className="font-serif text-base font-bold">HakimQzz</span>
          </div>
          <div className="flex gap-1 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 p-0.5 text-[10px] ml-auto">
            <button 
              type="button" 
              onClick={() => setLang("bn")} 
              className={`px-3 py-0.5 rounded-full cursor-pointer transition-colors ${lang === "bn" ? "bg-primary text-white font-semibold" : "text-zinc-500"}`}
            >
              বাংলা
            </button>
            <button 
              type="button" 
              onClick={() => setLang("en")} 
              className={`px-3 py-0.5 rounded-full cursor-pointer transition-colors ${lang === "en" ? "bg-primary text-white font-semibold" : "text-zinc-500"}`}
            >
              EN
            </button>
          </div>
        </div>

        {/* Center: Uiverse style Form */}
        <div className="flex justify-center items-center my-auto py-1 w-full">
          <form onSubmit={handleSubmit} className="form">
            <div className="text-center mb-1 flex flex-col items-center gap-0.5">
              <h1 className="text-lg sm:text-xl font-serif font-bold text-zinc-900 dark:text-zinc-50">
                {activeTab === "signin" ? t("sign_in") : t("sign_up")}
              </h1>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {activeTab === "signin" ? "Login to access your store dashboard" : "Create a new owner account for your clothing business"}
              </p>
            </div>

            {/* Field: Full Name (Only on Signup) */}
            {activeTab === "signup" && (
              <>
                <div className="flex-column">
                  <label>{t("full_name")}</label>
                </div>
                <div className="inputForm">
                  <svg height="15" viewBox="0 0 24 24" width="15" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                  <input 
                    type="text" 
                    required
                    className="input" 
                    placeholder="Your full name" 
                    value={fullName} 
                    onChange={e => setFullName(e.target.value)} 
                  />
                </div>
              </>
            )}

            {/* Field: Email */}
            <div className="flex-column">
              <label>{t("email")}</label>
            </div>
            <div className="inputForm">
              <svg height="15" viewBox="0 0 32 32" width="15" xmlns="http://www.w3.org/2000/svg">
                <g id="Layer_3" data-name="Layer 3">
                  <path d="m30.853 13.87a15 15 0 0 0 -29.729 4.082 15.1 15.1 0 0 0 12.876 12.918 15.6 15.6 0 0 0 2.016.13 14.85 14.85 0 0 0 7.715-2.145 1 1 0 1 0 -1.031-1.711 13.007 13.007 0 1 1 5.458-6.529 2.149 2.149 0 0 1 -4.158-.759v-10.856a1 1 0 0 0 -2 0v1.726a8 8 0 1 0 .2 10.325 4.135 4.135 0 0 0 7.83.274 15.2 15.2 0 0 0 .823-7.455zm-14.853 8.13a6 6 0 1 1 6-6 6.006 6.006 0 0 1 -6 6z"></path>
                </g>
              </svg>
              <input 
                type="email" 
                required
                className="input" 
                placeholder="Enter your Email" 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
              />
            </div>
            
            {/* Field: Password */}
            <div className="flex-column">
              <label>{t("password")}</label>
            </div>
            <div className="inputForm">
              <svg height="15" viewBox="-64 0 512 512" width="15" xmlns="http://www.w3.org/2000/svg">
                <path d="m336 512h-288c-26.453125 0-48-21.523438-48-48v-224c0-26.476562 21.546875-48 48-48h288c26.453125 0 48 21.523438 48 48v224c0 26.476562-21.546875 48-48 48zm-288-288c-8.8125 0-16 7.167969-16 16v224c0 8.832031 7.1875 16 16 16h288c8.8125 0 16-7.167969 16-16v-224c0-8.832031-7.1875-16-16-16zm0 0"></path>
                <path d="m304 224c-8.832031 0-16-7.167969-16-16v-80c0-52.929688-43.070312-96-96-96s-96 43.070312-96 96v80c0 8.832031-7.167969 16-16 16s-16-7.167969-16-16v-80c0-70.59375 57.40625-128 128-128s128 57.40625 128 128v80c0 8.832031-7.167969 16-16 16zm0 0"></path>
              </svg>        
              <input 
                type="password" 
                required
                minLength={activeTab === "signup" ? 6 : undefined}
                className="input" 
                placeholder="Enter your Password" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
              />
            </div>
            
            {/* Remember Me / Forgot Password */}
            <div className="flex-row my-0.5">
              <div className="flex items-center gap-1.5">
                <input id="remember" type="checkbox" className="rounded accent-primary cursor-pointer" />
                <label htmlFor="remember" className="select-none cursor-pointer text-[11px]">Remember me</label>
              </div>
              <span className="span text-[11px]">Forgot password?</span>
            </div>

            <button type="submit" disabled={busy} className="button-submit">
              {busy ? "…" : (activeTab === "signin" ? t("sign_in") : t("create_account"))}
            </button>

            {/* Info Message */}
            {activeTab === "signup" && (
              <p className="text-[9.5px] text-zinc-400 text-center leading-normal mt-0.5">
                After signup you will activate with a license key (HZ-… or EMP-…).
              </p>
            )}

            {/* Toggle Signin / Signup */}
            <p className="p mt-0.5 text-xs">
              {activeTab === "signin" ? "Don't have an account? " : "Already have an account? "}
              <span 
                onClick={() => setActiveTab(activeTab === "signin" ? "signup" : "signin")} 
                className="span font-semibold cursor-pointer"
              >
                {activeTab === "signin" ? "Sign Up" : "Sign In"}
              </span>
            </p>

            {/* Or With divider */}
            <p className="p text-[9px] text-zinc-400 dark:text-zinc-500 uppercase tracking-widest my-1 select-none">— Or With —</p>

            {/* Social log-in row */}
            <div className="flex-row">
              <button type="button" disabled={busy} onClick={signInWithGoogle} className="btn google flex-1 border-0 cursor-pointer transition-transform active:scale-95">
                <svg version="1.1" width="15" id="Layer_1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className="size-3.5">
                  <path style={{ fill: "#FBBB00" }} d="M113.47,309.408L95.648,375.94l-65.139,1.378C11.042,341.211,0,299.9,0,256c0-42.451,10.324-82.483,28.624-117.732h0.014l57.992,10.632l25.404,57.644c-5.317,15.501-8.215,32.141-8.215,49.456C103.821,274.792,107.225,292.797,113.47,309.408z"></path>
                  <path style={{ fill: "#518EF8" }} d="M507.527,208.176C510.467,223.662,512,239.655,512,256c0,18.328-1.927,36.206-5.598,53.451c-12.462,58.683-45.025,109.925-90.134,146.187l-0.014-0.014l-73.044-3.727l-10.338-64.535c29.932-17.554,53.324-45.025,65.646-77.911h-136.89V208.176h138.887L507.527,208.176L507.527,208.176z"></path>
                  <path style={{ fill: "#28B446" }} d="M416.253,455.624l0.014,0.014C372.396,490.901,316.666,512,256,512c-97.491,0-182.252-54.491-225.491-134.681l82.961-67.91c21.619,57.698,77.278,98.771,142.53,98.771c28.047,0,54.323-7.582,76.87-20.818L416.253,455.624z"></path>
                  <path style={{ fill: "#F14336" }} d="M419.404,58.936l-82.933,67.896c-23.335-14.586-50.919-23.012-80.471-23.012c-66.729,0-123.429,42.957-143.965,102.724l-83.397-68.276h-0.014C71.23,56.123,157.06,0,256,0C318.115,0,375.068,22.126,419.404,58.936z"></path>
                </svg>
                Google 
              </button>
              <button type="button" onClick={() => toast.info("Apple sign-in is disabled")} className="btn apple flex-1 border-0">
                <svg version="1.1" height="15" width="15" id="Capa_1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22.773 22.773" className="size-3.5 fill-zinc-900 dark:fill-zinc-100">
                  <g>
                    <g>
                      <path d="M15.769,0c0.053,0,0.106,0,0.162,0c0.13,1.606-0.483,2.806-1.228,3.675c-0.731,0.863-1.732,1.7-3.351,1.573 c-0.108-1.583,0.506-2.694,1.25-3.561C13.292,0.879,14.557,0.16,15.769,0z"></path>
                      <path d="M20.67,16.716c0,0.016,0,0.03,0,0.045c-0.455,1.378-1.104,2.559-1.896,3.655c-0.723,0.995-1.609,2.334-3.191,2.334 c-1.367,0-2.275-0.879-3.676-0.903c-1.482-0.024-2.297,0.735-3.652,0.926c-0.155,0-0.31,0-0.462,0 c-0.995-0.144-1.798-0.932-2.383-1.642c-1.725-2.098-3.058-4.808-3.306-8.276c0-0.34,0-0.679,0-1.019 c0.105-2.482,1.311-4.5,2.914-5.478c0.846-0.52,2.009-0.963,3.304-0.765c0.555,0.086,1.122,0.276,1.619,0.464 c0.471,0.181,1.06,0.502,1.618,0.485c0.378-0.011,0.754-0.208,1.135-0.347c1.116-0.403,2.21-0.865,3.652-0.648 c1.733,0.262,2.963,1.032,3.723,2.22c-1.466,0.933-2.625,2.339-2.427,4.74C17.818,14.688,19.086,15.964,20.67,16.716z"></path>
                    </g>
                  </g>
                </svg>
                Apple 
              </button>
            </div>
          </form>
        </div>

        {/* Footer info (Mobile & Desktop right bottom) */}
        <div className="text-center text-[10.5px] text-zinc-500 dark:text-zinc-400 py-1.5 border-t border-border/40 space-y-0.5 shrink-0 mt-auto font-balooda">
          <p className="font-semibold text-zinc-700 dark:text-zinc-300">
            made with love by <span className="font-bold text-foreground">Azizul Hakim Khan</span>.
          </p>
          <p className="text-[9.5px] text-muted-foreground">
            @2026 - infinite all rights reserved by <span className="font-bold text-foreground">Hakim Qzz</span>.
          </p>
          <p className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
            Whatsapp Number : <a href="https://wa.me/8801783501427" target="_blank" rel="noopener noreferrer" className="hover:underline">+8801783501427</a>
          </p>
        </div>
      </div>
    </div>
  );
}
