"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SidebarProvider } from "@/components/ui/sidebar";
import { SpeedLoader } from "@/components/speed-loader";
import { useAuth } from "@/hooks/use-auth";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !loading) {
      if (!user) {
        router.replace("/auth");
      } else if (!user.activated) {
        router.replace("/activate");
      }
    }
  }, [user, loading, router, mounted]);

  if (!mounted || loading || !user || !user.activated) {
    return <SpeedLoader />;
  }

  return (
    <SidebarProvider>
      <AppShell>{children}</AppShell>
    </SidebarProvider>
  );
}
