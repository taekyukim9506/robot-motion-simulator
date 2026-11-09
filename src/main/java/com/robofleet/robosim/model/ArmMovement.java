package com.robofleet.robosim.model;

import jakarta.persistence.*;

// Store one arm command and the account that owns it.
@Entity
@Table(name = "arm_movements")
public class ArmMovement {

    // Generate a unique ID for each saved movement.
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // Link each movement to an existing account.
    // Load the account only when its details are needed.
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private UserAccount user;

    // Store the requested angles in degrees.
    @Column(nullable = false)
    private double roll;

    @Column(nullable = false)
    private double pitch;

    @Column(nullable = false)
    private double yaw;

    // Store the movement speed in degrees per second.
    @Column(nullable = false)
    private double speed;

    // Allow JPA to create objects when reading database records.
    protected ArmMovement() {
    }

    // Create a command after the service has checked its values.
    public ArmMovement(
            UserAccount user,
            double roll,
            double pitch,
            double yaw,
            double speed) {
        this.user = user;
        this.roll = roll;
        this.pitch = pitch;
        this.yaw = yaw;
        this.speed = speed;
    }

    // Return the database ID used to identify this movement.
    public Long getId() {
        return id;
    }

    // Return the saved roll angle.
    public double getRoll() {
        return roll;
    }

    // Return the saved pitch angle.
    public double getPitch() {
        return pitch;
    }

    // Return the saved yaw angle.
    public double getYaw() {
        return yaw;
    }

    // Return the speed used for this command.
    public double getSpeed() {
        return speed;
    }
}