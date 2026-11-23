const { test, expect } = require("@playwright/test");

// Open the arm screen with a test session and an accepted movement response.
test.beforeEach(async ({ page }) => {
    await page.route("**/api/auth/session", async (route) => {
        await route.fulfill({
            status: 200,
            json: {
                username: "tester",
                email: "tester@example.com",
                csrfToken: "animation-test-token"
            }
        });
    });

    await page.route("**/api/arm/move", async (route) => {
        await route.fulfill({
            status: 201,
            json: {
                id: 1,
                ...route.request().postDataJSON()
            }
        });
    });

    await page.goto("/");
    await page.locator("#launch-arm-btn").click();
    await expect(page.locator("#arm-scene canvas")).toBeVisible();
});

// Start a movement with a controlled clock so the test can check exact times.
async function startTurn(page, yaw, speed) {
    await page.locator("#arm-yaw").fill(String(yaw));
    await page.locator("#arm-speed").fill(String(speed));

    await page.clock.install({
        time: new Date("2030-01-01T00:00:00Z")
    });

    await page.clock.pauseAt(new Date("2030-01-01T00:01:00Z"));

    await page.locator('#arm-form button[type="submit"]').click();
    await expect(page.locator("#arm-message")).toHaveText("Movement accepted.");
}

// Check that the arm completes two full turns in either direction.
for (const target of [720, -720]) {
    test(`animates the full yaw movement to ${target} degrees`, async ({ page }) => {
        await startTurn(page, target, 180);

        await expect(page.locator("#arm-total")).toHaveText("4.0");

        // After one second, the arm should have covered a quarter of the turn.
        await page.clock.fastForward(1000);

        const currentYaw = Number(
            await page.locator("#arm-current-yaw").textContent()
        );

        expect(Math.abs(currentYaw - target / 4)).toBeLessThan(4);

        // The final pose should show the full angle entered by the user.
        await page.clock.fastForward(3100);

        await expect(page.locator("#arm-current-yaw")).toHaveText(String(target));
        await expect(page.locator("#arm-elapsed")).toHaveText("4.0");
        await expect(page.locator("#arm-pause")).toBeDisabled();
    });
}

// Check that pausing freezes the timer and resetting does not save another move.
test("pauses, resumes and resets a movement", async ({ page }) => {
    let savedMovements = 0;

    page.on("request", (request) => {
        if (request.url().endsWith("/api/arm/move")) {
            savedMovements++;
        }
    });

    await startTurn(page, 120, 30);
    await page.clock.fastForward(1000);
    await page.getByRole("button", { name: "Pause", exact: true }).click();

    const yaw = page.locator("#arm-current-yaw");
    const elapsed = page.locator("#arm-elapsed");
    const pausedYaw = await yaw.textContent();
    const pausedTime = await elapsed.textContent();

    // Five seconds of paused time must not change the arm or its timer.
    await page.clock.fastForward(5000);
    await expect(yaw).toHaveText(pausedYaw);
    await expect(elapsed).toHaveText(pausedTime);

    await page.getByRole("button", { name: "Resume", exact: true }).click();
    await page.clock.fastForward(1000);

    expect(Number(await yaw.textContent())).toBeGreaterThan(Number(pausedYaw));

    // Reset during movement and check that the old animation stays stopped.
    await page.getByRole("button", { name: "Reset arm", exact: true }).click();
    await page.clock.fastForward(5000);

    await expect(yaw).toHaveText("0");
    await expect(elapsed).toHaveText("0.0");
    await expect(page.locator("#arm-total")).toHaveText("0.0");
    await expect(page.locator('#arm-form button[type="submit"]')).toBeEnabled();

    expect(savedMovements).toBe(1);
});

// Check that dragging the camera changes the view without moving the arm.
test("rotates the camera and restores the starting view", async ({ page }) => {
    const canvas = page.locator("#arm-scene canvas");
    const resetView = page.getByRole("button", { name: "Reset view" });

    await expect(resetView).toBeEnabled();
    await canvas.scrollIntoViewIfNeeded();

    const originalView = await canvas.screenshot();
    const box = await canvas.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 80, y + 25, { steps: 5 });
    await page.mouse.up();

    expect((await canvas.screenshot()).equals(originalView)).toBe(false);

    await resetView.click();

    await expect.poll(async () => {
        return (await canvas.screenshot()).equals(originalView);
    }).toBe(true);

    await expect(page.locator("#arm-current-yaw")).toHaveText("0");
});

// Check that a rejected command leaves the arm at its previous pose.
test("keeps the neutral pose after a rejected movement", async ({ page }) => {
    await page.route("**/api/arm/move", async (route) => {
        await route.fulfill({
            status: 400,
            json: { message: "Movement rejected." }
        });
    });

    await page.locator("#arm-pitch").fill("45");
    await page.locator('#arm-form button[type="submit"]').click();

    await expect(page.locator("#arm-message")).toHaveText("Movement rejected.");
    await expect(page.locator("#arm-current-pitch")).toHaveText("0");
    await expect(page.locator("#arm-total")).toHaveText("0.0");
    await expect(page.locator("#arm-pause")).toBeDisabled();
});