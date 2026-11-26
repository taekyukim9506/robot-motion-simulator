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
        resetArm();
        resetMobile();
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

// Connect the movement buttons and timer to the arm panel.
const pauseArmButton = document.getElementById("arm-pause");
const resetArmButton = document.getElementById("arm-reset");
const resetViewButton = document.getElementById("arm-view-reset");
const elapsedOutput = document.getElementById("arm-elapsed");
const totalOutput = document.getElementById("arm-total");

// Keep the active movement and its next browser frame in memory.
let armMotion = null;
let armFrameId = null;

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

    // Wait for the current request or movement before starting another.
    armSubmitButton.disabled = isBusy || armMotion !== null;
    resetArmButton.disabled = isBusy;
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

    // Accept one command at a time, including while the arm is paused.
    if (armRequestInProgress || armMotion !== null) {
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

        // Start moving only after the backend accepts and saves the command.
        startArmMotion(result);
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
        resetViewButton.disabled = false;
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

    // Round only the displayed text. Keep full precision for the 3D movement.
    document.getElementById("arm-current-roll").textContent =
        String(Number(currentArmPose.roll.toFixed(2)));

    document.getElementById("arm-current-pitch").textContent =
        String(Number(currentArmPose.pitch.toFixed(2)));

    document.getElementById("arm-current-yaw").textContent =
        String(Number(currentArmPose.yaw.toFixed(2)));

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

// Start a movement from the current pose to the accepted target.
function startArmMotion(target) {
    const start = { ...currentArmPose };

    // The axis travelling furthest sets the duration for all three axes.
    const rollDistance = Math.abs(target.roll - start.roll);
    const pitchDistance = Math.abs(target.pitch - start.pitch);
    const yawDistance = Math.abs(target.yaw - start.yaw);
    const longestDistance = Math.max(rollDistance, pitchDistance, yawDistance);

    // Dividing first also supports very large yaw values of opposite signs.
    const duration = Number.isFinite(longestDistance)
        ? longestDistance / target.speed
        : Math.abs(target.yaw / 2 - start.yaw / 2) / target.speed * 2;

    elapsedOutput.textContent = "0.0";
    totalOutput.textContent = Number.isFinite(duration)
        ? duration.toFixed(1)
        : "∞";

    // An accepted command may already match the current pose.
    if (duration === 0) {
        updateArmPose(target);
        return;
    }

    // Store active time separately so paused time can be left out.
    armMotion = {
        start,
        target,
        duration,
        elapsedBeforeResume: 0,
        resumedAt: performance.now(),
        paused: false
    };

    pauseArmButton.disabled = false;
    pauseArmButton.textContent = "Pause";
    armFrameId = requestAnimationFrame(drawArmFrame);
}

// Draw the position for one moment and report whether the movement has finished.
function displayArmAtTime(now) {
    const motion = armMotion;
    const activeSeconds = Math.max(0, now - motion.resumedAt) / 1000;
    const elapsed = Math.min(
        motion.duration,
        motion.elapsedBeforeResume + activeSeconds
    );

    elapsedOutput.textContent = elapsed.toFixed(1);

    // Use the exact target at the end to avoid a small rounding difference.
    if (elapsed >= motion.duration) {
        updateArmPose(motion.target);
        stopArmPlayback();
        return true;
    }

    // Keep the full yaw distance so 720 degrees produces two complete turns.
    const progress = elapsed / motion.duration;
    const pose = {};

    for (const axis of ["roll", "pitch", "yaw"]) {
        pose[axis] =
            motion.start[axis] * (1 - progress) +
            motion.target[axis] * progress;
    }

    updateArmPose(pose);
    return false;
}

// Request another frame only while the arm is moving.
function drawArmFrame(now) {
    if (armMotion === null || armMotion.paused) {
        return;
    }

    const finished = displayArmAtTime(now);

    if (!finished) {
        armFrameId = requestAnimationFrame(drawArmFrame);
    }
}

// Release the controls when the movement finishes or the user resets it.
function stopArmPlayback() {
    if (armFrameId !== null) {
        cancelAnimationFrame(armFrameId);
    }

    armFrameId = null;
    armMotion = null;
    pauseArmButton.disabled = true;
    pauseArmButton.textContent = "Pause";
    armSubmitButton.disabled = armRequestInProgress;
}

// Freeze the arm and timer, or continue from the same position.
function toggleArmPause() {
    if (armMotion === null) {
        return;
    }

    const now = performance.now();

    // Resume using a new start time so the pause is excluded.
    if (armMotion.paused) {
        armMotion.resumedAt = now;
        armMotion.paused = false;
        pauseArmButton.textContent = "Pause";
        armFrameId = requestAnimationFrame(drawArmFrame);
        return;
    }

    // Draw the position at the exact moment the user presses Pause.
    cancelAnimationFrame(armFrameId);
    armFrameId = null;

    if (displayArmAtTime(now)) {
        return;
    }

    armMotion.elapsedBeforeResume +=
        Math.max(0, now - armMotion.resumedAt) / 1000;

    armMotion.paused = true;
    pauseArmButton.textContent = "Resume";
}

// Return the simulator to its starting pose without saving another command.
function resetArm() {
    stopArmPlayback();
    updateArmPose({ roll: 0, pitch: 0, yaw: 0 });

    elapsedOutput.textContent = "0.0";
    totalOutput.textContent = "0.0";

    armForm.reset();
    clearArmMessage();
}

// Connect each button to its movement or camera action.
pauseArmButton.addEventListener("click", toggleArmPause);
resetArmButton.addEventListener("click", resetArm);

resetViewButton.addEventListener("click", () => {
    if (armScene) {
        armScene.resetView();
    }
});

// Connect the mobile form, position display and canvas to the simulator.
const mobileForm = document.getElementById("mobile-form");
const mobileMessage = document.getElementById("mobile-message");
const mobileCanvas = document.getElementById("mobile-grid");
const mobileContext = mobileCanvas.getContext("2d");
const mobileMoveButton = mobileForm.querySelector('button[type="submit"]');
const mobileCurrentX = document.getElementById("mobile-current-x");
const mobileCurrentY = document.getElementById("mobile-current-y");

const mobileInputs = {
    x: document.getElementById("mobile-x"),
    y: document.getElementById("mobile-y"),
    speed: document.getElementById("mobile-speed")
};

// Store the robot position separately from the centre and scale of the view.
let mobilePosition = { x: 0, y: 0 };
let mobileHeading = 0;
let mobileSteering = 0;
let mobileHasDriven = false;
let mobileView = { x: 0, y: 0, scale: 24 };
let mobileDrag = null;
let mobileFrameId = null;
let mobileBusy = false;

// Show command feedback below the movement button.
function showMobileMessage(message, success = false) {
    mobileMessage.textContent = message;
    mobileMessage.classList.toggle("form-message--success", success);
    mobileMessage.classList.toggle("form-message--error", !success);
    mobileMessage.hidden = false;
}

// Allow one command at a time while saving or moving.
function setMobileBusy(busy) {
    mobileBusy = busy;
    mobileMoveButton.disabled = busy;

    for (const input of Object.values(mobileInputs)) {
        input.disabled = busy;
    }
}

// Draw the visible grid, coordinate axes and current robot position.
function drawMobileGrid() {
    if (!mobileContext) {
        return;
    }

    const ctx = mobileContext;
    const width = mobileCanvas.width;
    const height = mobileCanvas.height;
    const scale = mobileView.scale;

    ctx.fillStyle = "#f5f8fc";
    ctx.fillRect(0, 0, width, height);

    // Find the first visible grid line. Work in pixels to keep the loop short.
    const offsetX = (width / 2 - (mobileView.x % 1) * scale) % scale;
    const offsetY = (height / 2 + (mobileView.y % 1) * scale) % scale;

    ctx.beginPath();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#d5dfe9";

    for (let x = offsetX; x < width; x += scale) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
    }

    for (let y = offsetY; y < height; y += scale) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
    }

    ctx.stroke();

    // Positive X points right. Positive Y points up on the screen.
    const originX = width / 2 - mobileView.x * scale;
    const originY = height / 2 + mobileView.y * scale;

    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#74869a";
    ctx.fillStyle = "#394b60";
    ctx.font = "14px sans-serif";

    if (originY >= 0 && originY < height) {
        ctx.moveTo(0, originY);
        ctx.lineTo(width, originY);
        ctx.fillText("X", width - 18, Math.max(16, originY - 6));
    }

    if (originX >= 0 && originX < width) {
        ctx.moveTo(originX, 0);
        ctx.lineTo(originX, height);
        ctx.fillText("Y", Math.min(width - 16, originX + 6), 18);
    }

    ctx.stroke();

        // Place the car at its grid position and turn its nose towards its heading.
    const carX = width / 2 + (mobilePosition.x - mobileView.x) * scale;
    const carY = height / 2 - (mobilePosition.y - mobileView.y) * scale;

    if (carX >= -32 && carX <= width + 32 &&
        carY >= -32 && carY <= height + 32) {
        ctx.save();
        ctx.translate(carX, carY);

        // Canvas Y points down, so reverse the grid angle when drawing.
        ctx.rotate(-mobileHeading);

        // Draw four tyres. The two at the front turn with the steering.
        for (const axle of [-12, 12]) {
            for (const side of [-1, 1]) {
                ctx.save();
                ctx.translate(axle, side * 10);

                if (axle > 0) {
                    ctx.rotate(-mobileSteering);
                }

                ctx.fillStyle = "#202936";
                ctx.fillRect(-5, -2.5, 10, 5);
                ctx.restore();
            }
        }

        // Draw the body between the wheels. Its front is on the right.
        ctx.fillStyle = "#e98b26";
        ctx.strokeStyle = "#55351e";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(-20, -8.5, 40, 17, 5);
        ctx.fill();
        ctx.stroke();

        // Draw a dark cabin and a light windscreen near the bonnet.
        ctx.fillStyle = "#31465a";
        ctx.fillRect(-8, -6.5, 15, 13);
        ctx.fillStyle = "#a9d9ef";
        ctx.fillRect(4, -6, 4, 12);

        // Headlights and rear lights make the driving direction visible.
        ctx.fillStyle = "#fff3bf";
        ctx.fillRect(17, -6, 3, 3);
        ctx.fillRect(17, 3, 3, 3);
        ctx.fillStyle = "#a72828";
        ctx.fillRect(-20, -6, 2, 3);
        ctx.fillRect(-20, 3, 2, 3);

        ctx.restore();
    }
}

