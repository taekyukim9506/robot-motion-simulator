const { test, expect } = require("@playwright/test");

// Use example account details without contacting a real email service.
const account = {
    username: "testuser",
    email: "testuser@example.com",
    csrfToken: "browser-test-token"
};

// Simulate the session endpoint for visitors or signed-in users.
async function mockSession(page, signedIn = false) {
    await page.route("**/api/auth/session", async (route) => {
        await route.fulfill({
            status: signedIn ? 200 : 401,
            json: signedIn
                ? account
                : { message: "Please log in to continue." }
        });
    });
}

// Open login through the homepage navigation.
async function openLogin(page) {
    await page.goto("/");

    await page
        .locator('#home-screen [data-screen="login-screen"]')
        .click();

    await expect(page.locator("#login-screen")).toBeVisible();
}

// Fill the login form and submit it.
async function submitLogin(page, identifier = "testuser") {
    await page.locator("#login-username").fill(identifier);
    await page.locator("#login-password").fill("RobotTest123!");

    await page
        .locator('#login-form button[type="submit"]')
        .click();
}

// Check that either supported identifier is sent to the login endpoint.
for (const identifier of ["testuser", "testuser@example.com"]) {
    test(`logs in using ${identifier}`, async ({ page }) => {
        await mockSession(page);

        let submittedDetails;
        let submittedMethod;

        await page.route("**/api/auth/login", async (route) => {
            submittedDetails = route.request().postDataJSON();
            submittedMethod = route.request().method();

            await route.fulfill({
                status: 200,
                json: account
            });
        });

        await openLogin(page);
        await submitLogin(page, identifier);

        await expect(page.locator("#home-screen")).toBeVisible();
        await expect(page.locator("#login-screen")).toBeHidden();

        await expect(page.locator("#user-greeting")).toHaveText(
            "Hello, testuser!"
        );

        await expect(page.locator("#logout-btn")).toBeVisible();
        await expect(page.locator("#login-password")).toHaveValue("");

        expect(submittedMethod).toBe("POST");
        expect(submittedDetails).toEqual({
            identifier,
            password: "RobotTest123!"
        });

        // Allow a signed-in user to open the arm panel.
        await page.locator("#launch-arm-btn").click();
        await expect(page.locator("#arm-screen")).toBeVisible();
    });
}

// Display backend errors without granting access to the robot panels.
const loginErrors = [
    {
        name: "incorrect credentials",
        status: 401,
        message: "Invalid username/email or password."
    },
    {
        name: "an unverified account",
        status: 403,
        message: "Please verify your email before logging in."
    }
];

for (const errorCase of loginErrors) {
    test(`rejects ${errorCase.name}`, async ({ page }) => {
        await mockSession(page);

        await page.route("**/api/auth/login", async (route) => {
            await route.fulfill({
                status: errorCase.status,
                json: { message: errorCase.message }
            });
        });

        await openLogin(page);
        await submitLogin(page);

        await expect(page.locator("#login-screen")).toBeVisible();
        await expect(page.locator("#login-message")).toHaveText(
            errorCase.message
        );

        await expect(
            page.locator('#login-form button[type="submit"]')
        ).toBeEnabled();

        await expect(page.locator("#logout-btn")).toBeHidden();

        // Returning home must not turn a failed login into valid access.
        await page
            .locator('#login-screen [data-screen="home-screen"]')
            .click();

        await page.locator("#launch-arm-btn").click();
        await expect(page.locator("#login-screen")).toBeVisible();
        await expect(page.locator("#arm-screen")).toBeHidden();
    });
}

// Restore account details from the backend when the page is refreshed.
test("restores a valid session after refresh", async ({ page }) => {
    await mockSession(page, true);

    await page.goto("/");

    await expect(page.locator("#user-greeting")).toHaveText(
        "Hello, testuser!"
    );

    await page.reload();

    await expect(page.locator("#user-greeting")).toHaveText(
        "Hello, testuser!"
    );

    await expect(page.locator("#logout-btn")).toBeVisible();

    await page.locator("#launch-mobile-btn").click();
    await expect(page.locator("#mobile-screen")).toBeVisible();
});

// Send the session token during logout and remove access afterwards.
test("logs out and blocks robot access afterwards", async ({ page }) => {
    let signedIn = true;
    let logoutMethod;
    let logoutToken;

    await page.route("**/api/auth/session", async (route) => {
        await route.fulfill({
            status: signedIn ? 200 : 401,
            json: signedIn
                ? account
                : { message: "Please log in to continue." }
        });
    });

    await page.route("**/api/auth/logout", async (route) => {
        logoutMethod = route.request().method();
        logoutToken = route.request().headers()["x-csrf-token"];
        signedIn = false;

        await route.fulfill({
            status: 204
        });
    });

    await page.goto("/");
    await page.locator("#logout-btn").click();

    await expect(page.locator("#login-screen")).toBeVisible();
    await expect(page.locator("#logout-btn")).toBeHidden();

    expect(logoutMethod).toBe("POST");
    expect(logoutToken).toBe(account.csrfToken);

    // Check that logout remains effective after reloading the page.
    await page.reload();

    await expect(page.locator("#home-screen")).toBeVisible();
    await expect(page.locator("#logout-btn")).toBeHidden();

    await page.locator("#launch-arm-btn").click();
    await expect(page.locator("#login-screen")).toBeVisible();
    await expect(page.locator("#arm-screen")).toBeHidden();
});

// Require login when a visitor tries to open either robot panel.
test("blocks robot panels for visitors", async ({ page }) => {
    await mockSession(page);
    await page.goto("/");

    await page.locator("#launch-arm-btn").click();
    await expect(page.locator("#login-screen")).toBeVisible();
    await expect(page.locator("#arm-screen")).toBeHidden();

    await page
        .locator('#login-screen [data-screen="home-screen"]')
        .click();

    await page.locator("#launch-mobile-btn").click();
    await expect(page.locator("#login-screen")).toBeVisible();
    await expect(page.locator("#mobile-screen")).toBeHidden();
});

// Explain connection failures and allow another login attempt.
test("allows retry after a login connection failure", async ({ page }) => {
    await mockSession(page);

    await page.route("**/api/auth/login", async (route) => {
        await route.abort("failed");
    });

    await openLogin(page);
    await submitLogin(page);

    await expect(page.locator("#login-message")).toHaveText(
        "Unable to connect to the server. Please try again."
    );

    await expect(
        page.locator('#login-form button[type="submit"]')
    ).toBeEnabled();

    await expect(page.locator("#login-screen")).toBeVisible();
});