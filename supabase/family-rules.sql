-- =====================================================================
-- KENEWA: family rules (spouse, dependants, siblings)
--
--  * Limits: 1 spouse, 7 dependants, 7 siblings per member.
--  * First time: everything a member adds is approved automatically,
--    until they confirm their family list (or the committee approves
--    their membership).
--  * After that: every addition, change or removal waits for
--    committee approval.
--
-- ALREADY using the members system? Run this file once:
--   Supabase > SQL Editor > New query > paste everything > Run
-- It is safe to run more than once.
-- (New installs get it automatically as part of setup.sql.)
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
