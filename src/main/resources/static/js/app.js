"use strict";

// Store all screens so only one is visible at a time.
const screens = [
    document.getElementById("home-screen"),
    document.getElementById("arm-screen"),
    document.getElementById("mobile-screen"),
    document.getElementById("login-screen"),
    document.getElementById("signup-screen"),
    document.getElementById("recovery-screen")
];

// Keep account state in memory and restore it from the backend.
let currentAccount = null;
let sessionReady = false;

const protectedScreens = new Set([
    "arm-screen",
    "mobile-screen"
]);

// Show one screen and direct unauthenticated visitors to login.
function showScreen(screenId) {
    let targetId = screenId;

    if (protectedScreens.has(targetId) && !currentAccount) {
        targetId = "login-screen";
    }

    const selectedScreen = screens.find(
        (screen) => screen.id === targetId
    );

    if (!selectedScreen) {
        return;
    }

    screens.forEach((screen) => {
        screen.hidden = screen !== selectedScreen;
    });

    // Move keyboard focus to the heading of the selected screen.
    const heading = selectedScreen.querySelector("h1");

    if (heading) {
        heading.setAttribute("tabindex", "-1");
        heading.focus({ preventScroll: true });
    }

    window.scrollTo(0, 0);
}

// Wait for the startup session check before opening a robot panel.
async function navigateToScreen(screenId) {
    if (protectedScreens.has(screenId) && !sessionReady) {
        await sessionStartup;
    }

    showScreen(screenId);
}

// Open the arm panel through the account check.
document.getElementById("launch-arm-btn").addEventListener("click", () => {
    void navigateToScreen("arm-screen");
});

// Open the mobile panel through the account check.
document.getElementById("launch-mobile-btn").addEventListener("click", () => {
    void navigateToScreen("mobile-screen");
});

// Read navigation targets from the buttons in the HTML.
document.querySelectorAll("[data-screen]").forEach((button) => {
    button.addEventListener("click", () => {
        void navigateToScreen(button.dataset.screen);
    });
});

// Store the signup form and feedback elements.
const signupForm = document.getElementById("signup-form");
const signupMessage = document.getElementById("signup-message");
const signupSubmitButton = signupForm.querySelector(
    'button[type="submit"]'
);

let signupInProgress = false;

// Display signup feedback safely as plain text.
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

// Update the form while the registration request is running.
function setSignupBusy(isBusy) {
    signupInProgress = isBusy;
    signupSubmitButton.disabled = isBusy;

    signupSubmitButton.textContent = isBusy
        ? "Creating Account..."
        : "Create Account";

    signupForm.setAttribute("aria-busy", String(isBusy));
}

// Validate signup details and send them to the backend.
async function handleSignupSubmit(event) {
    event.preventDefault();

    if (signupInProgress) {
        return;
    }

    clearSignupMessage();

    // Remove surrounding spaces from identifiers, but preserve passwords.
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

    if (username.length === 0) {
        showSignupMessage("Please enter a username.");
        return;
    }

    // Reject different passwords before sending the registration request.
    if (password !== confirmPassword) {
        showSignupMessage("Passwords do not match.");
        return;
    }

    setSignupBusy(true);

    try {
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

        // Allow for server responses that do not contain valid JSON.
        const result = await response.json().catch(() => ({}));

        const backendMessage =
            result &&
            typeof result.message === "string" &&
            result.message.trim().length > 0
                ? result.message
                : null;

        if (!response.ok) {
            showSignupMessage(
                backendMessage ||
                "Registration failed. Please try again."
            );
            return;
        }

        // Clear entered details after successful registration.
        signupForm.reset();

        showSignupMessage(
            backendMessage ||
            "Registration successful. Check your email to verify your account.",
            true
        );
    } catch (error) {
        showSignupMessage(
            "Unable to connect to the server. Please try again."
        );
    } finally {
        setSignupBusy(false);
    }
}

// Handle signup without reloading the page.
signupForm.addEventListener("submit", handleSignupSubmit);

// Store the login form and account controls.
const loginForm = document.getElementById("login-form");
const loginMessage = document.getElementById("login-message");
const loginSubmitButton = loginForm.querySelector(
    'button[type="submit"]'
);

const userGreeting = document.getElementById("user-greeting");
const openLoginButton = document.getElementById("open-login-btn");
const logoutButton = document.getElementById("logout-btn");
const accountMessage = document.getElementById("account-message");

let loginInProgress = false;
let logoutInProgress = false;

// Display account feedback without interpreting it as HTML.
function showAccountFeedback(element, message) {
    element.textContent = message;
    element.hidden = false;
}

// Remove account feedback from an earlier request.
function clearAccountFeedback(element) {
    element.textContent = "";
    element.hidden = true;
}

