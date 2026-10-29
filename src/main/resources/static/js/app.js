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

// Store references to the signup form and its feedback elements.
const signupForm = document.getElementById("signup-form");
const signupMessage = document.getElementById("signup-message");
const signupSubmitButton = signupForm.querySelector(
    'button[type="submit"]'
);

// Track an active request to prevent repeated submissions.
let signupInProgress = false;

// Display feedback as plain text with the matching message style.
function showSignupMessage(message, isSuccess = false) {
    signupMessage.textContent = message;
    signupMessage.classList.remove(
        "form-message--success",
        "form-message--error"
    );

    signupMessage.classList.add(
        isSuccess
            ? "form-message--success"
            : "form-message--error"
    );

    signupMessage.hidden = false;
}

// Remove feedback from the previous registration attempt.
function clearSignupMessage() {
    signupMessage.textContent = "";
    signupMessage.hidden = true;

    signupMessage.classList.remove(
        "form-message--success",
        "form-message--error"
    );
}

// Update the button and form while registration is being processed.
function setSignupBusy(isBusy) {
    signupInProgress = isBusy;
    signupSubmitButton.disabled = isBusy;

    signupSubmitButton.textContent = isBusy
        ? "Creating Account..."
        : "Create Account";

    signupForm.setAttribute("aria-busy", String(isBusy));
}

// Validate the form, send account details, and display the result.
async function handleSignupSubmit(event) {
    event.preventDefault();

    // Ignore another submission while the current request is running.
    if (signupInProgress) {
        return;
    }

    clearSignupMessage();

    // Read the fields without removing spaces from either password.
    const username = document
        .getElementById("signup-username")
        .value.trim();

    const email = document
        .getElementById("signup-email")
        .value.trim();

    const password = document
        .getElementById("signup-password")
        .value;

    const confirmPassword = document
        .getElementById("signup-confirm-password")
        .value;

    // Reject a username that contains only spaces.
    if (username.length === 0) {
        showSignupMessage("Please enter a username.");
        return;
    }

    // Check password confirmation before sending account details.
    if (password !== confirmPassword) {
        showSignupMessage("Passwords do not match.");
        return;
    }

    setSignupBusy(true);

    try {
        // Send the field names expected by the registration controller.
        const response = await fetch("/api/auth/register", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                username,
                email,
                password,
                confirmPassword
            })
        });

        // Read the backend message, allowing for an unexpected response.
        const result = await response.json().catch(() => ({}));

        const backendMessage =
            result &&
            typeof result.message === "string" &&
            result.message.trim().length > 0
                ? result.message
                : null;

        // Keep the form available when the backend rejects registration.
        if (!response.ok) {
            showSignupMessage(
                backendMessage ||
                "Registration failed. Please try again."
            );
            return;
        }

        // Clear account details after successful registration.
        signupForm.reset();

        showSignupMessage(
            backendMessage ||
            "Registration successful. Check your email to verify your account.",
            true
        );
    } catch (error) {
        // Explain a connection failure without showing technical details.
        showSignupMessage(
            "Unable to connect to the server. Please try again."
        );
    } finally {
        // Allow another attempt after either success or failure.
        setSignupBusy(false);
    }
}

// Handle registration without reloading the current page.
signupForm.addEventListener("submit", handleSignupSubmit);