-- =====================================================================
-- KENEWA members area update (October 2026)
--   1. Members can attach documents (evidence) to support requests
--   2. The Treasurer can download all member profiles as Excel,
--      but only after another committee member approves each download
--   3. The members' WhatsApp group link appears for registered members
--
-- Run ONCE in Supabase: SQL Editor > New query > paste everything > Run.
-- It is safe to run again (for example after changing the WhatsApp link).
-- New installs: setup.sql already includes this file, so you don't need it.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. EVIDENCE FOR SUPPORT REQUESTS
-- Files go in a PRIVATE storage bucket. Each member uploads into a folder
-- named after their own account. Only that member and the committee can
-- open the files.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('support-evidence', 'support-evidence', false, 10485760,   -- 10 MB per file
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf',
              'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "evidence upload to own folder" on storage.objects;
create policy "evidence upload to own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'support-evidence' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "evidence open own or committee" on storage.objects;
create policy "evidence open own or committee" on storage.objects for select to authenticated
  using (bucket_id = 'support-evidence'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.is_committee()));

drop policy if exists "evidence delete by committee" on storage.objects;
create policy "evidence delete by committee" on storage.objects for delete to authenticated
  using (bucket_id = 'support-evidence' and public.is_committee());

-- The list of attached files is saved with the request (up to 5 files)
alter table public.support_requests add column if not exists attachments jsonb not null default '[]'::jsonb;

-- Every attached file must be in the member's own folder
create or replace function public.attachments_ok(files jsonb, owner uuid)
returns boolean language sql immutable as $$
  select jsonb_typeof(files) = 'array'
     and jsonb_array_length(files) <= 5
     and not exists (
       select 1 from jsonb_array_elements(files) f
        where jsonb_typeof(f) <> 'object'
           or coalesce(f->>'path', '') not like owner::text || '/%'
     );
$$;
alter table public.support_requests drop constraint if exists support_attachments_ok;
alter table public.support_requests add constraint support_attachments_ok
  check (public.attachments_ok(attachments, member_id));


-- ---------------------------------------------------------------------
-- 2. EXCEL EXPORT OF MEMBER PROFILES (Treasurer, with committee approval)
--   - Only the committee member whose role is "Treasurer" can ask.
--   - A DIFFERENT committee member must approve.
--   - The approval allows ONE download within 48 hours.
--   - Every request, decision and download is recorded.
-- ---------------------------------------------------------------------
create table if not exists public.export_requests (
  id bigint generated always as identity primary key,
  requested_by uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'downloaded')),
  decided_by uuid references auth.users(id) on delete set null,
  decision_note text,
  decided_at timestamptz,
  downloaded_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.export_requests enable row level security;

-- The committee can see the record; changes only happen through the functions below
drop policy if exists "exports read" on public.export_requests;
create policy "exports read" on public.export_requests for select to authenticated
  using (public.is_committee());

create or replace function public.is_treasurer()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.committee
                  where user_id = auth.uid() and lower(trim(coalesce(role, ''))) = 'treasurer');
$$;

-- Treasurer: ask for an export
create or replace function public.export_request(p_reason text)
returns bigint language plpgsql security definer set search_path = public as $$
declare new_id bigint;
begin
  if not public.is_treasurer() then
    raise exception 'Only the Treasurer can ask for a members export';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Please say why the export is needed';
  end if;
  if exists (select 1 from public.export_requests
              where requested_by = auth.uid() and status in ('pending', 'approved')
                and (status = 'pending' or decided_at > now() - interval '48 hours')) then
    raise exception 'You already have an export request open';
  end if;
  insert into public.export_requests (requested_by, reason) values (auth.uid(), trim(p_reason))
  returning id into new_id;
  -- tell the rest of the committee
  insert into public.notifications (member_id, title, body)
  select c.user_id, 'Members export waiting for approval',
         'The Treasurer has asked to download all member profiles. Reason: ' || trim(p_reason)
         || ' Open the committee area, then Members export, to approve or decline.'
    from public.committee c
    join public.profiles p on p.id = c.user_id
   where c.user_id <> auth.uid();
  return new_id;
