// =========================================================
// KENEWA committee area
// =========================================================
const msg = document.getElementById("msg");
let members = [], requests = [], payments = [], family = [], notices = [], exportsList = [], committee = [];
let me = null, iAmTreasurer = false;   // true for the Treasurer or the Secretary (can ask for the Excel export)
let polls = [], pollOptions = [], turnout = {}, results = {}, docs = [];
const EVIDENCE_BUCKET = "support-evidence";
const byId = id => members.find(m => m.id === id) || {};
const fullName = m => [m.first_name, m.last_name].filter(Boolean).join(" ") || m.email || "Unknown";

function show(view) {
    document.querySelectorAll(".view").forEach(v => v.hidden = v.id !== "view-" + view);
    document.querySelectorAll(".side button").forEach(b => b.classList.toggle("on", b.dataset.view === view));
    history.replaceState(null, "", "#" + view);
}
document.addEventListener("click", e => {
    const nav = e.target.closest("[data-view]");
    if (nav) { show(nav.dataset.view); showMsg(msg, ""); }
});
function badge(id, n) { const el = document.getElementById(id); el.textContent = n; el.hidden = !n; }

async function loadAll() {
    const [m, r, p, f, n, x, c] = await Promise.all([
        db.from("profiles").select("*").order("created_at", { ascending: false }),
        db.from("support_requests").select("*").order("created_at", { ascending: false }),
        db.from("payments").select("*").order("created_at", { ascending: false }),
        db.from("family_members").select("*").order("created_at"),
        db.from("notifications").select("*").order("created_at", { ascending: false }).limit(30),
        db.from("export_requests").select("*").order("created_at", { ascending: false }),
        db.from("committee").select("*")
    ]);
    const [pl, po, dc] = await Promise.all([
        db.from("polls").select("*").order("created_at", { ascending: false }),
        db.from("poll_options").select("*").order("position"),
        db.from("member_documents").select("*").order("category").order("title")
    ]);
    polls = pl.data || []; pollOptions = po.data || []; docs = dc.data || [];
    turnout = {}; results = {};
    const recent = polls.slice(0, 15);
    const t = await Promise.all(recent.map(x => db.rpc("poll_turnout", { p_poll: x.id })));
    recent.forEach((x, i) => { if (!t[i].error && t[i].data && t[i].data[0]) turnout[x.id] = t[i].data[0]; });
    const closed = recent.filter(x => new Date(x.closes_at) <= new Date());
    const r2 = await Promise.all(closed.map(x => db.rpc("poll_results", { p_poll: x.id })));
    closed.forEach((x, i) => { if (!r2[i].error) results[x.id] = r2[i].data || []; });
    const err = [m, r, p, f, n].find(x => x.error);
    if (err) showMsg(msg, "Could not load everything: " + err.error.message, "error");
    members = m.data || []; requests = r.data || []; payments = p.data || [];
    family = f.data || []; notices = n.data || [];
    exportsList = x.error ? [] : (x.data || []); committee = c.data || [];
    badge("c-members", members.filter(x => x.status === "pending").length);
    badge("c-requests", requests.filter(x => x.status === "new").length);
    badge("c-payments", payments.filter(x => x.status === "awaiting").length);
    badge("c-family", family.filter(x => x.pending_action).length);
    badge("c-exports", exportsList.filter(x => x.status === "pending" && x.requested_by !== me.id).length);
    renderMembers(); renderRequests(); renderPayments(); renderFamily(); renderNotify(); renderExports(); renderVotes(); renderDocs();
}

// ---------- Family helpers ----------
const KIND_LABEL = { spouse: "Spouse", dependant: "Dependant", sibling: "Sibling" };
const ACTION_LABEL = { add: "Add new person", update: "Change details", remove: "Remove person" };
function famText(f, pending) {
    const name = pending ? f.pending_full_name : f.full_name;
    const rel = pending ? f.pending_relationship : f.relationship;
    const dob = pending ? f.pending_date_of_birth : f.date_of_birth;
    const country = pending ? f.pending_country : f.country;
    const bits = [];
    if (f.kind === "dependant" && rel) bits.push(rel);
    if (dob) bits.push("born " + fmtDate(dob));
    if (f.kind === "sibling" && country) bits.push("lives in " + country);
    return esc(name) + (bits.length ? ` <span class="note">(${esc(bits.join(", "))})</span>` : "");
}
function famRequest(f) {
    if (f.pending_action === "update") return `${famText(f)}<div class="change-to"><span>Change to:</span> ${famText(f, true)}</div>`;
    return famText(f);
}
function famButtons(f) {
    return `<button class="btn btn-sm btn-gold" data-famreview="${f.id}:1">Approve</button>
            <button class="btn btn-sm btn-outline-ink" data-famreview="${f.id}:0">Reject</button>`;
}

