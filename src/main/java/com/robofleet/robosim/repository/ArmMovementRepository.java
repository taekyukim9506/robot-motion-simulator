package com.robofleet.robosim.repository;

import com.robofleet.robosim.model.ArmMovement;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

// Provide database operations for saved arm commands.
public interface ArmMovementRepository
        extends JpaRepository<ArmMovement, Long> {

    // Return one user's movements in the order they were saved.
    List<ArmMovement> findByUser_IdOrderByIdAsc(Long userId);

    // Delete only the movements owned by the selected account.
    long deleteByUser_Id(Long userId);
}