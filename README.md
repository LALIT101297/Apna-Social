# Apna Social (mobile-first)

## Project files
- `index.html` – mobile-first user interface
- `app.js` – Supabase connection and app logic
- `supabase/schema.sql` – database tables, trigger and Row Level Security policies

## A. Create Supabase backend
1. Open https://supabase.com and sign in.
2. Create a new project. Save the database password somewhere safe.
3. Open **SQL Editor > New query**.
4. Open `supabase/schema.sql`, copy all SQL and run it.
5. Open **Project Settings > API** (or Connect) and copy the Project URL and anon/publishable key.
6. Open `app.js`; replace `PASTE_YOUR_SUPABASE_PROJECT_URL` and `PASTE_YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY`.
   Never put a `service_role` or secret key in browser code.

## B. Make yourself Master Admin
1. First deploy the app and sign up using your own email.
2. In Supabase > SQL Editor run this, replacing the email:
   ```sql
   update public.profiles p set role='admin'
   where p.id=(select id from auth.users where email='YOUR_LOGIN_EMAIL');
   ```
3. Log out and log in again. The Admin tab should appear.
4. Do not give anyone the SQL Editor / Supabase owner login. Customers cannot promote themselves.

## C. Deploy on GitHub Pages
1. Create a GitHub repository, e.g. `apna-social`.
2. Upload `index.html`, `app.js`, and the `supabase` folder (with `schema.sql`) keeping this structure:
   ```
   apna-social/
     index.html
     app.js
     supabase/
       schema.sql
   ```
3. Open repository **Settings > Pages**.
4. Under Build and deployment choose **Deploy from a branch**.
5. Choose branch `main`, folder `/ (root)`, then Save.
6. Wait for the Pages URL and open it on your phone.

## D. Supabase Auth settings
- In Supabase Authentication > URL Configuration, add your GitHub Pages URL to **Site URL** and **Redirect URLs**.
- For password reset, also allow the same URL.
- Email confirmation may be enabled; users must verify their email before login.

## Current starter functionality
Email signup/login, reset email, profile, create/read/delete posts, reactions, comments, search, follow/unfollow, reporting, basic admin report review and post moderation.
Profile photo upload, account deletion, admin user suspension, private account/follow approval and complete admin user management need additional secure storage/Edge Function work before public launch. Do not advertise those as finished yet.

## Notes
- GitHub Pages hosts static files only; Supabase handles authentication and data.
- Supabase free-plan quotas, inactivity pausing and email limits can change. Check current dashboard usage before inviting many users.