// Joining fees confirmed by the Treasurer = welfare member services unlocked
const feesOk = id => payments.some(p => p.member_id === id && p.purpose === "Joining fees" && p.status === "confirmed");
const feesWaiting = id => payments.some(p => p.member_id === id && p.purpose === "Joining fees" && p.status === "awaiting");
function feesPill(m) {
    if (!m.type_chosen) return `<span class="note m-0">-</span>`;
    if (m.membership_type !== "financial") return `<span class="note m-0">Not needed</span>`;
    if (feesOk(m.id)) return pill("confirmed", "Confirmed");
    if (feesWaiting(m.id)) return pill("awaiting", "To confirm");
    return pill("rejected", "Not paid");
}

// ---------- Members ----------
function renderMembers() {
    const status = document.getElementById("m-filter").value;
    const q = document.getElementById("m-search").value.trim().toLowerCase();
    const list = members.filter(m => (!status || m.status === status) &&
        (!q || (fullName(m) + " " + (m.town || "")).toLowerCase().includes(q)));
    document.getElementById("m-rows").innerHTML = list.length ? list.map(m => `
        <tr class="clickable" data-member="${m.id}"><td><strong>${esc(fullName(m))}</strong><br><span class="note">${esc(m.email)}</span></td>
        <td>${esc(m.town)}</td><td>${!m.type_chosen ? '<span class="note m-0">Not chosen yet</span>' : m.membership_type === "financial" ? "Welfare" : "Community"}</td>
        <td>${feesPill(m)}</td>
        <td>${esc(m.member_number || "-")}</td><td>${pill(m.status, STATUS_LABEL[m.status])}</td></tr>`).join("")
        : `<tr><td colspan="6" class="empty">No members match.</td></tr>`;
}
document.getElementById("m-filter").addEventListener("change", renderMembers);
document.getElementById("m-search").addEventListener("input", renderMembers);

