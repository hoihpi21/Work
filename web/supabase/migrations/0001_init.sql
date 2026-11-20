-- Books & Friends v1.0 schema. Run once in Supabase Dashboard > SQL Editor.

-- ========== Tables ==========
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 40),
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  book_title text not null check (char_length(book_title) between 1 and 200),
  book_author text not null check (char_length(book_author) between 1 and 200),
  chapter_count int not null check (chapter_count between 1 and 200),
  created_at timestamptz not null default now()
);

create table public.chapters (
  session_id uuid not null references public.sessions(id) on delete cascade,
  position int not null check (position >= 1),
  title text,
  primary key (session_id, position)
);

create table public.participants (
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  chapters_completed int not null default 0 check (chapters_completed >= 0),
  progress_updated_at timestamptz not null default now(),
  joined_at timestamptz not null default now(),
  primary key (session_id, user_id)
);
create index on public.participants (user_id);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index on public.comments (session_id, created_at);

create table public.reactions (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 32),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id, emoji)
);

-- ========== Triggers / functions ==========
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- progress cannot exceed the session's chapter count
create function public.check_progress() returns trigger
language plpgsql as $$
declare n int;
begin
  select chapter_count into n from public.sessions where id = new.session_id;
  if new.chapters_completed > n then
    raise exception 'chapters_completed exceeds chapter_count';
  end if;
  new.progress_updated_at := now();
  return new;
end $$;

create trigger participants_check_progress before insert or update on public.participants
  for each row execute function public.check_progress();

create function public.touch_comment() returns trigger
language plpgsql as $$
begin
  if new.body is distinct from old.body then new.edited_at := now(); end if;
  return new;
end $$;

create trigger comments_touch before update on public.comments
  for each row execute function public.touch_comment();

-- Create a session + its chapters + host participation atomically.
-- p_chapters: ordered chapter titles (use empty strings for untitled chapters).
create function public.create_session(p_title text, p_author text, p_chapters text[])
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  sid uuid;
  n int := coalesce(array_length(p_chapters, 1), 0);
  i int;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if n < 1 or n > 200 then raise exception 'chapters must be between 1 and 200'; end if;
  insert into public.sessions (host_id, book_title, book_author, chapter_count)
  values (auth.uid(), trim(p_title), trim(p_author), n) returning id into sid;
  for i in 1..n loop
    insert into public.chapters (session_id, position, title)
    values (sid, i, nullif(trim(p_chapters[i]), ''));
  end loop;
  insert into public.participants (session_id, user_id) values (sid, auth.uid());
  return sid;
end $$;

revoke all on function public.create_session(text, text, text[]) from public, anon;
grant execute on function public.create_session(text, text, text[]) to authenticated;

-- ========== Row Level Security ==========
alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.chapters enable row level security;
alter table public.participants enable row level security;
alter table public.comments enable row level security;
alter table public.reactions enable row level security;

create policy "profiles readable" on public.profiles for select to authenticated using (true);
create policy "profiles update own" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "sessions readable" on public.sessions for select to authenticated using (true);
create policy "chapters readable" on public.chapters for select to authenticated using (true);
-- no direct insert/update/delete on sessions & chapters (create_session RPC only)

create policy "participants readable" on public.participants for select to authenticated using (true);
create policy "participants join self" on public.participants for insert to authenticated
  with check (user_id = auth.uid());
create policy "participants update own" on public.participants for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "participants leave" on public.participants for delete to authenticated
  using (user_id = auth.uid());

create policy "comments readable" on public.comments for select to authenticated using (true);
create policy "comments insert participant" on public.comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (select 1 from public.participants p where p.session_id = comments.session_id and p.user_id = auth.uid())
  );
create policy "comments update own" on public.comments for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "comments delete own" on public.comments for delete to authenticated
  using (author_id = auth.uid());

create policy "reactions readable" on public.reactions for select to authenticated using (true);
create policy "reactions insert participant" on public.reactions for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.comments c
      join public.participants p on p.session_id = c.session_id
      where c.id = reactions.comment_id and p.user_id = auth.uid()
    )
  );
create policy "reactions delete own" on public.reactions for delete to authenticated
  using (user_id = auth.uid());

-- ========== Realtime ==========
alter publication supabase_realtime add table public.comments, public.reactions, public.participants;
alter table public.reactions replica identity full;
alter table public.participants replica identity full;
