-- Step 3: table privileges for the API roles.
-- Newer Supabase projects don't auto-grant on public tables, which causes
-- "permission denied for table ...". RLS policies still restrict what rows are accessible.
-- Run in SQL Editor (safe to re-run).
grant usage on schema public to anon,
authenticated;

grant
select
,
    insert,
update,
delete on all tables in schema public to authenticated;

grant usage,
select
    on all sequences in schema public to authenticated;

grant execute on all functions in schema public to authenticated;

-- keep the sign-up trigger function and internal helpers away from clients
revoke execute on function public.handle_new_user ()
from
    public,
    anon,
    authenticated;

-- future objects created by the postgres role get the same grants
alter default privileges in schema public grant
select
,
    insert,
update,
delete on tables to authenticated;

alter default privileges in schema public grant usage,
select
    on sequences to authenticated;