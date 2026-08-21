"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppLogo } from "@/components/app-logo";
import { SpeedLoader } from "@/components/speed-loader";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { loginFn, registerFn } from "@/lib/rpc";
import type { AuthUser } from "@/hooks/use-auth";
import { loginWithFirebase, signupWithFirebase, loginWithFirebaseGoogle, loginWithFirebaseApple } from "@/lib/firebase-auth";

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

  if (user) return <SpeedLoader />;

  function afterAuth(u: AuthUser | null) {
    if (!u) return;
    login(u);
    router.replace(u.activated ? "/dashboard" : "/activate");
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      try {
        await loginWithFirebase(email, password);
      } catch (fbErr: any) {
        console.warn("Firebase auth info:", fbErr?.message);
      }
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
      try {
        await signupWithFirebase(email, password, fullName);
      } catch (fbErr: any) {
        console.warn("Firebase signup info:", fbErr?.message);
      }
      const data = await registerFn({ data: { email, password, fullName } });
      toast.success(lang === "bn" ? "একাউন্ট তৈরি — লাইসেন্স দিয়ে সক্রিয় করুন" : "Account created — activate with license");
      afterAuth(data.user as AuthUser);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleSignIn() {
    setBusy(true);
    try {
      const fbUser = await loginWithFirebaseGoogle();
      const isLicensed = Boolean(fbUser.activated && (fbUser as any).license_key);
      const mockAuthUser: AuthUser = {
        id: fbUser.uid,
        email: fbUser.email,
        full_name: fbUser.fullName,
        business_name: fbUser.businessName || "Classic World",
        role: "owner",
        activated: isLicensed,
        business_id: null,
        logo_url: "/logo.svg",
      };
      if (isLicensed) {
        toast.success(lang === "bn" ? "গুগল লগইন সফল হয়েছে!" : "Google login successful!");
      } else {
        toast.info(lang === "bn" ? "লগইন সফল — অনুগ্রহ করে লাইসেন্স কী প্রদান করুন" : "Login successful — please enter your license key");
      }
      afterAuth(mockAuthUser);
    } catch (err: any) {
      toast.error(err?.message || "Google sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleAppleSignIn() {
    setBusy(true);
    try {
      const fbUser = await loginWithFirebaseApple();
      const isLicensed = Boolean(fbUser.activated && (fbUser as any).license_key);
      const mockAuthUser: AuthUser = {
        id: fbUser.uid,
        email: fbUser.email,
        full_name: fbUser.fullName,
        business_name: fbUser.businessName || "Classic World",
        role: "owner",
        activated: isLicensed,
        business_id: null,
        logo_url: "/logo.svg",
      };
      if (isLicensed) {
        toast.success(lang === "bn" ? "অ্যাপল লগইন সফল হয়েছে!" : "Apple login successful!");
      } else {
        toast.info(lang === "bn" ? "লগইন সফল — অনুগ্রহ করে লাইসেন্স কী প্রদান করুন" : "Login successful — please enter your license key");
      }
      afterAuth(mockAuthUser);
    } catch (err: any) {
      toast.error(err?.message || "Apple sign-in failed");
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
    <div className="auth-page h-screen h-[100dvh] max-h-[100dvh] overflow-hidden grid grid-cols-1 md:grid-cols-12">
      {/* Dynamic Scoped Styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        .auth-page .form {
          display: flex;
          flex-direction: column;
          gap: 8px;
          background-color: #ffffff;
          padding: 24px;
          width: 100%;
          max-width: 440px;
          border-radius: 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
          box-shadow: 0 4px 20px -2px rgba(0,0,0,0.05);
        }
        @media (max-width: 640px) {
          .auth-page .form {
            padding: 18px 16px;
            gap: 6px;
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
        }
        .dark .auth-page .flex-column > label {
          color: #e4e4e7;
        }

        .auth-page .inputForm {
          border: 1.5px solid #ecedec;
          border-radius: 10px;
          height: 50px;
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
          font-size: 14px;
          color: black;
          font-weight: 400;
        }
        .dark .auth-page .flex-row > div > label {
          color: #a1a1aa;
        }

        .auth-page .span {
          font-size: 14px;
          margin-left: 5px;
          color: #2d79f3;
          font-weight: 500;
          cursor: pointer;
        }
        .auth-page .span:hover {
          text-decoration: underline;
        }

        .auth-page .button-submit {
          margin: 20px 0 10px 0;
          background-color: #151717;
          border: none;
          color: white;
          font-size: 15px;
          font-weight: 500;
          border-radius: 10px;
          height: 50px;
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
          font-size: 14px;
          margin: 5px 0;
        }
        .dark .auth-page .p {
          color: #a1a1aa;
        }

        .auth-page .btn {
          margin-top: 10px;
          width: 100%;
          height: 50px;
          border-radius: 10px;
          display: flex;
          justify-content: center;
          align-items: center;
          font-weight: 500;
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

      {/* Left panel: Bright luxury fashion boutique showroom backdrop */}
      <div 
        className="hidden md:flex md:col-span-6 lg:col-span-7 relative flex-col justify-between p-12 text-zinc-900 select-none overflow-hidden bg-cover bg-center border-r border-zinc-200/80"
        style={{ backgroundImage: `linear-gradient(135deg, rgba(255, 255, 255, 0.88), rgba(248, 250, 252, 0.92)), url('/login_illustration.jpg')` }}
      >
        <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/15 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-primary/15 rounded-full blur-3xl" />

        {/* Top brand header */}
        <div className="flex items-center gap-3 relative z-10">
          <AppLogo size="md" alt="Classic World" />
          <span className="font-serif text-2xl font-black tracking-tight text-zinc-900">Classic World</span>
        </div>

        {/* Middle minimalist description */}
        <div className="space-y-6 relative z-10 max-w-lg my-auto">
          <span className="bg-primary/10 border border-primary/20 text-primary text-xs px-3.5 py-1.5 rounded-full font-bold uppercase tracking-wider shadow-xs">
            {lang === "bn" ? "পোশাক ব্যবসায়ীদের আস্থার প্রতীক" : "Designed for Fashion Retailers"}
          </span>
          <h2 className="text-4xl lg:text-5xl font-black font-serif leading-tight text-zinc-950 tracking-tight">
            {lang === "bn" 
              ? `"Classic World" ইনভেন্টরি ম্যানেজমেন্ট এবং প্রোডাক্টস সলিউশন`
              : `"Classic World" inventory management and products solutions`}
          </h2>
          <p className="text-base text-zinc-700 font-medium leading-relaxed max-w-md">
            {lang === "bn" 
              ? "স্টক মূল্যায়ন, ক্যাশ ফ্লো, কাস্টম ইনভয়েস এবং বিক্রয় ট্র্যাকিং সহজতর করার এক নির্ভরযোগ্য মাধ্যম।" 
              : "Modern stock valuation, cashbox ledger, custom invoices, and sales profit margin tracking in one simple workspace."}
          </p>
        </div>

        {/* Bottom copyright placeholder */}
        <div className="text-xs text-zinc-500 font-medium relative z-10">
          © {new Date().getFullYear()} Classic World. Powered by Classic World.
        </div>
      </div>

      {/* Right panel: Form input and Language selectors */}
      <div className="col-span-12 md:col-span-6 lg:col-span-5 flex flex-col justify-between p-4 sm:p-6 bg-slate-50 dark:bg-zinc-950 h-full max-h-[100dvh] overflow-y-auto">
        
        {/* Top Row: Language switcher */}
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 md:hidden">
            <AppLogo size="sm" alt="Classic World" />
            <span className="font-serif text-lg font-bold">Classic World</span>
          </div>
          <div className="flex gap-1 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 p-0.5 text-[10px] ml-auto">
            <button 
              type="button" 
              onClick={() => setLang("bn")} 
              className={`px-3 py-1 rounded-full cursor-pointer transition-colors ${lang === "bn" ? "bg-primary text-white font-semibold" : "text-zinc-500"}`}
            >
              বাংলা
            </button>
            <button 
              type="button" 
              onClick={() => setLang("en")} 
              className={`px-3 py-1 rounded-full cursor-pointer transition-colors ${lang === "en" ? "bg-primary text-white font-semibold" : "text-zinc-500"}`}
            >
              EN
            </button>
          </div>
        </div>

        {/* Center: Uiverse style Form */}
        <div className="flex justify-center items-center my-auto py-2 w-full">
          <form onSubmit={handleSubmit} className="form">
            <div className="text-center mb-2 flex flex-col items-center gap-1">
              <h1 className="text-xl font-serif font-bold text-zinc-900 dark:text-zinc-50">
                {activeTab === "signin" ? t("sign_in") : t("sign_up")}
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
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
                  <svg height="16" viewBox="0 0 24 24" width="16" xmlns="http://www.w3.org/2000/svg">
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
              <svg height="16" viewBox="0 0 32 32" width="16" xmlns="http://www.w3.org/2000/svg">
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
              <svg height="16" viewBox="-64 0 512 512" width="16" xmlns="http://www.w3.org/2000/svg">
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
            <div className="flex-row my-1">
              <div className="flex items-center gap-1.5">
                <input id="remember" type="checkbox" className="rounded accent-primary cursor-pointer" />
                <label htmlFor="remember" className="select-none cursor-pointer text-xs">Remember me</label>
              </div>
              <span className="span text-xs">Forgot password?</span>
            </div>

            <button type="submit" disabled={busy} className="button-submit">
              {busy ? "…" : (activeTab === "signin" ? t("sign_in") : t("create_account"))}
            </button>

            {/* Info Message */}
            {activeTab === "signup" && (
              <p className="text-[10px] text-zinc-400 text-center leading-normal mt-0.5">
                After signup you will activate with a license key (HZ-… or EMP-…).
              </p>
            )}

            {/* Toggle Signin / Signup */}
            <p className="p mt-1">
              {activeTab === "signin" ? "Don't have an account? " : "Already have an account? "}
              <span 
                onClick={() => setActiveTab(activeTab === "signin" ? "signup" : "signin")} 
                className="span font-semibold"
              >
                {activeTab === "signin" ? "Sign Up" : "Sign In"}
              </span>
            </p>

            {/* Or With divider */}
            <p className="p text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-widest my-1.5 select-none">— Or With —</p>

            {/* Social log-in row */}
            <div className="flex-row">
              <button type="button" onClick={handleGoogleSignIn} disabled={busy} className="btn google flex-1 border-0">
                <svg version="1.1" width="16" id="Layer_1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" className="size-4">
                  <path style={{ fill: "#FBBB00" }} d="M113.47,309.408L95.648,375.94l-65.139,1.378C11.042,341.211,0,299.9,0,256c0-42.451,10.324-82.483,28.624-117.732h0.014l57.992,10.632l25.404,57.644c-5.317,15.501-8.215,32.141-8.215,49.456C103.821,274.792,107.225,292.797,113.47,309.408z"></path>
                  <path style={{ fill: "#518EF8" }} d="M507.527,208.176C510.467,223.662,512,239.655,512,256c0,18.328-1.927,36.206-5.598,53.451c-12.462,58.683-45.025,109.925-90.134,146.187l-0.014-0.014l-73.044-3.727l-10.338-64.535c29.932-17.554,53.324-45.025,65.646-77.911h-136.89V208.176h138.887L507.527,208.176L507.527,208.176z"></path>
                  <path style={{ fill: "#28B446" }} d="M416.253,455.624l0.014,0.014C372.396,490.901,316.666,512,256,512c-97.491,0-182.252-54.491-225.491-134.681l82.961-67.91c21.619,57.698,77.278,98.771,142.53,98.771c28.047,0,54.323-7.582,76.87-20.818L416.253,455.624z"></path>
                  <path style={{ fill: "#F14336" }} d="M419.404,58.936l-82.933,67.896c-23.335-14.586-50.919-23.012-80.471-23.012c-66.729,0-123.429,42.957-143.965,102.724l-83.397-68.276h-0.014C71.23,56.123,157.06,0,256,0C318.115,0,375.068,22.126,419.404,58.936z"></path>
                </svg>
                Google 
              </button>
              <button type="button" onClick={handleAppleSignIn} disabled={busy} className="btn apple flex-1 border-0">
                <svg version="1.1" height="16" width="16" id="Capa_1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22.773 22.773" className="size-4 fill-zinc-900 dark:fill-zinc-100">
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

        {/* Footer info (Mobile visible, desktop bottom right) */}
        <div className="text-center text-[10px] text-zinc-400 py-1 space-y-0.5 shrink-0 mt-auto">
          <p>Classic World Inventory Management System. All rights reserved.</p>
          <p className="text-[9px] text-zinc-500">Powered by Classic World</p>
        </div>
      </div>
    </div>
  );
}
