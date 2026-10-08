// =========================================================
// KENEWA members area
// =========================================================
const msg = document.getElementById("msg");
let user, profile, family = [], payments = [], requests = [], notes = [], reads = new Set(), waLink = null;
// welfare member services (unlock when the joining fees are confirmed)
let welfare = false, polls = [], pollOptions = [], myVotes = new Set(), pollResults = {}, documents = [];
const EVIDENCE_BUCKET = "support-evidence";

// ---------- Small helpers ----------
let toastTimer;
function toast(text) {
    const t = document.getElementById("toast");
    t.textContent = text; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, 2600);
}
function fileSize(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }

// ---------- Moving between sections ----------
function show(view) {
    // new members must choose their membership type before anything else
    const choosing = !!profile && !profile.type_chosen;
    if (choosing) view = "choose";
    else if (view === "choose") view = "dashboard";
    document.body.classList.toggle("choosing", choosing);
    document.querySelectorAll(".view").forEach(v => v.hidden = v.id !== "view-" + view);
    document.querySelectorAll(".side button, .tabbar button").forEach(b => b.classList.toggle("on", b.dataset.view === view));
    showMsg(msg, "");
    history.replaceState(null, "", "#" + view);
    window.scrollTo(0, 0);
}
document.addEventListener("click", e => {
    const nav = e.target.closest("[data-view], [data-go]");
    if (nav) show(nav.dataset.view || nav.dataset.go);
});

// ---------- Load everything for this member ----------
async function loadAll() {
    const [p, f, pay, req, n, r, wa, wel, pl, po, pv, docs] = await Promise.all([
        db.from("profiles").select("*").eq("id", user.id).single(),
        db.from("family_members").select("*").eq("member_id", user.id).order("created_at"),
        db.from("payments").select("*").eq("member_id", user.id).order("created_at", { ascending: false }),
        db.from("support_requests").select("*").eq("member_id", user.id).order("created_at", { ascending: false }),
        db.from("notifications").select("*").or("member_id.is.null,member_id.eq." + user.id).order("created_at", { ascending: false }).limit(50),
        db.from("notification_reads").select("notification_id").eq("member_id", user.id),
        db.rpc("member_whatsapp_link"),
        // the database only returns these to welfare members whose fees are confirmed
        db.rpc("is_welfare_member"),
        db.from("polls").select("*").order("closes_at", { ascending: false }).limit(20),
        db.from("poll_options").select("*").order("position"),
        db.from("poll_voters").select("poll_id").eq("member_id", user.id),
        db.from("member_documents").select("*").order("category").order("title")
    ]);
    if (p.error) { showMsg(msg, "Could not load your account: " + p.error.message, "error"); return; }
    profile = p.data;
    family = f.data || [];
    payments = pay.data || [];
    requests = req.data || [];
    notes = n.data || [];
    reads = new Set((r.data || []).map(x => x.notification_id));
    waLink = (!wa.error && wa.data) ? wa.data : null;
    welfare = !wel.error && wel.data === true;
    polls = welfare ? (pl.data || []) : [];
    pollOptions = welfare ? (po.data || []) : [];
    myVotes = new Set((pv.data || []).map(x => x.poll_id));
    documents = welfare ? (docs.data || []) : [];
    // results for votes that have closed (the database hides them until then)
    pollResults = {};
    const closed = polls.filter(x => new Date(x.closes_at) <= new Date()).slice(0, 5);
    const res = await Promise.all(closed.map(x => db.rpc("poll_results", { p_poll: x.id })));
    closed.forEach((x, i) => { if (!res[i].error) pollResults[x.id] = res[i].data || []; });
    renderAll();
}

function renderAll() {
    const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || user.email;
    document.getElementById("user-name").textContent = name;
    document.getElementById("user-initials").textContent =
        ((profile.first_name || "?")[0] + ((profile.last_name || "")[0] || "")).toUpperCase();
    document.getElementById("hello").textContent = "Habari, " + (profile.first_name || "member") + "!";
    document.getElementById("choose-hello").textContent = "Karibu, " + (profile.first_name || "and welcome") + "!";
    renderDashboard(); renderWhatsApp(); fillRegistration(); renderFamily(); renderPayments(); renderRequests(); renderNotes();
    renderServices();
}

// ---------- First step: choose membership type ----------
document.addEventListener("click", async e => {
    const b = e.target.closest("[data-choose]");
    if (!b) return;
    const type = b.dataset.choose;
    document.querySelectorAll("[data-choose]").forEach(x => x.disabled = true);
    const { error } = await db.from("profiles").update({ membership_type: type, type_chosen: true }).eq("id", user.id);
    document.querySelectorAll("[data-choose]").forEach(x => x.disabled = false);
    if (error) return showMsg(msg, "Could not save your choice: " + error.message, "error");
    await loadAll();
    show("registration");
    showMsg(msg, type === "financial"
        ? "Great choice. Next, fill in your details below. After that you'll add your family and pay the $200 joining fees."
        : "Thank you. Next, fill in your details below so the committee can welcome you.", "info");
});

