"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { AppLogo } from "@/components/app-logo";
import { SpeedLoader } from "@/components/speed-loader";
import { toast } from "sonner";
import { activateLicenseFn } from "@/lib/rpc-admin";

export default function ActivatePage() {
  const { user, loading, refresh, login } = useAuth();
  const { t } = useT();
  const router = useRouter();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user?.activated) {
      router.replace("/dashboard");
    }
  }, [user, loading, router]);

  if (user?.activated) return <SpeedLoader />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim()) {
      toast.error("Please enter a valid license key");
      return;
    }
    setBusy(true);
    try {
      await activateLicenseFn({ data: { licenseKey: key.trim() } });
      if (user) {
        login({ ...user, activated: true });
      }
      await refresh();
      toast.success("License activated successfully! Welcome to Classic World.");
      router.replace("/dashboard");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="glass-card w-full max-w-md p-6 space-y-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <AppLogo size="lg" className="h-12 max-w-[260px]" />
          <h1 className="text-xl font-serif font-bold">Activate License</h1>
          <p className="text-sm text-muted-foreground">
            Enter your business or employee license key to activate Classic World.
          </p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">License Key</Label>
            <Input
              placeholder="CW-XXXX-XXXX-XXXX or EMP-XXXX-XXXX-XXXX"
              value={key}
              onChange={e => setKey(e.target.value.toUpperCase())}
              className="font-mono uppercase"
              required
            />
          </div>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Activating…" : "Activate Software"}
          </Button>
        </form>

        <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t text-center">
          <p>Need a license key? Contact Classic World Support:</p>
          <a
            href="https://wa.me/8801979929282"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary font-medium hover:underline inline-flex items-center gap-1"
          >
            WhatsApp Support: +880 1979-929282
          </a>
        </div>
      </Card>
    </div>
  );
}
