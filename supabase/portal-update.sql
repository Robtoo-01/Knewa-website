-- =====================================================================
-- KENEWA members area update (October 2026, part 2)
--   1. New members choose their membership type before anything else
--   2. Welfare member services unlock only when the joining fees
--      are confirmed by the Treasurer
--   3. Online voting (secret ballot) for welfare members
--   4. Members' documents library (constitution, minutes, reports)
--   5. The Secretary, as well as the Treasurer, can download the
--      members Excel export (still needs another committee member's approval)
--
-- ALREADY using the members system? Run this file once:
--   Supabase > SQL Editor > New query > paste everything > Run
-- It is safe to run more than once.
-- (New installs get it automatically as part of setup.sql.)
-- =====================================================================


-- ---------------------------------------------------------------------
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
