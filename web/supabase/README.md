# Supabase setup (one-time)

Project: `https://your-project.supabase.co`

## 1. Run migrations (SQL Editor, in order)
1. `supabase/migrations/0001_init.sql` – tables, RLS, `create_session` RPC, realtime
2. `supabase/migrations/0002_avatars_and_account_deletion.sql` – avatar bucket + policies, `delete_my_account` RPC, keeps comments after account deletion
3. `supabase/migrations/0003_grants.sql` – table/sequence/function grants for `authenticated`
4. `supabase/migrations/0004_private_sessions.sql` – v2.0 private sessions, invite codes (`join_by_invite`, `regenerate_invite_code`), tightened RLS
5. `supabase/migrations/0005_spoilers_search_host_controls.sql` – v2.0 spoiler `chapter_ref`, quote-reply `reply_to_id`, trigram search indexes, host controls (`update_session`, `delete_session`, `remove_participant`, host comment moderation)
6. `supabase/migrations/0006_notifications.sql` – v2.0 `notifications` & `push_tokens` tables, per-session `muted` flag, realtime publication, notification triggers
7. `supabase/migrations/0007_session_resources.sql` – v2.0 `session_resources` table & private `session-files` bucket (PDF, DOC/DOCX, XML up to 25 MB, plus URLs)

Dashboard > SQL Editor > New query > paste file > Run. Each file runs once; if one fails, fix it before running the next.

## 2. Auth settings (Dashboard > Authentication)
- **Sign In / Providers > Email**: enabled. For development turn **Confirm email** off so sign-up logs in instantly; turn it on again before launch.
- **URL Configuration**: Site URL `http://localhost:5173` for dev. Add your production URL and any redirect URLs later.
- Optional: raise minimum password length (default 6) under Providers > Email.

## 3. Verify
Run in SQL Editor – every table should show `true` for RLS:

```sql
select tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1;
select id, public from storage.buckets where id = 'avatars';
select tablename from pg_publication_tables where pubname = 'supabase_realtime';
```
Expected: 6 tables (comments, chapters, participants, profiles, reactions, sessions) with RLS on, the avatars bucket public, and comments/participants/reactions in the realtime publication.

## 4. Keys
- Only the publishable key (`sb_publishable_…`) goes in the web app (`web/.env`).
- Never put the secret / service-role key in client code.

## 5. Later (not needed for v1.0)
Custom SMTP for production emails (the built-in mailer is heavily rate limited), Google/Apple sign-in, daily backups (Pro plan), Supabase CLI (`supabase link`, `supabase db push`) to manage these migrations from the repo.