// Use the same position for the drawing and the text below it.
function displayMobilePosition(x, y) {
    mobilePosition = { x, y };
    mobileCurrentX.textContent = String(Number(x.toFixed(2)));
    mobileCurrentY.textContent = String(Number(y.toFixed(2)));
    drawMobileGrid();
}

// Return the robot and view to the origin when the account changes.
function resetMobile() {
    if (mobileFrameId !== null) {
        cancelAnimationFrame(mobileFrameId);
        mobileFrameId = null;
    }

    mobileDrag = null;
    mobileHeading = 0;
    mobileSteering = 0;
    mobileHasDriven = false;
    mobileView = { x: 0, y: 0, scale: 24 };
    mobileForm.reset();
    mobileMessage.hidden = true;
    mobileMessage.textContent = "";
    setMobileBusy(false);
    displayMobilePosition(0, 0);
}

// Read the fields as numbers and explain which value needs attention.
function readMobileCommand() {
    const command = {};

    for (const [field, input] of Object.entries(mobileInputs)) {
        const value = input.valueAsNumber;

        if (!Number.isFinite(value)) {
            showMobileMessage(`Enter a finite number for ${field}.`);
            input.focus();
            return null;
        }

        command[field] = value;
    }

    if (command.speed <= 0) {
        showMobileMessage("Speed must be greater than zero.");
        mobileInputs.speed.focus();
        return null;
    }

    return command;
}

