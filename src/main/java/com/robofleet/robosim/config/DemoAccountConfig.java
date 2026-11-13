package com.robofleet.robosim.config;

import com.robofleet.robosim.model.UserAccount;
import com.robofleet.robosim.repository.UserRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.crypto.password.PasswordEncoder;

// Create a ready-to-use test account only when demo mode is active.
@Configuration
public class DemoAccountConfig {

    // Run after Spring has prepared the application and database.
    @Bean
    public CommandLineRunner createDemoAccount(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder) {

        return args -> {
            // Use example details that do not belong to a real email account.
            String username = "test";
            String email = "test";

            // Keep existing accounts unchanged if either identifier is taken.
            if (userRepository.existsByUsername(username)
                    || userRepository.existsByEmail(email)) {
                return;
            }

            // Hash the demo password using the existing password encoder.
            String passwordHash = passwordEncoder.encode("test123!@#");

            UserAccount account = new UserAccount(
                    username,
                    email,
                    passwordHash
            );

            // Allow this local test account to log in without email verification.
            account.setEnabled(true);
            account.setVerificationToken(null);

            // Save the account before the application is used.
            userRepository.saveAndFlush(account);
        };
    }
}