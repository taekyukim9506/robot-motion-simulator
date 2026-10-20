package com.robofleet.robosim.repository;

import com.robofleet.robosim.model.UserAccount;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

// Provide database operations for user accounts.
// JpaRepository already includes methods such as save and findById.
public interface UserRepository extends JpaRepository<UserAccount, Long> {

    // Find an account by the username entered during login.
    Optional<UserAccount> findByUsername(String username);

    // Find an account by its email address.
    Optional<UserAccount> findByEmail(String email);

    // Find the account linked to an email verification token.
    Optional<UserAccount> findByVerificationToken(String verificationToken);

    // Check whether a username is already registered.
    boolean existsByUsername(String username);

    // Check whether an email address is already registered.
    boolean existsByEmail(String email);
}