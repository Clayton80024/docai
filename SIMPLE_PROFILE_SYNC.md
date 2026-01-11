# Simple Profile Sync

Profile syncing is now handled automatically and simply - no API endpoints needed!

## How It Works

### Automatic Sync (Already Working)

When a user visits the dashboard (`/dashboard`), their profile is automatically synced from Clerk to Supabase. This happens in the server component, so it's seamless and fast.

### Manual Sync (If Needed)

If you need to manually sync a profile, simply visit:

```
http://localhost:3000/sync-profile
```

This page uses a simple server action (no API routes) to sync the profile.

## For Your Current User

Since you already created a user in Clerk, just:

1. **Visit the dashboard**: Go to `http://localhost:3000/dashboard`
   - Your profile will be automatically created/updated in Supabase

2. **Or visit the sync page**: Go to `http://localhost:3000/sync-profile`
   - Click "Sync Profile" button

That's it! No webhooks, no API endpoints, no complex setup.

## How It Works Under the Hood

- **Dashboard**: The server component calls `syncClerkUserToProfile()` directly
- **Sync Page**: Uses a server action (`syncProfile()`) that can be called from client components
- Both methods use the same helper function, so they work identically

## Verify It Worked

1. Visit your Supabase dashboard
2. Go to Table Editor → `profiles` table
3. You should see your user's profile with their Clerk user ID

Simple and straightforward! 🎉

