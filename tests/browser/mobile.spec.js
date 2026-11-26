const { test, expect } = require("@playwright/test");

// Open the mobile simulator with a signed-in test account.
test.beforeEach(async ({ page }) => {
    await page.route("**/api/auth/session", async (route) => {
        await route.fulfill({
            status: 200,
            json: {
                username: "mobileuser",
                email: "mobileuser@example.com",
                csrfToken: "mobile-browser-test-token"
            }
        });
    });

    await page.goto("/");
    await expect(page.locator("#user-greeting")).toHaveText("Hello, mobileuser!");
    await page.locator("#launch-mobile-btn").click();
    await expect(page.locator("#mobile-screen")).toBeVisible();
});

// Enter the target position and speed through the movement form.
async function fillMovement(page, x, y, speed) {
    await page.locator("#mobile-x").fill(String(x));
    await page.locator("#mobile-y").fill(String(y));
    await page.locator("#mobile-speed").fill(String(speed));
}

// Read a displayed coordinate as a number so formatting does not affect the test.
async function readCoordinate(page, axis) {
    const text = await page.locator(`#mobile-current-${axis}`).innerText();
    expect(text.trim()).not.toBe("");
    return Number(text);
}

// A distance of five grid units at two units per second takes 2.5 seconds.
test("moves in a straight line at the requested speed", async ({ page }) => {
    let savedCommand;
    let requestToken;

    await page.route("**/api/mobile/move", async (route) => {
        savedCommand = route.request().postDataJSON();
        requestToken = route.request().headers()["x-csrf-token"];

        await route.fulfill({
            status: 201,
            json: { id: 1, ...savedCommand }
        });
    });

    // Start at the origin and choose a target three units right and four up.
    expect(await readCoordinate(page, "x")).toBe(0);
    expect(await readCoordinate(page, "y")).toBe(0);
    await fillMovement(page, 3, 4, 2);

    // Control the browser clock so the timing check works on slower laptops.
    await page.clock.install({
        time: new Date("2030-01-01T00:00:00Z")
    });
    await page.clock.pauseAt(new Date("2030-01-01T00:01:00Z"));

    await page.getByRole("button", { name: "Move Robot", exact: true }).click();
    await expect(page.locator("#mobile-message")).toHaveText("Movement accepted.");

    expect(savedCommand).toEqual({ x: 3, y: 4, speed: 2 });
    expect(requestToken).toBe("mobile-browser-test-token");

    // Halfway through the movement, both coordinates should be halfway too.
    await page.clock.fastForward(1250);

    expect(await readCoordinate(page, "x")).toBeCloseTo(1.5, 1);
    expect(await readCoordinate(page, "y")).toBeCloseTo(2, 1);

    // Allow one extra frame for the final position to appear.
    await page.clock.fastForward(1300);

    expect(await readCoordinate(page, "x")).toBe(3);
    expect(await readCoordinate(page, "y")).toBe(4);
    await expect(
        page.getByRole("button", { name: "Move Robot", exact: true })
    ).toBeEnabled();
});

// A rejected command should show the server message and keep the robot still.
test("keeps the current position when the server rejects a command", async ({ page }) => {
    await page.route("**/api/mobile/move", async (route) => {
        await route.fulfill({
            status: 400,
            json: { message: "Movement rejected." }
        });
    });

    await fillMovement(page, -2.5, 4.75, 3);
    await page.getByRole("button", { name: "Move Robot", exact: true }).click();

    await expect(page.locator("#mobile-message")).toHaveText("Movement rejected.");
    expect(await readCoordinate(page, "x")).toBe(0);
    expect(await readCoordinate(page, "y")).toBe(0);
    await expect(page.locator("#mobile-x")).toHaveValue("-2.5");
});

// Catch an invalid speed in the browser before it reaches the backend.
test("rejects zero speed before sending a command", async ({ page }) => {
    let requestCount = 0;

    await page.route("**/api/mobile/move", async (route) => {
        requestCount++;
        await route.fulfill({
            status: 400,
            json: { message: "Unexpected request." }
        });
    });

    await fillMovement(page, 3, 4, 0);
    await page.getByRole("button", { name: "Move Robot", exact: true }).click();

    await expect(page.locator("#mobile-message")).toHaveText(
        "Speed must be greater than zero."
    );
    expect(requestCount).toBe(0);
});

// Zoom and pan change the grid view. Recentring brings the robot back into view.
test("zooms, pans and recentres the grid", async ({ page }) => {
    const grid = page.locator("#mobile-grid");
    const panel = page.locator("#mobile-screen");

    await expect(grid).toBeVisible();
    await grid.scrollIntoViewIfNeeded();

    const originalView = await grid.screenshot();

    await panel.getByRole("button", { name: "Zoom in", exact: true }).click();

    await expect.poll(async () => {
        return (await grid.screenshot()).equals(originalView);
    }).toBe(false);

    const zoomedView = await grid.screenshot();

    // Drag from the middle of the grid so the pointer stays inside it.
    const box = await grid.boundingBox();
    const centreX = box.x + box.width / 2;
    const centreY = box.y + box.height / 2;

    await page.mouse.move(centreX, centreY);
    await page.mouse.down();
    await page.mouse.move(centreX + 60, centreY + 35, { steps: 5 });
    await page.mouse.up();

    await expect.poll(async () => {
        return (await grid.screenshot()).equals(zoomedView);
    }).toBe(false);

    // Recentring should keep the selected zoom and leave the robot at (0, 0).
    await panel.getByRole("button", { name: "Recenter", exact: true }).click();

    await expect.poll(async () => {
        return (await grid.screenshot()).equals(zoomedView);
    }).toBe(true);

    expect(await readCoordinate(page, "x")).toBe(0);
    expect(await readCoordinate(page, "y")).toBe(0);
});