end;
$$;

-- Another committee member: approve or decline
create or replace function public.export_decide(p_id bigint, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.export_requests;
begin
  if not public.is_committee() then
    raise exception 'Only committee members can approve exports';
  end if;
  select * into r from public.export_requests where id = p_id for update;
  if not found then raise exception 'Export request not found'; end if;
  if r.status <> 'pending' then raise exception 'This request has already been decided'; end if;
  if r.requested_by = auth.uid() then
    raise exception 'Another committee member must approve your own export request';
  end if;
  update public.export_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(p_note), '')
   where id = p_id;
  if exists (select 1 from public.profiles where id = r.requested_by) then
    insert into public.notifications (member_id, title, body)
    values (r.requested_by,
            case when p_approve then 'Members export approved' else 'Members export declined' end,
            case when p_approve
                 then 'You can download the Excel file once, within 48 hours, from the committee area (Members export).'
                 else 'The committee did not approve the export.' || coalesce(' Note: ' || nullif(trim(p_note), ''), '') end);
  end if;
end;
$$;

-- Treasurer: download (once) after approval. Returns every profile and family member.
create or replace function public.export_members(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.export_requests;
begin
  if not public.is_treasurer() then
    raise exception 'Only the Treasurer can download the members export';
  end if;
  select * into r from public.export_requests where id = p_id for update;
  if not found or r.requested_by <> auth.uid() then raise exception 'Export request not found'; end if;
  if r.status = 'downloaded' then raise exception 'This export has already been downloaded. Please ask again'; end if;
  if r.status <> 'approved' then raise exception 'This export has not been approved'; end if;
  if r.decided_at < now() - interval '48 hours' then
    raise exception 'The approval has expired (48 hours). Please ask again';
  end if;
  update public.export_requests set status = 'downloaded', downloaded_at = now() where id = p_id;
  return jsonb_build_object(
    'generated_at', now(),
    'members', coalesce((select jsonb_agg(to_jsonb(p) order by p.member_number nulls last, p.last_name, p.first_name)
                           from public.profiles p), '[]'::jsonb),
    'family',  coalesce((select jsonb_agg(to_jsonb(f) order by f.member_id, f.kind, f.id)
                           from public.family_members f), '[]'::jsonb));
end;
$$;


-- ---------------------------------------------------------------------
-- 3. MEMBERS' WHATSAPP GROUP LINK
-- Kept in the database (not in the website files) and only given to
-- members who have submitted their registration.
--
-- Do NOT write the real link in this file: the files are on GitHub.
-- To set or change it, run this ONE line on its own in the SQL Editor
-- (paste your group's invite link):
--
--   update public.app_settings set value = 'https://chat.whatsapp.com/YOUR-LINK'
--    where key = 'whatsapp_group_link';
--
-- Running this file again keeps the link you set.
-- ---------------------------------------------------------------------
create table if not exists public.app_settings (
  key text primary key,
  value text
);
alter table public.app_settings enable row level security;   -- no policies: read only through the function below

insert into public.app_settings (key, value)
values ('whatsapp_group_link', null)
on conflict (key) do nothing;

create or replace function public.member_whatsapp_link()
returns text language sql stable security definer set search_path = public as $$
  select s.value from public.app_settings s
   where s.key = 'whatsapp_group_link'
     and exists (select 1 from public.profiles p
                  where p.id = auth.uid() and p.status in ('pending', 'active'));
$$;

-- Only signed-in people may call these functions
revoke execute on function public.export_request(text), public.export_decide(bigint, boolean, text),
                         public.export_members(bigint), public.member_whatsapp_link(), public.is_treasurer()
  from public, anon;
grant execute on function public.export_request(text), public.export_decide(bigint, boolean, text),
                        public.export_members(bigint), public.member_whatsapp_link(), public.is_treasurer()
  to authenticated;
