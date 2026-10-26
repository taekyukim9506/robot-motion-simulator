package com.robofleet.robosim.service;

import com.robofleet.robosim.model.UserAccount;
import com.robofleet.robosim.repository.UserRepository;
import jakarta.mail.internet.AddressException;
import jakarta.mail.internet.InternetAddress;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.UUID;

// Manage account registration and email verification.
@Service
public class RegistrationService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JavaMailSender mailSender;
    private final String senderEmail;
    private final String baseUrl;

    // Receive the database, password encoder and email settings from Spring.
    public RegistrationService(
            UserRepository userRepository,
            PasswordEncoder passwordEncoder,
            JavaMailSender mailSender,
            @Value("${spring.mail.username:}") String senderEmail,
            @Value("${app.base-url}") String baseUrl) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.mailSender = mailSender;
        this.senderEmail = senderEmail;
        this.baseUrl = baseUrl;
    }

    // Validate the details and create an account awaiting email verification.
    // Roll back the database changes if saving or sending the email fails.
    @Transactional
    public void register(
            String username,
            String email,
            String password,
            String confirmPassword) {

        // Remove surrounding spaces from account identifiers.
        String cleanUsername = username == null ? "" : username.strip();
        String cleanEmail = email == null
                ? ""
                : email.strip().toLowerCase(Locale.ROOT);

        validateDetails(cleanUsername, cleanEmail, password, confirmPassword);

        // Reject identifiers already used by another account.
        if (userRepository.existsByUsername(cleanUsername)) {
            throw new IllegalArgumentException("Username is already taken.");
        }

        if (userRepository.existsByEmail(cleanEmail)) {
            throw new IllegalArgumentException("Email is already registered.");
        }

        // Store a password hash and generate a random verification token.
        String passwordHash = passwordEncoder.encode(password);
        String token = UUID.randomUUID().toString();

        UserAccount account = new UserAccount(
                cleanUsername,
                cleanEmail,
                passwordHash
        );
        account.setEnabled(false);
        account.setVerificationToken(token);

        // Check database constraints before attempting to send the email.
        userRepository.saveAndFlush(account);

        sendVerificationEmail(cleanEmail, token);
    }

    // Check the required fields before creating an account.
    private void validateDetails(
            String username,
            String email,
            String password,
            String confirmPassword) {

        if (username.isBlank() || username.length() > 50) {
            throw new IllegalArgumentException(
                    "Username must contain between 1 and 50 characters."
            );
        }

        // Check the address format before passing it to the mail sender.
        if (email.isBlank() || email.length() > 254
                || !email.matches("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")) {
            throw new IllegalArgumentException("Enter a valid email address.");
        }

        try {
            new InternetAddress(email, true).validate();
        } catch (AddressException exception) {
            throw new IllegalArgumentException("Enter a valid email address.");
        }

        // Keep passwords unchanged, including any spaces the user entered.
        if (password == null || password.isBlank() || password.length() < 8) {
            throw new IllegalArgumentException(
                    "Password must contain at least 8 characters."
            );
        }

        // Keep the password within BCrypt's supported input size.
        if (password.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new IllegalArgumentException(
                    "Password is too long. Use no more than 72 UTF-8 bytes."
            );
        }

        // Preserve the capital-letter rule from the original application.
        if (!password.matches("(?s).*[A-Z].*")) {
            throw new IllegalArgumentException(
                    "Password must contain at least one capital letter."
            );
        }

        // Require at least one punctuation or symbol character.
        if (!password.matches("(?s).*[\\p{P}\\p{S}].*")) {
            throw new IllegalArgumentException(
                    "Password must contain at least one special character."
            );
        }

        if (!password.equals(confirmPassword)) {
            throw new IllegalArgumentException("Passwords do not match.");
        }
    }

    // Send the link that allows the account owner to verify their email.
    private void sendVerificationEmail(String email, String token) {
        if (senderEmail.isBlank()) {
            throw new MailSendException("The sender email is not configured.");
        }

        String confirmationUrl =
                baseUrl + "/api/auth/confirm?token=" + token;

        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(senderEmail);
        message.setTo(email);
        message.setSubject("Verify your Robot Motion Simulator account");
        message.setText(
                "Please verify your email address by opening this link:\n\n"
                        + confirmationUrl
                        + "\n\nIf you did not request this account, "
                        + "you can ignore this email."
        );

        mailSender.send(message);
    }

    // Enable the matching account and remove its token after verification.
    @Transactional
    public void confirmEmail(String token) {
        if (token == null || token.isBlank()) {
            throw new IllegalArgumentException(
                    "The verification link is invalid or has already been used."
            );
        }

        UserAccount account = userRepository.findByVerificationToken(token)
                .orElseThrow(() -> new IllegalArgumentException(
                        "The verification link is invalid or has already been used."
                ));

        account.setEnabled(true);
        account.setVerificationToken(null);
        userRepository.saveAndFlush(account);
    }
}