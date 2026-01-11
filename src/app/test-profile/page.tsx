import { currentUser } from "@clerk/nextjs/server";
import { syncClerkUserToProfile, getUserProfile } from "@/lib/supabase/helpers";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function TestProfilePage() {
  const user = await currentUser();

  if (!user) {
    return <div>Not authenticated</div>;
  }

  const userId = user.id;
  const results: any = {
    user: {
      id: userId,
      email: user.emailAddresses[0]?.emailAddress,
      firstName: user.firstName,
      lastName: user.lastName,
    },
    env: {
      hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      hasSupabaseKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 30) + "...",
    },
    errors: [] as string[],
    steps: {} as Record<string, any>,
  };

  // Step 1: Check Supabase connection
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.from("profiles").select("count").limit(1);
    results.steps.connection = {
      success: !error,
      error: error?.message,
    };
  } catch (error: any) {
    results.steps.connection = {
      success: false,
      error: error.message,
    };
    results.errors.push(`Connection error: ${error.message}`);
  }

  // Step 2: Check if profile exists
  try {
    const existingProfile = await getUserProfile(userId);
    results.steps.checkExisting = {
      success: true,
      exists: !!existingProfile,
      profile: existingProfile,
    };
  } catch (error: any) {
    results.steps.checkExisting = {
      success: false,
      error: error.message,
    };
    results.errors.push(`Check existing error: ${error.message}`);
  }

  // Step 3: Try to sync profile
  try {
    const profile = await syncClerkUserToProfile(userId, {
      emailAddresses: user.emailAddresses,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumbers: user.phoneNumbers,
      imageUrl: user.imageUrl,
    });
    results.steps.sync = {
      success: true,
      profile,
    };
  } catch (error: any) {
    results.steps.sync = {
      success: false,
      error: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    };
    results.errors.push(`Sync error: ${error.message}`);
  }

  // Step 4: Verify profile was created
  try {
    const verifyProfile = await getUserProfile(userId);
    results.steps.verify = {
      success: true,
      profile: verifyProfile,
    };
  } catch (error: any) {
    results.steps.verify = {
      success: false,
      error: error.message,
    };
    results.errors.push(`Verify error: ${error.message}`);
  }

  return (
    <div className="container mx-auto p-8">
      <h1 className="mb-6 text-3xl font-bold">Profile Sync Test</h1>
      <pre className="rounded-lg border border-border bg-card p-4 text-sm">
        {JSON.stringify(results, null, 2)}
      </pre>
    </div>
  );
}

