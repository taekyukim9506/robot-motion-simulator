package com.robofleet.robosim.controller;

import com.robofleet.robosim.model.UserAccount;
import com.robofleet.robosim.service.ArmMovementService;
import com.robofleet.robosim.service.ArmMovementService.MovementRequest;
import com.robofleet.robosim.service.ArmMovementService.MovementResponse;
import com.robofleet.robosim.service.SessionService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

// Provide protected endpoints for arm commands and movement history.
@RestController
@RequestMapping("/api/arm")
public class ArmController {

    private final ArmMovementService movementService;
    private final SessionService sessionService;

    // Receive the services used for movement data and access checks.
    public ArmController(
            ArmMovementService movementService,
            SessionService sessionService) {
        this.movementService = movementService;
        this.sessionService = sessionService;
    }

    // Save a command only after checking the login session and request token.
    @PostMapping(value = "/move", consumes = "application/json")
    public ResponseEntity<MovementResponse> move(
            @RequestBody MovementRequest movement,
            HttpServletRequest request,
            @RequestHeader(
                    name = "X-CSRF-Token",
                    required = false
            ) String suppliedToken) {

        HttpSession session = request.getSession(false);
        UserAccount account = sessionService.requireAccount(session);
        sessionService.requireCsrfToken(session, suppliedToken);

        MovementResponse saved =
                movementService.saveMovement(account, movement);

        return ResponseEntity.status(HttpStatus.CREATED)
                .header("Cache-Control", "no-store")
                .body(saved);
    }

    // Return only the history belonging to the signed-in account.
    @GetMapping("/history")
    public ResponseEntity<List<MovementResponse>> history(
            HttpServletRequest request) {

        UserAccount account = sessionService.requireAccount(
                request.getSession(false)
        );

        return ResponseEntity.ok()
                .header("Cache-Control", "no-store")
                .body(movementService.getHistory(account));
    }

    // Clear the signed-in user's history after checking the request token.
    @DeleteMapping("/history")
    public ResponseEntity<Void> clearHistory(
            HttpServletRequest request,
            @RequestHeader(
                    name = "X-CSRF-Token",
                    required = false
            ) String suppliedToken) {

        HttpSession session = request.getSession(false);
        UserAccount account = sessionService.requireAccount(session);
        sessionService.requireCsrfToken(session, suppliedToken);

        movementService.clearHistory(account);

        return ResponseEntity.noContent()
                .header("Cache-Control", "no-store")
                .build();
    }

    // Return clear JSON messages for access and movement validation errors.
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> handleMovementError(
            ResponseStatusException exception) {

        String message = exception.getReason();

        return ResponseEntity.status(exception.getStatusCode())
                .header("Cache-Control", "no-store")
                .body(Map.of(
                        "message",
                        message == null
                                ? "Movement request failed."
                                : message
                ));
    }
}