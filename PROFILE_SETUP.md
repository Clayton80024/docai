# Profile Table Setup

The profile table has been created to store user information synced from Clerk.

## Database Migration

Run the migration file to create the profile table:

```sql
-- File: supabase/migrations/002_create_profile_table.sql
```

You can run this in your Supabase SQL Editor or via the Supabase CLI.

## Environment Variables

The service role key has been added to your `.env.local`:

```env
SUPABASE_SERVICE_ROLE_KEY=sbp_YOUR_SERVICE_ROLE_KEY_HERE
```

**⚠️ Important:** Never commit this key to version control! It's already in `.gitignore`.

## Profile Table Structure

The `profiles` table includes:

- `user_id` (TEXT, UNIQUE) - Clerk user ID
- `email` - User's email address
- `first_name` - First name
- `last_name` - Last name
- `phone` - Phone number
- `date_of_birth` - Date of birth
- `nationality` - Nationality
- `address` - Street address
- `city` - City
- `state` - State/Province
- `country` - Country
- `postal_code` - Postal/ZIP code
- `avatar_url` - Profile picture URL
- `metadata` (JSONB) - Additional custom fields
- `created_at` - Timestamp
- `updated_at` - Auto-updated timestamp

## Usage

### Get User Profile

```typescript
import { getUserProfile } from "@/lib/supabase/helpers";

const profile = await getUserProfile(userId);
```

### Create or Update Profile

```typescript
import { createOrUpdateProfile } from "@/lib/supabase/helpers";

const profile = await createOrUpdateProfile(userId, {
  email: "user@example.com",
  first_name: "John",
  last_name: "Doe",
  phone: "+1234567890",
  country: "United States",
});
```

### Sync Clerk User to Profile

```typescript
import { syncClerkUserToProfile } from "@/lib/supabase/helpers";
import { currentUser } from "@clerk/nextjs/server";

const user = await currentUser();
if (user) {
  await syncClerkUserToProfile(user.id, {
    emailAddresses: user.emailAddresses,
    firstName: user.firstName,
    lastName: user.lastName,
    phoneNumbers: user.phoneNumbers,
    imageUrl: user.imageUrl,
  });
}
```

### API Endpoint

There's an API route available at `/api/sync-profile` that automatically syncs the current Clerk user to their Supabase profile:

```typescript
// Client-side
await fetch("/api/sync-profile", { method: "POST" });
```

## Automatic Profile Sync

You can set up automatic profile syncing in a few ways:

### Option 1: On Dashboard Load

Update your dashboard page to sync the profile when it loads:

```typescript
// In src/app/dashboard/page.tsx
import { syncClerkUserToProfile } from "@/lib/supabase/helpers";

export default async function DashboardPage() {
  const user = await currentUser();
  if (user) {
    // Sync profile on dashboard load
    await syncClerkUserToProfile(user.id, {
      emailAddresses: user.emailAddresses,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumbers: user.phoneNumbers,
      imageUrl: user.imageUrl,
    });
  }
  // ... rest of component
}
```

### Option 2: Clerk Webhook

Set up a Clerk webhook to automatically sync profiles when users sign up or update their profile. Create a webhook endpoint that calls `syncClerkUserToProfile`.

### Option 3: Client-Side on Sign In

Call the sync API endpoint after successful sign-in:

```typescript
// After Clerk sign-in
await fetch("/api/sync-profile", { method: "POST" });
```

## Database Function

The migration includes a PostgreSQL function `create_user_profile()` that can be called directly:

```sql
SELECT create_user_profile(
  'clerk_user_id_here',
  'user@example.com',
  'John',
  'Doe'
);
```

This function will create or update the profile in a single call.

## Next Steps

1. Run the migration in your Supabase dashboard
2. Test the profile sync by calling `/api/sync-profile` after signing in
3. Add profile editing UI to allow users to update their information
4. Use profile data throughout your application

