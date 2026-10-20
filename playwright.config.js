const { defineConfig } = require("@playwright/test");

// Set the test folder and run one browser test at a time.
module.exports = defineConfig({
    testDir: "./tests/browser",
    workers: 1,

    // Display terminal results and save an HTML report.
    reporter: [
        ["list"],
        ["html", { open: "never" }]
    ],

    use: {
        // Use this address when a test opens a relative path such as "/".
        baseURL: "http://localhost:8080",
        browserName: "chromium",
        viewport: { width: 1280, height: 800 },

        // Save evidence to help investigate failed tests.
        screenshot: "only-on-failure",
        trace: "retain-on-failure"
    }
});