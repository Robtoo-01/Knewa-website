// Sign-in guard for the members area and committee area.
// Load this in <head>, before anything else, so it runs before the page is drawn.
// - No saved sign-in in this browser: go straight to the login page (no flash of the members area).
// - Saved sign-in: keep the page hidden until db.js confirms it with Supabase (see requireUser).
(function () {
    var root = document.documentElement;
    var hasSession = false;
    try {
        for (var i = 0; i < localStorage.length; i++) {
            if (/^sb-.+-auth-token$/.test(localStorage.key(i))) { hasSession = true; break; }
        }
    } catch (e) {
        hasSession = true;   // storage blocked: let the normal check in db.js decide
    }
    root.classList.add("auth-pending");
    if (!hasSession) {
        var page = location.pathname.split("/").pop() || "portal.html";
        if (!/\.html$/i.test(page)) page += ".html";   // kenewa.org/portal -> portal.html
        location.replace("login.html?next=" + encodeURIComponent(page + location.hash));
        return;
    }
    // Safety net: never leave a signed-in member looking at a blank page if Supabase is slow
    setTimeout(function () { root.classList.remove("auth-pending"); }, 8000);
})();
