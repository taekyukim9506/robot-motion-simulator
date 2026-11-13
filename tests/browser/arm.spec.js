const { test, expect } = require("@playwright/test");

// Use a simulated account to test the signed-in arm controls.
const account = {
    username: "armuser",
    email: "armuser@example.com",
    csrfToken: "arm-browser-test-token"
};

// Open the arm screen after the page restores the simulated session.
async function openArm(page) {
    await page.goto("/");

    await expect(page.locator("#user-greeting")).toHaveText(
        "Hello, armuser!"
    );

    await page.locator("#launch-arm-btn").click();
    await expect(page.locator("#arm-screen")).toBeVisible();
}

// Fill all movement fields using the same names as the backend.
async function fillMovement(page, values = {}) {
    const command = {
        roll: 10.5,
        pitch: -20.5,
        yaw: 30,
        speed: 15,
        ...values
    };

    for (const [field, value] of Object.entries(command)) {
        await page.locator(`#arm-${field}`).fill(String(value));
    }

    return command;
}

// Locate the submit button even while its text changes during a request.
function moveButton(page) {
    return page.locator('#arm-form button[type="submit"]');
}

// Provide a valid session and prevent accidental real movement requests.
test.beforeEach(async ({ page }) => {
    await page.route("**/api/auth/session", async (route) => {
        await route.fulfill({
            status: 200,
            json: account
        });
    });

    await page.route("**/api/arm/move", async (route) => {
        await route.fulfill({
            status: 500,
            json: {
                message: "No movement response was configured for this test."
            }
        });
    });
});

// Check accessible labels, initial values and the agreed angle limits.
test("shows labelled movement controls and default values", async ({ page }) => {
    await openArm(page);

    const form = page.locator("#arm-form");

    await expect(
        form.getByLabel("Roll (degrees)", { exact: true })
    ).toHaveValue("0");

    await expect(
        form.getByLabel("Pitch (degrees)", { exact: true })
    ).toHaveValue("0");

    await expect(
        form.getByLabel("Yaw (degrees)", { exact: true })
    ).toHaveValue("0");

    await expect(
        form.getByLabel("Speed (degrees/second)", { exact: true })
    ).toHaveValue("15");

    await expect(page.locator("#arm-roll")).toHaveAttribute("min", "-165");
    await expect(page.locator("#arm-roll")).toHaveAttribute("max", "165");
    await expect(page.locator("#arm-pitch")).toHaveAttribute("min", "-75");
    await expect(page.locator("#arm-pitch")).toHaveAttribute("max", "75");

    // Yaw must allow rotations beyond one complete turn in either direction.
    expect(await page.locator("#arm-yaw").getAttribute("min")).toBeNull();
    expect(await page.locator("#arm-yaw").getAttribute("max")).toBeNull();

    await expect(moveButton(page)).toBeEnabled();
});

// Check both positive and negative yaw beyond a full rotation.
for (const yaw of [720.5, -720.5]) {
    test(`submits numeric movement values with yaw ${yaw}`, async ({ page }) => {
        let submittedRequest;

        await page.route("**/api/arm/move", async (route) => {
            submittedRequest = {
                method: route.request().method(),
                token: route.request().headers()["x-csrf-token"],
                body: route.request().postDataJSON()
            };

            await route.fulfill({
                status: 201,
                json: {
                    id: 1,
                    ...submittedRequest.body
                }
            });
        });

        await openArm(page);
        const command = await fillMovement(page, { yaw });
        await moveButton(page).click();

        // Wait for visible feedback before checking the captured request.
        await expect(page.locator("#arm-message")).toHaveText(
            "Movement accepted."
        );

        expect(submittedRequest.method).toBe("POST");
        expect(submittedRequest.token).toBe(account.csrfToken);
        expect(submittedRequest.body).toEqual(command);
    });
}

// Reject invalid input in the browser before sending a movement request.
test("blocks invalid angles, speeds and empty fields", async ({ page }) => {
    let requestCount = 0;

    await page.route("**/api/arm/move", async (route) => {
        requestCount++;

        await route.fulfill({
            status: 201,
            json: {
                id: requestCount,
                ...route.request().postDataJSON()
            }
        });
    });

    await openArm(page);

    const invalidInputs = [
        { field: "roll", value: "-165.01" },
        { field: "roll", value: "165.01" },
        { field: "pitch", value: "-75.01" },
        { field: "pitch", value: "75.01" },
        { field: "speed", value: "0" },
        { field: "speed", value: "-1" },
        { field: "roll", value: "" },
        { field: "pitch", value: "" },
        { field: "yaw", value: "" },
        { field: "speed", value: "" }
    ];

    for (const invalidInput of invalidInputs) {
        // Reset the form values so each attempt contains one invalid field.
        await fillMovement(page);
        await page.locator(`#arm-${invalidInput.field}`).fill(
            invalidInput.value
        );

        await moveButton(page).click();

        await expect(page.locator("#arm-screen")).toBeVisible();
        await expect(moveButton(page)).toBeEnabled();
    }

    expect(requestCount).toBe(0);
});

// Display validation and request-token errors returned by the backend.
for (const errorCase of [
    {
        name: "invalid movement",
        status: 400,
        message: "Roll must be between -165.0 and 165.0 degrees."
    },
    {
        name: "invalid request token",
        status: 403,
        message: "Invalid request token. Refresh the page and try again."
    }
]) {
    test(`shows the backend error for ${errorCase.name}`, async ({ page }) => {
        await page.route("**/api/arm/move", async (route) => {
            await route.fulfill({
                status: errorCase.status,
                json: { message: errorCase.message }
            });
        });

        await openArm(page);
        await fillMovement(page);
        await moveButton(page).click();

        await expect(page.locator("#arm-message")).toHaveText(
            errorCase.message
        );

        await expect(page.locator("#arm-roll")).toHaveValue("10.5");
        await expect(moveButton(page)).toBeEnabled();
        await expect(page.locator("#arm-screen")).toBeVisible();
    });
}

// Allow another attempt when the movement request cannot reach the server.
test("allows retry after a movement connection failure", async ({ page }) => {
    await page.route("**/api/arm/move", async (route) => {
        await route.abort("failed");
    });

    await openArm(page);
    await fillMovement(page);
    await moveButton(page).click();

    await expect(page.locator("#arm-message")).toHaveText(
        "Unable to connect to the server. Please try again."
    );

    await expect(moveButton(page)).toBeEnabled();
    await expect(page.locator("#arm-screen")).toBeVisible();
});

// Return to login when the backend reports that the session has expired.
test("returns to login when the movement session has expired", async ({ page }) => {
    await page.route("**/api/arm/move", async (route) => {
        await route.fulfill({
            status: 401,
            json: { message: "Please log in to continue." }
        });
    });

    await openArm(page);
    await fillMovement(page);
    await moveButton(page).click();

    await expect(page.locator("#login-screen")).toBeVisible();
    await expect(page.locator("#arm-screen")).toBeHidden();

    await expect(page.locator("#login-message")).toHaveText(
        "Your session has expired. Please log in again."
    );

    // Returning home must not restore access to the protected arm screen.
    await page.locator(
        '#login-screen [data-screen="home-screen"]'
    ).click();

    await expect(page.locator("#open-login-btn")).toBeVisible();
    await expect(page.locator("#logout-btn")).toBeHidden();

    await page.locator("#launch-arm-btn").click();
    await expect(page.locator("#login-screen")).toBeVisible();
});