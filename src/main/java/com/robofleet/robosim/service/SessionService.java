package com.robofleet.robosim.service;

import com.robofleet.robosim.model.UserAccount;
import com.robofleet.robosim.repository.UserRepository;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.HttpStatus;
import org.springframework.lang.Nullable;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

// Check the existing login session before allowing protected operations.
@Service
public class SessionService {

    private final UserRepository userRepository;

    // Receive the repository used to check that the account is still active.
    public SessionService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    // Identify the user from the server session, not from request parameters.
    public UserAccount requireAccount(@Nullable HttpSession session) {
        if (session == null
                || !(session.getAttribute("authenticatedUserId")
                instanceof Long userId)) {
            throw loginRequired();
        }

        UserAccount account = userRepository.findById(userId)
                .orElse(null);

        // Stop accepting sessions for deleted or disabled accounts.
        if (account == null || !account.isEnabled()) {
            session.invalidate();
            throw loginRequired();
        }

        return account;
    }

    // Require the session's token before saving or deleting data.
    public void requireCsrfToken(
            @Nullable HttpSession session,
            @Nullable String suppliedToken) {

        if (session == null) {
            throw loginRequired();
        }

        Object storedToken = session.getAttribute("csrfToken");

        // Compare tokens without using a normal string equality check.
        if (!(storedToken instanceof String expectedToken)
                || expectedToken.isBlank()
                || suppliedToken == null
                || !MessageDigest.isEqual(
                        expectedToken.getBytes(StandardCharsets.UTF_8),
                        suppliedToken.getBytes(StandardCharsets.UTF_8)
                )) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "Invalid request token. Refresh the page and try again."
            );
        }
    }

    // Use the same login-required response as the account endpoints.
    private ResponseStatusException loginRequired() {
        return new ResponseStatusException(
                HttpStatus.UNAUTHORIZED,
                "Please log in to continue."
        );
    }
}