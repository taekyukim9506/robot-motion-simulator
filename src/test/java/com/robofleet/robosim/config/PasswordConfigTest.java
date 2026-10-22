package com.robofleet.robosim.config;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

// Load our password configuration and check the encoder it provides.
@SpringJUnitConfig(PasswordConfig.class)
class PasswordConfigTest {

    // Use the encoder created by PasswordConfig.
    @Autowired
    private PasswordEncoder passwordEncoder;

    // Check that encoding hides the original value while allowing verification.
    @Test
    void encodesPasswordAndAcceptsCorrectPassword() {
        String password = "RobotTest123!";

        String passwordHash = passwordEncoder.encode(password);

        assertNotEquals(password, passwordHash);
        assertTrue(passwordEncoder.matches(password, passwordHash));
    }

    // Check that a different password cannot match the stored hash.
    @Test
    void rejectsIncorrectPassword() {
        String passwordHash = passwordEncoder.encode("RobotTest123!");

        boolean matches = passwordEncoder.matches(
                "WrongPassword456!",
                passwordHash
        );

        assertFalse(matches);
    }
}