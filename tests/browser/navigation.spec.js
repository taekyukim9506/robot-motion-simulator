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

// Check that the selected screen is visible and all others are hidden.
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

// Load a fresh homepage before every test.
test.beforeEach(async ({ page }) => {
    await page.goto("/");
});

// Check the initial screen and the two available robot choices.
test("Homepage opens with both robot choices", async ({ page }) => {
    await expect(page).toHaveTitle("Robot Motion Simulator");
    await expectOnlyScreen(page, "home-screen");

    await expect(page.locator("#launch-arm-btn")).toBeEnabled();
    await expect(page.locator("#launch-mobile-btn")).toBeEnabled();
});

// Check both launch buttons, robot switching and return navigation.
test("Robot navigation opens the correct panels", async ({ page }) => {
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

// Check every account navigation link from its visible screen.
test("Account navigation opens and closes each form", async ({ page }) => {
    for (const target of ["signup-screen", "recovery-screen"]) {
        await page.locator(
            '#home-screen [data-screen="login-screen"]'
        ).click();
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

    await page.locator(
        '#home-screen [data-screen="login-screen"]'
    ).click();

    await page.locator(
        '#login-screen [data-screen="home-screen"]'
    ).click();
    await expectOnlyScreen(page, "home-screen");
});

// Check keyboard activation and focus after changing screens.
test("Keyboard navigation moves focus to the new heading", async ({ page }) => {
    await page.keyboard.press("Tab");

    await expect(page.locator(
        '#home-screen [data-screen="login-screen"]'
    )).toBeFocused();

    await page.keyboard.press("Enter");
    await expectOnlyScreen(page, "login-screen");
    await expect(page.locator("#login-screen h1")).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Username", { exact: true })
        .filter({ visible: true })).toBeFocused();
});

// Check the current form fields and their basic browser validation.
test("Account fields have labels and expected input behaviour", async ({ page }) => {
    await page.locator(
        '#home-screen [data-screen="login-screen"]'
    ).click();

    const login = page.locator("#login-form");
    await login.getByLabel("Username", { exact: true }).fill("testuser");
    await login.getByLabel("Password", { exact: true }).fill("Test-only-123!");

    await expect(login.getByLabel("Password", { exact: true }))
        .toHaveAttribute("type", "password");
    await expect(login.locator('[type="submit"]')).toBeDisabled();

    await page.locator(
        '#login-screen [data-screen="signup-screen"]'
    ).click();

    const signup = page.locator("#signup-form");
    await signup.getByLabel("Username", { exact: true }).fill("newuser");
    await signup.getByLabel("Password", { exact: true }).fill("Test-only-123!");

    const email = signup.getByLabel("Email address", { exact: true });

    // Reject an invalid email format and accept a valid example.
    await email.fill("not-an-email");
    expect(await email.evaluate((input) => input.checkValidity())).toBe(false);

    await email.fill("newuser@example.com");
    expect(await email.evaluate((input) => input.checkValidity())).toBe(true);

    // Required fields must reject an empty value.
    await email.fill("");
    expect(await email.evaluate((input) => input.checkValidity())).toBe(false);

    await expect(signup.getByLabel("Password", { exact: true }))
        .toHaveAttribute("type", "password");
    await expect(signup.locator('[type="submit"]')).toBeDisabled();

    await page.locator(
        '#signup-screen [data-screen="login-screen"]'
    ).click();
    await page.locator(
        '#login-screen [data-screen="recovery-screen"]'
    ).click();

    const recovery = page.locator("#recovery-form");
    await recovery.getByLabel("Email address", { exact: true })
        .fill("testuser@example.com");
    await expect(recovery.locator('[type="submit"]')).toBeDisabled();
});

// Check the layout at desktop, tablet and phone widths.
for (const width of [1280, 768, 375]) {
    test(`Screens fit a ${width}px viewport`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });

        // Cards should share a row on desktop and stack at smaller widths.
        const cards = page.locator(".video-card");
        const first = await cards.nth(0).boundingBox();
        const second = await cards.nth(1).boundingBox();

        if (width > 900) {
            expect(Math.abs(first.y - second.y)).toBeLessThan(2);
            expect(second.x).toBeGreaterThan(first.x);
        } else {
            expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
        }

        // Visit each screen to check for horizontal page overflow.
        for (const id of screenIds) {
            if (id !== "home-screen") {
                await page.goto("/");

                if (id === "arm-screen" || id === "mobile-screen") {
                    const button = id === "arm-screen"
                        ? "#launch-arm-btn"
                        : "#launch-mobile-btn";
                    await page.locator(button).click();
                } else {
                    await page.locator(
                        '#home-screen [data-screen="login-screen"]'
                    ).click();

                    if (id !== "login-screen") {
                        await page.locator(
                            `#login-screen [data-screen="${id}"]`
                        ).click();
                    }
                }
            }

            await expectOnlyScreen(page, id);

            const fitsWidth = await page.evaluate(() =>
                document.documentElement.scrollWidth <= window.innerWidth
            );
            expect(fitsWidth).toBe(true);
        }
    });
}