// ---------- Welfare member services ----------
function joiningPayment() {
    return payments.find(p => p.purpose === "Joining fees" && p.status === "confirmed")
        || payments.find(p => p.purpose === "Joining fees" && p.status === "awaiting");
}
// open | community | lapsed | awaiting (payment recorded, not yet confirmed) | unpaid
function serviceState() {
    if (welfare) return "open";
    if (profile.membership_type !== "financial") return "community";
    if (profile.status === "lapsed") return "lapsed";
    const pay = joiningPayment();
    if (pay && pay.status === "confirmed") return "register";   // paid, but registration not submitted yet
    return pay ? "awaiting" : "unpaid";
}
const SERVICE_LOCKED = {
    community: { text: "These services are for <strong>welfare members</strong>. Upgrade to welfare membership ($200 to join) to vote, get welfare fund cover for your family and use everything below.",
                 btn: `<button class="btn btn-gold" data-go="registration">Upgrade in My details</button>` },
    unpaid:    { text: "Your welfare member services unlock as soon as the Treasurer confirms your <strong>$200 joining fees</strong>.",
                 btn: `<button class="btn btn-gold" data-go="payments">Pay now</button>` },
    awaiting:  { text: "Thank you, your joining fees are recorded. Your services unlock as soon as the <strong>Treasurer confirms the payment</strong>. You'll get a notification.",
                 btn: "" },
    lapsed:    { text: "Your membership has lapsed, so these services are paused. Please renew your membership or contact the Treasurer.",
                 btn: `<button class="btn btn-gold" data-go="payments">Renew</button>` },
    register:  { text: "Your joining fees are confirmed. Submit your registration in <strong>My details</strong> to unlock your services.",
                 btn: `<button class="btn btn-gold" data-go="registration">Finish registration</button>` }
};

// Each service: live ones have a render function; the others are "coming soon"
const SERVICES = [
    { id: "voting", icon: "i-vote", title: "Online voting", live: true,
      desc: "Vote in committee elections, AGM motions and member surveys from your phone. Your vote is secret.", render: renderVoting },
    { id: "card", icon: "i-idcard", title: "Digital membership card", live: true,
      desc: "Your KENEWA membership card with your member number, ready to show or print.", render: renderCard },
    { id: "cover", icon: "i-shield", title: "My welfare cover", live: true,
      desc: "See who in your family is covered by the welfare fund for bereavement, illness and hardship support.", render: renderCover },
    { id: "docs", icon: "i-doc", title: "Members' documents", live: true,
      desc: "The constitution, meeting minutes, financial reports and the welfare fund policy.", render: renderDocs },
    { id: "chama", icon: "i-coins", title: "Chama savings circle",
      desc: "Save and invest together with other members in the chama tradition." },
    { id: "loans", icon: "i-help", title: "Interest-free emergency loans",
      desc: "Small short-term loans from the welfare fund when an emergency strikes." },
    { id: "bursary", icon: "i-grad", title: "Education bursaries",
      desc: "Help with school and study costs for members' children and students." },
    { id: "mentoring", icon: "i-family", title: "Mentoring and careers network",
      desc: "Connect with members working in health, education, agriculture, trades and business." },
    { id: "directory", icon: "i-store", title: "Member business directory",
      desc: "List your business and support other members' businesses across New England." },
    { id: "discounts", icon: "i-tag", title: "Partner discounts",
      desc: "Discounts from local businesses and services that support KENEWA." }
];

function renderServices() {
    const state = serviceState();
    const open = state === "open";
    document.getElementById("side-lock").hidden = open;

    document.getElementById("svc-state").innerHTML = open
        ? `<div class="svc-banner open"><svg width="26" height="26" aria-hidden="true"><use href="#i-shield"/></svg>
             <div><strong>Your welfare member services are active.</strong> Thank you for supporting the welfare fund. Asante sana!</div></div>`
        : `<div class="svc-banner locked"><svg width="26" height="26" aria-hidden="true"><use href="#i-lock"/></svg>
             <div>${SERVICE_LOCKED[state].text}</div>${SERVICE_LOCKED[state].btn}</div>`;

    document.getElementById("svc-grid").innerHTML = SERVICES.map(s => {
        const head = `<div class="svc-head"><span class="svc-icon"><svg width="22" height="22" aria-hidden="true"><use href="#${s.icon}"/></svg></span>
            <h2>${s.title}</h2>${!open ? `<span class="svc-tag lock"><svg width="13" height="13" aria-hidden="true"><use href="#i-lock"/></svg> Locked</span>`
                : !s.live ? `<span class="svc-tag soon">Coming soon</span>` : ""}</div>`;
        const body = open && s.live ? s.render() : `<p class="svc-desc">${s.desc}</p>`;
        return `<article class="svc ${open ? "" : "locked"} ${open && !s.live ? "soon" : ""} ${open && s.live ? "live svc-" + s.id : ""}" id="svc-${s.id}"
                 ${open ? "" : 'aria-disabled="true"'}>${head}${body}</article>`;
    }).join("");

    // dashboard teaser
    const openPolls = polls.filter(x => isOpen(x) && !myVotes.has(x.id)).length;
    document.getElementById("svc-teaser").innerHTML = open
        ? `<button class="svc-teaser open" data-go="services"><svg width="24" height="24" aria-hidden="true"><use href="#i-star"/></svg>
             <span><strong>Member services</strong><br><span class="note m-0">${openPolls ? `${openPolls} vote${openPolls === 1 ? "" : "s"} waiting for you` : "Voting, membership card, welfare cover and documents"}</span></span>
             ${openPolls ? `<span class="count">${openPolls}</span>` : ""}</button>`
        : `<button class="svc-teaser locked" data-go="services"><svg width="24" height="24" aria-hidden="true"><use href="#i-lock"/></svg>
             <span><strong>Member services are locked</strong><br><span class="note m-0">${{ community: "For welfare members: tap to see what's included", awaiting: "Waiting for the Treasurer to confirm your payment",
                lapsed: "Paused: membership lapsed", register: "Finish your registration to unlock" }[state] || "Unlock by paying your $200 joining fees"}</span></span></button>`;
}

