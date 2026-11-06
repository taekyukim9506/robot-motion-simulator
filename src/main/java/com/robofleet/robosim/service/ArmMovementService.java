package com.robofleet.robosim.service;

import com.robofleet.robosim.model.ArmMovement;
import com.robofleet.robosim.model.UserAccount;
import com.robofleet.robosim.repository.ArmMovementRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Objects;

// Check arm commands and manage the current user's movement history.
@Service
public class ArmMovementService {

    private final ArmMovementRepository movementRepository;

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

    // Validate and save a command for the account identified by the session.
    @Transactional
    public MovementResponse saveMovement(
            UserAccount account,
            MovementRequest request) {

        if (request == null) {
            throw invalidMovement("Enter the movement details.");
        }

        double roll = requireFinite(request.roll(), "Roll");
        double pitch = requireFinite(request.pitch(), "Pitch");
        double yaw = requireFinite(request.yaw(), "Yaw");
        double speed = requireFinite(request.speed(), "Speed");

        if (speed <= 0) {
            throw invalidMovement("Speed must be greater than zero.");
        }

        ArmMovement movement = new ArmMovement(
                account,
                roll,
                pitch,
                yaw,
                speed
        );

        return toResponse(movementRepository.saveAndFlush(movement));
    }

    // Read only the movements owned by the authenticated account.
    @Transactional(readOnly = true)
    public List<MovementResponse> getHistory(UserAccount account) {
        Long userId = Objects.requireNonNull(account.getId());

        return movementRepository.findByUser_IdOrderByIdAsc(userId)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    // Remove this user's history without affecting other accounts.
    @Transactional
    public void clearHistory(UserAccount account) {
        Long userId = Objects.requireNonNull(account.getId());
        movementRepository.deleteByUser_Id(userId);
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