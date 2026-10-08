// =========================================================
// KENEWA events: builds the Events page from js/events-data.js,
// and runs countdowns anywhere on the site (data-countdown="YYYY-MM-DD").
// You shouldn't need to edit this file; edit js/events-data.js instead.
// =========================================================
(function () {
    const AUDIENCES = {
        everyone: "Open to everyone",
        families: "Families and kids",
        youth:    "Youth and students",
        women:    "Women",
        culture:  "Culture and national days",
        sport:    "Sport and wellbeing",
        members:  "Members' meetings"
    };
    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const pad = n => String(n).padStart(2, "0");
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const thisMonth = todayStr.slice(0, 7);

    // ---------- countdowns (home page and featured event) ----------
    function startCountdowns() {
        document.querySelectorAll("[data-countdown]").forEach(box => {
            const [y, m, d] = box.dataset.countdown.split("-").map(Number);
            const target = new Date(y, m - 1, d);            // midnight, local time
            box.hidden = false;                              // hidden in the HTML so "--" never shows
            function tick() {
                const ms = target - new Date();
                const set = (unit, v) => { const el = box.querySelector(`[data-unit="${unit}"]`); if (el) el.textContent = v; };
                if (ms <= 0) {
                    const sameDay = new Date().toDateString() === target.toDateString();
                    box.querySelector(".countdown-grid").innerHTML = `<p class="countdown-today">${sameDay ? "It's today!" : "Thank you for coming!"}</p>`;
                    return false;
                }
                const parts = { days: Math.floor(ms / 86400000), hours: Math.floor(ms / 3600000) % 24, minutes: Math.floor(ms / 60000) % 60 };
                Object.entries(parts).forEach(([unit, v]) => {
                    set(unit, v);
                    const label = box.querySelector(`[data-unit="${unit}"] + small`);
                    if (label) label.textContent = v === 1 ? unit.slice(0, -1) : unit;   // "1 hour", "2 hours"
                });
                return true;
            }
            if (tick()) setInterval(tick, 30000);
        });
    }

    // ---------- events page ----------
    const grid = document.getElementById("event-grid");
    if (grid && typeof KNEWA_EVENTS !== "undefined") {
        const upcoming = KNEWA_EVENTS
            .filter(e => e.date ? e.date >= todayStr : (!e.month || e.month >= thisMonth))
            .sort((a, b) => {
                const ka = a.date || (a.month ? a.month + "-99" : "9999");
                const kb = b.date || (b.month ? b.month + "-99" : "9999");
                return ka.localeCompare(kb);
            });

        // card colour comes from the most specific audience
        const PRIORITY = ["culture", "sport", "women", "youth", "members", "families", "everyone"];
        const theme = e => PRIORITY.find(p => e.for.includes(p)) || "everyone";
        const statusLabel = e => e.status === "proposed" ? "Idea: help us plan it" : e.status === "tbc" ? "Details to be confirmed" : "Confirmed";

        function poster(e) {
            if (e.date) {
                const [y, m, d] = e.date.split("-").map(Number);
                return `<span class="ev-day">${d}</span><span class="ev-mon">${MONTHS[m - 1]} ${y}</span>`;
            }
            if (e.month) {
                const [y, m] = e.month.split("-").map(Number);
                return `<span class="ev-day ev-day-word">${MONTHS[m - 1]}</span><span class="ev-mon">${y}</span>`;
            }
            return `<span class="ev-day ev-day-word">Idea</span><span class="ev-mon">Coming soon</span>`;
        }
        function facts(e) {
            const rows = [["When", e.when], ["Time", e.time], ["Where", e.place], ["Cost", e.cost]].filter(r => r[1]);
            return `<dl class="ev-facts">${rows.map(r => `<div><dt>${r[0]}</dt><dd>${esc(r[1])}</dd></div>`).join("")}</dl>`;
        }
        function tags(e) {
            return `<ul class="ev-tags" aria-label="Who it's for">${e.for.map(f => `<li class="tag-${f}">${esc(AUDIENCES[f] || f)}</li>`).join("")}</ul>`;
        }
        function actions(e) {
            const cal = e.date ? `<button type="button" class="btn btn-sm btn-gold" data-ics="${esc(e.id)}">Add to calendar</button>` : "";
            const ask = e.status === "proposed"
                ? `<a class="btn btn-sm btn-outline-ink" href="contact.html?topic=${encodeURIComponent("Hosting or suggesting an event")}">Help plan it</a>`
                : `<a class="btn btn-sm btn-outline-ink" href="contact.html?topic=Events">Ask about it</a>`;
            return `<div class="ev-actions">${cal}${ask}<button type="button" class="btn btn-sm btn-link" data-share="${esc(e.id)}">Share</button></div>`;
        }
        function card(e) {
            return `<article class="ev-card theme-${theme(e)} status-${e.status}" id="${esc(e.id)}" data-for="${e.for.join(" ")}">
                <div class="ev-poster">${poster(e)}<span class="ev-status">${statusLabel(e)}</span></div>
                <div class="ev-body">
                    <h3>${esc(e.title)}</h3>
                    ${facts(e)}
                    <p>${esc(e.about)}</p>
                    ${tags(e)}
                    ${actions(e)}
                </div>
            </article>`;
        }

        // featured event: marked featured, otherwise the next event with an exact date
        const featured = upcoming.find(e => e.featured) || upcoming.find(e => e.date) || null;
        const featuredBox = document.getElementById("featured-event");
        if (featured && featuredBox) {
            featuredBox.innerHTML = `<article class="feature theme-${theme(featured)}" id="${esc(featured.id)}">
                <div class="feature-main">
                    <p class="eyebrow">Next big event</p>
                    <h2>${esc(featured.title)}</h2>
                    <p class="feature-about">${esc(featured.about)}</p>
                    ${facts(featured)}
                    ${tags(featured)}
                    ${actions(featured)}
                </div>
                ${featured.date ? `<div class="countdown" data-countdown="${featured.date}">
                    <p class="countdown-label">Starts in</p>
                    <div class="countdown-grid">
                        <div><span data-unit="days">--</span><small>days</small></div>
                        <div><span data-unit="hours">--</span><small>hours</small></div>
                        <div><span data-unit="minutes">--</span><small>minutes</small></div>
                    </div></div>` : ""}
            </article>`;
        } else if (featuredBox) {
            featuredBox.closest("section").hidden = true;
        }

        const listed = upcoming.filter(e => e !== featured);
        grid.innerHTML = listed.map(card).join("") ||
            `<p class="empty">More events are on the way. <a href="contact.html?topic=Events">Suggest one</a>.</p>`;

        // filter chips (only for groups that have events)
        const present = Object.keys(AUDIENCES).filter(k => upcoming.some(e => e.for.includes(k)));
        const chipsBox = document.getElementById("event-filters");
        chipsBox.innerHTML = `<button type="button" class="chip" data-filter="" aria-pressed="true">All events</button>` +
            present.map(k => `<button type="button" class="chip chip-${k}" data-filter="${k}" aria-pressed="false">${esc(AUDIENCES[k])}</button>`).join("");
        const countEl = document.getElementById("event-count");
        function applyFilter(key) {
            let shown = 0;
            grid.querySelectorAll(".ev-card").forEach(c => {
                const ok = !key || c.dataset.for.split(" ").includes(key);
                c.hidden = !ok; if (ok) shown++;
            });
            chipsBox.querySelectorAll(".chip").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.filter === key)));
            let empty = grid.querySelector(".filter-empty");
            if (!shown) {
                if (!empty) { empty = document.createElement("p"); empty.className = "filter-empty"; grid.appendChild(empty); }
                empty.innerHTML = `Nothing else planned for this group yet. <a href="contact.html?topic=${encodeURIComponent("Hosting or suggesting an event")}">Suggest an event</a>.`;
            } else if (empty) empty.remove();
            countEl.textContent = `Showing ${shown} more event${shown === 1 ? "" : "s"}`;
        }
        chipsBox.addEventListener("click", ev => { const b = ev.target.closest(".chip"); if (b) applyFilter(b.dataset.filter); });
        applyFilter("");

        // year at a glance: this month and the next 11
        const strip = document.getElementById("year-strip");
        if (strip) {
            const cells = [];
            for (let i = 0; i < 12; i++) {
                const dt = new Date(now.getFullYear(), now.getMonth() + i, 1);
                const key = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}`;
                const inMonth = upcoming.filter(e => (e.date ? e.date.slice(0, 7) : e.month) === key);
                cells.push(`<div class="ym${inMonth.length ? " has" : ""}">
                    <p class="ym-name">${MONTHS_LONG[dt.getMonth()]} <span>${dt.getFullYear()}</span></p>
                    ${inMonth.length ? `<ul>${inMonth.map(e => `<li><a href="#${esc(e.id)}">${esc(e.title)}</a></li>`).join("")}</ul>` : `<p class="ym-empty">Nothing yet</p>`}
                </div>`);
            }
            strip.innerHTML = cells.join("");
        }

        // add to calendar (.ics file) and share buttons
        document.addEventListener("click", async ev => {
            const icsBtn = ev.target.closest("[data-ics]");
            if (icsBtn) {
                const e = KNEWA_EVENTS.find(x => x.id === icsBtn.dataset.ics);
                const start = e.date.replace(/-/g, "");
                const endDate = new Date(e.date + "T00:00:00"); endDate.setDate(endDate.getDate() + 1);
                const end = `${endDate.getFullYear()}${pad(endDate.getMonth() + 1)}${pad(endDate.getDate())}`;
                const clean = s => String(s || "").replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
                const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//KENEWA//Events//EN", "BEGIN:VEVENT",
                    `UID:${e.id}@kenewa.org`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
                    `DTSTART;VALUE=DATE:${start}`, `DTEND;VALUE=DATE:${end}`, `SUMMARY:${clean("KENEWA: " + e.title)}`,
                    `LOCATION:${clean(e.place)}`, `DESCRIPTION:${clean(e.about + (e.time ? " Time: " + e.time + "." : "") + " Details: " + location.href.split("#")[0] + "#" + e.id)}`,
                    "END:VEVENT", "END:VCALENDAR"].join("\r\n");
                const a = document.createElement("a");
                a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
                a.download = e.id + ".ics";
                document.body.appendChild(a); a.click(); a.remove();
                return;
            }
            const shareBtn = ev.target.closest("[data-share]");
            if (shareBtn) {
                const e = KNEWA_EVENTS.find(x => x.id === shareBtn.dataset.share);
                const url = location.href.split("#")[0] + "#" + e.id;
                try {
                    if (navigator.share) { await navigator.share({ title: "KENEWA: " + e.title, text: e.when, url }); return; }
                    await navigator.clipboard.writeText(url);
                    shareBtn.textContent = "Link copied";
                } catch (_) { /* sharing cancelled */ }
            }
        });

        // opened with a link to one event? scroll to it and highlight it
        if (location.hash) {
            const target = document.getElementById(location.hash.slice(1));
            if (target) { target.classList.add("is-linked"); setTimeout(() => target.scrollIntoView({ block: "center" }), 50); }
        }
    }

    startCountdowns();
})();