// ---- Online voting ----
const fmtWhen = v => new Date(v).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const isOpen = x => new Date(x.opens_at) <= new Date() && new Date() < new Date(x.closes_at);
const KIND_LABEL = { election: "Election", motion: "Motion", survey: "Survey" };
function renderVoting() {
    const optionsFor = id => pollOptions.filter(o => o.poll_id === id);
    const open = polls.filter(isOpen).sort((a, b) => new Date(a.closes_at) - new Date(b.closes_at));
    const soon = polls.filter(x => new Date(x.opens_at) > new Date());
    const closed = polls.filter(x => new Date(x.closes_at) <= new Date()).slice(0, 5);
    if (!polls.length) return `<p class="empty mb-0">No votes yet. The committee will notify you when a vote opens.</p>`;

    const openHtml = open.map(x => myVotes.has(x.id)
        ? `<div class="poll"><div class="poll-top"><span class="pill grey">${KIND_LABEL[x.kind]}</span><span class="note m-0">Closes ${fmtWhen(x.closes_at)}</span></div>
             <h3>${esc(x.title)}</h3><p class="voted">✓ You have voted. Results show when the vote closes.</p></div>`
        : `<form class="poll" data-poll="${x.id}"><div class="poll-top"><span class="pill amber">${KIND_LABEL[x.kind]}: open</span><span class="note m-0">Closes ${fmtWhen(x.closes_at)}</span></div>
             <h3>${esc(x.title)}</h3>${x.description ? `<p class="note mt-0">${esc(x.description)}</p>` : ""}
             <div class="poll-options">${optionsFor(x.id).map(o => `<label><input type="radio" name="opt" value="${o.id}" required><span>${esc(o.label)}</span></label>`).join("")}</div>
             <button class="btn btn-gold mt-2">Cast my vote</button>
             <p class="note mb-0">Secret ballot: the committee can see who has voted, but not how anyone voted. You can vote once.</p></form>`).join("");
    const soonHtml = soon.map(x => `<div class="poll"><div class="poll-top"><span class="pill grey">${KIND_LABEL[x.kind]}</span><span class="note m-0">Opens ${fmtWhen(x.opens_at)}</span></div><h3>${esc(x.title)}</h3></div>`).join("");
    const closedHtml = closed.map(x => {
        const rows = pollResults[x.id] || [];
        const total = rows.reduce((t, r) => t + Number(r.votes), 0);
        const top = Math.max(0, ...rows.map(r => Number(r.votes)));
        return `<div class="poll closed"><div class="poll-top"><span class="pill green">${KIND_LABEL[x.kind]}: closed</span><span class="note m-0">${total} vote${total === 1 ? "" : "s"}</span></div>
            <h3>${esc(x.title)}</h3>
            ${rows.map(r => { const pct = total ? Math.round(r.votes / total * 100) : 0;
                return `<div class="result ${Number(r.votes) === top && top > 0 ? "win" : ""}"><span class="r-label">${esc(r.label)}</span>
                  <span class="r-bar"><span style="width:${pct}%"></span></span><span class="r-num">${r.votes} (${pct}%)</span></div>`; }).join("")}</div>`;
    }).join("");
    return openHtml + soonHtml + (closedHtml ? `<p class="svc-sub">Recent results</p>${closedHtml}` : "");
}
document.addEventListener("submit", async e => {
    const form = e.target.closest("form[data-poll]");
    if (!form) return;
    e.preventDefault();
    const choice = form.querySelector('input[name="opt"]:checked');
    if (!choice) return;
    const label = choice.nextElementSibling.textContent;
    if (!confirm(`Cast your vote for "${label}"? You can't change it afterwards.`)) return;
    form.querySelector("button").disabled = true;
    const { error } = await db.rpc("cast_vote", { p_poll: Number(form.dataset.poll), p_option: Number(choice.value) });
    if (error) { form.querySelector("button").disabled = false; return showMsg(msg, error.message, "error"); }
    await loadAll(); show("services");
    showMsg(msg, "Thank you, your vote has been counted.", "info");
});

// ---- Digital membership card ----
function renderCard() {
    const name = [profile.first_name, profile.last_name].filter(Boolean).join(" ");
    return `<div class="member-card" id="member-card">
        <div class="mc-top"><img src="images/logo-mark.svg" alt="" width="44" height="44"><div><strong>KENEWA</strong><span>Kenyans in New England Welfare Association Inc</span></div></div>
        <p class="mc-name">${esc(name || user.email)}</p>
        <div class="mc-grid">
            <div><span>Member no.</span>${esc(profile.member_number || "Given after approval")}</div>
            <div><span>Membership</span>Welfare member</div>
            <div><span>Status</span>${esc(STATUS_LABEL[profile.status] || profile.status)}</div>
            <div><span>Member since</span>${fmtDate(profile.registered_at || profile.created_at)}</div>
        </div>
        <p class="mc-motto">Umoja ni nguvu</p>
    </div>
    <button class="btn btn-outline-ink btn-sm mt-2" id="print-card">Print or save as PDF</button>`;
}
document.addEventListener("click", e => {
    if (!e.target.closest("#print-card")) return;
    document.body.classList.add("print-card");
    window.print();
    setTimeout(() => document.body.classList.remove("print-card"), 500);
});

// ---- My welfare cover ----
function renderCover() {
    const covered = family.filter(m => m.pending_action !== "add");
    const waiting = family.filter(m => m.pending_action);
    const group = (kind, title) => {
        const people = covered.filter(m => m.kind === kind);
        return people.length ? `<p class="svc-sub">${title}</p><ul class="cover-list">${people.map(m => `<li>${esc(m.full_name)}${m.pending_action === "remove" ? ' <span class="note m-0">(removal waiting)</span>' : ""}</li>`).join("")}</ul>` : "";
    };
    return `<ul class="cover-list"><li><strong>You</strong></li></ul>
        ${group("spouse", "Spouse")}${group("dependant", "Dependants")}${group("sibling", "Siblings")}
        ${covered.length ? "" : `<p class="note">No family registered yet.</p>`}
        ${waiting.length ? `<p class="note">${waiting.length} change${waiting.length === 1 ? "" : "s"} waiting for committee approval.</p>` : ""}
        <button class="btn btn-link btn-sm p-0" data-go="family">Update my family</button>
        <p class="note mb-0">Support applies once your membership has been current for 3 months (straight away for a bereavement or
           life-threatening emergency). The committee decides the amount under the
           <a href="docs/kenewa-welfare-fund-policy.pdf" target="_blank" rel="noopener">Welfare Fund Policy</a>.</p>`;
}