// Drive to the accepted target. Keep the current heading when starting a new turn.
function animateMobileMovement(target) {
    const start = { ...mobilePosition };
    const dx = target.x - start.x;
    const dy = target.y - start.y;
    const distance = Math.hypot(dx, dy);

    // A command to the current position needs no movement.
    if (distance === 0) {
        setMobileBusy(false);
        return;
    }

    if (!Number.isFinite(distance)) {
        showMobileMessage("Command saved, but the distance is too large to display.");
        setMobileBusy(false);
        return;
    }

    // On the first command, face the target. Later commands start from
    // the direction in which the car finished its previous movement.
    const targetAngle = Math.atan2(dy, dx);
    const initialHeading = mobileHasDriven ? mobileHeading : targetAngle;

    // Reverse towards a target behind the car instead of turning on the spot.
    const reversing = Math.cos(targetAngle - initialHeading) < -0.000001;
    const travelAngle = initialHeading + (reversing ? Math.PI : 0);

    // The middle point sets the starting direction of a gentle curved path.
    const guide = {
        x: start.x + Math.cos(travelAngle) * distance * 0.4,
        y: start.y + Math.sin(travelAngle) * distance * 0.4
    };

    // Find a position on the curve between the start and the destination.
    function pointAt(t) {
        const u = 1 - t;
        return {
            x: u * u * start.x + 2 * u * t * guide.x + t * t * target.x,
            y: u * u * start.y + 2 * u * t * guide.y + t * t * target.y
        };
    }

    // Measure the curve in short sections so speed follows distance travelled.
    const sections = 80;
    const lengths = [0];
    let previous = start;

    for (let i = 1; i <= sections; i++) {
        const point = pointAt(i / sections);
        const step = Math.hypot(point.x - previous.x, point.y - previous.y);
        lengths.push(lengths[i - 1] + step);
        previous = point;
    }

    const pathLength = lengths[sections];
    const duration = pathLength / target.speed;

    if (!Number.isFinite(duration)) {
        showMobileMessage("Command saved, but its duration is too large to display.");
        setMobileBusy(false);
        return;
    }

    mobileHasDriven = true;
    mobileHeading = initialHeading;
    const startedAt = performance.now();
    let section = 1;

    // Move along the path and turn the car to match the local direction.
    function drawFrame(now) {
        const elapsed = Math.max(0, now - startedAt) / 1000;
        const finished = elapsed >= duration;
        const travelled = finished ? pathLength : elapsed * target.speed;

        while (section < sections && lengths[section] < travelled) {
            section++;
        }

        const sectionStart = lengths[section - 1];
        const sectionLength = lengths[section] - sectionStart;
        const fraction = sectionLength > 0
            ? (travelled - sectionStart) / sectionLength
            : 0;
        const t = finished ? 1 : (section - 1 + fraction) / sections;

        // The tangent gives the direction of travel at the current position.
        const tangentX = (1 - t) * (guide.x - start.x) + t * (target.x - guide.x);
        const tangentY = (1 - t) * (guide.y - start.y) + t * (target.y - guide.y);
        const direction = Math.atan2(tangentY, tangentX);
        mobileHeading = direction + (reversing ? Math.PI : 0);

        // Point the front tyres into the bend, then straighten them on arrival.
        const bend = tangentX * (target.y - guide.y) -
            tangentY * (target.x - guide.x);
        const bendStrength = Math.atan2(bend, tangentX ** 2 + tangentY ** 2);
        mobileSteering = finished ? 0 : Math.max(-0.5, Math.min(0.5,
            reversing ? -bendStrength : bendStrength
        ));

        const point = finished ? target : pointAt(t);
        displayMobilePosition(point.x, point.y);

        if (finished) {
            mobileFrameId = null;
            setMobileBusy(false);
        } else {
            mobileFrameId = requestAnimationFrame(drawFrame);
        }
    }

    mobileFrameId = requestAnimationFrame(drawFrame);
}

