import { SignIn } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { syncClerkUserToProfile } from "@/lib/supabase/helpers";

export default async function SignInPage() {
  // If user is already signed in, redirect to dashboard and sync profile
  const user = await currentUser();
  
  if (user) {
    // Sync profile when user is already authenticated (e.g., after sign-in)
    // This will gracefully skip if Supabase is not configured
    await syncClerkUserToProfile(user.id, {
      emailAddresses: user.emailAddresses,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumbers: user.phoneNumbers,
      imageUrl: user.imageUrl,
    });
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignIn 
        afterSignInUrl="/dashboard"
        afterSignUpUrl="/dashboard"
      />
    </div>
  );
}

