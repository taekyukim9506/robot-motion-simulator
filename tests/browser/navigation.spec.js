const { test, expect } = require("@playwright/test");

// List the screens that should appear one at a time.
const screenIds = [
    "home-screen",
    "arm-screen",
    "mobile-screen",
    "login-screen",
    "signup-screen",
    "recovery-screen"
];

// Check that only the selected screen is visible.
async function expectOnlyScreen(page, selectedId) {
    for (const id of screenIds) {
        const screen = page.locator(`#${id}`);

        if (id === selectedId) {
            await expect(screen).toBeVisible();
        } else {
            await expect(screen).toBeHidden();
        }
    }
}

// Simulate the session response without needing a real account.
async function setTestSession(page, signedIn) {
    await page.unroute("**/api/auth/session");

    await page.route("**/api/auth/session", async (route) => {
        await route.fulfill({
            status: signedIn ? 200 : 401,
            json: signedIn
                ? {
                    username: "testuser",
                    email: "testuser@example.com",
                    csrfToken: "navigation-test-token"
                }
                : {
                    message: "Please log in to continue."
                }
        });
    });
}

// Start each test with a visitor viewing the homepage.
test.beforeEach(async ({ page }) => {
    await setTestSession(page, false);
    await page.goto("/");
});

// Check the initial screen and the available robot choices.
test("Homepage opens with both robot choices", async ({ page }) => {
    await expect(page).toHaveTitle("Robot Motion Simulator");
    await expectOnlyScreen(page, "home-screen");

    await expect(page.locator("#launch-arm-btn")).toBeEnabled();
    await expect(page.locator("#launch-mobile-btn")).toBeEnabled();
    await expect(page.locator("#open-login-btn")).toBeVisible();
    await expect(page.locator("#logout-btn")).toBeHidden();
});

// Check robot navigation using an authenticated session.
test("Robot navigation opens the correct panels", async ({ page }) => {
    await setTestSession(page, true);
    await page.goto("/");

    // Wait until the frontend has restored the account.
    await expect(page.locator("#user-greeting")).toHaveText(
        "Hello, testuser!"
    );

    await page.locator("#launch-arm-btn").click();
    await expectOnlyScreen(page, "arm-screen");

    await page.locator(
        '#arm-screen [data-screen="mobile-screen"]'
    ).click();
    await expectOnlyScreen(page, "mobile-screen");

    await page.locator(
        '#mobile-screen [data-screen="arm-screen"]'
    ).click();
    await expectOnlyScreen(page, "arm-screen");

    await page.locator(
        '#arm-screen [data-screen="home-screen"]'
    ).click();
    await expectOnlyScreen(page, "home-screen");

    await page.locator("#launch-mobile-btn").click();
    await expectOnlyScreen(page, "mobile-screen");

    await page.locator(
        '#mobile-screen [data-screen="home-screen"]'
    ).click();
    await expectOnlyScreen(page, "home-screen");
});

// Check account navigation while the visitor is signed out.
test("Account navigation opens and closes each form", async ({ page }) => {
    for (const target of ["signup-screen", "recovery-screen"]) {
        await page.locator("#open-login-btn").click();
        await expectOnlyScreen(page, "login-screen");

        await page.locator(
            `#login-screen [data-screen="${target}"]`
        ).click();
        await expectOnlyScreen(page, target);

        await page.locator(
            `#${target} [data-screen="login-screen"]`
        ).click();
        await expectOnlyScreen(page, "login-screen");

        await page.locator(
            `#login-screen [data-screen="${target}"]`
        ).click();

        await page.locator(
            `#${target} [data-screen="home-screen"]`
        ).click();
        await expectOnlyScreen(page, "home-screen");
    }

    // Check the direct return link from login to the homepage.
    await page.locator("#open-login-btn").click();

    await page.locator(
        '#login-screen [data-screen="home-screen"]'
    ).click();

    await expectOnlyScreen(page, "home-screen");
});

// Check keyboard activation and focus after changing screens.
test("Keyboard navigation moves focus to the new heading", async ({
    page
}) => {
    await page.keyboard.press("Tab");
    await expect(page.locator("#open-login-btn")).toBeFocused();

    await page.keyboard.press("Enter");
    await expectOnlyScreen(page, "login-screen");

    await expect(
        page.locator("#login-screen h1")
    ).toBeFocused();

    await page.keyboard.press("Tab");

    await expect(
        page.locator("#login-form").getByLabel(
            "Username / Email",
            { exact: true }
        )
    ).toBeFocused();
});

