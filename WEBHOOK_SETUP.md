# Clerk Webhook Setup for Profile Sync

This guide explains how to set up Clerk webhooks to automatically create/update user profiles in Supabase when users sign up or update their information.

## Option 1: Set Up Clerk Webhook (Recommended)

### Step 1: Get Your Webhook Secret

1. Go to your [Clerk Dashboard](https://dashboard.clerk.com)
2. Navigate to **Webhooks** in the sidebar
3. Click **Add Endpoint**
4. Enter your webhook URL:
   ```
   https://yourdomain.com/api/webhooks/clerk
   ```
   For local development, use a tool like [ngrok](https://ngrok.com):
   ```
   https://your-ngrok-url.ngrok.io/api/webhooks/clerk
   ```
5. Select the events you want to listen to:
   - ✅ `user.created`
   - ✅ `user.updated`
6. Copy the **Signing Secret** (starts with `whsec_`)

### Step 2: Add Webhook Secret to Environment

Add the webhook secret to your `.env.local`:

```env
CLERK_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

### Step 3: Test the Webhook

1. Create a new user in Clerk
2. Check your Supabase `profiles` table - the profile should be created automatically
3. Check your server logs for any errors

## Option 2: Manual Sync for Existing Users

If you already have users in Clerk that weren't synced, you can manually sync them:

### Method 1: Visit Dashboard (Automatic)

When a user visits the dashboard, their profile will be automatically synced. Just have them log in and visit `/dashboard`.

### Method 2: Use Sync API Endpoint

Call the sync endpoint for the current user:

```bash
# From your app (client-side)
fetch('/api/sync-profile', { method: 'POST' })
```

### Method 3: Sync All Users (Admin)

⚠️ **Warning:** This endpoint should be protected in production!

1. Make sure you're logged in
2. Call the sync-all endpoint:

```bash
curl -X POST http://localhost:3000/api/sync-all-users \
  -H "Cookie: your-auth-cookie"
```

Or create a simple admin page:

```typescript
// src/app/admin/sync-users/page.tsx
'use client';

export default function SyncUsersPage() {
  const handleSync = async () => {
    const response = await fetch('/api/sync-all-users', {
      method: 'POST',
    });
    const data = await response.json();
    console.log(data);
  };

  return (
    <button onClick={handleSync}>
      Sync All Users
    </button>
  );
}
```

## Troubleshooting

### Webhook Not Working

1. **Check webhook secret**: Make sure `CLERK_WEBHOOK_SECRET` is set correctly
2. **Check webhook URL**: Verify the URL in Clerk dashboard matches your endpoint
3. **Check logs**: Look for errors in your server logs
4. **Test locally**: Use ngrok to expose your local server

### Profile Not Created

1. **Check Supabase connection**: Verify your Supabase credentials
2. **Check migration**: Make sure the `profiles` table exists
3. **Check logs**: Look for errors in the sync function
4. **Manual sync**: Try calling `/api/sync-profile` manually

### Error: "svix headers missing"

- Make sure you're calling the webhook from Clerk, not manually
- Verify the webhook secret is correct
- Check that the endpoint is accessible

## Testing Locally

1. Install ngrok:
   ```bash
   npm install -g ngrok
   # or
   brew install ngrok
   ```

2. Start your Next.js dev server:
   ```bash
   npm run dev
   ```

3. In another terminal, start ngrok:
   ```bash
   ngrok http 3000
   ```

4. Copy the HTTPS URL (e.g., `https://abc123.ngrok.io`)

5. In Clerk Dashboard, add webhook endpoint:
   ```
   https://abc123.ngrok.io/api/webhooks/clerk
   ```

6. Test by creating a new user in Clerk

## Production Deployment

When deploying to production:

1. Update the webhook URL in Clerk Dashboard to your production domain
2. Make sure `CLERK_WEBHOOK_SECRET` is set in your production environment
3. Test the webhook after deployment
4. Consider adding authentication to `/api/sync-all-users` endpoint

## Next Steps

- Set up the webhook in Clerk Dashboard
- Test with a new user signup
- Monitor the webhook logs for any issues
- Consider adding error notifications/alerts

