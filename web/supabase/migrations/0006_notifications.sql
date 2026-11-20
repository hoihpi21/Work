-- Books & Friends v2.0 – step 6: In-app notifications, session mute & push token storage.
-- Run AFTER 0005_spoilers_search_host_controls.sql in Supabase Dashboard > SQL Editor.

-- ========== Per-session mute on participants ==========
alter table public.participants
  add column if not exists muted boolean not null default false;

-- ========== Notifications table ==========
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null check (type in ('comment', 'reply', 'reaction')),
  session_id uuid not null references public.sessions(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  emoji text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

-- ========== Push tokens table (Expo Push Notifications) ==========
create table if not exists public.push_tokens (
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  token text not null check (char_length(token) between 10 and 255),
  platform text not null check (platform in ('ios', 'android', 'web')),
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);

-- ========== Notification triggers ==========
create or replace function public.notify_on_comment()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  parent_author uuid;
begin
  if new.reply_to_id is not null then
    select author_id into parent_author from public.comments where id = new.reply_to_id;
  end if;

  insert into public.notifications (user_id, actor_id, type, session_id, comment_id)
  select
    p.user_id,
    new.author_id,
    case when p.user_id = parent_author then 'reply' else 'comment' end,
    new.session_id,
    new.id
  from public.participants p
  where p.session_id = new.session_id
    and p.user_id <> new.author_id
    and p.muted = false;

  return new;
end $$;

drop trigger if exists comments_notify on public.comments;
create trigger comments_notify after insert on public.comments
  for each row execute function public.notify_on_comment();

create or replace function public.notify_on_reaction()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  c_author uuid;
  c_session uuid;
  is_muted boolean;
begin
  select author_id, session_id into c_author, c_session
  from public.comments where id = new.comment_id;

  if c_author is null or c_author = new.user_id then
    return new;
  end if;

  select muted into is_muted
  from public.participants
  where session_id = c_session and user_id = c_author;

  if is_muted is false then
    insert into public.notifications (user_id, actor_id, type, session_id, comment_id, emoji)
    values (c_author, new.user_id, 'reaction', c_session, new.comment_id, new.emoji);
  end if;

  return new;
end $$;

drop trigger if exists reactions_notify on public.reactions;
create trigger reactions_notify after insert on public.reactions
  for each row execute function public.notify_on_reaction();

-- ========== Row Level Security ==========
alter table public.notifications enable row level security;
alter table public.push_tokens enable row level security;

drop policy if exists "notifications read own" on public.notifications;
create policy "notifications read own" on public.notifications for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "notifications update own" on public.notifications;
create policy "notifications update own" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "notifications delete own" on public.notifications;
create policy "notifications delete own" on public.notifications for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists "push_tokens manage own" on public.push_tokens;
create policy "push_tokens manage own" on public.push_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ========== Realtime & Grants ==========
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

grant select, insert, update, delete on public.notifications to authenticated;
grant select, insert, update, delete on public.push_tokens to authenticated;
revoke execute on function public.notify_on_comment() from public, anon, authenticated;
revoke execute on function public.notify_on_reaction() from public, anon, authenticated;
