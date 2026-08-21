"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { SpeedLoader } from "@/components/speed-loader";
import AuthPage from "./auth/page";

export default function IndexPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      if (user.activated) {
        router.replace("/dashboard");
      } else {
        router.replace("/activate");
      }
    }
  }, [user, loading, router]);

  // If loading session, show animated loader
  if (loading) return <SpeedLoader />;

  // If user is already logged in, show loader while redirecting
  if (user) return <SpeedLoader />;

  // If unauthenticated, render AuthPage immediately with 0 delay!
  return <AuthPage />;
}
