-- Books & Friends v2.0 – step 5: Spoiler chapter tags, quote-replies, search indexes & host controls.
-- Run AFTER 0004_private_sessions.sql in Supabase Dashboard > SQL Editor.

-- ========== Spoilers & Quote-replies on comments ==========
alter table public.comments
  add column if not exists chapter_ref int check (chapter_ref >= 1),
  add column if not exists reply_to_id uuid references public.comments(id) on delete set null;

create index if not exists comments_reply_to_idx on public.comments (reply_to_id);

create or replace function public.validate_comment_refs()
returns trigger
language plpgsql set search_path = '' as $$
declare
  max_ch int;
  parent_sid uuid;
begin
  if new.chapter_ref is not null then
    select chapter_count into max_ch from public.sessions where id = new.session_id;
    if new.chapter_ref > max_ch then
      raise exception 'chapter_ref exceeds session chapter_count';
    end if;
  end if;

  if new.reply_to_id is not null then
    select session_id into parent_sid from public.comments where id = new.reply_to_id;
    if parent_sid is distinct from new.session_id then
      raise exception 'reply_to_id must belong to the same session';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists comments_validate_refs on public.comments;
create trigger comments_validate_refs before insert or update on public.comments
  for each row execute function public.validate_comment_refs();

-- ========== Search indexes (trigram for fast ilike) ==========
create extension if not exists pg_trgm;
create index if not exists sessions_book_title_trgm_idx on public.sessions using gin (book_title gin_trgm_ops);
create index if not exists sessions_book_author_trgm_idx on public.sessions using gin (book_author gin_trgm_ops);

-- ========== Host controls RPCs ==========
create or replace function public.update_session(
  p_session_id uuid,
  p_title text,
  p_author text,
  p_chapters text[],
  p_visibility text default null
)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  n int := coalesce(array_length(p_chapters, 1), 0);
  max_done int;
  cur_vis text;
  cur_code text;
  next_vis text;
  next_code text;
  i int;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select visibility, invite_code into cur_vis, cur_code
  from public.sessions where id = p_session_id and host_id = auth.uid();
  if cur_vis is null then raise exception 'only the host can edit this session'; end if;
  if n < 1 or n > 200 then raise exception 'chapters must be between 1 and 200'; end if;

  select coalesce(max(chapters_completed), 0) into max_done
  from public.participants where session_id = p_session_id;
  if n < max_done then
    raise exception 'cannot reduce chapters below a reader''s current progress (%)', max_done;
  end if;

  next_vis := coalesce(nullif(trim(p_visibility), ''), cur_vis);
  if next_vis not in ('public', 'private') then raise exception 'invalid visibility'; end if;
  next_code := cur_code;
  if next_vis = 'private' and next_code is null then
    next_code := public.generate_invite_code();
  end if;

  update public.sessions
  set book_title = trim(p_title),
      book_author = trim(p_author),
      chapter_count = n,
      visibility = next_vis,
      invite_code = next_code
  where id = p_session_id;

  delete from public.chapters where session_id = p_session_id and position > n;
  for i in 1..n loop
    insert into public.chapters (session_id, position, title)
    values (p_session_id, i, nullif(trim(p_chapters[i]), ''))
    on conflict (session_id, position) do update set title = excluded.title;
  end loop;
end $$;

create or replace function public.delete_session(p_session_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.sessions where id = p_session_id and host_id = auth.uid()) then
    raise exception 'only the host can delete this session';
  end if;
  delete from public.sessions where id = p_session_id;
end $$;

create or replace function public.remove_participant(p_session_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_user_id = auth.uid() then raise exception 'host cannot remove themselves'; end if;
  if not exists (select 1 from public.sessions where id = p_session_id and host_id = auth.uid()) then
    raise exception 'only the host can remove participants';
  end if;
  delete from public.participants where session_id = p_session_id and user_id = p_user_id;
end $$;

-- Host can also delete any comment in their session (moderation)
drop policy if exists "comments delete host" on public.comments;
create policy "comments delete host" on public.comments for delete to authenticated
  using (
    exists (
      select 1 from public.sessions s
      where s.id = comments.session_id and s.host_id = auth.uid()
    )
  );

-- ========== Grants ==========
revoke all on function public.update_session(uuid, text, text, text[], text) from public, anon;
grant execute on function public.update_session(uuid, text, text, text[], text) to authenticated;
revoke all on function public.delete_session(uuid) from public, anon;
grant execute on function public.delete_session(uuid) to authenticated;
revoke all on function public.remove_participant(uuid, uuid) from public, anon;
grant execute on function public.remove_participant(uuid, uuid) to authenticated;
