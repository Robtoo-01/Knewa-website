-- =====================================================================
-- KENEWA: automatic emails to members, sent from info@kenewa.org
--
--   1. "We've received your registration": when a member submits
--      their registration (status goes from incomplete to pending)
--   2. "Welcome, your membership is approved": when the committee
--      approves them (status becomes active), with their member number
--
-- Emails are sent through Resend (resend.com). Before running this file:
--   a) In Resend, add and verify the domain kenewa.org (see README)
--   b) Create a Resend API key (starts with re_)
--   c) In Supabase > SQL Editor, run this ONE line on its own, with your key:
--
--        select vault.create_secret('re_YOUR_KEY_HERE', 'resend_api_key');
--
--      (The key is stored encrypted in Supabase. NEVER put it in this file
--       or any website file: they are public on GitHub.)
--
-- Then run this whole file: SQL Editor > New query > paste > Run.
-- It is safe to run again (for example after changing the wording below).
-- If the key is missing, nothing is sent and nothing breaks.
-- =====================================================================

create extension if not exists pg_net with schema extensions;

-- Website address used in the email buttons. Change if the domain changes.
create or replace function public.site_url()
returns text language sql immutable as $$ select 'https://kenewa.org' $$;

-- Make member-typed text (like a first name) safe to put in an email
create or replace function public.html_safe(t text)
returns text language sql immutable as $$
  select replace(replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;');
$$;

-- Send one email. Wraps the message in the KENEWA layout.
-- Only the database itself can use this (members cannot call it).
create or replace function public.send_member_email(p_to text, p_subject text, p_body text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  api_key text;
  html text;
begin
  select decrypted_secret into api_key from vault.decrypted_secrets where name = 'resend_api_key' limit 1;
  if api_key is null or coalesce(trim(p_to), '') = '' then return; end if;

  html := '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1F2937;line-height:1.6">'
       || '<div style="background:#00753A;color:#fff;padding:18px 24px;border-radius:10px 10px 0 0">'
       || '<strong style="font-size:20px">KENEWA</strong><br>'
       || '<span style="font-size:13px;opacity:.9">Kenyans in New England Welfare Association Inc</span></div>'
       || '<div style="border:1px solid #E5E7EB;border-top:0;padding:24px;border-radius:0 0 10px 10px">'
       || p_body
       || '<p style="margin-top:28px">Umoja ni nguvu: unity is strength.<br><strong>The KENEWA Committee</strong></p>'
       || '<p style="font-size:13px;color:#4B5563;border-top:1px solid #E5E7EB;padding-top:12px">'
       || 'Questions? Reply to this email, write to info@kenewa.org or call 0475 140 471.<br>'
       || 'In an emergency, call 000.</p></div></div>';

  perform net.http_post(
    url     := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Authorization', 'Bearer ' || api_key, 'Content-Type', 'application/json'),
    body    := jsonb_build_object(
                 'from', 'KENEWA <info@kenewa.org>',
                 'to', jsonb_build_array(trim(p_to)),
                 'reply_to', 'info@kenewa.org',
                 'subject', p_subject,
                 'html', html));
exception when others then
  -- an email problem must never stop a registration or approval from saving
  raise warning 'KENEWA email not sent to %: %', p_to, sqlerrm;
end;
$$;

revoke all on function public.send_member_email(text, text, text) from public, anon, authenticated;

-- A green button for emails
create or replace function public.email_button(p_label text, p_path text)
returns text language sql immutable as $$
  select '<p style="margin:22px 0"><a href="' || public.site_url() || '/' || p_path || '" '
      || 'style="background:#00753A;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">'
      || p_label || '</a></p>';
$$;

-- ---------------------------------------------------------------------
-- The emails. Edit the wording here, then run this file again.
-- ---------------------------------------------------------------------
create or replace function public.member_status_email()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  hello text := '<h2 style="color:#00753A;margin-top:0">Habari '
             || coalesce(nullif(public.html_safe(trim(new.first_name)), ''), 'there') || ',</h2>';
  fin boolean := new.membership_type = 'financial';
begin
  if new.status is not distinct from old.status then return new; end if;

  -- 1. Registration submitted
  if old.status = 'incomplete' and new.status = 'pending' then
    perform public.send_member_email(new.email,
      'We''ve received your KENEWA registration',
      hello
      || '<p>Thank you for registering with the Kenyans in New England Welfare Association. '
      || 'The committee has received your details.</p>'
      || case when fin then
           '<p><strong>To finish your welfare membership:</strong></p><ol>'
        || '<li>Add your family (spouse, dependants and siblings) and tap <em>Confirm my family list</em>.</li>'
        || '<li>Pay the $200 joining fees ($30 registration + $170 welfare fund) by PayID, bank transfer, card or cash to the Treasurer.</li>'
        || '<li>Record the payment in your members area so the Treasurer can confirm it.</li>'
        || '<li>The committee approves your membership and gives you a member number.</li></ol>'
         else
           '<p>As a community member you''ll receive news and invitations to all our events. '
        || 'The committee will confirm your membership soon.</p>'
         end
      || '<p>You can now join the <strong>KENEWA Members WhatsApp group</strong> from your dashboard.</p>'
      || public.email_button('Open my members area', 'portal.html'));

  -- 2. Membership approved (first approval only, not when a lapsed member is reactivated)
  elsif old.status in ('incomplete', 'pending') and new.status = 'active' then
    perform public.send_member_email(new.email,
      'Karibu! Your KENEWA membership is approved',
      hello
      || '<p>Great news: the committee has approved your membership. Welcome to the KENEWA family!</p>'
      || case when new.member_number is not null then
           '<p style="background:#F2F7F4;border-left:4px solid #00753A;padding:12px 16px;font-size:16px">'
        || 'Your member number: <strong>' || public.html_safe(new.member_number) || '</strong></p>'
         else '' end
      || case when fin then
           '<p>As a welfare member you can now vote at general meetings, stand for the committee, '
        || 'and receive support from the welfare fund for you and your registered family.</p>'
        || '<p>If you ever need help, such as a bereavement, illness or hardship, call us on 0475 140 471 '
        || 'or send a confidential request from your members area.</p>'
         else
           '<p>You''ll receive our news and invitations to every KENEWA event. You can upgrade to welfare '
        || 'membership at any time from your members area.</p>'
         end
      || public.email_button('Go to my members area', 'portal.html'));
  end if;

  return new;
end;
$$;

drop trigger if exists member_status_email on public.profiles;
create trigger member_status_email
  after update of status on public.profiles
  for each row execute function public.member_status_email();

-- =====================================================================
-- TEST (optional): send yourself a test email. Run on its own:
--
--   select public.send_member_email('your-email@example.com', 'KENEWA test', '<p>It works!</p>');
--
-- Then check what Resend replied (status_code 200 means sent):
--
--   select status_code, content from net._http_response order by created desc limit 5;
-- =====================================================================
