"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { SpeedLoader } from "@/components/speed-loader";
import AuthPage from "./auth/page";

export default function IndexPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    try {
      const hasToken = typeof window !== "undefined" && !!window.localStorage.getItem("auth_token");
      if (hasToken) {
        setRedirecting(true);
        router.replace("/dashboard");
      }
    } catch {
      // stay on auth
    }
  }, [router]);

  if (redirecting || (loading && user)) {
    return <SpeedLoader />;
  }

  if (user) {
    return <SpeedLoader />;
  }

  return <AuthPage />;
}
