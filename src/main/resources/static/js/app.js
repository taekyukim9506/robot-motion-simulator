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

// Keep one scene and the latest accepted pose for the current account.
let armScene = null;
let armSceneLoading = null;
let currentArmPose = { roll: 0, pitch: 0, yaw: 0 };

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

    // Create or resize the 3D view after the arm screen becomes visible.
    if (targetId === "arm-screen") {
        void showArmScene();
    }

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

    // Clear the previous account's displayed pose when signed out.
    if (!signedIn) {
        updateArmPose({ roll: 0, pitch: 0, yaw: 0 });
    }

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

// Store the arm form and its feedback elements.
const armForm = document.getElementById("arm-form");
const armMessage = document.getElementById("arm-message");
const armSubmitButton = armForm.querySelector('button[type="submit"]');

const armInputs = {
    roll: document.getElementById("arm-roll"),
    pitch: document.getElementById("arm-pitch"),
    yaw: document.getElementById("arm-yaw"),
    speed: document.getElementById("arm-speed")
};

let armRequestInProgress = false;

// Display movement feedback as plain text.
function showArmMessage(message, isSuccess = false) {
    armMessage.textContent = message;
    armMessage.classList.remove(
        "form-message--success",
        "form-message--error"
    );

    armMessage.classList.add(
        isSuccess ? "form-message--success" : "form-message--error"
    );

    armMessage.hidden = false;
}

// Remove feedback from the previous movement attempt.
function clearArmMessage() {
    armMessage.textContent = "";
    armMessage.hidden = true;
    armMessage.classList.remove(
        "form-message--success",
        "form-message--error"
    );
}

// Prevent changes and repeated submissions while saving a command.
function setArmBusy(isBusy) {
    armRequestInProgress = isBusy;
    armSubmitButton.disabled = isBusy;
    armSubmitButton.textContent = isBusy ? "Sending..." : "Move Arm";
    armForm.setAttribute("aria-busy", String(isBusy));

    Object.values(armInputs).forEach((input) => {
        input.disabled = isBusy;
    });
}

// Read numeric values and apply the same limits as the backend.
function readArmCommand() {
    const command = {};

    for (const [field, input] of Object.entries(armInputs)) {
        const value = input.valueAsNumber;

        // Empty fields and invalid numeric input must not become zero.
        if (input.value.trim() === "" || !Number.isFinite(value)) {
            showArmMessage(`Enter a finite number for ${field}.`);
            input.focus();
            return null;
        }

        command[field] = value;
    }

    if (command.roll < -165 || command.roll > 165) {
        showArmMessage("Roll must be between -165 and 165 degrees.");
        armInputs.roll.focus();
        return null;
    }

    if (command.pitch < -75 || command.pitch > 75) {
        showArmMessage("Pitch must be between -75 and 75 degrees.");
        armInputs.pitch.focus();
        return null;
    }

    if (command.speed <= 0) {
        showArmMessage("Speed must be greater than zero.");
        armInputs.speed.focus();
        return null;
    }

    return command;
}

// Check the saved command before using its values in the simulator.
function isArmMovementResponse(result) {
    return result !== null &&
        typeof result === "object" &&
        Number.isInteger(result.id) &&
        result.id > 0 &&
        ["roll", "pitch", "yaw", "speed"].every(
            (field) => Number.isFinite(result[field])
        ) &&
        result.roll >= -165 &&
        result.roll <= 165 &&
        result.pitch >= -75 &&
        result.pitch <= 75 &&
        result.speed > 0;
}

// Remove protected access when the backend reports an expired session.
function handleArmSessionExpired() {
    currentAccount = null;
    updateAccountControls();
    loginForm.reset();
    clearAccountFeedback(accountMessage);
    armForm.reset();
    clearArmMessage();

    showScreen("login-screen");
    showAccountFeedback(
        loginMessage,
        "Your session has expired. Please log in again."
    );
}

// Validate and submit a movement using the current account's session token.
async function handleArmSubmit(event) {
    event.preventDefault();

    if (armRequestInProgress) {
        return;
    }

    clearArmMessage();

    const command = readArmCommand();

    if (!command) {
        return;
    }

    setArmBusy(true);

    try {
        await sessionStartup;

        if (!currentAccount) {
            handleArmSessionExpired();
            return;
        }

        // Remember which account started the request.
        const requestingAccount = currentAccount;

        const response = await fetch("/api/arm/move", {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/json",
                "X-CSRF-Token": requestingAccount.csrfToken
            },
            body: JSON.stringify(command)
        });

        const result = await response.json().catch(() => null);

        // Ignore old responses if the user logged out or changed accounts.
        if (currentAccount !== requestingAccount) {
            return;
        }

        if (response.status === 401) {
            handleArmSessionExpired();
            return;
        }

        if (!response.ok) {
            showArmMessage(
                accountResponseMessage(
                    result,
                    "Movement request failed. Please try again."
                )
            );
            return;
        }

        if (!isArmMovementResponse(result)) {
            showArmMessage(
                "The server returned an unexpected movement response. " +
                "The command may have been saved. Refresh before trying again."
            );
            return;
        }

        // Display the values returned by the server after saving succeeds.
        updateArmPose(result);
        showArmMessage("Movement accepted.", true);
    } catch (error) {
        showArmMessage(
            "Unable to connect to the server. Please try again."
        );
    } finally {
        setArmBusy(false);
    }
}

// Handle movement submissions without refreshing the page.
armForm.addEventListener("submit", handleArmSubmit);

// Load the scene only when the user opens the arm screen.
async function showArmScene() {
    const message = document.getElementById("arm-scene-message");

    try {
        if (!armSceneLoading) {
            message.textContent = "Loading the 3D view...";
            message.hidden = false;

            armSceneLoading = import("./arm-scene.js").then((module) => {
                armScene = module.createArmScene(
                    document.getElementById("arm-scene")
                );

                return armScene;
            });
        }

        const view = await armSceneLoading;

        // Use the latest pose even if it changed while loading.
        view.setPose(currentArmPose);
        message.hidden = true;
    } catch (error) {
        // Allow another loading attempt when the screen is opened again.
        armSceneLoading = null;
        message.textContent =
            "The 3D view could not load. Check the browser console for details.";
        message.hidden = false;
        console.error("Unable to load the arm scene:", error);
    }
}

// Keep the text description and the 3D model on the same accepted pose.
function updateArmPose(movement) {
    currentArmPose = {
        roll: movement.roll,
        pitch: movement.pitch,
        yaw: movement.yaw
    };

    document.getElementById("arm-current-roll").textContent =
        String(currentArmPose.roll);
    document.getElementById("arm-current-pitch").textContent =
        String(currentArmPose.pitch);
    document.getElementById("arm-current-yaw").textContent =
        String(currentArmPose.yaw);

    if (!armScene) {
        return;
    }

    try {
        armScene.setPose(currentArmPose);
    } catch (error) {
        // A display problem must not be reported as a failed save.
        const message = document.getElementById("arm-scene-message");
        message.textContent =
            "The pose text has updated, but the 3D view could not refresh.";
        message.hidden = false;
        console.error("Unable to render the accepted arm pose:", error);
    }
}