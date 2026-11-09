package com.robofleet.robosim.controller;

import com.robofleet.robosim.repository.ArmMovementRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.robofleet.robosim.model.UserAccount;
import com.robofleet.robosim.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
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
import org.springframework.transaction.annotation.Transactional;
import org.junit.jupiter.params.provider.CsvSource;
import java.util.HashMap;

import java.util.Map;
import java.util.Objects;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// Check arm endpoints with real login sessions and a separate test database.
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:arm_controller_tests",
        "spring.jpa.hibernate.ddl-auto=create-drop",
        "spring.mail.username=sender@example.com",
        "spring.mail.password=test-only-password",
        "app.base-url=http://localhost:8080"
})
@AutoConfigureMockMvc
@Transactional
class ArmControllerTest {

    private static final String PASSWORD = "RobotTest123!";

    // Check that old movements are actually removed from the database.
    @Autowired
    private ArmMovementRepository movementRepository;

    // Send HTTP requests through Spring without starting a separate server.
    @Autowired
    private MockMvc mockMvc;

    // Convert movement data and login details into JSON.
    @Autowired
    private ObjectMapper objectMapper;

    // Create the accounts used to check access and history ownership.
    @Autowired
    private UserRepository userRepository;

    // Store test passwords using the application's password encoder.
    @Autowired
    private PasswordEncoder passwordEncoder;

    // Prevent the test environment from sending real emails.
    @MockBean
    private JavaMailSender mailSender;

    // Prepare two verified users. Each test transaction is rolled back afterwards.
    @BeforeEach
    void setUp() {
        createVerifiedAccount("armuser");
        createVerifiedAccount("otheruser");
    }

    // Create a verified account that can use the normal login endpoint.
    private void createVerifiedAccount(String username) {
        UserAccount account = new UserAccount(
                username,
                username + "@example.com",
                passwordEncoder.encode(PASSWORD)
        );
        account.setEnabled(true);
        userRepository.saveAndFlush(account);
    }

    // Return JSON that has been checked for null before sending a request.
    @NonNull
    private String json(Object value) throws Exception {
        return Objects.requireNonNull(
                objectMapper.writeValueAsString(value)
        );
    }

    // Log in through the existing endpoint instead of building a fake login.
    @NonNull
    private MockHttpSession loginAs(String username) throws Exception {
        var result = mockMvc.perform(post("/api/auth/login")
                        .contentType("application/json")
                        .content(json(Map.of(
                                "identifier", username,
                                "password", PASSWORD
                        ))))
                .andExpect(status().isOk())
                .andReturn();

        return (MockHttpSession) Objects.requireNonNull(
                result.getRequest().getSession(false),
                "Successful login must create a session."
        );
    }

    // Read the request token through the endpoint used by the frontend.
    @NonNull
    private String csrfToken(@NonNull MockHttpSession session)
            throws Exception {
        var result = mockMvc.perform(get("/api/auth/session")
                        .session(session))
                .andExpect(status().isOk())
                .andReturn();

        String token = objectMapper.readTree(
                result.getResponse().getContentAsString()
        ).path("csrfToken").asText();

        assertFalse(token.isBlank());
        return Objects.requireNonNull(token);
    }

    // Provide a normal movement command in degrees and degrees per second.
    private Map<String, Double> movement(double roll, double speed) {
        return Map.of(
                "roll", roll,
                "pitch", 20.0,
                "yaw", 30.0,
                "speed", speed
        );
    }

    // Save a valid command using the user's session and request token.
    private void saveMovement(
            @NonNull MockHttpSession session,
            double roll) throws Exception {
        mockMvc.perform(post("/api/arm/move")
                        .session(session)
                        .header("X-CSRF-Token", csrfToken(session))
                        .contentType("application/json")
                        .content(json(movement(roll, 15.0))))
                .andExpect(status().isCreated());
    }

