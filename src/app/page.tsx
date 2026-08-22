"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { SpeedLoader } from "@/components/speed-loader";

export default function IndexPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.replace("/auth");
      } else {
        router.replace("/dashboard");
      }
    }
  }, [user, loading, router]);

  return <SpeedLoader />;
}
