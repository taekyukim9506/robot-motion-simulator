package com.robofleet.robosim.controller;

import com.robofleet.robosim.service.RegistrationService;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mail.MailException;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

// Provide the account registration and verification endpoints.
@RestController
@RequestMapping("/api/auth")
public class AuthorizationController {

    private final RegistrationService registrationService;

    // Receive the service that handles account creation and verification.
    public AuthorizationController(RegistrationService registrationService) {
        this.registrationService = registrationService;
    }

    // Read signup details and return a message for the frontend.
    @PostMapping("/register")
    public ResponseEntity<Map<String, String>> register(
            @RequestBody Map<String, String> request) {

        try {
            registrationService.register(
                    request.get("username"),
                    request.get("email"),
                    request.get("password"),
                    request.get("confirmPassword")
            );

            return ResponseEntity.status(HttpStatus.CREATED).body(Map.of(
                    "message",
                    "Registration successful. Check your email to verify your account."
            ));

        // Explain invalid input or account details already in use.
        } catch (IllegalArgumentException exception) {
            return ResponseEntity.badRequest().body(Map.of(
                    "message", exception.getMessage()
            ));

        // Handle duplicate accounts created by requests arriving together.
        } catch (DataIntegrityViolationException exception) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of(
                    "message", "The username or email is already registered."
            ));

        // Report email failure without exposing mail server details.
        } catch (MailException exception) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of(
                            "message",
                            "We could not send the verification email. Please try again later."
                    ));
        }
    }

    // Display the verification result when an email link is opened.
    @GetMapping(value = "/confirm", produces = MediaType.TEXT_HTML_VALUE)
    public ResponseEntity<String> confirmEmail(
            @RequestParam(name = "token", defaultValue = "") String token) {

        try {
            registrationService.confirmEmail(token);

            return ResponseEntity.ok("""
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Email verified</title>
                    </head>
                    <body>
                        <main>
                            <h1>Email verified successfully</h1>
                            <p>Your account is now verified.</p>
                            <a href="/">Return to Robot Motion Simulator</a>
                        </main>
                    </body>
                    </html>
                    """);

        // Reject links that do not match an unused verification token.
        } catch (IllegalArgumentException exception) {
            return ResponseEntity.badRequest().body("""
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Invalid verification link</title>
                    </head>
                    <body>
                        <main>
                            <h1>Verification failed</h1>
                            <p>This link is invalid or has already been used.</p>
                            <a href="/">Return to Robot Motion Simulator</a>
                        </main>
                    </body>
                    </html>
                    """);
        }
    }
}