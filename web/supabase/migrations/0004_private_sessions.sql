-- Books & Friends v2.0 – step 4: Private sessions & invite links.
-- Run AFTER 0003_grants.sql in Supabase Dashboard > SQL Editor.

-- ========== Schema ==========
alter table public.sessions
  add column if not exists visibility text not null default 'public'
    check (visibility in ('public', 'private')),
  add column if not exists invite_code text unique;

create index if not exists sessions_visibility_created_idx
  on public.sessions (visibility, created_at desc);

-- ========== Helper functions (prevent RLS recursion) ==========
create or replace function public.is_session_member(p_session_id uuid)
returns boolean
language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.participants
    where session_id = p_session_id and user_id = auth.uid()
  );
$$;

create or replace function public.can_access_session(p_session_id uuid)
returns boolean
language sql security definer stable set search_path = '' as $$
  select exists (
    select 1 from public.sessions s
    where s.id = p_session_id
      and (
        s.visibility = 'public'
        or s.host_id = auth.uid()
        or exists (
          select 1 from public.participants p
          where p.session_id = s.id and p.user_id = auth.uid()
        )
      )
  );
$$;

create or replace function public.generate_invite_code()
returns text
language sql volatile set search_path = '' as $$
  select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
$$;

-- ========== RPCs ==========
-- Replace v1.0 3-arg create_session with 4-arg version (p_visibility defaults to 'public')
drop function if exists public.create_session(text, text, text[]);

create or replace function public.create_session(
  p_title text,
  p_author text,
  p_chapters text[],
  p_visibility text default 'public'
)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  sid uuid;
  n int := coalesce(array_length(p_chapters, 1), 0);
  vis text := coalesce(nullif(trim(p_visibility), ''), 'public');
  code text := null;
  i int;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if n < 1 or n > 200 then raise exception 'chapters must be between 1 and 200'; end if;
  if vis not in ('public', 'private') then raise exception 'invalid visibility'; end if;
  if vis = 'private' then
    code := public.generate_invite_code();
  end if;

  insert into public.sessions (host_id, book_title, book_author, chapter_count, visibility, invite_code)
  values (auth.uid(), trim(p_title), trim(p_author), n, vis, code)
  returning id into sid;

  for i in 1..n loop
    insert into public.chapters (session_id, position, title)
    values (sid, i, nullif(trim(p_chapters[i]), ''));
  end loop;

  insert into public.participants (session_id, user_id) values (sid, auth.uid());
  return sid;
end $$;

create or replace function public.join_by_invite(p_code text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  sid uuid;
  cleaned text := upper(trim(coalesce(p_code, '')));
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if cleaned = '' then raise exception 'invalid invite code'; end if;

  select id into sid from public.sessions where upper(invite_code) = cleaned;
  if sid is null then raise exception 'invite link is invalid or expired'; end if;

  insert into public.participants (session_id, user_id)
  values (sid, auth.uid())
  on conflict (session_id, user_id) do nothing;

  return sid;
end $$;

create or replace function public.regenerate_invite_code(p_session_id uuid)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  new_code text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.sessions where id = p_session_id and host_id = auth.uid()) then
    raise exception 'only the host can regenerate the invite link';
  end if;

  new_code := public.generate_invite_code();
  update public.sessions set invite_code = new_code where id = p_session_id;
  return new_code;
end $$;

-- ========== Tightened RLS for private sessions ==========
drop policy if exists "sessions readable" on public.sessions;
create policy "sessions readable" on public.sessions for select to authenticated
  using (visibility = 'public' or host_id = auth.uid() or public.is_session_member(id));

drop policy if exists "chapters readable" on public.chapters;
create policy "chapters readable" on public.chapters for select to authenticated
  using (public.can_access_session(session_id));

drop policy if exists "participants readable" on public.participants;
create policy "participants readable" on public.participants for select to authenticated
  using (public.can_access_session(session_id));

drop policy if exists "participants join self" on public.participants;
create policy "participants join self" on public.participants for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.sessions s
      where s.id = participants.session_id
        and (s.visibility = 'public' or s.host_id = auth.uid())
    )
  );

drop policy if exists "comments readable" on public.comments;
create policy "comments readable" on public.comments for select to authenticated
  using (public.can_access_session(session_id));

drop policy if exists "reactions readable" on public.reactions;
create policy "reactions readable" on public.reactions for select to authenticated
  using (
    exists (
      select 1 from public.comments c
      where c.id = reactions.comment_id and public.can_access_session(c.session_id)
    )
  );

-- ========== Grants ==========
revoke all on function public.generate_invite_code() from public, anon, authenticated;
revoke all on function public.create_session(text, text, text[], text) from public, anon;
grant execute on function public.create_session(text, text, text[], text) to authenticated;
revoke all on function public.join_by_invite(text) from public, anon;
grant execute on function public.join_by_invite(text) to authenticated;
revoke all on function public.regenerate_invite_code(uuid) from public, anon;
grant execute on function public.regenerate_invite_code(uuid) to authenticated;
grant execute on function public.is_session_member(uuid) to authenticated;
grant execute on function public.can_access_session(uuid) to authenticated;