// Save the command through the backend before starting the animation.
async function handleMobileSubmit(event) {
    event.preventDefault();

    if (mobileBusy) {
        return;
    }

    const command = readMobileCommand();

    if (!command) {
        return;
    }

    const account = currentAccount;

    if (!account) {
        showScreen("login-screen");
        return;
    }

    setMobileBusy(true);

    try {
        const response = await fetch("/api/mobile/move", {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "Content-Type": "application/json",
                "X-CSRF-Token": account.csrfToken
            },
            body: JSON.stringify(command)
        });

        const result = await response.json().catch(() => null);

        // Ignore an old response if a different user has since signed in.
        if (currentAccount !== account) {
            return;
        }

        if (response.status === 401) {
            currentAccount = null;
            updateAccountControls();
            loginForm.reset();
            showScreen("login-screen");
            showAccountFeedback(
                loginMessage,
                "Your session has expired. Please log in again."
            );
            return;
        }

        if (!response.ok) {
                        // Show the HTTP status so a failed movement is easier to diagnose.
            const reason = accountResponseMessage(
                result,
                result?.error || response.statusText || "Request failed"
            );
            showMobileMessage(`Movement request failed (${response.status}): ${reason}`);
            setMobileBusy(false);
            return;
        }

        // Animate only when the server returns a complete saved command.
        if (!result || !Number.isInteger(result.id) || result.id <= 0 ||
            !Number.isFinite(result.x) || !Number.isFinite(result.y) ||
            !Number.isFinite(result.speed) || result.speed <= 0) {
            showMobileMessage(
                "Unexpected movement response. The command may have been saved."
            );
            setMobileBusy(false);
            return;
        }

        showMobileMessage("Movement accepted.", true);
        animateMobileMovement(result);
    } catch (error) {
        if (currentAccount === account) {
            showMobileMessage("Unable to connect to the server. Please try again.");
            setMobileBusy(false);
        }
    }
}

