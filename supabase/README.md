# Supabase Setup

## 1. Run schema
In the Supabase SQL editor, run `schema.sql` then `seed.sql` in order.

## 2. Create Storage bucket
Supabase Dashboard → Storage → New bucket:
- Name: `documents`
- Public: **NO** (private)
- File size limit: 10 MB
- Allowed MIME types: `application/pdf, image/jpeg, image/png`

## 3. Create the admin user
Follow the instructions at the bottom of `seed.sql`.

Quick reference:
1. Supabase Dashboard → Authentication → Users → Add user
   - Email: `vanes.vr@gmail.com`
   - Password: `GWMSAdmin2026!`
   - Check "Auto Confirm User"
2. Copy the user UUID, then run in SQL editor:
```sql
UPDATE profiles
SET role = 'admin', full_name = 'Jane Doe', company_name = 'GWMS Ltd'
WHERE email = 'vanes.vr@gmail.com';
```
