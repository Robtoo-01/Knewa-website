// Shared helpers for the members system (login, portal, committee pages)
const KNEWA_READY = !KNEWA_SUPABASE_URL.startsWith("PASTE") && !KNEWA_SUPABASE_KEY.startsWith("PASTE");
const db = KNEWA_READY ? supabase.createClient(KNEWA_SUPABASE_URL, KNEWA_SUPABASE_KEY) : null;

// Make text safe before putting it on the page
function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function fmtDate(value) {
    if (!value) return "";
    return new Date(value).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}
function money(n) { return "$" + Number(n).toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }

function showMsg(el, text, type) {
    el.className = "msg " + (type || "info");
    el.textContent = text;
    el.hidden = !text;
}

// Show a setup notice instead of a broken page if Supabase isn't connected yet
function needsSetup() {
    if (KNEWA_READY) return false;
    document.body.insertAdjacentHTML("afterbegin",
        '<div class="setup-note">The members system is not connected yet. Add your Supabase details to <code>js/config.js</code> (see README).</div>');
    return true;
}

// Who is signed in? Checks with Supabase, so an expired or deleted account isn't treated as signed in.
async function currentUser() {
    const { data: sess } = await db.auth.getSession();
    if (!sess.session) return null;
    const { data, error } = await db.auth.getUser();
    if (error || !data.user) {
        await db.auth.signOut({ scope: "local" });   // clear the stale sign-in from this browser
        return null;
    }
    return data.user;
}

// Send people who are not signed in to the login page
async function requireUser() {
    const user = await currentUser();
    if (!user) {
        const page = location.pathname.split("/").pop() || "portal.html";
        location.href = "login.html?next=" + encodeURIComponent(page + location.hash);
        return null;
    }
    return user;
}

async function isCommittee() {
    const { data, error } = await db.rpc("is_committee");
    return !error && data === true;
}

const STATUS_LABEL = { incomplete: "Registration not finished", pending: "Waiting for approval", active: "Active", lapsed: "Lapsed" };
const STATUS_PILL = { incomplete: "grey", pending: "amber", active: "green", lapsed: "red",
                      awaiting: "amber", confirmed: "green", rejected: "red",
                      new: "red", in_progress: "amber", resolved: "green" };
const REQUEST_LABEL = { new: "New", in_progress: "In progress", resolved: "Resolved" };
function pill(key, label) { return `<span class="pill ${STATUS_PILL[key] || "grey"}">${esc(label || key)}</span>`; }