    // Confirm that a saved command can be read back from the user's history.
    @Test
    void savesMovementAndReturnsItInHistory() throws Exception {
        MockHttpSession session = loginAs("armuser");

        mockMvc.perform(post("/api/arm/move")
                        .session(session)
                        .header("X-CSRF-Token", csrfToken(session))
                        .contentType("application/json")
                        .content(json(movement(10.5, 15.0))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.roll").value(10.5))
                .andExpect(jsonPath("$.pitch").value(20.0))
                .andExpect(jsonPath("$.yaw").value(30.0))
                .andExpect(jsonPath("$.speed").value(15.0))
                .andExpect(jsonPath("$.user").doesNotExist())
                .andExpect(jsonPath("$.passwordHash").doesNotExist());

        mockMvc.perform(get("/api/arm/history").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].roll").value(10.5))
                .andExpect(jsonPath("$[0].pitch").value(20.0))
                .andExpect(jsonPath("$[0].yaw").value(30.0))
                .andExpect(jsonPath("$[0].speed").value(15.0));
    }

    // Require login for saving, reading and clearing arm movements.
    @Test
    void rejectsRequestsWithoutLogin() throws Exception {
        mockMvc.perform(post("/api/arm/move")
                        .contentType("application/json")
                        .content(json(movement(10.0, 15.0))))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(get("/api/arm/history"))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(delete("/api/arm/history"))
                .andExpect(status().isUnauthorized());
    }

    // Keep histories separate even when a request names another user.
    @Test
    void returnsOnlyTheCurrentUsersHistory() throws Exception {
        MockHttpSession firstSession = loginAs("armuser");
        MockHttpSession secondSession = loginAs("otheruser");

        saveMovement(firstSession, 10.0);
        saveMovement(secondSession, 40.0);

        mockMvc.perform(get("/api/arm/history")
                        .session(firstSession)
                        .param("username", "otheruser"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].roll").value(10.0));

        mockMvc.perform(get("/api/arm/history")
                        .session(secondSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].roll").value(40.0));
    }

    // Clear the current user's commands without changing another user's history.
    @Test
    void clearsOnlyTheCurrentUsersHistory() throws Exception {
        MockHttpSession firstSession = loginAs("armuser");
        MockHttpSession secondSession = loginAs("otheruser");

        saveMovement(firstSession, 10.0);
        saveMovement(secondSession, 40.0);

        mockMvc.perform(delete("/api/arm/history")
                        .session(firstSession)
                        .header("X-CSRF-Token", csrfToken(firstSession)))
                .andExpect(status().isNoContent());

        mockMvc.perform(get("/api/arm/history")
                        .session(firstSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));

        mockMvc.perform(get("/api/arm/history")
                        .session(secondSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].roll").value(40.0));
    }

    // Reject changes without a valid token and keep existing history unchanged.
    @ParameterizedTest
    @ValueSource(strings = {"", "incorrect-token"})
    void rejectsChangesWithoutValidToken(String suppliedToken)
            throws Exception {
        MockHttpSession session = loginAs("armuser");
        saveMovement(session, 10.0);

        var saveRequest = post("/api/arm/move")
                .session(session)
                .contentType("application/json")
                .content(json(movement(40.0, 15.0)));

        var clearRequest = delete("/api/arm/history")
                .session(session);

        // An empty test value represents a completely missing token header.
        if (!suppliedToken.isEmpty()) {
            saveRequest.header("X-CSRF-Token", suppliedToken);
            clearRequest.header("X-CSRF-Token", suppliedToken);
        }

        mockMvc.perform(saveRequest)
                .andExpect(status().isForbidden());

        mockMvc.perform(clearRequest)
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/arm/history").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].roll").value(10.0));
    }

    // Reject speeds that cannot produce a forward-running animation.
    @ParameterizedTest
    @ValueSource(doubles = {0.0, -5.0})
    void rejectsZeroOrNegativeSpeed(double speed) throws Exception {
        MockHttpSession session = loginAs("armuser");

        mockMvc.perform(post("/api/arm/move")
                        .session(session)
                        .header("X-CSRF-Token", csrfToken(session))
                        .contentType("application/json")
                        .content(json(movement(10.0, speed))))
                .andExpect(status().isBadRequest());

        // Invalid commands must not create history entries.
        mockMvc.perform(get("/api/arm/history").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }
    
    // Reject missing or null fields without adding anything to history.
    @ParameterizedTest
    @CsvSource({
            "roll, missing",
            "roll, null",
            "pitch, missing",
            "pitch, null",
            "yaw, missing",
            "yaw, null",
            "speed, missing",
            "speed, null"
    })
    void rejectsMissingOrNullMovementFields(
            String field,
            String inputType) throws Exception {

        MockHttpSession session = loginAs("armuser");

        // Start with valid values and change only the field being tested.
        Map<String, Object> details = new HashMap<>(
                movement(10.0, 15.0)
        );

        // A missing field is absent; a null field is present without a value.
        if (inputType.equals("missing")) {
            details.remove(field);
        } else {
            details.put(field, null);
        }

        // The backend must explain that the command is invalid.
        mockMvc.perform(post("/api/arm/move")
                        .session(session)
                        .header("X-CSRF-Token", csrfToken(session))
                        .contentType("application/json")
                        .content(json(details)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").isNotEmpty());

        // Rejected input must not leave a movement in the database.
        mockMvc.perform(get("/api/arm/history").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    // Accept both angle boundaries and yaw values beyond a full rotation.
    @ParameterizedTest
    @CsvSource({
            "-165.0, -75.0, -720.0",
            "-165.0, 75.0, 720.0",
            "165.0, -75.0, -360.5",
            "165.0, 75.0, 360.5"
    })
    void acceptsAngleBoundariesAndUnrestrictedYaw(
            double roll,
            double pitch,
            double yaw) throws Exception {

        MockHttpSession session = loginAs("armuser");

        mockMvc.perform(post("/api/arm/move")
                        .session(session)
                        .header("X-CSRF-Token", csrfToken(session))
                        .contentType("application/json")
                        .content(json(Map.of(
                                "roll", roll,
                                "pitch", pitch,
                                "yaw", yaw,
                                "speed", 15.0
                        ))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.roll").value(roll))
                .andExpect(jsonPath("$.pitch").value(pitch))
                .andExpect(jsonPath("$.yaw").value(yaw));
    }

    // Reject values just outside each allowed range.
    @ParameterizedTest
    @CsvSource({
            "-165.01, 0.0",
            "165.01, 0.0",
            "0.0, -75.01",
            "0.0, 75.01"
    })
    void rejectsAnglesOutsideAllowedRanges(
            double roll,
            double pitch) throws Exception {

        MockHttpSession session = loginAs("armuser");

        mockMvc.perform(post("/api/arm/move")
                        .session(session)
                        .header("X-CSRF-Token", csrfToken(session))
                        .contentType("application/json")
                        .content(json(Map.of(
                                "roll", roll,
                                "pitch", pitch,
                                "yaw", 0.0,
                                "speed", 15.0
                        ))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").isNotEmpty());

        // Invalid angles must not create a history entry.
        mockMvc.perform(get("/api/arm/history").session(session))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    // Keep the latest 50 commands without deleting another user's movements.
    @Test
    void keepsOnlyLatestFiftyMovementsPerUser() throws Exception {
        MockHttpSession firstSession = loginAs("armuser");
        MockHttpSession secondSession = loginAs("otheruser");

        // Save another user's command first to check ownership during cleanup.
        saveMovement(secondSession, -10.0);

        // Use different roll values to identify the order of saved commands.
        for (int number = 1; number <= 50; number++) {
            saveMovement(firstSession, number);
        }

        mockMvc.perform(get("/api/arm/history").session(firstSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(50))
                .andExpect(jsonPath("$[0].roll").value(1.0))
                .andExpect(jsonPath("$[49].roll").value(50.0));

        // Command 51 should remove command 1 from this user's history.
        saveMovement(firstSession, 51.0);

        mockMvc.perform(get("/api/arm/history").session(firstSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(50))
                .andExpect(jsonPath("$[0].roll").value(2.0))
                .andExpect(jsonPath("$[49].roll").value(51.0));

        // Check that cleanup continues to work on the next command.
        saveMovement(firstSession, 52.0);

        mockMvc.perform(get("/api/arm/history").session(firstSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(50))
                .andExpect(jsonPath("$[0].roll").value(3.0))
                .andExpect(jsonPath("$[49].roll").value(52.0));

        mockMvc.perform(get("/api/arm/history").session(secondSession))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].roll").value(-10.0));

        // The database must contain 50 commands for one user and 1 for the other.
        org.junit.jupiter.api.Assertions.assertEquals(
                51L,
                movementRepository.count()
        );
    }
}