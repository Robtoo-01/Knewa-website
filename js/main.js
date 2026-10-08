// =========================================================
// KENEWA: small helpers used on every public page
// =========================================================

// Put the current year in the footer automatically
const yearEl = document.getElementById("year");
if (yearEl) yearEl.textContent = new Date().getFullYear();

// Stop the home page slider moving on its own for people who prefer less motion
const hero = document.getElementById("hero");
if (hero && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    bootstrap.Carousel.getOrCreateInstance(hero, { ride: false, interval: false }).pause();
}

// If someone is signed in on this device, the "Members portal" link says "My account"
try {
    const signedIn = Object.keys(localStorage).some(k => /^sb-.+-auth-token$/.test(k));
    if (signedIn) {
        document.querySelectorAll("[data-portal-link]").forEach(a => {
            a.textContent = "My account";
            a.href = "portal.html";
        });
    }
} catch (e) { /* storage blocked: keep the normal link */ }

// Contact page: links like contact.html?topic=Events choose the right topic
const topicSelect = document.getElementById("c-topic");
const topic = new URLSearchParams(location.search).get("topic");
if (topicSelect && topic) {
    const match = [...topicSelect.options].find(o => o.text.toLowerCase() === topic.toLowerCase());
    if (match) topicSelect.value = match.value || match.text;
}
