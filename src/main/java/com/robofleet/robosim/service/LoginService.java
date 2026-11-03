package com.robofleet.robosim.service;

import com.robofleet.robosim.model.UserAccount;
import com.robofleet.robosim.repository.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.util.Locale;

// Check login details using accounts stored in the database.
@Service
public class LoginService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final String dummyPasswordHash;

    // Receive the repository and the existing password encoder.
    public LoginService(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;

        // Perform a password check even when the account does not exist.
        this.dummyPasswordHash =
                passwordEncoder.encode("UnusedDummyPassword123!");
    }

    // Accept an account only when its password and verification are valid.
    public UserAccount authenticate(String identifier, String password) {
        if (identifier == null || identifier.isBlank()
                || password == null || password.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Enter your username/email and password."
            );
        }

        // Reject oversized input before searching or checking the hash.
        if (identifier.length() > 254
                || password.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw invalidCredentials();
        }

        String cleanIdentifier = identifier.strip();

        // Search for an exact username first, then a normalised email.
        UserAccount account = userRepository
                .findByUsername(cleanIdentifier)
                .orElseGet(() -> userRepository.findByEmail(
                        cleanIdentifier.toLowerCase(Locale.ROOT)
                ).orElse(null));

        // Check the entered password against a hash, never plain text.
        String storedHash = account == null
                ? dummyPasswordHash
                : account.getPasswordHash();

        boolean passwordMatches =
                passwordEncoder.matches(password, storedHash);

        if (account == null || !passwordMatches) {
            throw invalidCredentials();
        }

        // Check verification only after accepting the password.
        if (!account.isEnabled()) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Please verify your email before logging in."
            );
        }

        return account;
    }

    // Use the same message for unknown accounts and incorrect passwords.
    private ResponseStatusException invalidCredentials() {
        return new ResponseStatusException(
                HttpStatus.UNAUTHORIZED,
                "Invalid username/email or password."
        );
    }
}