// ---- Members' documents ----
function renderDocs() {
    if (!documents.length) return `<p class="empty mb-0">Documents will appear here once the committee adds them.</p>`;
    const cats = [...new Set(documents.map(d => d.category))];
    return cats.map(c => `<p class="svc-sub">${esc(c)}</p><ul class="doc-list">${documents.filter(d => d.category === c).map(d =>
        `<li><a href="${esc(d.url)}" target="_blank" rel="noopener"><svg width="16" height="16" aria-hidden="true"><use href="#i-doc"/></svg> ${esc(d.title)}</a>
             <span class="note m-0">${fmtDate(d.created_at)}</span></li>`).join("")}</ul>`).join("");
}

// ---------- Dashboard ----------
function membershipSteps() {
    const fin = profile.membership_type === "financial";
    const joining = payments.find(p => p.purpose === "Joining fees" && p.status !== "rejected");
    const steps = [
        { done: true, what: "Create your account", hint: "Done." },
        { done: !!profile.type_chosen, what: "Choose your membership type", hint: fin ? "Welfare (financial) member." : "Community member.", go: "choose" },
        { done: profile.status !== "incomplete", what: "Complete your registration", hint: "Your details, next of kin and declaration.", go: "registration" }
    ];
    if (fin) {
        steps.push({ done: profile.family_locked, what: "Add and confirm your family", hint: profile.family_locked ? "Confirmed." : "Spouse, dependants and siblings, then tap Confirm my family list.", go: "family" });
        steps.push({ done: !!joining, what: "Pay your $200 joining fees", hint: joining ? "Recorded." : "Tap Pay now, then record the payment.", go: "payments" });
        const ok = payments.some(p => p.purpose === "Joining fees" && p.status === "confirmed");
        steps.push({ done: ok, what: "Treasurer confirms your payment", hint: ok ? "Confirmed: your welfare member services are unlocked." : "Your member services unlock when this is done." });
    }
    steps.push({ done: profile.status === "active", what: "Committee approval", hint: profile.status === "active" ? "Welcome to KENEWA!" : "The committee will review your registration." });
    return steps;
}

function renderDashboard() {
    const fin = profile.membership_type === "financial";
    document.getElementById("st-type").textContent = fin ? "Welfare" : "Community";
    document.getElementById("st-status").innerHTML = pill(profile.status, STATUS_LABEL[profile.status]);
    const approvedFamily = family.filter(m => m.pending_action !== "add").length;
    document.getElementById("st-family").textContent = fin ? approvedFamily + " of 15" : "Not needed";
    document.getElementById("st-owing").textContent = payments.filter(p => p.status === "awaiting").length;

    // welcome card
    document.getElementById("welcome-number").textContent = profile.member_number ? "Member no. " + profile.member_number : "Member no. given after approval";
    document.getElementById("welcome-status").innerHTML = pill(profile.status, STATUS_LABEL[profile.status]);
    document.getElementById("welcome-sub").textContent = profile.status === "active"
        ? "Thank you for being part of KENEWA. Umoja ni nguvu."
        : "Here is what's left to finish your membership.";

    const steps = membershipSteps();
    const done = steps.filter(s => s.done).length;
    const pct = Math.round(done / steps.length * 100);
    document.getElementById("progress-ring").style.setProperty("--p", pct);
    document.getElementById("progress-num").textContent = pct + "%";
    const next = steps.find(s => !s.done);
    document.getElementById("progress-text").textContent = next ? `${done} of ${steps.length} steps done` : "All steps done";
    const nextBtn = document.getElementById("next-step");
    nextBtn.hidden = !(next && next.go);
    if (next && next.go) { nextBtn.dataset.go = next.go; nextBtn.textContent = "Next: " + next.what; }

    let nowSet = false;
    document.getElementById("checklist").innerHTML = steps.map(s => {
        let cls = s.done ? "done" : "";
        if (!s.done && !nowSet) { cls = "now"; nowSet = true; }
        const action = !s.done && s.go ? ` <button class="btn btn-link btn-sm p-0" data-go="${s.go}">Go</button>` : "";
        return `<li class="${cls}"><span class="tick">${s.done ? "✓" : ""}</span>
                <div><div class="what">${s.what}${action}</div><div class="hint">${esc(s.hint)}</div></div></li>`;
    }).join("");
}

// ---------- WhatsApp group ----------
function renderWhatsApp() {
    const card = document.getElementById("wa-card");
    const join = document.getElementById("wa-join");
    const locked = document.getElementById("wa-locked");
    const top = document.getElementById("top-whatsapp");
    card.hidden = false;
    if (waLink) {
        join.href = waLink; join.hidden = false; locked.hidden = true;
        top.href = waLink; top.hidden = false;
        document.getElementById("wa-text").textContent = "Tap to join \"KENEWA Members\" for news, event reminders and quick updates from the committee.";
        card.classList.remove("wa-locked");
    } else {
        join.hidden = true; top.hidden = true;
        locked.hidden = profile.status !== "incomplete";
        card.classList.add("wa-locked");
        document.getElementById("wa-text").textContent = profile.status === "incomplete"
            ? "The group link appears here as soon as you submit your registration."
            : "The group link isn't available right now. Please contact the committee.";
    }
}

// ---------- Registration ----------
const regForm = document.getElementById("reg-form");
function toggleFinancial() {
    const fin = regForm.querySelector('input[name="membership_type"]:checked')?.value === "financial";
    regForm.querySelectorAll(".financial-only").forEach(el => el.hidden = !fin);
}
regForm.addEventListener("change", e => { if (e.target.name === "membership_type") toggleFinancial(); });

