"use server";

import { currentUser } from "@clerk/nextjs/server";
import { syncClerkUserToProfile } from "@/lib/supabase/helpers";

/**
 * Server action to sync the current user's profile
 * Can be called directly from client components
 */
export async function syncProfile() {
  try {
    const user = await currentUser();

    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    const profile = await syncClerkUserToProfile(user.id, {
      emailAddresses: user.emailAddresses,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumbers: user.phoneNumbers,
      imageUrl: user.imageUrl,
    });

    return { success: true, profile };
  } catch (error: any) {
    console.error("Error syncing profile:", error);
    return { success: false, error: error.message || "Failed to sync profile" };
  }
}

