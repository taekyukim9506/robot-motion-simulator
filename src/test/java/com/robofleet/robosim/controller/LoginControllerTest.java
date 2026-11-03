package com.robofleet.robosim.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.robofleet.robosim.model.UserAccount;
import com.robofleet.robosim.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.lang.NonNull;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// Check login and logout using real components and a separate test database.
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:login_tests",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.mail.username=sender@example.com",
        "spring.mail.password=test-only-password",
        "app.base-url=http://localhost:8080"
})
@AutoConfigureMockMvc
class LoginControllerTest {

    private static final String PASSWORD = "RobotTest123!";

    // Send requests through Spring's controller handling.
    @Autowired
    private MockMvc mockMvc;

    // Convert login details into JSON.
    @Autowired
    private ObjectMapper objectMapper;

    // Prepare accounts in the separate test database.
    @Autowired
    private UserRepository userRepository;

    // Use the application's configured password encoder.
    @Autowired
    private PasswordEncoder passwordEncoder;

    // Prevent these tests from sending real emails.
    @MockBean
    private JavaMailSender mailSender;

    // Create one verified account and one awaiting email verification.
    @BeforeEach
    void setUp() {
        userRepository.deleteAll();

        UserAccount verified = new UserAccount(
                "testuser",
                "testuser@example.com",
                passwordEncoder.encode(PASSWORD)
        );
        verified.setEnabled(true);
        userRepository.saveAndFlush(verified);

        UserAccount unverified = new UserAccount(
                "pendinguser",
                "pending@example.com",
                passwordEncoder.encode(PASSWORD)
        );
        unverified.setEnabled(false);
        unverified.setVerificationToken("pending-test-token");
        userRepository.saveAndFlush(unverified);
    }

    // Submit login details using the JSON format expected by the controller.
    private ResultActions login(Map<String, String> details)
            throws Exception {
        String body = Objects.requireNonNull(
                objectMapper.writeValueAsString(details)
        );

        return mockMvc.perform(post("/api/auth/login")
                .contentType("application/json")
                .content(body));
    }

    // Provide valid details that individual tests can change.
    private Map<String, String> validLoginDetails() {
        Map<String, String> details = new HashMap<>();
        details.put("identifier", "testuser");
        details.put("password", PASSWORD);
        return details;
    }

    // Log in and return a session that has been checked for null.
    @NonNull
    private MockHttpSession loginAndGetSession() throws Exception {
        MvcResult result = login(validLoginDetails())
                .andExpect(status().isOk())
                .andReturn();

        return (MockHttpSession) Objects.requireNonNull(
                result.getRequest().getSession(false),
                "Successful login must create a session."
        );
    }