function fillRegistration() {
    const fields = ["first_name", "last_name", "date_of_birth", "gender", "phone", "occupation", "street_address", "town",
                    "postcode", "home_county", "father_name", "mother_name", "nok_name", "nok_relationship", "nok_phone", "nok_country"];
    fields.forEach(k => { if (regForm.elements[k]) regForm.elements[k].value = profile[k] || ""; });
    regForm.querySelector(`input[name="membership_type"][value="${profile.membership_type}"]`).checked = true;
    regForm.elements.agreed_constitution.checked = profile.agreed_constitution;
    document.getElementById("reg-locked").hidden = profile.status === "incomplete";
    document.getElementById("reg-submit").textContent = profile.status === "incomplete" ? "Save and submit registration" : "Save changes";
    toggleFinancial();
}

regForm.addEventListener("submit", async e => {
    e.preventDefault();
    const f = regForm.elements;
    const update = {
        membership_type: regForm.querySelector('input[name="membership_type"]:checked').value,
        first_name: f.first_name.value.trim(), last_name: f.last_name.value.trim(),
        date_of_birth: f.date_of_birth.value || null, gender: f.gender.value || null,
        phone: f.phone.value.trim(), occupation: f.occupation.value.trim(),
        street_address: f.street_address.value.trim(), town: f.town.value.trim(), postcode: f.postcode.value.trim(),
        home_county: f.home_county.value.trim(), father_name: f.father_name.value.trim(), mother_name: f.mother_name.value.trim(),
        nok_name: f.nok_name.value.trim(), nok_relationship: f.nok_relationship.value.trim(),
        nok_phone: f.nok_phone.value.trim(), nok_country: f.nok_country.value.trim(),
        agreed_constitution: f.agreed_constitution.checked
    };
    const firstTime = profile.status === "incomplete";
    if (firstTime) update.status = "pending";
    const { error } = await db.from("profiles").update(update).eq("id", user.id);
    if (error) return showMsg(msg, "Could not save: " + error.message, "error");
    await loadAll();
    show(update.membership_type === "financial" && !profile.family_locked ? "family" : "dashboard");
    showMsg(msg, (update.membership_type === "financial"
        ? "Registration saved. Next, add your family and confirm the list, then pay your joining fees."
        : "Registration saved. The committee will review it soon.")
        + (firstTime && waLink ? " You can now join the members' WhatsApp group from your dashboard." : ""), "info");
});

// ---------- Family ----------
// Limits and fields for each kind of family member (the database enforces the same limits)
const FAMILY = {
    spouse:    { title: "Spouse", one: "spouse", limit: 1, fields: ["full_name", "date_of_birth"] },
    dependant: { title: "Dependants", one: "dependant", limit: 7, fields: ["full_name", "relationship", "date_of_birth"] },
    sibling:   { title: "Siblings", one: "sibling", limit: 7, fields: ["full_name", "country"] }
};
const FIELD_HTML = {
    full_name: (k) => `<div class="col-md"><label class="form-label" for="${k}-name">Full name *</label>
        <input class="form-control" id="${k}-name" name="full_name" required maxlength="120"></div>`,
    relationship: (k) => `<div class="col-md-3"><label class="form-label" for="${k}-rel">Relationship *</label>
        <select class="form-select" id="${k}-rel" name="relationship" required>
            <option value="">Choose...</option><option>Child</option><option>Stepchild</option><option>Other dependant</option></select></div>`,
    date_of_birth: (k) => `<div class="col-md-3"><label class="form-label" for="${k}-dob">Date of birth</label>
        <input type="date" class="form-control" id="${k}-dob" name="date_of_birth"></div>`,
    country: (k) => `<div class="col-md-4"><label class="form-label" for="${k}-country">Country they live in *</label>
        <input class="form-control" id="${k}-country" name="country" required placeholder="e.g. Kenya"></div>`
};

function familyDetails(m, pending) {
    const name = pending ? m.pending_full_name : m.full_name;
    const rel = pending ? m.pending_relationship : m.relationship;
    const dob = pending ? m.pending_date_of_birth : m.date_of_birth;
    const country = pending ? m.pending_country : m.country;
    const bits = [];
    if (m.kind === "dependant" && rel) bits.push(rel);
    if (dob) bits.push("born " + fmtDate(dob));
    if (m.kind === "sibling" && country) bits.push("lives in " + country);
    return `<strong>${esc(name)}</strong>${bits.length ? `<br><span class="note">${esc(bits.join(", "))}</span>` : ""}`;
}

function familyStatus(m) {
    if (m.pending_action === "add") return pill("awaiting", "New: waiting for approval");
    if (m.pending_action === "update") return pill("awaiting", "Change waiting for approval");
    if (m.pending_action === "remove") return pill("rejected", "Removal waiting for approval");
    return pill("confirmed", "Approved");
}

