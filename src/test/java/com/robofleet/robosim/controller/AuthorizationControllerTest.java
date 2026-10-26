package com.robofleet.robosim.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.robofleet.robosim.model.UserAccount;
import com.robofleet.robosim.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import java.util.HashMap;
import java.util.Map;
import java.util.stream.Stream;
import java.util.Objects;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// Test the real account endpoints with a separate in-memory database.
// Use example mail settings so no personal credentials are required.
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:registration_tests",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.mail.username=sender@example.com",
        "spring.mail.password=test-only-password",
        "app.base-url=http://localhost:8080"
})
@AutoConfigureMockMvc
class AuthorizationControllerTest {

    // Send test requests through Spring's actual controller handling.
    @Autowired
    private MockMvc mockMvc;

    // Convert request data into JSON.
    @Autowired
    private ObjectMapper objectMapper;

    // Inspect the accounts stored by the registration service.
    @Autowired
    private UserRepository userRepository;

    // Verify hashes using the application's configured password encoder.
    @Autowired
    private PasswordEncoder passwordEncoder;

    // Replace the real mail sender to prevent external email delivery.
    @MockBean
    private JavaMailSender mailSender;

    // Start each test with an empty database and a fresh mail mock.
    @BeforeEach
    void setUp() {
        userRepository.deleteAll();
        reset(mailSender);
    }

    // Provide valid example details that individual tests can change.
    private Map<String, String> validRequest() {
        Map<String, String> request = new HashMap<>();
        request.put("username", "testuser");
        request.put("email", "testuser@example.com");
        request.put("password", "RobotTest123!");
        request.put("confirmPassword", "RobotTest123!");
        return request;
    }

    // Submit a registration request using the same JSON format as the frontend.
    private ResultActions register(Map<String, String> request)
            throws Exception {
        String requestBody = Objects.requireNonNull(
                objectMapper.writeValueAsString(request),
                "The registration request body must not be null."
        );

        return mockMvc.perform(post("/api/auth/register")
                .contentType("application/json")
                .content(requestBody));
    }