    // Allow verified users to log in with their username or email.
    @ParameterizedTest
    @ValueSource(strings = {
            "testuser",
            "testuser@example.com"
    })
    void acceptsUsernameOrEmail(String identifier) throws Exception {
        login(Map.of(
                "identifier", identifier,
                "password", PASSWORD
        ))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("testuser"))
                .andExpect(jsonPath("$.email").value(
                        "testuser@example.com"
                ))
                .andExpect(jsonPath("$.password").doesNotExist())
                .andExpect(jsonPath("$.passwordHash").doesNotExist())
                .andExpect(jsonPath("$.verificationToken").doesNotExist());
    }

    // Use the same error for unknown accounts and incorrect passwords.
    @ParameterizedTest
    @CsvSource({
            "testuser, WrongPassword123!",
            "unknownuser, RobotTest123!"
    })
    void rejectsIncorrectCredentials(String identifier, String password)
            throws Exception {
        MockHttpSession session = new MockHttpSession();

        String body = Objects.requireNonNull(
                objectMapper.writeValueAsString(Map.of(
                        "identifier", identifier,
                        "password", password
                ))
        );

        mockMvc.perform(post("/api/auth/login")
                        .session(session)
                        .contentType("application/json")
                        .content(body))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value(
                        "Invalid username/email or password."
                ));

        // A failed login must not grant access to account details.
        mockMvc.perform(get("/api/auth/session").session(session))
                .andExpect(status().isUnauthorized());
    }

    // Reject missing or blank fields before checking account credentials.
    @ParameterizedTest
    @CsvSource({
            "identifier, missing",
            "identifier, blank",
            "password, missing",
            "password, blank"
    })
    void rejectsMissingOrBlankDetails(String field, String inputType)
            throws Exception {
        Map<String, String> details = validLoginDetails();

        if (inputType.equals("missing")) {
            details.remove(field);
        } else {
            details.put(field, "   ");
        }

        login(details)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").isNotEmpty());
    }

    // Keep accounts blocked until their email address is verified.
    @Test
    void rejectsUnverifiedAccount() throws Exception {
        login(Map.of(
                "identifier", "pendinguser",
                "password", PASSWORD
        ))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value(
                        "Please verify your email before logging in."
                ));
    }

    // Do not accept a username in the URL as proof of login.
    @Test
    void rejectsSessionRequestWithoutLogin() throws Exception {
        mockMvc.perform(get("/api/auth/session")
                        .param("username", "testuser"))
                .andExpect(status().isUnauthorized());
    }

    // Recognise the user on later requests using the authenticated session.
    @Test
    void returnsAccountDetailsForAuthenticatedSession() throws Exception {
        MockHttpSession session = loginAndGetSession();

        mockMvc.perform(get("/api/auth/session").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("testuser"))
                .andExpect(jsonPath("$.email").value(
                        "testuser@example.com"
                ))
                .andExpect(jsonPath("$.password").doesNotExist())
                .andExpect(jsonPath("$.passwordHash").doesNotExist())
                .andExpect(jsonPath("$.verificationToken").doesNotExist());

        // A separate browser session must still be unauthenticated.
        mockMvc.perform(get("/api/auth/session")
                        .session(new MockHttpSession()))
                .andExpect(status().isUnauthorized());
    }

    // Replace the session ID after login to prevent session fixation.
    @Test
    void changesSessionIdAfterSuccessfulLogin() throws Exception {
        MockHttpSession originalSession = new MockHttpSession();
        String originalId = originalSession.getId();

        String body = Objects.requireNonNull(
                objectMapper.writeValueAsString(validLoginDetails())
        );

        MvcResult result = mockMvc.perform(post("/api/auth/login")
                        .session(originalSession)
                        .contentType("application/json")
                        .content(body))
                .andExpect(status().isOk())
                .andReturn();

        MockHttpSession authenticatedSession =
                (MockHttpSession) Objects.requireNonNull(
                        result.getRequest().getSession(false)
                );

        assertNotEquals(originalId, authenticatedSession.getId());

        mockMvc.perform(get("/api/auth/session")
                        .session(authenticatedSession))
                .andExpect(status().isOk());
    }

    // End only the current session while keeping the account available.
    @Test
    void logoutInvalidatesOnlyTheCurrentSession() throws Exception {
        MockHttpSession firstSession = loginAndGetSession();
        MockHttpSession secondSession = loginAndGetSession();

        // Read the token through the endpoint used by the frontend.
        MvcResult sessionResult = mockMvc.perform(
                        get("/api/auth/session").session(firstSession))
                .andExpect(status().isOk())
                .andReturn();

        String csrfToken = objectMapper.readTree(
                sessionResult.getResponse().getContentAsString()
        ).path("csrfToken").asText();

        assertFalse(csrfToken.isBlank());

        // Send the token when asking the server to end the session.
        mockMvc.perform(post("/api/auth/logout")
                        .session(firstSession)
                        .header("X-CSRF-Token", csrfToken))
                .andExpect(status().isNoContent());

        assertTrue(firstSession.isInvalid());

        // A request without an authenticated session must be rejected.
        mockMvc.perform(get("/api/auth/session"))
                .andExpect(status().isUnauthorized());

        // Logging out one session must not end another session.
        mockMvc.perform(get("/api/auth/session").session(secondSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.username").value("testuser"));

        // Logout must not delete the user's account.
        assertTrue(userRepository.existsByUsername("testuser"));
    }

    // Reject logout requests with a missing or incorrect token.
    @ParameterizedTest
    @ValueSource(strings = {"", "incorrect-token"})
    void rejectsLogoutWithoutValidToken(String token) throws Exception {
        MockHttpSession session = loginAndGetSession();

        var request = post("/api/auth/logout").session(session);

        if (!token.isEmpty()) {
            request.header("X-CSRF-Token", token);
        }

        mockMvc.perform(request)
                .andExpect(status().isForbidden());

        // A rejected logout request must leave the session active.
        assertFalse(session.isInvalid());

        mockMvc.perform(get("/api/auth/session").session(session))
                .andExpect(status().isOk());
    }

    // Reject browser form submissions because login requires JSON.
    @Test
    void rejectsFormEncodedLogin() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .contentType("application/x-www-form-urlencoded")
                        .param("identifier", "testuser")
                        .param("password", PASSWORD))
                .andExpect(status().isUnsupportedMediaType());
    }
}