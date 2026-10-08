-- =====================================================================
-- KENEWA Membership Management System: database setup
-- Run this ONCE in Supabase: SQL Editor > New query > paste > Run
-- =====================================================================

-- ---------- Tables ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  first_name text,
  last_name text,
  phone text,
  date_of_birth date,
  gender text,
  street_address text,
  town text,
  postcode text,
  occupation text,
  home_county text,
  father_name text,
  mother_name text,
  nok_name text,
  nok_relationship text,
  nok_phone text,
  nok_country text,
  membership_type text not null default 'financial' check (membership_type in ('financial', 'community')),
  status text not null default 'incomplete' check (status in ('incomplete', 'pending', 'active', 'lapsed')),
  member_number text unique,
  agreed_constitution boolean not null default false,
  family_locked boolean not null default false,
  registered_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.family_members (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('spouse', 'dependant', 'sibling')),
  full_name text not null,
  relationship text,
  date_of_birth date,
  country text,
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.profiles(id) on delete cascade,
  purpose text not null,
  amount numeric(10,2) not null check (amount > 0),
  method text,
  reference text,
  paid_on date,
  status text not null default 'awaiting' check (status in ('awaiting', 'confirmed', 'rejected')),
  created_at timestamptz not null default now()
);

create table if not exists public.support_requests (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.profiles(id) on delete cascade,
  support_type text not null,
  urgency text not null,
  message text not null,
  preferred_contact text,
  best_time text,
  status text not null default 'new' check (status in ('new', 'in_progress', 'resolved')),
  committee_note text,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  member_id uuid references public.profiles(id) on delete cascade,  -- empty = all members
  title text not null,
  body text,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_reads (
  member_id uuid not null references public.profiles(id) on delete cascade,
  notification_id bigint not null references public.notifications(id) on delete cascade,
  primary key (member_id, notification_id)
);

create table if not exists public.committee (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text
);

create sequence if not exists public.member_no_seq;

-- ---------- Helper: is the signed-in person on the committee? ----------
create or replace function public.is_committee()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.committee where user_id = auth.uid());
$$;

-- ---------- Create a profile automatically when someone signs up ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, first_name, last_name, phone)
  values (new.id, new.email,
          new.raw_user_meta_data->>'first_name',
          new.raw_user_meta_data->>'last_name',
          new.raw_user_meta_data->>'phone');
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Row Level Security: who can see and change what ----------
alter table public.profiles           enable row level security;
alter table public.family_members     enable row level security;
alter table public.payments           enable row level security;
alter table public.support_requests   enable row level security;
alter table public.notifications      enable row level security;
alter table public.notification_reads enable row level security;
alter table public.committee          enable row level security;

-- profiles
create policy "profiles read"   on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_committee());
create policy "profiles update" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_committee())
  with check (id = auth.uid() or public.is_committee());

-- payments
create policy "payments read"   on public.payments for select to authenticated
  using (member_id = auth.uid() or public.is_committee());
create policy "payments add"    on public.payments for insert to authenticated
  with check (member_id = auth.uid() and status = 'awaiting');
create policy "payments update" on public.payments for update to authenticated
  using (public.is_committee()) with check (public.is_committee());

-- support requests
create policy "support read"   on public.support_requests for select to authenticated
  using (member_id = auth.uid() or public.is_committee());
create policy "support add"    on public.support_requests for insert to authenticated
  with check (member_id = auth.uid() and status = 'new' and committee_note is null);
create policy "support update" on public.support_requests for update to authenticated
  using (public.is_committee()) with check (public.is_committee());

-- notifications
create policy "notifications read"   on public.notifications for select to authenticated
  using (member_id is null or member_id = auth.uid() or public.is_committee());
create policy "notifications add"    on public.notifications for insert to authenticated
  with check (public.is_committee());
create policy "notifications remove" on public.notifications for delete to authenticated
  using (public.is_committee());

-- notification reads
create policy "reads read" on public.notification_reads for select to authenticated
  using (member_id = auth.uid());
create policy "reads add"  on public.notification_reads for insert to authenticated
  with check (member_id = auth.uid());

-- committee list
create policy "committee read" on public.committee for select to authenticated
  using (user_id = auth.uid() or public.is_committee());

-- =====================================================================
-- Family rules: 1 spouse, 7 dependants, 7 siblings; first entries are
-- approved automatically, later changes need committee approval.
-- (Same as family-rules.sql.)
-- =====================================================================

