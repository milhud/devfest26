/**
 * 1D Kalman Filter for smoothing noisy gesture values.
 * Reduces jitter from hand tracking while maintaining responsiveness.
 */

export class KalmanFilter {
    /**
     * Create a new Kalman filter.
     * @param {number} q - Process noise covariance (lower = smoother, less responsive)
     * @param {number} r - Measurement noise covariance (higher = trust predictions more)
     */
    constructor(q = 0.1, r = 0.5) {
        this.q = q;  // Process noise
        this.r = r;  // Measurement noise
        this.x = null;  // Estimated value
        this.p = 1;  // Estimation error covariance
    }

    /**
     * Update the filter with a new measurement.
     * @param {number} measurement - The raw measured value
     * @returns {number} The filtered (smoothed) value
     */
    filter(measurement) {
        if (this.x === null) {
            // First measurement - initialize state
            this.x = measurement;
            return this.x;
        }

        // Prediction step
        // x_pred = x (assume no motion model, state stays same)
        // p_pred = p + q
        this.p = this.p + this.q;

        // Update step
        // Kalman gain: k = p / (p + r)
        const k = this.p / (this.p + this.r);

        // State update: x = x + k * (measurement - x)
        this.x = this.x + k * (measurement - this.x);

        // Error covariance update: p = (1 - k) * p
        this.p = (1 - k) * this.p;

        return this.x;
    }

    /**
     * Get the current estimated value without updating.
     * @returns {number|null} Current estimate or null if not initialized
     */
    getValue() {
        return this.x;
    }

    /**
     * Reset the filter to uninitialized state.
     */
    reset() {
        this.x = null;
        this.p = 1;
    }

    /**
     * Set the state to a specific value (for reinitialization).
     * @param {number} value - The value to set
     */
    setState(value) {
        this.x = value;
        this.p = 0.1;  // Low initial uncertainty
    }
}

/**
 * Helper to apply dead zone to a value.
 * Values within the dead zone around center snap to center.
 * @param {number} value - The input value
 * @param {number} center - The center of the dead zone
 * @param {number} deadZone - Half-width of the dead zone
 * @returns {number} The value with dead zone applied
 */
export function applyDeadZone(value, center, deadZone) {
    if (Math.abs(value - center) < deadZone) {
        return center;
    }
    return value;
}

/**
 * Clamp a value between min and max.
 * @param {number} value - The value to clamp
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @returns {number} The clamped value
 */
export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

/**
 * Linear interpolation between two values.
 * @param {number} a - Start value
 * @param {number} b - End value
 * @param {number} t - Interpolation factor (0-1)
 * @returns {number} Interpolated value
 */
export function lerp(a, b, t) {
    return a + (b - a) * t;
}

/**
 * Map a value from one range to another.
 * @param {number} value - Input value
 * @param {number} inMin - Input range minimum
 * @param {number} inMax - Input range maximum
 * @param {number} outMin - Output range minimum
 * @param {number} outMax - Output range maximum
 * @returns {number} Mapped value
 */
export function mapRange(value, inMin, inMax, outMin, outMax) {
    const normalized = (value - inMin) / (inMax - inMin);
    return outMin + normalized * (outMax - outMin);
}
