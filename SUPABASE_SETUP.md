# Supabase Setup Guide

This guide will help you set up Supabase for your DocAI application.

## 1. Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign up or log in
3. Click "New Project"
4. Fill in your project details:
   - Name: `docai` (or your preferred name)
   - Database Password: Choose a strong password
   - Region: Select the closest region to your users
5. Click "Create new project"

## 2. Get Your Supabase Credentials

Once your project is created:

1. Go to **Settings** → **API**
2. Copy the following values:
   - **Project URL** (this is your `NEXT_PUBLIC_SUPABASE_URL`)
   - **anon/public key** (this is your `NEXT_PUBLIC_SUPABASE_ANON_KEY`)

## 3. Update Environment Variables

Open your `.env.local` file and update the Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Replace `your_supabase_project_url` and `your_supabase_anon_key` with the values from step 2.

## 4. Set Up the Database Schema

### Option A: Using Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Click "New query"
4. Copy and paste the contents of `supabase/migrations/001_initial_schema.sql`
5. Click "Run" to execute the migration

### Option B: Using Supabase CLI

If you have the Supabase CLI installed:

```bash
supabase db push
```

## 5. Configure Row Level Security (RLS)

**Important Note:** The migration file includes RLS policies, but since you're using Clerk for authentication (not Supabase Auth), you'll need to modify the RLS policies.

### Update RLS Policies for Clerk Integration

Since you're using Clerk, the RLS policies that check `auth.uid()` won't work. You have two options:

#### Option 1: Disable RLS (Development Only)

For development, you can temporarily disable RLS:

```sql
ALTER TABLE applications DISABLE ROW LEVEL SECURITY;
ALTER TABLE documents DISABLE ROW LEVEL SECURITY;
```

**⚠️ Warning:** Only do this in development. For production, use Option 2.

#### Option 2: Use Service Role Key (Recommended for Production)

1. In Supabase Dashboard, go to **Settings** → **API**
2. Copy the **service_role key** (keep this secret!)
3. Add it to your `.env.local`:

```env
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

4. Update your server-side Supabase client to use the service role key when needed for admin operations.

5. For user-specific queries, filter by `user_id` in your application code (which we're already doing in the helper functions).

## 6. Test the Connection

1. Restart your Next.js development server:
   ```bash
   npm run dev
   ```

2. Log in to your application
3. Navigate to the dashboard
4. The dashboard should now connect to Supabase and display your data

## 7. Verify Tables Were Created

1. Go to **Table Editor** in your Supabase dashboard
2. You should see two tables:
   - `applications`
   - `documents`

## Troubleshooting

### Error: "relation does not exist"
- Make sure you've run the migration SQL script
- Check that you're connected to the correct Supabase project

### Error: "permission denied"
- Check your RLS policies
- Verify your environment variables are correct
- If using Clerk, make sure you've configured RLS appropriately (see Option 2 above)

### Data not showing up
- Check the browser console for errors
- Verify your Supabase credentials in `.env.local`
- Make sure you've restarted your dev server after adding environment variables

## Next Steps

- Create API routes for file uploads
- Implement document processing logic
- Add more database tables as needed
- Set up Supabase Storage for file uploads (if needed)

