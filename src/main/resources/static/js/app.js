"use strict";

// Store the robot and account screens so only one is visible at a time.
const screens = [
    document.getElementById("home-screen"),
    document.getElementById("arm-screen"),
    document.getElementById("mobile-screen"),
    document.getElementById("login-screen"),
    document.getElementById("signup-screen"),
    document.getElementById("recovery-screen")
];

// Show the requested screen and hide the other application screens.
function showScreen(screenId) {
    const selectedScreen = screens.find(
        (screen) => screen.id === screenId
    );

    // Keep the current view if the requested screen does not exist.
    if (!selectedScreen) {
        return;
    }

    screens.forEach((screen) => {
        screen.hidden = screen !== selectedScreen;
    });

    // Move keyboard focus to the new heading after changing screens.
    const heading = selectedScreen.querySelector("h1");

    if (heading) {
        heading.setAttribute("tabindex", "-1");
        heading.focus({ preventScroll: true });
    }

    // Start each screen at the top of the page.
    window.scrollTo(0, 0);
}

// Open the arm panel when its homepage launch button is clicked.
document.getElementById("launch-arm-btn").addEventListener("click", () => {
    showScreen("arm-screen");
});

// Open the mobile panel when its homepage launch button is clicked.
document.getElementById("launch-mobile-btn").addEventListener("click", () => {
    showScreen("mobile-screen");
});

// Read each navigation button's target and open the matching screen.
document.querySelectorAll("[data-screen]").forEach((button) => {
    button.addEventListener("click", () => {
        showScreen(button.dataset.screen);
    });
});