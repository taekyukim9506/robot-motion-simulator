package com.robofleet.robosim.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

// Store each user account as one row in the user_accounts table.
@Entity
@Table(name = "user_accounts")
public class UserAccount {

    // Let the database generate a unique number for each account.
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Prevent two accounts from using the same username.
    @Column(nullable = false, unique = true)
    private String username;

    // Store the email address used to verify the account.
    @Column(nullable = false, unique = true)
    private String email;

    // Store a password hash instead of the user's original password.
    @Column(nullable = false)
    private String passwordHash;

    // Keep the account disabled until its email address is verified.
    @Column(nullable = false)
    private boolean enabled = false;

    // Store the temporary token used by the email verification link.
    @Column(unique = true)
    private String verificationToken;

    // Allow JPA to create account objects when reading database records.
    protected UserAccount() {
    }

    // Create an account using details checked by the registration code.
    public UserAccount(String username, String email, String passwordHash) {
        this.username = username;
        this.email = email;
        this.passwordHash = passwordHash;
    }

    // Return the unique database ID of this account.
    public Long getId() {
        return id;
    }

    // Return the username used to identify the account.
    public String getUsername() {
        return username;
    }

    // Return the email address linked to the account.
    public String getEmail() {
        return email;
    }

    // Return the stored hash for password checking on the backend.
    public String getPasswordHash() {
        return passwordHash;
    }

    // Replace the stored hash when the user changes their password.
    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    // Check whether the account has completed email verification.
    public boolean isEnabled() {
        return enabled;
    }

    // Change the account status after email verification.
    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    // Return the token used to confirm the email address.
    public String getVerificationToken() {
        return verificationToken;
    }

    // Set a verification token or clear it after successful verification.
    public void setVerificationToken(String verificationToken) {
        this.verificationToken = verificationToken;
    }
}