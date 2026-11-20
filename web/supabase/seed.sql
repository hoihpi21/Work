-- Books & Friends seed data. Run in Supabase SQL Editor AFTER 0001 (and 0002).
-- Safe to re-run: seed sessions are skipped if they already exist.
-- Edit the 4 values below if needed.

do $$
declare
  email_a  text := 'your-email';  -- user A
  name_a   text := 'firstname';                   -- new display name for user A
  name_b   text := 'lastname';                   -- new display name for the other user
  a uuid; b uuid;
  s1 uuid; s2 uuid; s3 uuid;
  c1 uuid; c2 uuid; c3 uuid; c4 uuid; c5 uuid;
begin
  select id into a from auth.users where lower(email) = lower(email_a);
  if a is null then raise exception 'User % not found in auth.users', email_a; end if;

  -- user B = the earliest-created other user
  select id into b from auth.users where id <> a order by created_at limit 1;
  if b is null then raise exception 'A second user is required (create it in Authentication > Users)'; end if;

  -- profiles (normally created by trigger; upsert covers users created before 0001)
  insert into public.profiles (id, display_name) values (a, name_a), (b, name_b)
  on conflict (id) do update set display_name = excluded.display_name;

  if exists (select 1 from public.sessions where book_title in ('The Little Prince', 'Atomic Habits', 'Pride and Prejudice') and host_id in (a, b)) then
    raise notice 'Seed sessions already exist – display names updated only.';
    return;
  end if;

  -- ===== Session 1: The Little Prince (hosted by A, 12 chapters) =====
  insert into public.sessions (host_id, book_title, book_author, chapter_count, created_at)
  values (a, 'The Little Prince', 'Antoine de Saint-Exupéry', 12, now() - interval '5 days') returning id into s1;
  insert into public.chapters (session_id, position, title)
  select s1, g, 'Chapter ' || g from generate_series(1, 12) g;
  insert into public.participants (session_id, user_id, chapters_completed, joined_at) values
    (s1, a, 8, now() - interval '5 days'),
    (s1, b, 5, now() - interval '4 days');

  insert into public.comments (id, session_id, author_id, body, created_at)
  values (gen_random_uuid(), s1, a, 'Just finished the chapter with the fox. "What is essential is invisible to the eye" hit hard.', now() - interval '2 days') returning id into c1;
  insert into public.comments (id, session_id, author_id, body, created_at)
  values (gen_random_uuid(), s1, b, 'I''m only at chapter 5 – no spoilers please! The baobab part is hilarious though 😄', now() - interval '47 hours') returning id into c2;
  insert into public.comments (id, session_id, author_id, body, created_at)
  values (gen_random_uuid(), s1, a, 'Promise, no spoilers. Take your time!', now() - interval '46 hours') returning id into c3;
  insert into public.reactions (comment_id, user_id, emoji) values
    (c1, b, '❤️'), (c1, b, '🥹'), (c2, a, '😂'), (c3, b, '👍');

  -- ===== Session 2: Atomic Habits (hosted by B, 20 chapters) =====
  insert into public.sessions (host_id, book_title, book_author, chapter_count, created_at)
  values (b, 'Atomic Habits', 'James Clear', 20, now() - interval '3 days') returning id into s2;
  insert into public.chapters (session_id, position, title)
  select s2, g, 'Chapter ' || g from generate_series(1, 20) g;
  insert into public.participants (session_id, user_id, chapters_completed, joined_at) values
    (s2, b, 12, now() - interval '3 days'),
    (s2, a, 3, now() - interval '2 days');

  insert into public.comments (id, session_id, author_id, body, created_at)
  values (gen_random_uuid(), s2, b, 'The "1% better every day" idea is so simple, yet I''ve started tracking my habits already.', now() - interval '30 hours') returning id into c4;
  insert into public.comments (id, session_id, author_id, body, created_at)
  values (gen_random_uuid(), s2, a, 'Habit stacking is my favourite so far. Reading after morning coffee 📚☕', now() - interval '20 hours') returning id into c5;
  insert into public.reactions (comment_id, user_id, emoji) values
    (c4, a, '🔥'), (c4, a, '👏'), (c5, b, '☕'), (c5, b, '👍');

  -- ===== Session 3: Pride and Prejudice (hosted by A, named chapters, nobody discussing yet) =====
  insert into public.sessions (host_id, book_title, book_author, chapter_count, created_at)
  values (a, 'Pride and Prejudice', 'Jane Austen', 6, now() - interval '1 day') returning id into s3;
  insert into public.chapters (session_id, position, title) values
    (s3, 1, 'It is a truth universally acknowledged'),
    (s3, 2, 'The Netherfield ball'),
    (s3, 3, 'Mr. Collins arrives'),
    (s3, 4, 'Wickham''s story'),
    (s3, 5, 'Hunsford'),
    (s3, 6, 'Pemberley');
  insert into public.participants (session_id, user_id, chapters_completed, joined_at) values
    (s3, a, 1, now() - interval '1 day');

  raise notice 'Seed complete. A=% (%), B=% (%)', a, name_a, b, name_b;
end $$;

-- Check:
-- select s.book_title, p.display_name, pa.chapters_completed, s.chapter_count
-- from public.participants pa join public.sessions s on s.id = pa.session_id
-- join public.profiles p on p.id = pa.user_id order by 1, 2;