    // Check account storage, password hashing and the verification email.
    @SuppressWarnings("null")
    @Test
    void registersDisabledAccountAndSendsVerificationEmail() throws Exception {
        register(validRequest())
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.message").value(
                        "Registration successful. Check your email to verify your account."
                ));

        UserAccount account = userRepository.findByUsername("testuser")
                .orElseThrow();

        assertEquals(1, userRepository.count());
        assertEquals("testuser@example.com", account.getEmail());
        assertFalse(account.isEnabled());
        assertNotNull(account.getVerificationToken());
        assertFalse(account.getVerificationToken().isBlank());

        // Confirm that registration saved a hash instead of the raw password.
        assertNotEquals("RobotTest123!", account.getPasswordHash());
        assertTrue(passwordEncoder.matches(
                "RobotTest123!", account.getPasswordHash()
        ));
        assertFalse(passwordEncoder.matches(
                "WrongPassword123!", account.getPasswordHash()
        ));

        // Inspect the message passed to the mocked mail sender.
        ArgumentCaptor<SimpleMailMessage> messageCaptor =
                ArgumentCaptor.forClass(SimpleMailMessage.class);

        verify(mailSender).send(messageCaptor.capture());

        SimpleMailMessage message = messageCaptor.getValue();
        assertEquals("sender@example.com", message.getFrom());
        assertArrayEquals(
                new String[]{"testuser@example.com"},
                message.getTo()
        );
        assertEquals(
                "Verify your Robot Motion Simulator account",
                message.getSubject()
        );

        String body = message.getText();
        assertNotNull(body);
        assertTrue(body.contains(
                "http://localhost:8080/api/auth/confirm?token="
                        + account.getVerificationToken()
        ));
        assertFalse(body.contains("RobotTest123!"));
    }

    // Check that identifier spaces and email letter case are normalised.
    @Test
    void normalisesUsernameAndEmail() throws Exception {
        Map<String, String> request = validRequest();
        request.put("username", "  testuser  ");
        request.put("email", "  TestUser@Example.COM  ");

        register(request).andExpect(status().isCreated());

        UserAccount account = userRepository.findByUsername("testuser")
                .orElseThrow();

        assertEquals("testuser@example.com", account.getEmail());
    }

    // Reject a duplicate username or email without creating another account.
    @ParameterizedTest
    @ValueSource(strings = {"username", "email"})
    void rejectsDuplicateAccountDetails(String duplicateField) throws Exception {
        register(validRequest()).andExpect(status().isCreated());
        clearInvocations(mailSender);

        Map<String, String> request = validRequest();

        if (duplicateField.equals("username")) {
            request.put("email", "another@example.com");
        } else {
            request.put("username", "anotheruser");
        }

        String expectedMessage = duplicateField.equals("username")
                ? "Username is already taken."
                : "Email is already registered.";

        register(request)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value(expectedMessage));

        assertEquals(1, userRepository.count());
        verifyNoInteractions(mailSender);
    }

    // Define invalid values for required fields and password rules.
    static Stream<Arguments> invalidRegistrationData() {
        return Stream.of(
                Arguments.of("username", null),
                Arguments.of("username", "   "),
                Arguments.of("username", "u".repeat(51)),
                Arguments.of("email", null),
                Arguments.of("email", "not-an-email"),
                Arguments.of("password", null),
                Arguments.of("password", "Ab1!"),
                Arguments.of("password", "robot123!"),
                Arguments.of("password", "RobotTest123"),
                Arguments.of("password", "A!" + "a".repeat(71)),
                Arguments.of("confirmPassword", "Different123!"),
                Arguments.of("confirmPassword", null)
        );
    }

    // Check that invalid requests create no account and send no email.
    @ParameterizedTest(name = "Reject invalid {0}: case {index}")
    @MethodSource("invalidRegistrationData")
    void rejectsInvalidRegistrationDetails(String field, String value)
            throws Exception {
        Map<String, String> request = validRequest();

        // A null test value means that the field is missing from the request.
        if (value == null) {
            request.remove(field);
        } else {
            request.put(field, value);
        }

        // Match confirmation when testing a password rule on its own.
        if (field.equals("password")) {
            if (value == null) {
                request.remove("confirmPassword");
            } else {
                request.put("confirmPassword", value);
            }
        }

        register(request)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").isNotEmpty());

        assertEquals(0, userRepository.count());
        verifyNoInteractions(mailSender);
    }

    // Check that the verification link enables the account and clears its token.
    @Test
    void verifiesAccountAndRemovesToken() throws Exception {
        register(validRequest()).andExpect(status().isCreated());

        String token = userRepository.findByUsername("testuser")
                .orElseThrow()
                .getVerificationToken();

        clearInvocations(mailSender);

        mockMvc.perform(get("/api/auth/confirm").param("token", token))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith(
                        "text/html"
                ));

        UserAccount verified = userRepository.findByUsername("testuser")
                .orElseThrow();

        assertTrue(verified.isEnabled());
        assertNull(verified.getVerificationToken());
        verifyNoInteractions(mailSender);
    }

    // Reject unknown or empty tokens while keeping the account disabled.
    @ParameterizedTest
    @ValueSource(strings = {"unknown-token", ""})
    void rejectsInvalidVerificationToken(String token) throws Exception {
        register(validRequest()).andExpect(status().isCreated());

        mockMvc.perform(get("/api/auth/confirm").param("token", token))
                .andExpect(status().isBadRequest());

        UserAccount account = userRepository.findByUsername("testuser")
                .orElseThrow();

        assertFalse(account.isEnabled());
        assertNotNull(account.getVerificationToken());
    }

    // Check that a successful verification link cannot be used again.
    @Test
    void rejectsReusedVerificationToken() throws Exception {
        register(validRequest()).andExpect(status().isCreated());

        String token = userRepository.findByUsername("testuser")
                .orElseThrow()
                .getVerificationToken();

        mockMvc.perform(get("/api/auth/confirm").param("token", token))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/auth/confirm").param("token", token))
                .andExpect(status().isBadRequest());

        assertTrue(userRepository.findByUsername("testuser")
                .orElseThrow()
                .isEnabled());
    }

    // Check that mail failure rolls back registration and allows a later retry.
    // Mockito matchers use placeholders when setting up and checking calls.
    @SuppressWarnings("null")
    @Test
    void rollsBackAccountWhenEmailSendingFails() throws Exception {
        doThrow(new MailSendException("Simulated mail failure"))
                .when(mailSender).send(any(SimpleMailMessage.class));

        register(validRequest())
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.message").value(
                        "We could not send the verification email. Please try again later."
                ));

        assertEquals(0, userRepository.count());

        // Restore successful mail behaviour and retry the same account details.
        reset(mailSender);

        register(validRequest()).andExpect(status().isCreated());

        assertEquals(1, userRepository.count());
        assertFalse(userRepository.findByUsername("testuser")
                .orElseThrow()
                .isEnabled());
        verify(mailSender).send(any(SimpleMailMessage.class));
    }
}