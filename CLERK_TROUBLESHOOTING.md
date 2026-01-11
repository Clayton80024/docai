# Clerk Infinite Redirect Loop - Troubleshooting Guide

## Error Message
```
Clerk: Refreshing the session token resulted in an infinite redirect loop. 
This usually means that your Clerk instance keys do not match - make sure to 
copy the correct publishable and secret keys from the Clerk dashboard.
```

## Root Cause
This error occurs when your `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` are from **different Clerk instances** or are incorrect.

## Solution Steps

### Step 1: Verify Your Clerk Keys
1. Go to [Clerk Dashboard](https://dashboard.clerk.com)
2. Select your application (make sure you're in the correct instance)
3. Navigate to **API Keys** in the sidebar
4. You should see:
   - **Publishable key** (starts with `pk_test_` or `pk_live_`)
   - **Secret key** (starts with `sk_test_` or `sk_live_`)

### Step 2: Update .env.local
Make sure both keys are from the **same Clerk instance**:

```env
# These MUST be from the same Clerk application instance
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_YOUR_ACTUAL_KEY_HERE
CLERK_SECRET_KEY=sk_test_YOUR_ACTUAL_SECRET_KEY_HERE
```

**Important:**
- Copy the keys directly from the Clerk dashboard (don't type them manually)
- Make sure there are no extra spaces or quotes
- Both keys must be from the same Clerk application
- If you're using test keys, both should start with `pk_test_` and `sk_test_`
- If you're using production keys, both should start with `pk_live_` and `sk_live_`

### Step 3: Clear Browser Cache and Cookies
1. Clear your browser's cookies for `localhost:3000`
2. Or use an incognito/private window
3. This ensures old session tokens are removed

### Step 4: Restart Your Dev Server
After updating `.env.local`:

```bash
# Stop your server (Ctrl+C)
# Then restart
npm run dev
```

### Step 5: Verify the Fix
1. Open a new incognito/private browser window
2. Navigate to `http://localhost:3000`
3. Try to sign in or sign up
4. The redirect loop should be resolved

## Common Mistakes

### ❌ Wrong: Keys from Different Instances
```env
# DON'T DO THIS - keys from different Clerk apps
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_from_app_1
CLERK_SECRET_KEY=sk_test_from_app_2  # Wrong!
```

### ✅ Correct: Keys from Same Instance
```env
# DO THIS - both keys from the same Clerk app
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_from_app_1
CLERK_SECRET_KEY=sk_test_from_app_1  # Correct!
```

### ❌ Wrong: Extra Spaces or Quotes
```env
# DON'T DO THIS
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_test_..."  # Quotes not needed
CLERK_SECRET_KEY= sk_test_...  # Space before key
```

### ✅ Correct: No Quotes, No Spaces
```env
# DO THIS
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
```

## Additional Checks

### Check Environment Variables Are Loaded
Create a test page to verify your keys are loaded:

```typescript
// src/app/test-clerk/page.tsx
export default function TestClerkPage() {
  return (
    <div>
      <p>Publishable Key: {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.substring(0, 20)}...</p>
      <p>Secret Key: {process.env.CLERK_SECRET_KEY ? 'Set (hidden)' : 'Missing'}</p>
    </div>
  );
}
```

### Check Clerk Dashboard Settings
1. In Clerk Dashboard, go to **Settings** → **Paths**
2. Make sure your sign-in and sign-up paths match:
   - Sign-in path: `/sign-in`
   - Sign-up path: `/sign-up`

## Still Not Working?

1. **Double-check keys**: Copy them again from Clerk dashboard
2. **Check for typos**: Compare the keys character by character
3. **Verify environment file location**: `.env.local` should be in the project root (same folder as `package.json`)
4. **Restart everything**: Stop the dev server, clear browser cache, restart
5. **Check Clerk dashboard**: Make sure your Clerk application is active and not suspended

## Need More Help?

- [Clerk Documentation](https://clerk.com/docs)
- [Clerk Support](https://clerk.com/support)