-- ---------- New columns ----------
alter table public.profiles
  add column if not exists family_locked boolean not null default false;

alter table public.family_members
  add column if not exists pending_action text,
  add column if not exists pending_full_name text,
  add column if not exists pending_relationship text,
  add column if not exists pending_date_of_birth date,
  add column if not exists pending_country text,
  add column if not exists pending_requested_at timestamptz;

-- Allow "spouse" as its own kind of family member
alter table public.family_members drop constraint if exists family_members_kind_check;
update public.family_members
   set kind = 'spouse'
 where kind = 'dependant' and relationship ilike 'spouse%';
alter table public.family_members
  add constraint family_members_kind_check check (kind in ('spouse', 'dependant', 'sibling'));

alter table public.family_members drop constraint if exists family_members_pending_action_check;
alter table public.family_members
  add constraint family_members_pending_action_check
  check (pending_action is null or pending_action in ('add', 'update', 'remove'));

-- ---------- Bring existing records into line with the new rules ----------
-- Active members' family lists count as already confirmed
update public.profiles set family_locked = true where status = 'active';
-- Unconfirmed members: what they have added so far is approved automatically
update public.family_members f
   set approved = true, pending_action = null
  from public.profiles p
 where p.id = f.member_id and not p.family_locked and not f.approved;
-- Confirmed members: anything still unapproved is a new addition waiting for the committee
update public.family_members
   set pending_action = 'add', pending_requested_at = coalesce(pending_requested_at, now())
 where not approved and pending_action is null;

-- ---------- Members cannot unlock their own family list ----------
create or replace function public.protect_profile()
returns trigger language plpgsql set search_path = public as $$
begin
  -- applies to people signed in on the website; the Supabase SQL Editor is not restricted
  if auth.uid() is not null and not public.is_committee() then
    new.id := old.id;
    new.member_number := old.member_number;
    new.family_locked := old.family_locked or new.family_locked;   -- can lock, never unlock
    if old.status = 'incomplete' and new.status = 'pending' then
      new.registered_at := now();
    else
      new.status := old.status;
      new.registered_at := old.registered_at;
    end if;
  end if;
  return new;
end;
$$;

