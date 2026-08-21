"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4 text-center">
      <h2 className="text-2xl font-bold mb-2">404 — Page Not Found / পেজ পাওয়া যায়নি</h2>
      <p className="text-sm text-muted-foreground mb-4">
        The page you are looking for does not exist or has been moved.
      </p>
      <Button asChild>
        <Link href="/dashboard">Return to Dashboard / ড্যাশবোর্ডে ফিরে যান</Link>
      </Button>
    </div>
  );
}
