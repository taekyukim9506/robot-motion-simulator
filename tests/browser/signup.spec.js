const { test, expect } = require("@playwright/test");

// Use example details so the tests do not need a real account.
const account = {
    username: "testuser",
    email: "testuser@example.com",
    password: "RobotTest123!",
    confirmPassword: "RobotTest123!"
};

// Open the signup screen through the existing navigation buttons.
async function openSignup(page) {
    await page.goto("/");

    await page
        .locator('#home-screen [data-screen="login-screen"]')
        .click();

    await page
        .locator('#login-screen [data-screen="signup-screen"]')
        .click();

    await expect(page.locator("#signup-screen")).toBeVisible();
}

// Fill every signup field, with optional changes for each test case.
async function fillSignup(page, changes = {}) {
    const details = { ...account, ...changes };

    await page.locator("#signup-username").fill(details.username);
    await page.locator("#signup-email").fill(details.email);
    await page.locator("#signup-password").fill(details.password);

    await page
        .locator("#signup-confirm-password")
        .fill(details.confirmPassword);
}

// Find the submit button inside the signup form.
function signupButton(page) {
    return page.locator('#signup-form button[type="submit"]');
}

// Check that the form sends the correct details and shows success.
test("shows a verification message after successful signup", async ({
    page
}) => {
    let submittedDetails;
    let submittedMethod;

    await page.route("**/api/auth/register", async (route) => {
        submittedDetails = route.request().postDataJSON();
        submittedMethod = route.request().method();

        await route.fulfill({
            status: 201,
            json: {
                message:
                    "Registration successful. Check your email to verify your account."
            }
        });
    });

    await openSignup(page);
    await fillSignup(page);
    await signupButton(page).click();

    await expect(page.locator("#signup-message")).toHaveText(
        "Registration successful. Check your email to verify your account."
    );

    expect(submittedMethod).toBe("POST");
    expect(submittedDetails).toEqual(account);

    // Clear password fields after registration to avoid leaving them visible.
    await expect(page.locator("#signup-password")).toHaveValue("");
    await expect(page.locator("#signup-confirm-password")).toHaveValue("");
});

// Reject different passwords before contacting the registration backend.
test("blocks signup when the passwords do not match", async ({ page }) => {
    let registrationRequests = 0;

    await page.route("**/api/auth/register", async (route) => {
        registrationRequests += 1;

        await route.fulfill({
            status: 400,
            json: {
                message: "Unexpected registration request."
            }
        });
    });

    await openSignup(page);
    await fillSignup(page, {
        confirmPassword: "DifferentPassword123!"
    });

    await signupButton(page).click();

    await expect(page.locator("#signup-message")).toHaveText(
        "Passwords do not match."
    );

    expect(registrationRequests).toBe(0);
    await expect(signupButton(page)).toBeEnabled();
});

// Check that backend errors appear in the form and allow another attempt.
const backendErrors = [
    {
        name: "duplicate username",
        status: 400,
        message: "Username is already taken."
    },
    {
        name: "email service failure",
        status: 503,
        message:
            "We could not send the verification email. Please try again later."
    }
];

for (const errorCase of backendErrors) {
    test(`shows the error for ${errorCase.name}`, async ({ page }) => {
        await page.route("**/api/auth/register", async (route) => {
            await route.fulfill({
                status: errorCase.status,
                json: {
                    message: errorCase.message
                }
            });
        });

        await openSignup(page);
        await fillSignup(page);
        await signupButton(page).click();

        await expect(page.locator("#signup-message")).toHaveText(
            errorCase.message
        );

        await expect(signupButton(page)).toBeEnabled();

        // Keep non-sensitive details so the user can correct the form.
        await expect(page.locator("#signup-username")).toHaveValue(
            account.username
        );

        await expect(page.locator("#signup-email")).toHaveValue(
            account.email
        );
    });
}

// Show a clear message when the browser cannot reach the backend.
test("allows another attempt after a connection failure", async ({
    page
}) => {
    await page.route("**/api/auth/register", async (route) => {
        await route.abort("failed");
    });

    await openSignup(page);
    await fillSignup(page);
    await signupButton(page).click();

    await expect(page.locator("#signup-message")).toHaveText(
        "Unable to connect to the server. Please try again."
    );

    await expect(signupButton(page)).toBeEnabled();
});