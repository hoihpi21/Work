-- Books & Friends v2.0 – step 7: Session files (PDF, DOC/DOCX, XML) & URL resources.
-- Run AFTER 0006_notifications.sql in Supabase Dashboard > SQL Editor.

-- ========== Table ==========
create table if not exists public.session_resources (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  uploader_id uuid default auth.uid() references public.profiles(id) on delete set null,
  kind text not null check (kind in ('file', 'url')),
  title text not null check (char_length(trim(title)) between 1 and 200),
  url text check (url is null or url ~* '^https?://'),
  storage_path text,
  file_name text,
  mime_type text,
  file_size bigint check (file_size is null or file_size >= 0),
  created_at timestamptz not null default now(),
  check (
    (kind = 'url' and url is not null and storage_path is null)
    or (kind = 'file' and storage_path is not null and url is null)
  )
);

create index if not exists session_resources_session_created_idx
  on public.session_resources (session_id, created_at desc);

-- ========== Row Level Security ==========
alter table public.session_resources enable row level security;

drop policy if exists "session_resources readable" on public.session_resources;
create policy "session_resources readable" on public.session_resources for select to authenticated
  using (public.can_access_session(session_id));

drop policy if exists "session_resources insert participant" on public.session_resources;
create policy "session_resources insert participant" on public.session_resources for insert to authenticated
  with check (
    uploader_id = auth.uid()
    and public.is_session_member(session_id)
  );

drop policy if exists "session_resources delete own or host" on public.session_resources;
create policy "session_resources delete own or host" on public.session_resources for delete to authenticated
  using (
    uploader_id = auth.uid()
    or exists (
      select 1 from public.sessions s
      where s.id = session_resources.session_id and s.host_id = auth.uid()
    )
  );

-- ========== Storage bucket: session-files (private, signed URLs) ==========
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'session-files',
  'session-files',
  false,
  26214400, -- 25 MB
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/xml',
    'text/xml',
    'text/plain'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Path format: <session_id>/<user_id>/<timestamp>-<filename>
drop policy if exists "session_files read member" on storage.objects;
create policy "session_files read member" on storage.objects for select to authenticated
  using (
    bucket_id = 'session-files'
    and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
    and public.can_access_session(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "session_files upload participant" on storage.objects;
create policy "session_files upload participant" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'session-files'
    and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.is_session_member(((storage.foldername(name))[1])::uuid)
  );

drop policy if exists "session_files delete own or host" on storage.objects;
create policy "session_files delete own or host" on storage.objects for delete to authenticated
  using (
    bucket_id = 'session-files'
    and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
    and (
      (storage.foldername(name))[2] = auth.uid()::text
      or exists (
        select 1 from public.sessions s
        where s.id = ((storage.foldername(name))[1])::uuid and s.host_id = auth.uid()
      )
    )
  );

-- ========== Realtime & Grants ==========
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'session_resources'
  ) then
    alter publication supabase_realtime add table public.session_resources;
  end if;
end $$;

grant select, insert, update, delete on public.session_resources to authenticated;
