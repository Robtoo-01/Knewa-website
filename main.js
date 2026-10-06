// Put the current year in the footer automatically
document.getElementById("year").textContent = new Date().getFullYear();

// Stop the slider moving on its own for people who prefer less motion
if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const hero = document.getElementById("hero");
    bootstrap.Carousel.getOrCreateInstance(hero, { ride: false, interval: false }).pause();
}
