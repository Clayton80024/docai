# Environment Variables Setup

You need to add your actual Supabase credentials to `.env.local`.

## Step 1: Get Your Supabase Credentials

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project (or create a new one)
3. Go to **Settings** → **API**
4. You'll see:
   - **Project URL** (looks like: `https://xxxxx.supabase.co`)
   - **anon/public key** (a long string starting with `eyJ...`)
   - **service_role key** (starts with `sbp_...` or `eyJ...`)

## Step 2: Update .env.local

Open `.env.local` in your project root and update these values:

```env
# Clerk Auth (you already have these)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Supabase Configuration - UPDATE THESE!
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=sbp_YOUR_SERVICE_ROLE_KEY_HERE
```

**Important:**
- Replace `https://your-project-id.supabase.co` with your actual Project URL
- Replace the anon key with your actual anon/public key
- The service role key you provided should work, but make sure it matches what's in your Supabase dashboard

## Step 3: Restart Your Dev Server

After updating `.env.local`:

```bash
# Stop your current server (Ctrl+C)
# Then restart it
npm run dev
```

## Step 4: Verify

1. Visit `http://localhost:3000/test-profile`
2. You should see your environment variables are set correctly
3. The profile sync should work now

## Example .env.local

Here's what a complete `.env.local` should look like:

```env
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_YOUR_PUBLISHABLE_KEY_HERE
CLERK_SECRET_KEY=sk_test_YOUR_SECRET_KEY_HERE

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.YOUR_ANON_KEY_HERE
SUPABASE_SERVICE_ROLE_KEY=sbp_YOUR_SERVICE_ROLE_KEY_HERE
```

## Troubleshooting

### Error: "Invalid supabaseUrl"
- Make sure your URL starts with `https://`
- Make sure there are no extra spaces or quotes
- The URL should look like: `https://xxxxx.supabase.co`

### Error: "Missing Supabase environment variables"
- Make sure `.env.local` is in the project root (same folder as `package.json`)
- Make sure you restarted your dev server after adding the variables
- Make sure there are no typos in the variable names

### Still not working?
1. Double-check your Supabase dashboard for the correct values
2. Make sure you're using the **anon/public** key (not the service_role key) for `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Visit `/test-profile` to see detailed error messages




