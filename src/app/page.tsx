"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { SpeedLoader } from "@/components/speed-loader";

export default function IndexPage() {
  const router = useRouter();

  useEffect(() => {
    try {
      const hasToken = typeof window !== "undefined" && !!window.localStorage.getItem("auth_token");
      if (hasToken) {
        router.replace("/dashboard");
      } else {
        router.replace("/auth");
      }
    } catch {
      router.replace("/auth");
    }
  }, [router]);

  return <SpeedLoader />;
}