// Change the grid scale while keeping its centre in the same place.
function zoomMobileGrid(factor) {
    mobileView.scale = Math.min(96, Math.max(6, mobileView.scale * factor));
    drawMobileGrid();
}

document.getElementById("mobile-zoom-in").addEventListener("click", () => {
    zoomMobileGrid(1.5);
});

document.getElementById("mobile-zoom-out").addEventListener("click", () => {
    zoomMobileGrid(1 / 1.5);
});

// Centre the view on the robot and keep the selected zoom level.
document.getElementById("mobile-recenter").addEventListener("click", () => {
    mobileView.x = mobilePosition.x;
    mobileView.y = mobilePosition.y;
    drawMobileGrid();
});

// Remember where the user starts dragging with a mouse, pen or finger.
mobileCanvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || mobileDrag !== null) {
        return;
    }

    mobileDrag = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY
    };

    mobileCanvas.setPointerCapture(event.pointerId);
});

// Convert the pointer distance to grid units, including on smaller screens.
mobileCanvas.addEventListener("pointermove", (event) => {
    if (!mobileDrag || mobileDrag.id !== event.pointerId) {
        return;
    }

    const bounds = mobileCanvas.getBoundingClientRect();

    if (bounds.width === 0 || bounds.height === 0) {
        return;
    }

    const dx = (event.clientX - mobileDrag.x) * mobileCanvas.width / bounds.width;
    const dy = (event.clientY - mobileDrag.y) * mobileCanvas.height / bounds.height;

    mobileView.x -= dx / mobileView.scale;
    mobileView.y += dy / mobileView.scale;
    mobileDrag.x = event.clientX;
    mobileDrag.y = event.clientY;

    drawMobileGrid();
});

// Pointer capture ends when the user releases or cancels the drag.
mobileCanvas.addEventListener("lostpointercapture", (event) => {
    if (mobileDrag && mobileDrag.id === event.pointerId) {
        mobileDrag = null;
    }
});

// Connect the form and draw the starting position before opening the panel.
mobileForm.addEventListener("submit", handleMobileSubmit);
displayMobilePosition(0, 0);

// Restore the session after all controls and playback variables are ready.
const sessionStartup = restoreLoginSession();