// Update the greeting and available buttons from the current account.
function updateAccountControls() {
    const signedIn = currentAccount !== null;

    userGreeting.hidden = !signedIn;
    logoutButton.hidden = !signedIn;
    openLoginButton.hidden = signedIn;

    userGreeting.textContent = signedIn
        ? `Hello, ${currentAccount.username}!`
        : "";
}

// Read JSON while allowing for an unexpected server response.
async function readAccountResponse(response) {
    return response.json().catch(() => ({}));
}

// Prefer the backend message when one is available.
function accountResponseMessage(result, fallback) {
    return result &&
        typeof result.message === "string" &&
        result.message.trim().length > 0
        ? result.message
        : fallback;
}

// Check that a response contains the account data needed by the page.
function isAccountResponse(result) {
    return result &&
        typeof result.username === "string" &&
        typeof result.email === "string" &&
        typeof result.csrfToken === "string" &&
        result.csrfToken.length > 0;
}

// Restore an existing server session when the page opens or refreshes.
async function restoreLoginSession() {
    try {
        const response = await fetch("/api/auth/session", {
            credentials: "same-origin",
            cache: "no-store"
        });

        if (response.status === 401) {
            currentAccount = null;
            return;
        }

        const result = await readAccountResponse(response);

        if (!response.ok || !isAccountResponse(result)) {
            throw new Error("Unable to restore the session.");
        }

        currentAccount = result;
    } catch (error) {
        // Keep robot access blocked if the session cannot be confirmed.
        currentAccount = null;

        showAccountFeedback(
            accountMessage,
            "Unable to check your session. Please try logging in."
        );
    } finally {
        sessionReady = true;
        updateAccountControls();
    }
}

// Submit login details and update the page after successful authentication.
async function handleLoginSubmit(event) {
    event.preventDefault();

    if (loginInProgress) {
        return;
    }

    loginInProgress = true;
    loginSubmitButton.disabled = true;
    loginSubmitButton.textContent = "Logging In...";
    loginForm.setAttribute("aria-busy", "true");

    clearAccountFeedback(loginMessage);

    try {
        // Prevent the startup response from overwriting a new login.
        await sessionStartup;

        const identifier = document
            .getElementById("login-username")
            .value.trim();

        const password = document
            .getElementById("login-password")
            .value;

        if (identifier.length === 0) {
            showAccountFeedback(
                loginMessage,
                "Enter your username or email."
            );
            return;
        }

        const response = await fetch("/api/auth/login", {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                identifier,
                password
            })
        });

        const result = await readAccountResponse(response);

        if (!response.ok) {
            showAccountFeedback(
                loginMessage,
                accountResponseMessage(
                    result,
                    "Login failed. Please try again."
                )
            );
            return;
        }

        if (!isAccountResponse(result)) {
            showAccountFeedback(
                loginMessage,
                "The server returned an unexpected response. Please refresh the page."
            );
            return;
        }

        // Store the returned account details and clear entered credentials.
        currentAccount = result;
        loginForm.reset();
        clearAccountFeedback(accountMessage);
        updateAccountControls();
        showScreen("home-screen");
    } catch (error) {
        showAccountFeedback(
            loginMessage,
            "Unable to connect to the server. Please try again."
        );
    } finally {
        loginInProgress = false;
        loginSubmitButton.disabled = false;
        loginSubmitButton.textContent = "Log In";
        loginForm.setAttribute("aria-busy", "false");
    }
}

// Ask the backend to end the current session using its request token.
async function handleLogout() {
    if (logoutInProgress || !currentAccount) {
        return;
    }

    logoutInProgress = true;
    logoutButton.disabled = true;
    logoutButton.textContent = "Logging Out...";
    clearAccountFeedback(accountMessage);

    try {
        const response = await fetch("/api/auth/logout", {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "X-CSRF-Token": currentAccount.csrfToken
            }
        });

        // A 401 response means the server session has already ended.
        if (!response.ok && response.status !== 401) {
            const result = await readAccountResponse(response);

            showAccountFeedback(
                accountMessage,
                accountResponseMessage(
                    result,
                    "Logout failed. Please try again."
                )
            );
            return;
        }

        // Clear the signed-in view only after the server confirms logout.
        currentAccount = null;
        loginForm.reset();
        clearAccountFeedback(loginMessage);
        updateAccountControls();
        showScreen("login-screen");
    } catch (error) {
        showAccountFeedback(
            accountMessage,
            "Unable to log out. Check your connection and try again."
        );
    } finally {
        logoutInProgress = false;
        logoutButton.disabled = false;
        logoutButton.textContent = "Log Out";
    }
}

// Connect the account actions after all page elements are available.
loginForm.addEventListener("submit", handleLoginSubmit);
logoutButton.addEventListener("click", handleLogout);

// Share the initial session check with login and robot navigation.
const sessionStartup = restoreLoginSession();