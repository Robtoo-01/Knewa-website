// Put the current year in the footer automatically
const year = document.getElementById("year");
if (year) year.textContent = new Date().getFullYear();

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Stop the slider moving on its own for people who prefer less motion
const hero = document.getElementById("hero");
if (hero && reduceMotion && window.bootstrap) {
    bootstrap.Carousel.getOrCreateInstance(hero, { ride: false, interval: false }).pause();
}

// Add a soft shadow under the menu once the page is scrolled
const nav = document.querySelector(".site-nav");
if (nav) {
    const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
}

// Count the home page numbers up when they scroll into view
const counters = document.querySelectorAll("[data-count]");
if (counters.length && !reduceMotion && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const el = entry.target;
            const target = parseInt(el.dataset.count, 10);
            const start = performance.now();
            const step = (now) => {
                const progress = Math.min((now - start) / 1200, 1);
                el.textContent = Math.round(target * progress);
                if (progress < 1) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
            observer.unobserve(el);
        });
    }, { threshold: 0.6 });
    counters.forEach((el) => observer.observe(el));
}