// Check field labels, password inputs and basic browser validation.
test("Account fields have labels and expected input behaviour", async ({
    page
}) => {
    await page.locator("#open-login-btn").click();

    // Login now accepts a username or email and allows submission.
    const login = page.locator("#login-form");

    await login.getByLabel("Username / Email", { exact: true })
        .fill("testuser");

    await login.getByLabel("Password", { exact: true })
        .fill("Test-only-123!");

    await expect(
        login.getByLabel("Password", { exact: true })
    ).toHaveAttribute("type", "password");

    await expect(
        login.locator('[type="submit"]')
    ).toBeEnabled();

    await page.locator(
        '#login-screen [data-screen="signup-screen"]'
    ).click();

    // Check the signup fields and password confirmation.
    const signup = page.locator("#signup-form");

    await signup.getByLabel("Username", { exact: true })
        .fill("newuser");

    await signup.getByLabel("Password", { exact: true })
        .fill("Test-only-123!");

    await signup.getByLabel("Confirm Password", { exact: true })
        .fill("Test-only-123!");

    const email = signup.getByLabel(
        "Email address",
        { exact: true }
    );

    // Reject an invalid email and accept a valid example address.
    await email.fill("not-an-email");

    expect(
        await email.evaluate((input) => input.checkValidity())
    ).toBe(false);

    await email.fill("newuser@example.com");

    expect(
        await email.evaluate((input) => input.checkValidity())
    ).toBe(true);

    // A required email field must reject an empty value.
    await email.fill("");

    expect(
        await email.evaluate((input) => input.checkValidity())
    ).toBe(false);

    await expect(
        signup.getByLabel("Password", { exact: true })
    ).toHaveAttribute("type", "password");

    await expect(
        signup.getByLabel("Confirm Password", { exact: true })
    ).toHaveAttribute("type", "password");

    await expect(
        signup.locator('[type="submit"]')
    ).toBeEnabled();

    // Recovery remains unavailable until its later milestone.
    await page.locator(
        '#signup-screen [data-screen="login-screen"]'
    ).click();

    await page.locator(
        '#login-screen [data-screen="recovery-screen"]'
    ).click();

    const recovery = page.locator("#recovery-form");

    await recovery.getByLabel("Email address", { exact: true })
        .fill("testuser@example.com");

    await expect(
        recovery.locator('[type="submit"]')
    ).toBeDisabled();
});

// Check desktop, tablet and phone layouts.
for (const width of [1280, 768, 375]) {
    test(`Screens fit a ${width}px viewport`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });

        // Cards should share a row on desktop and stack on smaller screens.
        const cards = page.locator(".video-card");
        const first = await cards.nth(0).boundingBox();
        const second = await cards.nth(1).boundingBox();

        expect(first).not.toBeNull();
        expect(second).not.toBeNull();

        if (width > 900) {
            expect(Math.abs(first.y - second.y)).toBeLessThan(2);
            expect(second.x).toBeGreaterThan(first.x);
        } else {
            expect(second.y).toBeGreaterThanOrEqual(
                first.y + first.height
            );
        }

        // Visit each screen with the session state it requires.
        for (const id of screenIds) {
            const needsLogin =
                id === "arm-screen" || id === "mobile-screen";

            await setTestSession(page, needsLogin);
            await page.goto("/");

            if (needsLogin) {
                await expect(page.locator("#user-greeting")).toHaveText(
                    "Hello, testuser!"
                );

                const button = id === "arm-screen"
                    ? "#launch-arm-btn"
                    : "#launch-mobile-btn";

                await page.locator(button).click();
            } else if (id !== "home-screen") {
                await page.locator("#open-login-btn").click();

                if (id !== "login-screen") {
                    await page.locator(
                        `#login-screen [data-screen="${id}"]`
                    ).click();
                }
            }

            await expectOnlyScreen(page, id);

            // No screen should create horizontal page scrolling.
            const fitsWidth = await page.evaluate(() =>
                document.documentElement.scrollWidth <= window.innerWidth
            );

            expect(fitsWidth).toBe(true);
        }
    });
}