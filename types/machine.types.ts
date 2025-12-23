
/**
 * Domain: Machine Configuration.
 * Static and dynamic parameters of the physical punching machine.
 */

export interface MachineSettings {
    name: string;
    // Travel Limits
    xTravelMax: number;
    xTravelMin: number;
    yTravelMax: number;
    yTravelMin: number;
    
    // Clamp Protection
    clampProtectionZoneX: number;
    clampProtectionZoneY: number;
    deadZoneY: number; // e.g. -40mm from clamps

    // Speeds (Informational for generic G-code, but used for Time estimation)
    maxSlewSpeed: number; // m/min
    turretRotationSpeed: number; // RPM
}
