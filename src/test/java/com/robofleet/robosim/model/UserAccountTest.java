package com.robofleet.robosim.model;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;

// Check account rules that do not require a running database.
class UserAccountTest {

    // A new account must stay disabled until email verification is complete.
    @Test
    void newAccountIsDisabledByDefault() {
        UserAccount account = new UserAccount(
                "testuser",
                "testuser@example.com",
                "dummy-hash-for-testing"
        );

        assertFalse(account.isEnabled());
    }
}