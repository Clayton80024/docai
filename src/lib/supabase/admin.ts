import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

/**
 * Admin client using service role key for privileged operations
 * Use this only in server-side code (API routes, server actions, etc.)
 * Never expose the service role key to the client!
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || supabaseUrl === "your_supabase_project_url") {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is not set. Please add your Supabase project URL to .env.local. Get it from: https://supabase.com/dashboard/project/_/settings/api"
    );
  }

  if (!serviceRoleKey || serviceRoleKey === "your_service_role_key_here") {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set. Please add your Supabase service role key to .env.local. Get it from: https://supabase.com/dashboard/project/_/settings/api"
    );
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

