package com.robofleet.robosim.repository;

import com.robofleet.robosim.model.UserAccount;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.lang.NonNull;

import static org.junit.jupiter.api.Assertions.*;

// Test the repository with a temporary database.
// Database changes are rolled back after each test.
@DataJpaTest
class UserRepositoryTest {

    // Use the real repository to save and search for accounts.
    @Autowired
    private UserRepository userRepository;

    // Clear loaded entities so searches read the saved database records.
    @Autowired
    private TestEntityManager entityManager;

    // Always return a new account with example data for the tests.
    @NonNull
    private UserAccount createTestAccount() {
        UserAccount account = new UserAccount(
                "testuser",
                "testuser@example.com",
                "dummy-hash-for-testing"
        );

        account.setVerificationToken("test-token-001");
        return account;
    }

    // Check that an account is stored and can be found by its username.
    @Test
    void savesAccountAndFindsItByUsername() {
        UserAccount saved = userRepository.saveAndFlush(
                createTestAccount()
        );
        Long savedId = saved.getId();

        entityManager.clear();

        UserAccount found = userRepository
                .findByUsername("testuser")
                .orElseThrow();

        assertNotNull(savedId);
        assertEquals(savedId, found.getId());
        assertEquals("testuser@example.com", found.getEmail());
        assertEquals(
                "dummy-hash-for-testing",
                found.getPasswordHash()
        );
        assertFalse(found.isEnabled());
    }

    // Check that the email search returns the correct saved account.
    @Test
    void findsAccountByEmail() {
        userRepository.saveAndFlush(createTestAccount());
        entityManager.clear();

        UserAccount found = userRepository
                .findByEmail("testuser@example.com")
                .orElseThrow();

        assertEquals("testuser", found.getUsername());
    }

    // Check that a verification token identifies the correct account.
    @Test
    void findsAccountByVerificationToken() {
        userRepository.saveAndFlush(createTestAccount());
        entityManager.clear();

        UserAccount found = userRepository
                .findByVerificationToken("test-token-001")
                .orElseThrow();

        assertEquals("testuser", found.getUsername());
        assertFalse(found.isEnabled());
    }

    // Check that unknown account details do not return an account.
    @Test
    void returnsEmptyForUnknownAccountDetails() {
        userRepository.saveAndFlush(createTestAccount());
        entityManager.clear();

        assertTrue(
                userRepository.findByUsername("unknown-user").isEmpty()
        );
        assertTrue(
                userRepository.findByEmail("unknown@example.com").isEmpty()
        );
        assertTrue(
                userRepository.findByVerificationToken("unknown-token")
                        .isEmpty()
        );
    }

    // Check the methods used to detect existing usernames and emails.
    @Test
    void checksWhetherUsernameAndEmailExist() {
        userRepository.saveAndFlush(createTestAccount());
        entityManager.clear();

        assertTrue(userRepository.existsByUsername("testuser"));
        assertTrue(userRepository.existsByEmail("testuser@example.com"));

        assertFalse(userRepository.existsByUsername("unknown-user"));
        assertFalse(userRepository.existsByEmail("unknown@example.com"));
    }

    // Check that two accounts cannot use the same username.
    @Test
    void rejectsDuplicateUsername() {
        userRepository.saveAndFlush(createTestAccount());

        UserAccount duplicate = new UserAccount(
                "testuser",
                "another@example.com",
                "another-dummy-hash"
        );
        duplicate.setVerificationToken("test-token-002");

        assertThrows(
                DataIntegrityViolationException.class,
                () -> userRepository.saveAndFlush(duplicate)
        );
    }

    // Check that two accounts cannot use the same email address.
    @Test
    void rejectsDuplicateEmail() {
        userRepository.saveAndFlush(createTestAccount());

        UserAccount duplicate = new UserAccount(
                "anotheruser",
                "testuser@example.com",
                "another-dummy-hash"
        );
        duplicate.setVerificationToken("test-token-002");

        assertThrows(
                DataIntegrityViolationException.class,
                () -> userRepository.saveAndFlush(duplicate)
        );
    }
}