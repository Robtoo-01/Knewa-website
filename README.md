# KNEWA Website

The website of **Kenyans in New England Welfare Association Inc** (KNEWA), a not-for-profit community association promoting the welfare, unity and empowerment of Kenyans in the New England region of NSW.

- Incorporated in NSW under the *Associations Incorporation Act 2009*
- Registration no. INC2601004
- ABN 17 238 522 745

This is a simple static website: plain HTML and CSS with [Bootstrap 5](https://getbootstrap.com). There is no database and nothing to install or build. It runs on any computer, or on a phone with VSCodroid.

---

## Pages

| File | Page |
| --- | --- |
| `index.html` | Home: welcome slider, key figures, mission and vision, why join |
| `about.html` | Our story, purpose, registration details, values, committee |
| `events.html` | Upcoming events and "Our journey so far" timeline |
| `welfare.html` | What welfare support covers, how to ask for help, local services, FAQs |
| `membership.html` | Who can join, membership types, fees, application form |
| `contact.html` | Contact form and other ways to reach us |
| `thank-you.html` | Shown after someone sends a form |
| `privacy.html` | Privacy policy |

## Folder structure

```
knewa-website/
    index.html  about.html  events.html  welfare.html
    membership.html  contact.html  thank-you.html  privacy.html
    css/
        style.css      All colours, fonts and layout
    js/
        main.js        Footer year and slider settings
    images/            Logo and photos go here
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
- [ ] Email address, phone numbers and postal address
- [ ] Social media links in the footer (currently `#`)
- [ ] Logo and photos

### Common tasks

| To change... | Edit |
| --- | --- |
| Text on a page | That page's `.html` file |
| Colours or fonts | The `:root` section at the top of `css/style.css` |
| The menu or footer | Every `.html` file. Use **Ctrl+Shift+H** (Replace in Files) to change them all at once |
| Add an event | `events.html`: copy an `<article class="event">` block and edit it |
| Committee members | `about.html`: the `committee` section |
| The logo | Add `images/logo.png`, then replace `<span class="brand-mark">` in the menu with `<img src="images/logo.png" alt="" height="40">` |
| A banner photo | `css/style.css`: see the comment above `.slide-1` |

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

The membership and contact forms use **Netlify Forms**. After the first deploy:

1. In Netlify, open **Forms** and enable form detection.
2. Redeploy (push any small change).
3. Add an email notification so submissions go to the KNEWA inbox.
4. Send a test from each form.

Forms will show an error when tested locally. That is normal; they only work once published.

### Domain

To connect the association's domain, add it under **Domain management** in Netlify and update the DNS records at the registrar.

Before changing DNS, screenshot all existing records. **Do not change MX records**, or any @kenewa.org email will stop working.

---

## Accounts and ownership

Keep these under a shared KNEWA email address, not a personal one, and give at least two committee members access:

| Service | Used for |
| --- | --- |
| GitHub | Stores the website files |
| Netlify | Hosts the site and receives form submissions |
| Domain registrar | The web address (record the renewal date) |

Never put passwords, bank details or members' personal information in these files. They are public.

---

## Maintained by

The KNEWA committee. IT and Communications:  Yego. Secretary:  Rob.

Questions about the website: secretary@kenewa.org <!-- UPDATE if the email changes -->
