"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import { syncProfile } from "../actions/profile";

export default function SyncProfilePage() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSync = async () => {
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const result = await syncProfile();

      if (!result.success) {
        throw new Error(result.error || "Failed to sync profile");
      }

      setSuccess(true);
      setTimeout(() => {
        router.push("/dashboard");
      }, 2000);
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-zinc-50 to-white dark:from-black dark:to-zinc-950">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-lg">
        <h1 className="mb-4 text-2xl font-bold text-foreground">
          Sync Your Profile
        </h1>
        <p className="mb-6 text-muted-foreground">
          This will create or update your profile in the database with your
          current Clerk account information.
        </p>

        {success && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-green-500/10 p-4 text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-5 w-5" />
            <span>Profile synced successfully! Redirecting to dashboard...</span>
          </div>
        )}

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-500/10 p-4 text-red-600 dark:text-red-400">
            <AlertCircle className="h-5 w-5" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex gap-4">
          <button
            onClick={handleSync}
            disabled={loading || success}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Syncing...
              </>
            ) : success ? (
              <>
                <CheckCircle2 className="h-5 w-5" />
                Synced!
              </>
            ) : (
              "Sync Profile"
            )}
          </button>
          <Link
            href="/dashboard"
            className="flex items-center justify-center rounded-lg border border-border px-6 py-3 font-semibold transition-colors hover:bg-accent"
          >
            Cancel
          </Link>
        </div>

        <div className="mt-6 rounded-lg bg-muted p-4">
          <p className="text-sm text-muted-foreground">
            <strong>Note:</strong> Your profile will be automatically synced
            when you visit the dashboard. This page is useful if you need to
            manually trigger a sync.
          </p>
        </div>
      </div>
    </div>
  );
}

