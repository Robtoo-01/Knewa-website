# KENEWA Website

The website of **Kenyans in New England Welfare Association Inc** (KENEWA), a not-for-profit community association promoting the welfare, unity and empowerment of Kenyans in the New England region of NSW.

- Incorporated in NSW under the *Associations Incorporation Act 2009*
- Registration no. INC2601004
- ABN 17 238 522 745

This is a simple static website: plain HTML and CSS with [Bootstrap 5](https://getbootstrap.com). There is no database and nothing to install or build. It runs on any computer, or on a phone with VSCodroid.

---

## Pages

| File | Page |
| --- | --- |
| `index.html` | Home: welcome slider, Chairperson's message, signature event with countdown, objectives, gallery, donate, two ways to join |
| `about.html` | Our story (including how KENEWA was formed), main objective, mission, vision, values and the committee |
| `portfolios.html` | Our seven portfolios (like departments), each with its lead and how to get involved |
| `resources.html` | Community resources: settling in, visas, health, safety, study and work |
| `events.html` | Events: next big event with countdown, filters by audience, year at a glance, add-to-calendar. Built from `js/events-data.js` |
| `welfare.html` | What welfare support covers, how to ask for help, FAQs, and how to donate |
| `membership.html` | Two ways to join, eligibility, steps, fees and member benefits |
| `register.html` | Old address: forwards people to create an account |
| `support.html` | Get help: committee contacts, crisis lines, and a link to request support in the members area |
| `login.html` | Members system: sign in, create account, reset password |
| `portal.html` | Members area: choose membership type first, dashboard with progress, WhatsApp group link, my details, family, Pay now (card link, PayID, bank), **Member services** for welfare members (online voting, membership card, welfare cover, documents; locked until the joining fees are confirmed), support requests with documents, notifications |
| `admin.html` | Committee area: approve members and family changes, confirm payments (this unlocks welfare services), handle support requests, create votes, add members' documents, send notifications, members Excel export (Treasurer or Secretary) |
| `contact.html` | Contact form and other ways to reach us |
| `thank-you.html` | Shown after someone sends a form |
| `privacy.html` | Privacy policy |
| `child-safe.html` | Child safety: our commitment, Working With Children Checks, how to raise a concern. Linked from every footer, Resources, Portfolios and Get help |
| `credits.html` | Photo credits for the Unsplash photos |
| `sitemap.xml`, `robots.txt` | Help Google find the public pages. Add new public pages to `sitemap.xml` |

## Folder structure

```
knewa-website/
    index.html  about.html  portfolios.html  events.html  resources.html
    welfare.html  membership.html  register.html  support.html  contact.html
    thank-you.html  privacy.html
    login.html  portal.html  admin.html     (members system)
    css/
        style.css      All colours, fonts and layout
        portal.css     Extra styles for the members system
    js/
        main.js        Footer year, slider, "My account" link, contact topics
        events-data.js THE EVENTS LIST  <- edit this to add or change events
        events.js      Builds the Events page and countdowns from the list
        config.js      Supabase connection and payment details  <- edit this
        db.js          Shared helpers for the members system
        portal.js      Members area
        admin.js       Committee area
    supabase/
        setup.sql      Creates the members database (new installs only)
        family-rules.sql  One-off update for databases set up before October 2026
        members-update.sql  One-off update: documents, Excel export, WhatsApp link (see below)
        member-emails.sql   Automatic emails when members register and are approved
        portal-update.sql   One-off update: type choice, welfare services, online voting, documents, Secretary export
        welfare-update.sql  One-off update: welfare application details on support requests (who for, amount, insurance)
    docs/
        kenewa-constitution.pdf        The constitution (linked from About, Membership and the members area)
        kenewa-welfare-fund-policy.pdf The Welfare Fund Policy (linked from Welfare). If the committee changes the support limits, update the table on welfare.html too
        kenewa-child-safe-policy.pdf   ADD once the Committee adopts it, then uncomment the link on child-safe.html
    images/
        logo.svg / logo.png            Full logo with name (documents, flyers, social media)
        logo-mark.svg / logo-mark.png  Round symbol only (menu, profile pictures)
        favicon.png, apple-touch-icon.png  Browser tab and phone home-screen icons
        og-image.png                   Preview picture when a link is shared on WhatsApp or Facebook
    README.md          This file
```

---

## Previewing the site

**On a computer (VS Code)**

1. Open the `knewa-website` folder in VS Code.
2. Install the **Live Server** extension.
3. Right-click `index.html` and choose **Open with Live Server**.

**On Android (VSCodroid)**

1. Open the terminal (Ctrl+`) and go into the project folder:
   ```
   cd ~/projects/knewa-website
   python3 -m http.server 8000
   ```
2. Press **Ctrl+Shift+P**, run **VSCodroid: Open in Browser**, and enter `http://localhost:8000`.
3. Press **Ctrl+C** in the terminal to stop the preview.

---

## Making changes

### Find what still needs updating

Every spot that needs real information is marked with an `UPDATE` comment. Search all files with **Ctrl+Shift+F** and type `UPDATE`.

Before going live, check:

- [ ] Committee names (and that everyone agrees to be listed)
- [ ] Membership fees, currently $30 registration plus $170 welfare fund
- [ ] Event dates and venues
- [x] Postal address on `contact.html` (check the spelling "Edinburg" against the NSW Fair Trading record) (email info@kenewa.org and phone 0475 140 471 are in place)
- [x] Facebook page link (in every footer, the Contact page and the `index.html` JSON-LD `sameAs`)
- [ ] Supabase details, bank, BSB and PayID details, and the tap-to-pay links in `js/config.js`
- [ ] Committee phone numbers on `support.html` (the list is hidden in a comment; add it back only with each person's agreement)
- [ ] Committee approval of the logo, and replacing the Unsplash photos with KENEWA's own when ready
- [ ] The Chairperson's message on the home page
- [ ] Bank details for donations on `welfare.html` (fill in the hidden box, then delete the "How to give" box)
- [x] Waiting period, renewal fee and support limits on `welfare.html` and `membership.html` (from the constitution and Welfare Fund Policy)
- [x] Constitution and Welfare Fund Policy published in `docs/` and linked from About, Membership, Welfare and the members area. Replace the PDFs with the signed and dated copies when ready (keep the same file names)
- [ ] Event dates, and the "idea" events in `js/events-data.js`

### Common tasks

| To change... | Edit |
| --- | --- |
| Text on a page | That page's `.html` file |
| Colours or fonts | The `:root` section at the top of `css/style.css`. The look follows Kenya's eCitizen portal: government green #00753A, white, dark text, red #C8102E only for urgent things, Inter font. Lighter greens are the same green at low opacity (`--tint`, `--tint-2`) |
| Members and committee areas | `css/portal.css` uses the same colours from `css/style.css` |
| Floating "Need help?" button | `HELP_BUBBLE` is on every public page, bottom right; it links to `support.html` |
| The menu, top bar or footer | Every public `.html` file. Use **Ctrl+Shift+H** (Replace in Files) to change them all at once |
| The Chairperson's message | `index.html`, section "From our leadership" (currently a draft for the Chairperson to approve) |
| Photos | Slider photos: `.slide-1` to `.slide-5` near the end of `css/style.css`. Page banners: the `--banner-photo` on each page's `<header class="page-hero">`. Gallery: `index.html`. If you replace an Unsplash photo, also update `credits.html` |
| Add or change an event | `js/events-data.js`: copy an event from `{` to `},` and edit it. Past events disappear by themselves. The home page countdown date is in `index.html` (`data-countdown`) |
| Committee members | `about.html`: the `committee` section |
| WhatsApp group link | Stored in the database, not the website. Set it with the one-line `update public.app_settings ...` command shown in `supabase/members-update.sql`. Never write the link in a file |
| The logo | Replace the files in `images/` (`logo-mark.svg` is used in the menu and as the browser tab icon) |

### Images

- Use lowercase file names with hyphens, e.g. `jamhuri-day-2026.jpg`. File names are case-sensitive online.
- Shrink photos before adding them (under about 300 KB) with [Squoosh](https://squoosh.app) or [TinyPNG](https://tinypng.com).
- Always give images `alt` text describing them.
- Get permission from people in photos, and from parents for children.

### Saving your work

After each change, commit and push to GitHub:

```
git add .
git commit -m "Short description of the change"
git push
```

Or use the Source Control panel (**Ctrl+Shift+G**): type a message, tap **Commit**, then **Sync Changes**.

---

## Publishing

The site is designed to be hosted free on **[Netlify](https://www.netlify.com)**, connected to this GitHub repository.

1. Sign in to Netlify with GitHub.
2. **Add new site > Import an existing project**, choose this repository.
3. Leave the build command and publish directory **empty**, then deploy.
4. Every push to GitHub updates the live site automatically.

### Forms

The contact form uses **Netlify Forms**. Registration and support requests use the members system below. After the first deploy:

1. In Netlify, open **Forms** and enable form detection.
2. Redeploy (push any small change).
3. Add an email notification so submissions go to the KENEWA inbox.
4. Send a test message from the Contact page.

The contact form shows an error when tested locally. That is normal; it only works once published.

### Google Search

After the site is live on kenewa.org, add it to [Google Search Console](https://search.google.com/search-console) and submit `https://kenewa.org/sitemap.xml`.

### Domain

To connect the association's domain, add it under **Domain management** in Netlify and update the DNS records at the registrar.

Before changing DNS, screenshot all existing records. **Do not change MX records**, or any @kenewa.org email will stop working.

---

## Members system (accounts, registration, support)

Members create an account, complete their registration, add family, record payments and request support. The committee approves them in the committee area. It runs on **[Supabase](https://supabase.com)** (free plan), which provides logins and a secure database.

### One-time setup

1. **Create the database.** Sign up at supabase.com with the KENEWA email. Create a **New project** named `knewa`, choose a strong database password (store it in the password manager), and pick the **Sydney** region so members' data stays in Australia.
2. **Build the tables.** Open **SQL Editor > New query**, paste everything from `supabase/setup.sql`, and tap **Run**.
   - **Already set up before October 2026?** Don't run `setup.sql` again. Instead run `supabase/family-rules.sql` once to add the family rules (it's safe to run twice).
3. **Set the website address.** Go to **Authentication > URL Configuration**:
   - Site URL: `https://knewa-web.netlify.app` (change to the real domain later)
   - Redirect URLs: add `https://knewa-web.netlify.app/**`
4. **Connect the website.** Go to **Project Settings > API Keys**. Copy the **Project URL** and the **publishable key** (or the legacy `anon` key) into `js/config.js`. Also fill in the bank, BSB and PayID details there. Commit and push.
   - **Never** put the `secret` or `service_role` key in any website file.
5. **Make yourself an administrator.** Create your own account on the website and confirm the email. Then in the SQL Editor run (with your email):
   ```sql
   insert into public.committee (user_id, role)
   select id, 'Secretary' from auth.users where email = 'your-email@example.com';
   ```
   Repeat for each committee member who needs the committee area (change the role).

### October 2026 update: documents, Excel export, WhatsApp link

If your database was set up before this update, run **`supabase/members-update.sql`** once (SQL Editor > New query > paste > Run). It is safe to run again. It adds:

1. **Documents with support requests.** Members can attach up to 5 files (photos, PDF or Word, 10 MB each), such as a death certificate or hospital letter. Files go in a private storage bucket called `support-evidence`; only the member and the committee can open them, using links that work for one minute.
2. **Members export to Excel.** The committee member whose role is exactly `Treasurer` in the `committee` table can ask for an export in the committee area (**Members export**). Another committee member must approve it. The Treasurer can then download the file **once, within 48 hours**. Every request, decision and download is recorded. Make sure the Treasurer's committee entry has the role `Treasurer`:
   ```sql
   insert into public.committee (user_id, role)
   select id, 'Treasurer' from auth.users where email = 'treasurers-email@example.com'
   on conflict (user_id) do update set role = 'Treasurer';
   ```
   Note: committee members can already look at members one at a time in the committee area. The approval controls the **full download**, which is the bigger privacy risk.
3. **WhatsApp group link.** The "KENEWA Members" group link is stored in the database and shown on the dashboard (and as a WhatsApp button at the top) once a member has submitted their registration. Tip: in WhatsApp, turn on **Group settings > Approve new members**, so a forwarded link can't let strangers in.

### October 2026 update, part 2: welfare member services and online voting

If your database was set up before this update, run **`supabase/portal-update.sql`** once (SQL Editor > New query > paste > Run). It is safe to run again.

1. **Membership type first.** After signing up, a new member must choose welfare ($200) or community (free) membership before they see anything else. They can change it later in My details.
2. **Welfare member services unlock when the fees are confirmed.** A welfare member's services stay greyed out ("Locked") until the Treasurer confirms their **Joining fees** payment in the committee area (Payments > Confirm). The member then gets a notification. Community members see the same services greyed out with an option to upgrade. If a membership is marked **lapsed**, the services lock again.
3. **Member services** (for welfare members):
   - **Online voting.** The committee creates a vote under **Votes**: a motion (yes/no/abstain), an election (one line per candidate) or a survey, with opening and closing times. Eligible members are notified. Each member votes once, in secret: the database records *that* a member voted separately from *how* they voted. The committee sees turnout while the vote is open; everyone sees the results once it closes. **Close now** ends a vote early.
   - **Digital membership card** with the member number, which they can print or save as a PDF.
   - **My welfare cover**: who in their registered family is covered.
   - **Members' documents**: the committee adds links under **Documents** (for example Google Drive files shared as "Anyone with the link can view"). Only welfare members and the committee see the list.
   - **Coming soon** placeholders: chama savings circle, interest-free emergency loans, education bursaries, mentoring network, business directory, partner discounts. To launch one, ask your developer to give it a page in `js/portal.js` (the `SERVICES` list).
4. **Secretary export.** The committee member whose role is `Secretary` (as well as the `Treasurer`) can now ask for the members Excel export. Another committee member still has to approve each download. Make sure the Secretary's role is set:
   ```sql
   insert into public.committee (user_id, role)
   select id, 'Secretary' from auth.users where email = 'secretarys-email@example.com'
   on conflict (user_id) do update set role = 'Secretary';
   ```

### October 2026 update, part 3: welfare applications, bereavement and child safety

If your database was set up before this update, run **`supabase/welfare-update.sql`** once (SQL Editor > New query > paste > Run). It is safe to run again.

1. **Welfare application details.** When a member asks for bereavement, illness or hardship support in the members area, they can now say who the support is for, the amount they need and any insurance or other help that may pay (the same as paper form W1). The committee sees these details on each support request. If the update hasn't been run yet, the details are added to the message instead, so nothing breaks.
2. **Welfare page.** New section "If someone passes away" (`welfare.html#bereavement`). Two sections are written but hidden in comments until they are approved: "When a big claim comes in" (after the Committee adopts Welfare Fund Policy Amendment No. 1) and the Special Welfare Levy paragraph (after members approve it at a General Meeting). The levy also has hidden lines on `membership.html` and in the members area Payments list. Search for `UPDATE` to find them.
3. **Child safety page** (`child-safe.html`), with the NSW Child Protection Helpline added to Get help and Resources. Add the Child Safe Policy PDF and uncomment its link once the Committee adopts it.

### Emails from info@kenewa.org

All member emails come from **KENEWA &lt;info@kenewa.org&gt;**, sent through [Resend](https://resend.com) (free plan).

**One-time setup**

1. **Mailbox.** In Namecheap: Domain List > Manage (kenewa.org) > Advanced DNS > Mail Settings > Email Forwarding. Forward `info` to the committee's Gmail. To reply as info@, in Gmail go to Settings > Accounts > Send mail as, using `smtp.gmail.com`, port 587 and a Google App Password.
2. **Resend.** Sign up, add the domain `kenewa.org`, and copy the DNS records it shows into Namecheap Advanced DNS. Wait until Resend says **Verified**, then create an **API key**.
3. **Sign-up emails (confirm email, password reset).** In Supabase, go to Authentication > Emails > SMTP Settings and turn on custom SMTP: sender `info@kenewa.org`, name `KENEWA`, host `smtp.resend.com`, port `465`, username `resend`, password = the API key. Then raise the limit under Authentication > Rate Limits.
4. **Registration and approval emails.** In the SQL Editor, first run this line on its own with your key:
   ```sql
   select vault.create_secret('re_YOUR_KEY_HERE', 'resend_api_key');
   ```
   Then run all of **`supabase/member-emails.sql`**. Never put the key in a website file.

**What members receive**

| When | Email |
| --- | --- |
| They create an account | "Confirm your email" (Supabase template, set in Authentication > Emails > Templates) |
| They submit their registration | "We've received your KENEWA registration": next steps, fees, WhatsApp group |
| The committee approves them | "Your KENEWA membership is approved", with their member number |

To change the wording of the last two, edit `supabase/member-emails.sql` and run it again. To check emails are going out, run `select status_code, content from net._http_response order by created desc limit 5;` (200 means sent).

### Tap-to-pay links (card, Apple Pay, Google Pay)

Members can already pay by PayID or bank transfer (no fees, with Copy buttons in the members area). To let them pay by tapping a link:

1. Create a free [Stripe](https://stripe.com/au) account for KENEWA (business type: non-profit or incorporated association; it needs the ABN and the association's bank account).
2. In Stripe, go to **Payment Links > New**. Make one for **Joining fees, $200**. For renewals, welfare appeals and donations, choose **Customers choose what to pay**.
3. Copy each link (it starts with `https://buy.stripe.com/`) into `cardLinks` in `js/config.js`. Links left empty are hidden.
4. The members area adds the member's reference (for example `KENEWA-KN-0004`) and email to the link, so the Treasurer can match payments in Stripe. Members are also asked to record the payment so it shows in their history.

Stripe's standard fee for Australian cards was 1.7% + 30c per payment in 2026 (about $3.70 on $200); check [Stripe's pricing page](https://stripe.com/au/pricing) for current rates. PayID and bank transfer have no fees, so the members area lists them alongside.

### Family rules

- Each financial member can register **1 spouse, 7 dependants and 7 siblings**.
- **First time:** everything a member adds is approved automatically, and they can fix mistakes freely, until they tap **Confirm my family list** (or the committee approves their membership).
- **After that:** every addition, change or removal waits in the committee area under **Family changes**. The old details stay in place until approved, and the member gets a notification either way.
- These rules live in the database, so they still apply if someone edits the website code.

### Day to day (committee)

- Log in, then tap **Committee** at the top of the members area.
- **Members:** tap a name to see their details; **Approve membership** gives them a member number and confirms their family list.
- **Family changes** (approve or reject; the member is notified), **Payments** (match against the bank statement, then Confirm), **Support requests** (set status and leave a note the member can see), **Send notification**.

### Good to know

- **Security:** members can only ever see their own records. Committee access comes from the `committee` table. These rules live in the database, so they still apply even if someone edits the website code.
- **Urgent help:** the database doesn't alert anyone when a request arrives. Check the committee area regularly, and keep committee phone numbers on `support.html` for emergencies.
- **Emails:** Supabase's built-in email is limited to a small number per hour. Set up Resend as described in "Emails from info@kenewa.org" before launching to all members.
- **Free plan pauses:** a free project that goes unused for about a week can be paused. Restore it from the Supabase dashboard.
- **Backups:** the free plan has no automatic backups. Once a month, and before any change to the members system, run `supabase db dump` (Supabase CLI) and save the file to KENEWA's private drive. Record it in the backup log on form IT4. Every 6 months, restore the latest dump into a test project to prove it works. See the Digital Operations and Backup Procedure.
- **Pausing:** in quiet periods, a committee admin should log in to the Supabase dashboard at least weekly so the project isn't paused.

---

## Accounts and ownership

Keep these under a shared KENEWA email address, not a personal one, and give at least two committee members access:

| Service | Used for |
| --- | --- |
| GitHub | Stores the website files |
| Netlify | Hosts the site and receives contact form messages |
| Supabase | Member accounts and the members database |
| Domain registrar | The web address (record the renewal date) |

Never put passwords or members' personal information in these files. They are public. (KENEWA's own account details for receiving payments in `js/config.js` are fine to show.)

---

## Maintained by

The KENEWA committee. IT and Communications: Evans Yego. Secretary: Michael Kiplangat.

Questions about the website: info@kenewa.org or 0475 140 471
