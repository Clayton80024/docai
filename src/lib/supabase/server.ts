import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || supabaseUrl === "your_supabase_project_url") {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is not set. Please add your Supabase project URL to .env.local"
    );
  }

  if (!supabaseKey || supabaseKey === "your_supabase_anon_key") {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. Please add your Supabase anon key to .env.local"
    );
  }

  return createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
}

