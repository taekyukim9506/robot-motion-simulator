package com.robofleet.robosim.controller;

import com.robofleet.robosim.model.UserAccount;
import com.robofleet.robosim.repository.UserRepository;
import com.robofleet.robosim.service.LoginService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Map;
import java.util.Objects;

// Provide login, session checking and logout endpoints.
@RestController
@RequestMapping("/api/auth")
public class LoginController {

    private static final String USER_ID = "authenticatedUserId";
    private static final String CSRF_TOKEN = "csrfToken";

    private final LoginService loginService;
    private final UserRepository userRepository;
    private final SecureRandom secureRandom = new SecureRandom();

    // Receive the service and repository used to identify account owners.
    public LoginController(
            LoginService loginService,
            UserRepository userRepository) {
        this.loginService = loginService;
        this.userRepository = userRepository;
    }

    // Accept JSON login details and establish an authenticated session.
    @PostMapping(value = "/login", consumes = "application/json")
    public ResponseEntity<Map<String, String>> login(
            @RequestBody Map<String, String> details,
            HttpServletRequest request) {

        UserAccount account = loginService.authenticate(
                details.get("identifier"),
                details.get("password")
        );

        // Replace any earlier session so its ID cannot be reused after login.
        HttpSession previousSession = request.getSession(false);

        if (previousSession != null) {
            previousSession.invalidate();
        }

        HttpSession session = Objects.requireNonNull(
                request.getSession(true)
        );

        session.setAttribute(USER_ID, account.getId());
        session.setAttribute(CSRF_TOKEN, createCsrfToken());

        return accountResponse(account, session);
    }

    // Read the signed-in account from the server session.
    @GetMapping("/session")
    public ResponseEntity<Map<String, String>> currentSession(
            HttpServletRequest request) {

        HttpSession session = request.getSession(false);
        UserAccount account = requireAccount(session);

        return accountResponse(
                account,
                Objects.requireNonNull(session)
        );
    }

    // Check the request token before ending the current session.
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(
            HttpServletRequest request,
            @RequestHeader(
                    name = "X-CSRF-Token",
                    required = false
            ) String suppliedToken) {

        HttpSession session = request.getSession(false);
        requireAccount(session);

        HttpSession authenticatedSession =
                Objects.requireNonNull(session);

        Object storedToken =
                authenticatedSession.getAttribute(CSRF_TOKEN);

        // Reject requests that do not contain the session's correct token.
        if (!(storedToken instanceof String expectedToken)
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

        // End this session without deleting the account or other sessions.
        authenticatedSession.invalidate();

        return ResponseEntity.noContent()
                .header("Cache-Control", "no-store")
                .build();
    }

    // Reject missing sessions and accounts that are no longer available.
    private UserAccount requireAccount(HttpSession session) {
        if (session == null
                || !(session.getAttribute(USER_ID) instanceof Long userId)) {
            throw loginRequired();
        }

        UserAccount account = userRepository.findById(userId)
                .orElse(null);

        if (account == null || !account.isEnabled()) {
            session.invalidate();
            throw loginRequired();
        }

        return account;
    }

    // Return only the account details and token needed by the frontend.
    private ResponseEntity<Map<String, String>> accountResponse(
            UserAccount account,
            HttpSession session) {

        String token = Objects.requireNonNull(
                (String) session.getAttribute(CSRF_TOKEN)
        );

        return ResponseEntity.ok()
                .header("Cache-Control", "no-store")
                .body(Map.of(
                        "username", account.getUsername(),
                        "email", account.getEmail(),
                        "csrfToken", token
                ));
    }

    // Generate an unpredictable token for each successful login.
    private String createCsrfToken() {
        byte[] bytes = new byte[32];
        secureRandom.nextBytes(bytes);

        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(bytes);
    }

    // Explain that the request needs an authenticated session.
    private ResponseStatusException loginRequired() {
        return new ResponseStatusException(
                HttpStatus.UNAUTHORIZED,
                "Please log in to continue."
        );
    }

    // Return predictable JSON messages for account request errors.
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> handleAccountError(
            ResponseStatusException exception) {

        String message = exception.getReason();

        return ResponseEntity.status(exception.getStatusCode())
                .header("Cache-Control", "no-store")
                .body(Map.of(
                        "message",
                        message == null ? "Account request failed." : message
                ));
    }
}