function renderFamily() {
    const locked = profile.family_locked;
    document.getElementById("family-state").innerHTML = locked
        ? `<div class="msg">Your family list is confirmed. Any addition, change or removal is now sent to the committee for approval,
             and you'll get a notification when they decide.</div>`
        : `<div class="msg warn"><strong>First-time setup:</strong> everything you add now is approved straight away, and you can fix
             mistakes freely. When your list is complete, tap <strong>Confirm my family list</strong>. After that, changes need
             committee approval.
             <div class="mt-2"><button class="btn btn-gold" id="family-confirm">Confirm my family list</button></div></div>`;

    document.getElementById("family-panels").innerHTML = Object.entries(FAMILY).map(([kind, cfg]) => {
        const people = family.filter(m => m.kind === kind);
        const full = people.length >= cfg.limit;
        const rows = people.length ? people.map(m => {
            const changed = m.pending_action === "update"
                ? `<div class="change-to"><span>Requested change:</span> ${familyDetails(m, true)}</div>` : "";
            const waiting = m.pending_action === "update" || m.pending_action === "remove";
            const actions = waiting
                ? `<button class="btn btn-link btn-sm p-0" data-fcancel="${m.id}">Cancel request</button>`
                : `<button class="btn btn-link btn-sm p-0" data-fedit="${m.id}">Edit</button>
                   <button class="btn btn-link btn-sm p-0 text-danger ms-2" data-fremove="${m.id}">${locked && m.pending_action !== "add" ? "Request removal" : "Remove"}</button>`;
            return `<tr><td>${familyDetails(m)}${changed}</td><td>${familyStatus(m)}</td><td class="text-nowrap text-end">${actions}</td></tr>`;
        }).join("") : `<tr><td colspan="3" class="empty">None added yet.</td></tr>`;

        return `<div class="panel" id="panel-${kind}">
            <div class="d-flex justify-content-between align-items-baseline gap-2">
                <h2>${cfg.title}</h2><span class="count-of ${full ? "full" : ""}">${people.length} of ${cfg.limit}</span>
            </div>
            <div class="fill-bar" aria-hidden="true"><span style="width:${Math.round(people.length / cfg.limit * 100)}%"></span></div>
            <div class="table-wrap"><table class="list"><tbody>${rows}</tbody></table></div>
            <form class="family-form row g-2 mt-2 align-items-end" data-kind="${kind}" ${full ? "hidden" : ""}>
                <input type="hidden" name="id">
                <p class="form-mode col-12 mb-0" hidden></p>
                ${cfg.fields.map(f => FIELD_HTML[f](kind)).join("")}
                <div class="col-md-auto d-flex gap-2">
                    <button class="btn btn-gold" type="submit">${locked ? "Request to add" : "Add"}</button>
                    <button class="btn btn-outline-ink" type="button" data-fstop hidden>Cancel</button>
                </div>
            </form>
            ${full ? `<p class="note mb-0">You've reached the limit of ${cfg.limit}. To replace someone, ${locked ? "request their removal first" : "remove them first"}.</p>` : ""}
        </div>`;
    }).join("");
}

// Put a person's details into the form so they can be edited
function startEdit(id) {
    const m = family.find(x => String(x.id) === String(id));
    const form = document.querySelector(`.family-form[data-kind="${m.kind}"]`);
    form.hidden = false;
    const f = form.elements;
    f.id.value = m.id;
    f.full_name.value = m.full_name || "";
    if (f.relationship) f.relationship.value = m.relationship || "";
    if (f.date_of_birth) f.date_of_birth.value = m.date_of_birth || "";
    if (f.country) f.country.value = m.country || "";
    const changeNeedsApproval = profile.family_locked && m.pending_action !== "add";
    const mode = form.querySelector(".form-mode");
    mode.hidden = false;
    mode.innerHTML = `Editing <strong>${esc(m.full_name)}</strong>` + (changeNeedsApproval ? " (the committee will approve the change)" : "");
    form.querySelector("[type=submit]").textContent = changeNeedsApproval ? "Request change" : "Save";
    form.querySelector("[data-fstop]").hidden = false;
    f.full_name.focus();
}

async function familyAction(promise, okText) {
    const { error } = await promise;
    if (error) { showMsg(msg, error.message, "error"); return; }
    await loadAll(); show("family");
    if (okText) showMsg(msg, okText, "info");
}

document.addEventListener("submit", e => {
    const form = e.target.closest(".family-form");
    if (!form) return;
    e.preventDefault();
    const f = form.elements;
    const args = {
        p_full_name: f.full_name.value.trim(),
        p_relationship: f.relationship ? f.relationship.value : null,
        p_date_of_birth: f.date_of_birth && f.date_of_birth.value ? f.date_of_birth.value : null,
        p_country: f.country ? f.country.value.trim() : null
    };
    const locked = profile.family_locked;
    if (f.id.value) {
        const m = family.find(x => String(x.id) === f.id.value);
        const asks = locked && m && m.pending_action !== "add";
        familyAction(db.rpc("family_update", Object.assign({ p_id: Number(f.id.value) }, args)),
            asks ? "Change sent to the committee for approval." : "Saved.");
    } else {
        familyAction(db.rpc("family_add", Object.assign({ p_kind: form.dataset.kind }, args)),
            locked ? "Sent to the committee for approval." : "Added and approved.");
    }
});

document.addEventListener("click", e => {
    const edit = e.target.closest("[data-fedit]");
    if (edit) return startEdit(edit.dataset.fedit);
    if (e.target.closest("[data-fstop]")) return renderFamily();

    const rem = e.target.closest("[data-fremove]");
    if (rem) {
        const m = family.find(x => String(x.id) === rem.dataset.fremove);
        const asks = profile.family_locked && m.pending_action !== "add";
        if (!confirm(asks ? `Ask the committee to remove ${m.full_name}?` : `Remove ${m.full_name}?`)) return;
        return familyAction(db.rpc("family_remove", { p_id: m.id }),
            asks ? "Removal sent to the committee for approval." : "Removed.");
    }
    const cancel = e.target.closest("[data-fcancel]");
    if (cancel) return familyAction(db.rpc("family_cancel", { p_id: Number(cancel.dataset.fcancel) }), "Request cancelled.");

    if (e.target.closest("#family-confirm")) {
        if (!confirm("Confirm your family list? After this, any change will need committee approval.")) return;
        familyAction(db.rpc("family_confirm"), "Family list confirmed. Thank you.");
    }
});

// ---------- Payments ----------
let payChoice = 0;   // which item in KNEWA_PAYMENT.cardLinks is selected
function payReference() {
    return profile.member_number ? profile.member_number : (profile.last_name || "SURNAME").toUpperCase() + " REG";
}
function renderPayChoice() {
    const item = KNEWA_PAYMENT.cardLinks[payChoice];
    document.querySelectorAll("#pay-chips .chip").forEach((c, i) => c.setAttribute("aria-pressed", String(i === payChoice)));
    const link = document.getElementById("card-link");
    const missing = document.getElementById("card-missing");
    if (item.url) {
        // Stripe Payment Links accept these extras: the member's reference and email are filled in for them
        const ref = ("KENEWA-" + payReference()).replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 200);
        const sep = item.url.includes("?") ? "&" : "?";
        link.href = item.url + sep + "client_reference_id=" + encodeURIComponent(ref)
                  + (user.email ? "&prefilled_email=" + encodeURIComponent(user.email) : "");
        link.hidden = false; missing.hidden = true;
    } else {
        link.hidden = true; missing.hidden = false;
    }
    document.getElementById("card-amount").textContent = item.amount ? money(item.amount) : "now";
    // keep the "record a payment" form in step
    const sel = document.getElementById("p-purpose");
    if ([...sel.options].some(o => o.value === item.purpose)) sel.value = item.purpose;
    if (item.amount) document.getElementById("p-amount").value = item.amount;
}
function renderPayments() {
    const fin = profile.membership_type === "financial";
    document.getElementById("joining-box").closest(".col-lg-6").hidden = !fin;
    // joining fees only make sense for members who haven't paid them
    const paidJoining = payments.some(p => p.purpose === "Joining fees" && p.status !== "rejected");
    if (payChoice === 0 && (!fin || paidJoining)) payChoice = 1;
    document.getElementById("pay-chips").innerHTML = KNEWA_PAYMENT.cardLinks.map((c, i) =>
        `<button type="button" class="chip" data-paychoice="${i}" aria-pressed="false">${esc(c.label)}${c.amount ? " " + money(c.amount) : ""}</button>`).join("");
    document.getElementById("payid-val").textContent = KNEWA_PAYMENT.payid;
    document.getElementById("acc-name").textContent = KNEWA_PAYMENT.accountName;
    document.getElementById("bsb-val").textContent = KNEWA_PAYMENT.bsb;
    document.getElementById("acc-val").textContent = KNEWA_PAYMENT.account;
    document.getElementById("treasurer-name").textContent = KNEWA_PAYMENT.treasurer;
    document.getElementById("pay-ref").textContent = payReference();
    renderPayChoice();
    document.getElementById("pay-rows").innerHTML = payments.length ? payments.map(p => `<tr>
        <td>${fmtDate(p.paid_on || p.created_at)}</td><td>${esc(p.purpose)}</td><td>${money(p.amount)}</td>
        <td>${esc(p.method)}</td><td>${pill(p.status, p.status === "awaiting" ? "Waiting for Treasurer" : p.status[0].toUpperCase() + p.status.slice(1))}</td></tr>`).join("")
        : `<tr><td colspan="5" class="empty">No payments recorded yet.</td></tr>`;
}
document.addEventListener("click", e => {
    const chip = e.target.closest("[data-paychoice]");
    if (chip) { payChoice = Number(chip.dataset.paychoice); renderPayChoice(); }
    // After tapping the card link, get the record form ready for when they come back
    if (e.target.closest("#card-link")) {
        document.getElementById("p-method").value = "Card (payment link)";
        document.getElementById("p-date").value = new Date().toISOString().slice(0, 10);
        setTimeout(() => toast("When you've paid, tap Record payment below so it shows in your history."), 800);
    }
    // Copy buttons
    const copy = e.target.closest("[data-copy]");
    if (copy) {
        const text = document.querySelector(copy.dataset.copy).textContent.trim();
        (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
            .then(() => toast("Copied: " + text))
            .catch(() => toast("Couldn't copy. Please select it and copy it yourself."));
    }
});
document.getElementById("p-purpose").addEventListener("change", e => {
    const amt = e.target.selectedOptions[0].dataset.amount;
    if (amt) document.getElementById("p-amount").value = amt;
});
document.getElementById("pay-form").addEventListener("submit", async e => {
    e.preventDefault();
    const f = e.target.elements;
    const { error } = await db.from("payments").insert({
        member_id: user.id, purpose: f.purpose.value, amount: Number(f.amount.value),
        method: f.method.value, paid_on: f.paid_on.value || null, reference: f.reference.value.trim()
    });
    if (error) return showMsg(msg, "Could not record payment: " + error.message, "error");
    e.target.reset(); document.getElementById("p-amount").value = 200;
    await loadAll(); show("payments");
    showMsg(msg, "Thank you. The Treasurer will confirm your payment.", "info");
});

// ---------- Support requests (with documents) ----------
const ALLOWED = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif",
                  pdf: "application/pdf", doc: "application/msword",
                  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
const MAX_FILES = 5, MAX_SIZE = 10 * 1024 * 1024;
let chosen = [];

function renderChosen() {
    document.getElementById("file-list").innerHTML = chosen.map((f, i) => `<li>
        <svg width="16" height="16" aria-hidden="true"><use href="#i-clip"/></svg>
        <span class="fname">${esc(f.name)}</span><span class="note m-0">${fileSize(f.size)}</span>
        <button type="button" class="btn btn-link btn-sm p-0 text-danger" data-unfile="${i}">Remove</button></li>`).join("");
}
function addFiles(list) {
    const problems = [];
    for (const f of list) {
        const ext = (f.name.split(".").pop() || "").toLowerCase();
        if (!ALLOWED[ext]) { problems.push(`${f.name}: please use a photo, PDF or Word document`); continue; }
        if (f.size > MAX_SIZE) { problems.push(`${f.name}: larger than 10 MB`); continue; }
        if (chosen.length >= MAX_FILES) { problems.push(`Only ${MAX_FILES} files can be attached`); break; }
        chosen.push(f);
    }
    renderChosen();
    showMsg(msg, problems.join(". "), problems.length ? "warn" : "");
}
const fileInput = document.getElementById("s-files");
fileInput.addEventListener("change", () => { addFiles(fileInput.files); fileInput.value = ""; });
const zone = document.getElementById("dropzone");
["dragenter", "dragover"].forEach(t => zone.addEventListener(t, e => { e.preventDefault(); zone.classList.add("over"); }));
["dragleave", "drop"].forEach(t => zone.addEventListener(t, e => { e.preventDefault(); zone.classList.remove("over"); }));
zone.addEventListener("drop", e => addFiles(e.dataTransfer.files));
document.addEventListener("click", e => {
    const rm = e.target.closest("[data-unfile]");
    if (rm) { chosen.splice(Number(rm.dataset.unfile), 1); renderChosen(); }
});

async function uploadEvidence() {
    const saved = [];
    const progress = document.getElementById("upload-progress");
    for (let i = 0; i < chosen.length; i++) {
        const f = chosen[i];
        const ext = f.name.split(".").pop().toLowerCase();
        const safe = f.name.replace(/[^A-Za-z0-9._-]+/g, "-").slice(-80);
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
        progress.textContent = `Uploading ${i + 1} of ${chosen.length}...`;
        const { error } = await db.storage.from(EVIDENCE_BUCKET).upload(path, f, { contentType: ALLOWED[ext], upsert: false });
        if (error) throw new Error(`Could not upload ${f.name}: ${error.message}`);
        saved.push({ path, name: f.name, size: f.size, type: ALLOWED[ext] });
    }
    progress.textContent = "";
    return saved;
}

function attachmentLinks(r) {
    const files = Array.isArray(r.attachments) ? r.attachments : [];
    if (!files.length) return "";
    return `<ul class="attach-list">${files.map(f => `<li><button type="button" class="btn btn-link btn-sm p-0" data-openfile="${esc(f.path)}">
        <svg width="14" height="14" aria-hidden="true"><use href="#i-clip"/></svg> ${esc(f.name || "Document")}</button></li>`).join("")}</ul>`;
}
// Files are private: make a link that works for one minute, then open it
document.addEventListener("click", async e => {
    const b = e.target.closest("[data-openfile]");
    if (!b) return;
    const win = window.open("", "_blank");
    const { data, error } = await db.storage.from(EVIDENCE_BUCKET).createSignedUrl(b.dataset.openfile, 60);
    if (error || !data) { if (win) win.close(); return showMsg(msg, "Could not open the file: " + (error ? error.message : ""), "error"); }
    if (win) win.location = data.signedUrl; else location.href = data.signedUrl;
});

function renderRequests() {
    document.getElementById("req-list").innerHTML = requests.length ? requests.map(r => `
        <div class="req">
            <div class="d-flex justify-content-between gap-2"><strong>${esc(r.support_type)}</strong>${pill(r.status, REQUEST_LABEL[r.status])}</div>
            <div class="note mt-0">${fmtDate(r.created_at)} &middot; ${esc(r.urgency)}</div>
            ${attachmentLinks(r)}
            ${r.committee_note ? `<p class="req-note"><strong>Committee:</strong> ${esc(r.committee_note)}</p>` : ""}
        </div>`).join("") : `<p class="empty">You haven't sent any requests.</p>`;
}
document.getElementById("support-form").addEventListener("submit", async e => {
    e.preventDefault();
    const f = e.target.elements;
    const btn = document.getElementById("support-submit");
    const urgent = f.urgency.value.startsWith("Urgent");
    btn.disabled = true;
    try {
        const attachments = await uploadEvidence();
        const { error } = await db.from("support_requests").insert({
            member_id: user.id, support_type: f.support_type.value, urgency: f.urgency.value,
            message: f.message.value.trim(), preferred_contact: f.preferred_contact.value, best_time: f.best_time.value.trim(),
            attachments
        });
        if (error) throw new Error("Could not send: " + error.message);
    } catch (err) {
        btn.disabled = false; document.getElementById("upload-progress").textContent = "";
        return showMsg(msg, err.message, "error");
    }
    btn.disabled = false;
    e.target.reset(); chosen = []; renderChosen();
    await loadAll(); show("support");
    showMsg(msg, urgent
        ? `Your request has been sent. Because it's urgent, please also call us now on ${KNEWA_CONTACT.phoneDisplay}.`
        : "Your request has been sent to the committee. You'll see updates here.", urgent ? "warn" : "info");
});

// ---------- Notifications ----------
function renderNotes() {
    const li = n => `<li class="${reads.has(n.id) ? "" : "unread"}" data-note="${n.id}"><span class="dot"></span>
        <div><div class="t">${esc(n.title)}</div>${n.body ? `<p>${esc(n.body)}</p>` : ""}</div>
        <span class="meta">${fmtDate(n.created_at)}</span></li>`;
    const empty = `<li class="empty">No notifications yet.</li>`;
    document.getElementById("all-notes").innerHTML = notes.length ? notes.map(li).join("") : empty;
    document.getElementById("dash-notes").innerHTML = notes.length ? notes.slice(0, 3).map(li).join("") : empty;
    const unread = notes.filter(n => !reads.has(n.id)).length;
    ["note-count", "top-count"].forEach(id => { const c = document.getElementById(id); c.textContent = unread; c.hidden = unread === 0; });
}
async function markRead(ids) {
    const fresh = ids.filter(id => !reads.has(id));
    if (!fresh.length) return;
    await db.from("notification_reads").insert(fresh.map(id => ({ member_id: user.id, notification_id: id })));
    fresh.forEach(id => reads.add(id)); renderNotes();
}
document.addEventListener("click", e => {
    const li = e.target.closest("[data-note]");
    if (li) markRead([Number(li.dataset.note)]);
});
document.getElementById("mark-all").addEventListener("click", () => markRead(notes.map(n => n.id)));

// ---------- Sign out ----------
document.getElementById("logout").addEventListener("click", async () => {
    await db.auth.signOut(); location.href = "login.html";
});

// ---------- Start ----------
(async function start() {
    if (needsSetup()) return;
    user = await requireUser();
    if (!user) return;
    document.getElementById("committee-link").hidden = !(await isCommittee());
    await loadAll();
    const first = location.hash.slice(1);
    if (profile && !profile.type_chosen) show("choose");
    else if (profile && profile.status === "incomplete" && !first) show("registration");
    else if (first && document.getElementById("view-" + first)) show(first);
    else show("dashboard");
})();