function memberDetail(id) {
    const m = byId(id);
    const fam = family.filter(f => f.member_id === id);
    const pays = payments.filter(p => p.member_id === id);
    const field = (label, v) => `<div><span>${label}</span>${esc(v || "-")}</div>`;
    const box = document.getElementById("m-detail");
    box.hidden = false;
    box.innerHTML = `
        <div class="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-3">
            <div><h2 class="mb-1">${esc(fullName(m))}</h2>${pill(m.status, STATUS_LABEL[m.status])}
                <span class="note">Registered ${fmtDate(m.registered_at) || "-"}</span></div>
            <div class="d-flex gap-2 flex-wrap">
                ${m.status !== "active" ? `<button class="btn btn-gold" data-approve="${m.id}">Approve membership</button>` : ""}
                ${m.status === "active" ? `<button class="btn btn-outline-ink" data-status="${m.id}:lapsed">Mark as lapsed</button>` : ""}
                ${m.status === "lapsed" ? `<button class="btn btn-outline-ink" data-status="${m.id}:active">Reactivate</button>` : ""}
            </div>
        </div>
        <div class="detail-grid">
            ${field("Member no.", m.member_number)}${field("Type", !m.type_chosen ? "Not chosen yet" : m.membership_type === "financial" ? "Welfare (financial)" : "Community")}
            <div><span>Joining fees</span>${feesPill(m)}</div>
            <div><span>Welfare member services</span>${m.membership_type !== "financial" ? "Not included (community member)"
                : feesOk(m.id) && ["pending", "active"].includes(m.status) ? "Unlocked" : "Locked until the joining fees are confirmed"}</div>
            ${field("Email", m.email)}${field("Mobile", m.phone)}
            ${field("Date of birth", fmtDate(m.date_of_birth))}${field("Gender", m.gender)}
            ${field("Address", [m.street_address, m.town, m.postcode].filter(Boolean).join(", "))}${field("Occupation", m.occupation)}
            ${field("Home county", m.home_county)}${field("Agreed to constitution", m.agreed_constitution ? "Yes" : "No")}
            ${field("Father", m.father_name)}${field("Mother", m.mother_name)}
            ${field("Next of kin", [m.nok_name, m.nok_relationship].filter(Boolean).join(", "))}${field("Next of kin phone", [m.nok_phone, m.nok_country].filter(Boolean).join(", "))}
        </div>
        <h3 class="form-section-title">Family</h3>
        <p class="note mt-0">Family list: ${m.family_locked ? "confirmed (changes need approval)" : "first-time setup (entries approved automatically)"}</p>
        ${fam.length ? `<table class="list">${fam.map(f => `<tr><td>${KIND_LABEL[f.kind]}</td><td>${famRequest(f)}</td>
            <td class="text-nowrap">${f.pending_action ? `${pill("awaiting", ACTION_LABEL[f.pending_action])}<div class="mt-1">${famButtons(f)}</div>` : pill("confirmed", "Approved")}</td></tr>`).join("")}</table>` : `<p class="empty">No family added.</p>`}
        <h3 class="form-section-title">Payments</h3>
        ${pays.length ? `<table class="list">${pays.map(p => `<tr><td>${fmtDate(p.paid_on || p.created_at)}</td><td>${esc(p.purpose)}</td><td>${money(p.amount)}</td><td>${pill(p.status)}</td></tr>`).join("")}</table>` : `<p class="empty">No payments recorded.</p>`}`;
    box.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---------- Support requests ----------
function renderRequests() {
    const f = document.getElementById("r-filter").value;
    const list = requests.filter(r => !f || (f === "open" ? r.status !== "resolved" : r.status === f));
    document.getElementById("r-list").innerHTML = list.length ? list.map(r => {
        const m = byId(r.member_id);
        return `<div class="panel">
            <div class="d-flex flex-wrap justify-content-between gap-2 mb-2">
                <div><strong>${esc(r.support_type)}</strong> &middot; ${esc(r.urgency)}<br>
                <span class="note">${fmtDate(r.created_at)} from ${esc(fullName(m))}, ${esc(m.phone || "")} (prefers ${esc(r.preferred_contact || "-")}${r.best_time ? ", " + esc(r.best_time) : ""})</span></div>
                ${pill(r.status, REQUEST_LABEL[r.status])}
            </div>
            <p style="white-space:pre-wrap">${esc(r.message)}</p>
            ${r.person_affected || r.amount_requested != null || r.insurance_details ? `<div class="detail-grid mb-3">
                ${r.person_affected ? `<div><span>Support is for</span>${esc(r.person_affected)}</div>` : ""}
                ${r.amount_requested != null ? `<div><span>Amount asked for</span>${money(r.amount_requested)}</div>` : ""}
                ${r.insurance_details ? `<div><span>Insurance or other help</span>${esc(r.insurance_details)}</div>` : ""}</div>` : ""}
            ${(r.attachments || []).length ? `<div class="attach-box"><strong>Documents attached:</strong><ul class="attach-list">${r.attachments.map(a =>
                `<li><button type="button" class="btn btn-link btn-sm p-0" data-openfile="${esc(a.path)}">${esc(a.name || "Document")}</button>
                 <span class="note m-0">${a.size ? Math.max(1, Math.round(a.size / 1024)) + " KB" : ""}</span></li>`).join("")}</ul></div>` : ""}
            <div class="row g-2 align-items-end">
                <div class="col-md-3"><label class="form-label" for="rs-${r.id}">Status</label>
                    <select class="form-select" id="rs-${r.id}">
                        ${["new", "in_progress", "resolved"].map(s => `<option value="${s}" ${s === r.status ? "selected" : ""}>${REQUEST_LABEL[s]}</option>`).join("")}
                    </select></div>
                <div class="col-md-7"><label class="form-label" for="rn-${r.id}">Note to the member</label>
                    <input class="form-control" id="rn-${r.id}" value="${esc(r.committee_note || "")}"></div>
                <div class="col-md-2"><button class="btn btn-gold w-100" data-savereq="${r.id}">Save</button></div>
            </div></div>`;
    }).join("") : `<p class="empty">No requests here.</p>`;
}
document.getElementById("r-filter").addEventListener("change", renderRequests);

// ---------- Payments ----------
function renderPayments() {
    const list = [...payments].sort((a, b) => (a.status === "awaiting" ? -1 : 0) - (b.status === "awaiting" ? -1 : 0));
    document.getElementById("p-rows").innerHTML = list.length ? list.map(p => `<tr>
        <td>${esc(fullName(byId(p.member_id)))}</td><td>${esc(p.purpose)}</td><td>${money(p.amount)}</td>
        <td>${esc(p.method)}<br><span class="note">${esc(p.reference || "")}</span></td><td>${fmtDate(p.paid_on)}</td><td>${pill(p.status)}</td>
        <td class="text-nowrap">${p.status === "awaiting" ? `<button class="btn btn-sm btn-gold" data-pay="${p.id}:confirmed">Confirm</button>
            <button class="btn btn-sm btn-outline-ink" data-pay="${p.id}:rejected">Reject</button>` : ""}</td></tr>`).join("")
        : `<tr><td colspan="7" class="empty">No payments yet.</td></tr>`;
}

// ---------- Family approvals ----------
function renderFamily() {
    const list = family.filter(f => f.pending_action)
        .sort((a, b) => String(a.pending_requested_at).localeCompare(String(b.pending_requested_at)));
    document.getElementById("f-rows").innerHTML = list.length ? list.map(f => `<tr>
        <td>${esc(fullName(byId(f.member_id)))}<br><span class="note">${fmtDate(f.pending_requested_at)}</span></td>
        <td>${pill(f.pending_action === "remove" ? "rejected" : "awaiting", ACTION_LABEL[f.pending_action])}</td>
        <td>${KIND_LABEL[f.kind]}</td><td>${famRequest(f)}</td>
        <td class="text-nowrap">${famButtons(f)}</td></tr>`).join("")
        : `<tr><td colspan="5" class="empty">Nothing waiting.</td></tr>`;
}

// ---------- Notifications ----------
function renderNotify() {
    const sel = document.getElementById("n-to");
    const current = sel.value;
    sel.innerHTML = `<option value="">All members</option>` + members.map(m => `<option value="${m.id}">${esc(fullName(m))}</option>`).join("");
    sel.value = current;
    document.getElementById("n-list").innerHTML = notices.length ? notices.map(n => `
        <div class="req"><div class="d-flex justify-content-between gap-2"><strong>${esc(n.title)}</strong>
        <button class="btn btn-link btn-sm p-0 text-danger" data-delnote="${n.id}">Delete</button></div>
        <div class="note mt-0">${fmtDate(n.created_at)} &middot; ${n.member_id ? "To " + esc(fullName(byId(n.member_id))) : "All members"}</div>
        ${n.body ? `<p class="mb-0">${esc(n.body)}</p>` : ""}</div>`).join("") : `<p class="empty">Nothing sent yet.</p>`;
}
document.getElementById("n-form").addEventListener("submit", async e => {
    e.preventDefault();
    const { error } = await db.from("notifications").insert({
        member_id: document.getElementById("n-to").value || null,
        title: document.getElementById("n-title").value.trim(),
        body: document.getElementById("n-body").value.trim() || null
    });
    if (error) return showMsg(msg, error.message, "error");
    e.target.reset(); await loadAll(); showMsg(msg, "Notification sent.", "info");
});

// ---------- Support documents (private: open with a one-minute link) ----------
document.addEventListener("click", async e => {
    const b = e.target.closest("[data-openfile]");
    if (!b) return;
    const win = window.open("", "_blank");
    const { data, error } = await db.storage.from(EVIDENCE_BUCKET).createSignedUrl(b.dataset.openfile, 60);
    if (error || !data) { if (win) win.close(); return showMsg(msg, "Could not open the file: " + (error ? error.message : ""), "error"); }
    if (win) win.location = data.signedUrl; else location.href = data.signedUrl;
});

// ---------- Members export (Excel) ----------
const EXPORT_LABEL = { pending: "Waiting for approval", approved: "Approved: ready to download", rejected: "Declined", downloaded: "Downloaded" };
const EXPORT_PILL = { pending: "awaiting", approved: "confirmed", rejected: "rejected", downloaded: "grey" };
function personName(id) {
    const m = members.find(x => x.id === id);
    const role = (committee.find(c => c.user_id === id) || {}).role;
    return (m ? fullName(m) : "Committee member") + (role ? ` (${role})` : "");
}
function expired(x) { return x.status === "approved" && x.decided_at && (Date.now() - new Date(x.decided_at)) > 48 * 3600 * 1000; }
function renderExports() {
    document.getElementById("x-form").hidden = !iAmTreasurer;
    document.getElementById("x-rows").innerHTML = exportsList.length ? exportsList.map(x => {
        let action = "";
        if (x.status === "pending" && x.requested_by !== me.id) {
            action = `<button class="btn btn-sm btn-gold" data-xdecide="${x.id}:1">Approve</button>
                      <button class="btn btn-sm btn-outline-ink" data-xdecide="${x.id}:0">Decline</button>`;
        } else if (x.status === "pending") {
            action = `<span class="note m-0">Another committee member must approve</span>`;
        } else if (x.status === "approved" && x.requested_by === me.id && iAmTreasurer && !expired(x)) {
            action = `<button class="btn btn-sm btn-gold" data-xdownload="${x.id}">Download Excel</button>`;
        }
        const status = expired(x) ? pill("rejected", "Approval expired") : pill(EXPORT_PILL[x.status], EXPORT_LABEL[x.status]);
        return `<tr><td>${fmtDate(x.created_at)}</td><td>${esc(personName(x.requested_by))}</td>
            <td>${esc(x.reason)}${x.decision_note ? `<br><span class="note">Note: ${esc(x.decision_note)}</span>` : ""}</td>
            <td>${status}${x.downloaded_at ? `<br><span class="note">${fmtDate(x.downloaded_at)}</span>` : ""}</td>
            <td>${x.decided_by ? esc(personName(x.decided_by)) + `<br><span class="note">${fmtDate(x.decided_at)}</span>` : "-"}</td>
            <td class="text-nowrap">${action}</td></tr>`;
    }).join("") : `<tr><td colspan="6" class="empty">No exports yet.</td></tr>`;
}
document.getElementById("x-form").addEventListener("submit", async e => {
    e.preventDefault();
    const { error } = await db.rpc("export_request", { p_reason: document.getElementById("x-reason").value.trim() });
    if (error) return showMsg(msg, error.message, "error");
    e.target.reset(); await loadAll(); show("exports");
    showMsg(msg, "Sent. The rest of the committee has been notified; you'll get a notification when someone decides.", "info");
});

// Load the Excel tool only when it's needed
function loadSheetJS() {
    if (window.XLSX) return Promise.resolve();
    return new Promise((ok, fail) => {
        const sc = document.createElement("script");
        sc.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
        sc.onload = ok; sc.onerror = () => fail(new Error("Could not load the Excel tool. Check your internet connection."));
        document.head.appendChild(sc);
    });
}
const MEMBER_COLUMNS = [
    ["Member no.", "member_number"], ["First name", "first_name"], ["Last name", "last_name"], ["Email", "email"], ["Mobile", "phone"],
    ["Date of birth", "date_of_birth"], ["Gender", "gender"], ["Street address", "street_address"], ["Town", "town"], ["Postcode", "postcode"],
    ["Occupation", "occupation"], ["Home county", "home_county"], ["Father", "father_name"], ["Mother", "mother_name"],
    ["Next of kin", "nok_name"], ["Next of kin relationship", "nok_relationship"], ["Next of kin phone", "nok_phone"], ["Next of kin country", "nok_country"],
    ["Membership type", m => m.membership_type === "financial" ? "Welfare (financial)" : "Community"],
    ["Status", m => STATUS_LABEL[m.status] || m.status], ["Registered", m => (m.registered_at || "").slice(0, 10)],
    ["Joining fees confirmed", m => m.membership_type === "financial" ? (m.fees_confirmed ? "Yes" : "No") : "Not needed"],
    ["Agreed to constitution", m => m.agreed_constitution ? "Yes" : "No"], ["Family list confirmed", m => m.family_locked ? "Yes" : "No"]
];
async function downloadExport(id) {
    await loadSheetJS();
    const { data, error } = await db.rpc("export_members", { p_id: id });
    if (error) throw new Error(error.message);
    const mem = data.members || [], fam = data.family || [];
    const memberRows = mem.map(m => Object.fromEntries(MEMBER_COLUMNS.map(([h, k]) => [h, typeof k === "function" ? k(m) : (m[k] ?? "")])));
    const byMember = Object.fromEntries(mem.map(m => [m.id, m]));
    const familyRows = fam.map(f => {
        const m = byMember[f.member_id] || {};
        return { "Member no.": m.member_number || "", "Member": fullName(m), "Type": KIND_LABEL[f.kind] || f.kind,
                 "Full name": f.full_name, "Relationship": f.relationship || "", "Date of birth": f.date_of_birth || "",
                 "Country": f.country || "", "Approved": f.pending_action === "add" ? "Waiting" : "Yes",
                 "Change waiting": f.pending_action ? ACTION_LABEL[f.pending_action] : "" };
    });
    const x = exportsList.find(r => r.id === id) || {};
    const about = [
        ["Kenyans in New England Welfare Association Inc: members export"],
        ["CONFIDENTIAL. Store securely and delete when no longer needed."],
        [], ["Created", new Date(data.generated_at).toLocaleString("en-AU")],
        ["Downloaded by", personName(me.id)], ["Approved by", x.decided_by ? personName(x.decided_by) : ""],
        ["Reason", x.reason || ""], ["Members", mem.length], ["Family members", fam.length]
    ];
    const wb = XLSX.utils.book_new();
    const sheet = (rows, widths) => { const ws = XLSX.utils.json_to_sheet(rows); ws["!cols"] = widths.map(w => ({ wch: w })); return ws; };
    XLSX.utils.book_append_sheet(wb, sheet(memberRows, MEMBER_COLUMNS.map(([h]) => Math.max(12, h.length + 2))), "Members");
    XLSX.utils.book_append_sheet(wb, sheet(familyRows, [11, 22, 11, 24, 16, 13, 12, 10, 18]), "Family");
    const ab = XLSX.utils.aoa_to_sheet(about); ab["!cols"] = [{ wch: 18 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, ab, "About this file");
    XLSX.writeFile(wb, `KENEWA-members-${new Date().toISOString().slice(0, 10)}.xlsx`);
    return mem.length;
}
document.addEventListener("click", async e => {
    const d = e.target.closest("[data-xdecide]");
    if (d) {
        const [id, yes] = d.dataset.xdecide.split(":");
        const note = prompt(yes === "1" ? "Approve this export? Add a note if you like (optional):" : "Decline this export? Add a reason (optional):", "");
        if (note === null) return;
        const { error } = await db.rpc("export_decide", { p_id: Number(id), p_approve: yes === "1", p_note: note });
        if (error) return showMsg(msg, error.message, "error");
        await loadAll(); show("exports");
        return showMsg(msg, yes === "1" ? "Approved. The person who asked can now download the file once, within 48 hours." : "Declined. The person who asked has been told.", "info");
    }
    const dl = e.target.closest("[data-xdownload]");
    if (dl) {
        dl.disabled = true; dl.textContent = "Preparing...";
        try {
            const n = await downloadExport(Number(dl.dataset.xdownload));
            await loadAll(); show("exports");
            showMsg(msg, `Downloaded ${n} member profiles. Please store the file securely.`, "info");
        } catch (err) {
            dl.disabled = false; dl.textContent = "Download Excel";
            showMsg(msg, err.message, "error");
        }
    }
});

// ---------- Votes ----------
const KIND_NAME = { election: "Election", motion: "Motion", survey: "Survey" };
const fmtWhen = v => new Date(v).toLocaleString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
const toLocalInput = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
function pollState(x) {
    const now = new Date();
    // pill colours: "incomplete" = grey, "pending" = amber, "active" = green (see db.js)
    if (new Date(x.opens_at) > now) return ["incomplete", "Opens " + fmtWhen(x.opens_at)];
    if (new Date(x.closes_at) > now) return ["pending", "Open until " + fmtWhen(x.closes_at)];
    return ["active", "Closed " + fmtWhen(x.closes_at)];
}
function renderVotes() {
    const opens = document.getElementById("v-opens");
    if (!opens.value) {
        const now = new Date(); now.setSeconds(0, 0);
        opens.value = toLocalInput(now);
        document.getElementById("v-closes").value = toLocalInput(new Date(now.getTime() + 7 * 864e5));
    }
    document.getElementById("v-list").innerHTML = polls.length ? polls.map(x => {
        const [cls, label] = pollState(x);
        const tn = turnout[x.id];
        const res = results[x.id];
        const total = res ? res.reduce((t, r) => t + Number(r.votes), 0) : 0;
        const open = new Date(x.closes_at) > new Date();
        return `<div class="panel">
            <div class="d-flex flex-wrap justify-content-between gap-2 mb-2">
                <div>${pill("incomplete", KIND_NAME[x.kind])} ${pill(cls, label)}</div>
                <div class="d-flex gap-2">
                    ${open ? `<button class="btn btn-sm btn-outline-ink" data-closepoll="${x.id}">Close now</button>` : ""}
                    <button class="btn btn-sm btn-link text-danger p-0" data-delpoll="${x.id}">Delete</button>
                </div>
            </div>
            <h2 class="h5 mb-1">${esc(x.title)}</h2>
            ${x.description ? `<p class="note mt-0">${esc(x.description)}</p>` : ""}
            <p class="mb-2"><strong>Turnout:</strong> ${tn ? `${tn.voted} of ${tn.eligible} eligible welfare members` : "-"}</p>
            ${res ? `<table class="list">${res.map(r => `<tr><td>${esc(r.label)}</td><td class="text-end"><strong>${r.votes}</strong>
                 <span class="note m-0">(${total ? Math.round(r.votes / total * 100) : 0}%)</span></td></tr>`).join("")}</table>`
              : `<p class="note mb-0">Choices: ${pollOptions.filter(o => o.poll_id === x.id).map(o => esc(o.label)).join(", ")}. Results show when the vote closes.</p>`}
        </div>`;
    }).join("") : `<div class="panel"><p class="empty mb-0">No votes yet.</p></div>`;
}
document.getElementById("v-form").addEventListener("submit", async e => {
    e.preventDefault();
    const choices = document.getElementById("v-options").value.split("\n").map(s => s.trim()).filter(Boolean);
    if (choices.length < 2) return showMsg(msg, "Please give at least two choices, one per line.", "error");
    const opensAt = new Date(document.getElementById("v-opens").value);
    const closesAt = new Date(document.getElementById("v-closes").value);
    if (!(closesAt > opensAt)) return showMsg(msg, "The closing time must be after the opening time.", "error");
    const { data, error } = await db.from("polls").insert({
        title: document.getElementById("v-title").value.trim(),
        description: document.getElementById("v-desc").value.trim() || null,
        kind: document.getElementById("v-kind").value,
        opens_at: opensAt.toISOString(), closes_at: closesAt.toISOString(), created_by: me.id
    }).select().single();
    if (error) return showMsg(msg, error.message, "error");
    const o = await db.from("poll_options").insert(choices.map((label, i) => ({ poll_id: data.id, label, position: i })));
    if (o.error) return showMsg(msg, "The vote was created but the choices could not be saved: " + o.error.message, "error");
    e.target.reset(); document.getElementById("v-options").value = "Yes\nNo\nAbstain";
    await loadAll(); show("votes");
    showMsg(msg, "Vote created. Welfare members have been notified in their members area.", "info");
});
document.getElementById("v-kind").addEventListener("change", e => {
    const box = document.getElementById("v-options");
    if (e.target.value === "motion") box.value = "Yes\nNo\nAbstain";
    else if (box.value.trim() === "Yes\nNo\nAbstain") box.value = "";
});

// ---------- Members' documents ----------
function renderDocs() {
    document.getElementById("d-list").innerHTML = docs.length ? `<table class="list">${docs.map(d => `<tr>
        <td><a href="${esc(d.url)}" target="_blank" rel="noopener"><strong>${esc(d.title)}</strong></a><br><span class="note">${esc(d.category)} &middot; added ${fmtDate(d.created_at)}</span></td>
        <td class="text-end"><button class="btn btn-sm btn-link text-danger p-0" data-deldoc="${d.id}">Remove</button></td></tr>`).join("")}</table>`
        : `<p class="empty mb-0">No documents yet. Start with the constitution.</p>`;
}
document.getElementById("d-form").addEventListener("submit", async e => {
    e.preventDefault();
    const { error } = await db.from("member_documents").insert({
        title: document.getElementById("d-title").value.trim(),
        category: document.getElementById("d-cat").value,
        url: document.getElementById("d-url").value.trim(), created_by: me.id
    });
    if (error) return showMsg(msg, error.message.includes("url_check") ? "The link must start with https://" : error.message, "error");
    e.target.reset(); await loadAll(); show("docs"); showMsg(msg, "Document added. Welfare members can now see it.", "info");
});
document.addEventListener("click", async e => {
    const c = e.target.closest("[data-closepoll]");
    if (c) {
        if (!confirm("Close this vote now? Members won't be able to vote any more, and the results will show.")) return;
        const { error } = await db.from("polls").update({ closes_at: new Date().toISOString() }).eq("id", c.dataset.closepoll);
        if (error) return showMsg(msg, error.message, "error");
        await loadAll(); show("votes"); return showMsg(msg, "Vote closed. The results are below.", "info");
    }
    const d = e.target.closest("[data-delpoll]");
    if (d) {
        if (!confirm("Delete this vote and all its ballots? This can't be undone.")) return;
        const { error } = await db.from("polls").delete().eq("id", d.dataset.delpoll);
        if (error) return showMsg(msg, error.message, "error");
        await loadAll(); show("votes"); return showMsg(msg, "Vote deleted.", "info");
    }
    const dd = e.target.closest("[data-deldoc]");
    if (dd) {
        if (!confirm("Remove this document from the members area?")) return;
        const { error } = await db.from("member_documents").delete().eq("id", dd.dataset.deldoc);
        if (error) return showMsg(msg, error.message, "error");
        await loadAll(); show("docs"); return showMsg(msg, "Document removed.", "info");
    }
});

// ---------- Button actions ----------
document.addEventListener("click", async e => {
    const t = e.target.closest("[data-member],[data-approve],[data-status],[data-famreview],[data-pay],[data-savereq],[data-delnote]");
    if (!t) return;
    let res, detailFor = null;
    if (t.dataset.member) return memberDetail(t.dataset.member);
    if (t.dataset.approve) {
        res = await db.rpc("approve_member", { target: t.dataset.approve }); detailFor = t.dataset.approve;
    } else if (t.dataset.status) {
        const [id, status] = t.dataset.status.split(":");
        res = await db.from("profiles").update({ status }).eq("id", id); detailFor = id;
    } else if (t.dataset.famreview) {
        const [id, yes] = t.dataset.famreview.split(":");
        const fam = family.find(f => String(f.id) === id);
        if (yes === "0" && !confirm("Reject this request? The member will be notified.")) return;
        res = await db.rpc("family_review", { p_id: Number(id), p_approve: yes === "1" });
        if (!document.getElementById("m-detail").hidden && fam) detailFor = fam.member_id;
    } else if (t.dataset.pay) {
        const [id, status] = t.dataset.pay.split(":");
        res = await db.from("payments").update({ status }).eq("id", id);
    } else if (t.dataset.savereq) {
        const id = t.dataset.savereq;
        res = await db.from("support_requests").update({
            status: document.getElementById("rs-" + id).value,
            committee_note: document.getElementById("rn-" + id).value.trim() || null
        }).eq("id", id);
    } else if (t.dataset.delnote) {
        if (!confirm("Delete this notification?")) return;
        res = await db.from("notifications").delete().eq("id", t.dataset.delnote);
    }
    if (res && res.error) return showMsg(msg, res.error.message, "error");
    await loadAll();
    if (detailFor) memberDetail(detailFor);
    showMsg(msg, "Saved.", "info");
});

document.getElementById("logout").addEventListener("click", async () => {
    await db.auth.signOut(); location.href = "login.html";
});

(async function start() {
    if (needsSetup()) return;
    const user = await requireUser();
    if (!user) return;
    me = user;
    if (!(await isCommittee())) {
        document.querySelectorAll(".view, .side").forEach(el => el.hidden = true);
        document.getElementById("denied").hidden = false;
        return;
    }
    const t = await db.rpc("can_export_members");
    iAmTreasurer = !t.error && t.data === true;
    await loadAll();
    const first = location.hash.slice(1);
    if (first && document.getElementById("view-" + first)) show(first);
})();