-- ---------- Approving a membership also confirms the family list ----------
create or replace function public.approve_member(target uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_committee() then
    raise exception 'Only committee members can approve members';
  end if;
  update public.profiles
     set status = 'active',
         family_locked = true,
         member_number = coalesce(member_number, 'KN-' || lpad(nextval('public.member_no_seq')::text, 4, '0'))
   where id = target;
  -- anything the member had added is approved along with the membership
  update public.family_members
     set approved = true
   where member_id = target and not approved and pending_action is null;
end;
$$;

-- ---------- Member actions ----------
create or replace function public.family_limit(p_kind text)
returns int language sql immutable as $$
  select case p_kind when 'spouse' then 1 when 'dependant' then 7 when 'sibling' then 7 else 0 end;
$$;

-- Add a person. Approved straight away until the family list is confirmed.
create or replace function public.family_add(
  p_kind text, p_full_name text, p_relationship text default null,
  p_date_of_birth date default null, p_country text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  locked boolean;
  how_many int;
  new_id bigint;
begin
  if me is null then raise exception 'Please sign in first'; end if;
  if p_kind not in ('spouse', 'dependant', 'sibling') then raise exception 'Unknown family type'; end if;
  if coalesce(trim(p_full_name), '') = '' then raise exception 'Please enter a full name'; end if;
  if p_date_of_birth > current_date then raise exception 'Date of birth cannot be in the future'; end if;

  select family_locked into locked from public.profiles where id = me for update;
  if not found then raise exception 'Profile not found'; end if;

  select count(*) into how_many from public.family_members where member_id = me and kind = p_kind;
  if how_many >= public.family_limit(p_kind) then
    raise exception 'You can register up to % %', public.family_limit(p_kind),
      case p_kind when 'spouse' then 'spouse' when 'dependant' then 'dependants' else 'siblings' end;
  end if;

  insert into public.family_members
         (member_id, kind, full_name, relationship, date_of_birth, country,
          approved, pending_action, pending_requested_at)
  values (me, p_kind, trim(p_full_name),
          case when p_kind = 'spouse' then 'Spouse or partner' else nullif(trim(p_relationship), '') end,
          p_date_of_birth, nullif(trim(p_country), ''),
          not locked,
          case when locked then 'add' end,
          case when locked then now() end)
  returning id into new_id;
  return new_id;
end;
$$;

-- Change a person's details. After the list is confirmed, the change waits for approval.
create or replace function public.family_update(
  p_id bigint, p_full_name text, p_relationship text default null,
  p_date_of_birth date default null, p_country text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  locked boolean;
  r public.family_members;
begin
  if me is null then raise exception 'Please sign in first'; end if;
  if coalesce(trim(p_full_name), '') = '' then raise exception 'Please enter a full name'; end if;
  if p_date_of_birth > current_date then raise exception 'Date of birth cannot be in the future'; end if;

  select * into r from public.family_members where id = p_id and member_id = me for update;
  if not found then raise exception 'Family member not found'; end if;
  select family_locked into locked from public.profiles where id = me;

  if r.kind = 'spouse' then p_relationship := 'Spouse or partner'; end if;

  if not locked or r.pending_action = 'add' then
    -- not yet confirmed, or still a new request: just correct it
    update public.family_members
       set full_name = trim(p_full_name), relationship = nullif(trim(p_relationship), ''),
           date_of_birth = p_date_of_birth, country = nullif(trim(p_country), '')
     where id = p_id;
  else
    update public.family_members
       set pending_action = 'update',
           pending_full_name = trim(p_full_name),
           pending_relationship = nullif(trim(p_relationship), ''),
           pending_date_of_birth = p_date_of_birth,
           pending_country = nullif(trim(p_country), ''),
           pending_requested_at = now()
     where id = p_id;
  end if;
end;
$$;

-- Remove a person. After the list is confirmed, removal waits for approval.
create or replace function public.family_remove(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  locked boolean;
  r public.family_members;
begin
  if me is null then raise exception 'Please sign in first'; end if;
  select * into r from public.family_members where id = p_id and member_id = me for update;
  if not found then raise exception 'Family member not found'; end if;
  select family_locked into locked from public.profiles where id = me;

  if not locked or r.pending_action = 'add' then
    delete from public.family_members where id = p_id;
  else
    update public.family_members
       set pending_action = 'remove',
           pending_full_name = null, pending_relationship = null,
           pending_date_of_birth = null, pending_country = null,
           pending_requested_at = now()
     where id = p_id;
  end if;
end;
$$;

-- Withdraw a request that is still waiting for the committee
create or replace function public.family_cancel(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  r public.family_members;
begin
  if me is null then raise exception 'Please sign in first'; end if;
  select * into r from public.family_members where id = p_id and member_id = me for update;
  if not found then raise exception 'Family member not found'; end if;
  if r.pending_action = 'add' then
    delete from public.family_members where id = p_id;
  elsif r.pending_action in ('update', 'remove') then
    update public.family_members
       set pending_action = null, pending_full_name = null, pending_relationship = null,
           pending_date_of_birth = null, pending_country = null, pending_requested_at = null
     where id = p_id;
  end if;
end;
$$;

-- Member confirms their family list is complete
create or replace function public.family_confirm()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please sign in first'; end if;
  update public.profiles set family_locked = true where id = auth.uid();
end;
$$;

-- ---------- Committee action: approve or reject a waiting request ----------
create or replace function public.family_review(p_id bigint, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.family_members;
  what text;
begin
  if not public.is_committee() then
    raise exception 'Only committee members can approve family changes';
  end if;
  select * into r from public.family_members where id = p_id for update;
  if not found then raise exception 'Family member not found'; end if;
  if r.pending_action is null then return; end if;

  if r.pending_action = 'add' then
    what := 'adding ' || r.full_name;
    if p_approve then
      update public.family_members set approved = true, pending_action = null, pending_requested_at = null where id = p_id;
    else
      delete from public.family_members where id = p_id;
    end if;
  elsif r.pending_action = 'update' then
    what := 'changes to ' || r.full_name;
    if p_approve then
      update public.family_members
         set full_name = r.pending_full_name, relationship = r.pending_relationship,
             date_of_birth = r.pending_date_of_birth, country = r.pending_country
       where id = p_id;
    end if;
    update public.family_members
       set pending_action = null, pending_full_name = null, pending_relationship = null,
           pending_date_of_birth = null, pending_country = null, pending_requested_at = null
     where id = p_id;
  elsif r.pending_action = 'remove' then
    what := 'removing ' || r.full_name;
    if p_approve then
      delete from public.family_members where id = p_id;
    else
      update public.family_members set pending_action = null, pending_requested_at = null where id = p_id;
    end if;
  end if;

  insert into public.notifications (member_id, title, body)
  values (r.member_id,
          case when p_approve then 'Family update approved' else 'Family update not approved' end,
          'The committee has ' || case when p_approve then 'approved' else 'not approved' end
            || ' your request: ' || what || '.'
            || case when p_approve then '' else ' Please contact the committee if you have questions.' end);
end;
$$;

-- ---------- Security: family records only change through the actions above ----------
drop policy if exists "family add"     on public.family_members;
drop policy if exists "family remove"  on public.family_members;
drop policy if exists "family approve" on public.family_members;
drop policy if exists "family read"    on public.family_members;
create policy "family read" on public.family_members for select to authenticated
  using (member_id = auth.uid() or public.is_committee());

revoke execute on function public.family_add(text, text, text, date, text)    from anon;
revoke execute on function public.family_update(bigint, text, text, date, text) from anon;
revoke execute on function public.family_remove(bigint)  from anon;
revoke execute on function public.family_cancel(bigint)  from anon;
revoke execute on function public.family_confirm()       from anon;
revoke execute on function public.family_review(bigint, boolean) from anon;

-- ---------- Members cannot change their own status, member number or unlock their family list ----------
drop trigger if exists protect_profile on public.profiles;
create trigger protect_profile
  before update on public.profiles
  for each row execute function public.protect_profile();

-- =====================================================================
-- AFTER you have created your own account on the website, make yourself
-- a committee administrator by running this (change the email):
--
--   insert into public.committee (user_id, role)
--   select id, 'Secretary' from auth.users where email = 'your-email@example.com';
-- =====================================================================

-- =====================================================================
-- Included from members-update.sql (evidence uploads, members export, WhatsApp link)
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

-- =====================================================================
-- Included from portal-update.sql (type choice, welfare services, voting, documents, export)
-- =====================================================================
-- -------------------------------------------------------------------
-- 1. MEMBERSHIP TYPE IS CHOSEN FIRST
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists type_chosen boolean not null default false;
-- people who already submitted a registration have already chosen
update public.profiles set type_chosen = true where status <> 'incomplete' and not type_chosen;


-- ---------------------------------------------------------------------
-- 2. WHO CAN USE WELFARE MEMBER SERVICES
--    A welfare (financial) member whose $200 joining fees have been
--    confirmed by the Treasurer, and whose membership has not lapsed.
-- ---------------------------------------------------------------------
create or replace function public.fees_confirmed(p_member uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.payments
                  where member_id = p_member and purpose = 'Joining fees' and status = 'confirmed');
$$;

create or replace function public.is_welfare_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p
                  where p.id = auth.uid()
                    and p.membership_type = 'financial'
                    and p.status in ('pending', 'active')
                    and public.fees_confirmed(p.id));
$$;

-- Tell the member when the Treasurer confirms their joining fees
create or replace function public.joining_fees_confirmed_notice()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.purpose = 'Joining fees' and new.status = 'confirmed'
     and old.status is distinct from 'confirmed' then
    insert into public.notifications (member_id, title, body)
    values (new.member_id, 'Your welfare member services are unlocked',
            'Thank you: the Treasurer has confirmed your joining fees. Open Member services to vote, '
            || 'see your membership card, your welfare cover and members'' documents.');
  end if;
  return new;
end;
$$;
drop trigger if exists joining_fees_confirmed_notice on public.payments;
create trigger joining_fees_confirmed_notice
  after update of status on public.payments
  for each row execute function public.joining_fees_confirmed_notice();


-- ---------------------------------------------------------------------
-- 3. ONLINE VOTING (secret ballot)
--    The committee creates a vote (an election, a motion or a survey).
--    Each welfare member can vote once. The system records THAT you
--    voted separately from HOW you voted, so nobody can see your choice.
--    Results show after the vote closes.
-- ---------------------------------------------------------------------
create table if not exists public.polls (
  id bigint generated always as identity primary key,
  title text not null,
  description text,
  kind text not null default 'motion' check (kind in ('election', 'motion', 'survey')),
  opens_at timestamptz not null default now(),
  closes_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (closes_at > opens_at)
);

create table if not exists public.poll_options (
  id bigint generated always as identity primary key,
  poll_id bigint not null references public.polls(id) on delete cascade,
  label text not null,
  position int not null default 0
);

-- who has voted (no choice stored here)
create table if not exists public.poll_voters (
  poll_id bigint not null references public.polls(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  voted_at timestamptz not null default now(),
  primary key (poll_id, member_id)
);

-- the ballots (no name, no time stored here)
create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id bigint not null references public.polls(id) on delete cascade,
  option_id bigint not null references public.poll_options(id) on delete cascade
);

alter table public.polls        enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_voters  enable row level security;
alter table public.poll_votes   enable row level security;   -- no policies: only the functions below can read or write ballots

drop policy if exists "polls read"   on public.polls;
drop policy if exists "polls manage" on public.polls;
create policy "polls read" on public.polls for select to authenticated
  using (public.is_welfare_member() or public.is_committee());
create policy "polls manage" on public.polls for all to authenticated
  using (public.is_committee()) with check (public.is_committee());

drop policy if exists "options read"   on public.poll_options;
drop policy if exists "options manage" on public.poll_options;
create policy "options read" on public.poll_options for select to authenticated
  using (public.is_welfare_member() or public.is_committee());
create policy "options manage" on public.poll_options for all to authenticated
  using (public.is_committee()) with check (public.is_committee());

drop policy if exists "voters read" on public.poll_voters;
create policy "voters read" on public.poll_voters for select to authenticated
  using (member_id = auth.uid() or public.is_committee());

-- Cast a vote
create or replace function public.cast_vote(p_poll bigint, p_option bigint)
returns void language plpgsql security definer set search_path = public as $$
declare pl public.polls;
begin
  if not public.is_welfare_member() then
    raise exception 'Voting is for welfare members whose joining fees are confirmed';
  end if;
  select * into pl from public.polls where id = p_poll;
  if not found then raise exception 'Vote not found'; end if;
  if now() < pl.opens_at then raise exception 'This vote has not opened yet'; end if;
  if now() >= pl.closes_at then raise exception 'This vote has closed'; end if;
  if not exists (select 1 from public.poll_options where id = p_option and poll_id = p_poll) then
    raise exception 'Please choose one of the options';
  end if;
  begin
    insert into public.poll_voters (poll_id, member_id) values (p_poll, auth.uid());
  exception when unique_violation then
    raise exception 'You have already voted in this vote';
  end;
  insert into public.poll_votes (poll_id, option_id) values (p_poll, p_option);
end;
$$;

-- Results: after the vote closes (welfare members and committee)
create or replace function public.poll_results(p_poll bigint)
returns table (option_id bigint, label text, votes bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.is_welfare_member() or public.is_committee()) then
    raise exception 'Results are for welfare members';
  end if;
  if exists (select 1 from public.polls where id = p_poll and now() < closes_at) then
    raise exception 'Results show once the vote closes';
  end if;
  return query
    select o.id, o.label, count(v.id)
      from public.poll_options o
      left join public.poll_votes v on v.option_id = o.id
     where o.poll_id = p_poll
     group by o.id, o.label, o.position
     order by o.position, o.id;
end;
$$;

-- Turnout: how many have voted, and how many can vote
create or replace function public.poll_turnout(p_poll bigint)
returns table (voted bigint, eligible bigint)
language sql stable security definer set search_path = public as $$
  select (select count(*) from public.poll_voters where poll_id = p_poll),
         (select count(*) from public.profiles p
           where p.membership_type = 'financial' and p.status in ('pending', 'active')
             and public.fees_confirmed(p.id))
   where public.is_committee() or public.is_welfare_member();
$$;

-- Tell welfare members when a new vote is created
create or replace function public.new_poll_notice()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (member_id, title, body)
  select p.id, 'New vote: ' || new.title,
         'A new vote is open in Member services until '
         || to_char(new.closes_at at time zone 'Australia/Sydney', 'FMDay FMDD FMMonth YYYY, FMHH12:MI am')
         || '. Your vote is secret.'
    from public.profiles p
   where p.membership_type = 'financial' and p.status in ('pending', 'active')
     and public.fees_confirmed(p.id);
  return new;
end;
$$;
drop trigger if exists new_poll_notice on public.polls;
create trigger new_poll_notice after insert on public.polls
  for each row execute function public.new_poll_notice();


-- ---------------------------------------------------------------------
-- 4. MEMBERS' DOCUMENTS (links to the constitution, minutes, reports)
--    The committee adds a title and a link (for example a Google Drive
--    file shared as "Anyone with the link can view").
-- ---------------------------------------------------------------------
create table if not exists public.member_documents (
  id bigint generated always as identity primary key,
  title text not null,
  category text not null default 'Other',
  url text not null check (url ~* '^https://'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.member_documents enable row level security;
drop policy if exists "documents read"   on public.member_documents;
drop policy if exists "documents manage" on public.member_documents;
create policy "documents read" on public.member_documents for select to authenticated
  using (public.is_welfare_member() or public.is_committee());
create policy "documents manage" on public.member_documents for all to authenticated
  using (public.is_committee()) with check (public.is_committee());


-- ---------------------------------------------------------------------
-- 5. MEMBERS EXCEL EXPORT: Treasurer OR Secretary
--    Make sure the Secretary's committee entry has the role 'Secretary':
--      insert into public.committee (user_id, role)
--      select id, 'Secretary' from auth.users where email = 'secretarys-email@example.com'
--      on conflict (user_id) do update set role = 'Secretary';
-- ---------------------------------------------------------------------
create or replace function public.can_export_members()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.committee
                  where user_id = auth.uid()
                    and lower(trim(coalesce(role, ''))) in ('treasurer', 'secretary'));
$$;

create or replace function public.export_request(p_reason text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  new_id bigint;
  my_role text;
begin
  if not public.can_export_members() then
    raise exception 'Only the Treasurer or the Secretary can ask for a members export';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Please say why the export is needed';
  end if;
  if exists (select 1 from public.export_requests
              where requested_by = auth.uid() and status in ('pending', 'approved')
                and (status = 'pending' or decided_at > now() - interval '48 hours')) then
    raise exception 'You already have an export request open';
  end if;
  select initcap(trim(role)) into my_role from public.committee where user_id = auth.uid();
  insert into public.export_requests (requested_by, reason) values (auth.uid(), trim(p_reason))
  returning id into new_id;
  insert into public.notifications (member_id, title, body)
  select c.user_id, 'Members export waiting for approval',
         'The ' || my_role || ' has asked to download all member profiles. Reason: ' || trim(p_reason)
         || ' Open the committee area, then Members export, to approve or decline.'
    from public.committee c
    join public.profiles p on p.id = c.user_id
   where c.user_id <> auth.uid();
  return new_id;
end;
$$;

create or replace function public.export_members(p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r public.export_requests;
begin
  if not public.can_export_members() then
    raise exception 'Only the Treasurer or the Secretary can download the members export';
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
    'members', coalesce((select jsonb_agg(to_jsonb(p) || jsonb_build_object('fees_confirmed', public.fees_confirmed(p.id))
                                          order by p.member_number nulls last, p.last_name, p.first_name)
                           from public.profiles p), '[]'::jsonb),
    'family',  coalesce((select jsonb_agg(to_jsonb(f) order by f.member_id, f.kind, f.id)
                           from public.family_members f), '[]'::jsonb));
end;
$$;


-- ---------------------------------------------------------------------
-- Permissions: only signed-in people may call these functions
-- ---------------------------------------------------------------------
-- fees_confirmed is used inside the database only (members cannot look up other members)
revoke execute on function public.fees_confirmed(uuid) from public, anon, authenticated;

revoke execute on function public.is_welfare_member(),
                         public.cast_vote(bigint, bigint), public.poll_results(bigint), public.poll_turnout(bigint),
                         public.can_export_members(), public.export_request(text), public.export_members(bigint)
  from public, anon;
grant execute on function public.is_welfare_member(),
                        public.cast_vote(bigint, bigint), public.poll_results(bigint), public.poll_turnout(bigint),
                        public.can_export_members(), public.export_request(text), public.export_members(bigint)
  to authenticated;

-- =====================================================================
-- Included from welfare-update.sql (welfare application details on support requests)
-- =====================================================================
alter table public.support_requests
  add column if not exists person_affected   text,
  add column if not exists amount_requested  numeric(10,2),
  add column if not exists insurance_details text;

alter table public.support_requests drop constraint if exists support_amount_ok;
alter table public.support_requests add constraint support_amount_ok
  check (amount_requested is null or (amount_requested >= 0 and amount_requested <= 20000));
