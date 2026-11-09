package com.robofleet.robosim.service;

import com.robofleet.robosim.model.ArmMovement;
import com.robofleet.robosim.model.UserAccount;
import com.robofleet.robosim.repository.ArmMovementRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Objects;

// Check arm commands and manage the current user's movement history.
@Service
public class ArmMovementService {

    private static final double MIN_ROLL = -165.0;
    private static final double MAX_ROLL = 165.0;
    private static final double MIN_PITCH = -75.0;
    private static final double MAX_PITCH = 75.0;
    private static final int HISTORY_LIMIT = 50;

    private final ArmMovementRepository movementRepository;

    // Use the database account row to coordinate simultaneous history changes.
    @PersistenceContext
    private EntityManager entityManager;

    // Receive the repository used to store and read arm commands.
    public ArmMovementService(
            ArmMovementRepository movementRepository) {
        this.movementRepository = movementRepository;
    }

    // Keep request fields nullable so missing values can be rejected.
    public record MovementRequest(
            Double roll,
            Double pitch,
            Double yaw,
            Double speed) {
    }

    // Return movement details without exposing the account entity.
    public record MovementResponse(
            Long id,
            double roll,
            double pitch,
            double yaw,
            double speed) {
    }

    // Validate a command and keep only the user's latest 50 movements.
    @Transactional
    public MovementResponse saveMovement(
            UserAccount account,
            MovementRequest request) {

        if (request == null) {
            throw invalidMovement("Enter the movement details.");
        }

        // Require actual finite numbers for every movement field.
        double roll = requireFinite(request.roll(), "Roll");
        double pitch = requireFinite(request.pitch(), "Pitch");
        double yaw = requireFinite(request.yaw(), "Yaw");
        double speed = requireFinite(request.speed(), "Speed");

        // Include the boundary values in the permitted angle ranges.
        requireRange(roll, MIN_ROLL, MAX_ROLL, "Roll");
        requireRange(pitch, MIN_PITCH, MAX_PITCH, "Pitch");

        // Yaw has no angle limit, but speed must be greater than zero.
        if (speed <= 0) {
            throw invalidMovement("Speed must be greater than zero.");
        }

        // Let only one request change this user's history at a time.
        UserAccount owner = lockAccount(account);

        ArmMovement movement = new ArmMovement(
                owner,
                roll,
                pitch,
                yaw,
                speed
        );

        ArmMovement saved =
                movementRepository.saveAndFlush(movement);

        // Remove old entries in the same transaction as the new command.
        trimHistory(owner);

        return toResponse(saved);
    }

    // Read the user's remaining commands from oldest to newest.
    @Transactional(readOnly = true)
    public List<MovementResponse> getHistory(UserAccount account) {
        Long userId = Objects.requireNonNull(account.getId());

        return movementRepository.findByUser_IdOrderByIdAsc(userId)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    // Clear only this user's history and coordinate with movement requests.
    @Transactional
    public void clearHistory(UserAccount account) {
        UserAccount owner = lockAccount(account);
        Long userId = Objects.requireNonNull(owner.getId());

        movementRepository.deleteByUser_Id(userId);
    }

    // Lock the account row until the current transaction finishes.
    private UserAccount lockAccount(UserAccount account) {
        Long userId = Objects.requireNonNull(account.getId());

        UserAccount owner = entityManager.find(
                UserAccount.class,
                userId,
                LockModeType.PESSIMISTIC_WRITE
        );

        // Reject an account that was removed or disabled after the session check.
        if (owner == null || !owner.isEnabled()) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "Please log in to continue."
            );
        }

        return owner;
    }

    // Delete the oldest entries when the user's history exceeds the limit.
    private void trimHistory(UserAccount account) {
        Long userId = Objects.requireNonNull(account.getId());

        List<ArmMovement> history =
                movementRepository.findByUser_IdOrderByIdAsc(userId);

        int excessCount = history.size() - HISTORY_LIMIT;

        if (excessCount > 0) {
            // Confirm that the list of old movements is not null.
            movementRepository.deleteAll(
                    Objects.requireNonNull(
                            history.subList(0, excessCount)
                    )
            );
            movementRepository.flush();
        }
    }

    // Reject missing values, infinity and values that are not a number.
    private double requireFinite(Double value, String field) {
        if (value == null || !Double.isFinite(value)) {
            throw invalidMovement(
                    field + " must be a finite number."
            );
        }

        return value;
    }

    // Reject angles outside the allowed range without changing the input.
    private void requireRange(
            double value,
            double minimum,
            double maximum,
            String field) {

        if (value < minimum || value > maximum) {
            throw invalidMovement(
                    field + " must be between "
                            + minimum + " and " + maximum + " degrees."
            );
        }
    }

    // Build the public response using only movement information.
    private MovementResponse toResponse(ArmMovement movement) {
        return new MovementResponse(
                movement.getId(),
                movement.getRoll(),
                movement.getPitch(),
                movement.getYaw(),
                movement.getSpeed()
        );
    }

    // Explain why a movement command was rejected.
    private ResponseStatusException invalidMovement(String message) {
        return new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                message
        );
    }
}