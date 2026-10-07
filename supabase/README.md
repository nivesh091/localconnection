# KaamMitra (काम मित्र) — Supabase Setup & Migration Guide

### Supabase Project Details
- **Project Reference**: `hhvxanktvbncyeedzzdf`
- **Project URL**: `https://hhvxanktvbncyeedzzdf.supabase.co`
- **Publishable Key**: Configured in environment variables (`VITE_SUPABASE_PUBLISHABLE_KEY`)

### How to Run Database Migration Manually:
1. Open your Supabase Dashboard: [https://supabase.com/dashboard/project/hhvxanktvbncyeedzzdf](https://supabase.com/dashboard/project/hhvxanktvbncyeedzzdf)
2. Navigate to the **SQL Editor** in the left sidebar.
3. Open or copy the contents of `/supabase/migrations/20260926000000_kaammitra_master_schema.sql`.
4. Click **Run**.
5. All 14 application tables will be initialized **100% empty** (zero demo, seed, fake, or default application records).
6. Categories and administrative settings can now be managed directly through the authenticated **Admin Panel** (`/admin`).

### Storage Buckets Configured:
- `profile-media` (Public)
- `worker-media` (Public)
- `chat-media` (Private)
- `help-media` (Private)

### Admin Account:
- Admin Email: `niveshkumar1230@gmail.com`
- Set the password via Supabase Auth in the Dashboard or sign up with this email.
- Contact Number: `9149275779`
