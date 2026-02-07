/**
 * Gesture detection with "sticky" controls.
 * Gestures are triggered once and values stay until changed.
 */

import { CONFIG } from './config.js';
import { KalmanFilter, clamp, mapRange } from './kalmanFilter.js';

export class GestureDetector {
    constructor() {
        // Smoothing filters
        this.crossfaderFilter = new KalmanFilter(CONFIG.KALMAN_Q, CONFIG.KALMAN_R);
        this.volumeLeftFilter = new KalmanFilter(CONFIG.KALMAN_Q, CONFIG.KALMAN_R);
        this.volumeRightFilter = new KalmanFilter(CONFIG.KALMAN_Q, CONFIG.KALMAN_R);
        this.filterSweepFilter = new KalmanFilter(CONFIG.KALMAN_Q * 2, CONFIG.KALMAN_R);

        // Sticky values (persist when hands leave)
        this.stickyValues = {
            crossfader: 0.5,
            volumeLeft: CONFIG.DEFAULT_VOLUME,
            volumeRight: CONFIG.DEFAULT_VOLUME,
            filterSweep: 1.0,  // Full open
        };

        // Play/pause state tracking
        this.lastHandState = { left: null, right: null };
        this.playPauseLastTrigger = { left: 0, right: 0 };

        // Track switch (wrist flick)
        this.lastRollAngle = { left: null, right: null };
        this.trackSwitchLastTrigger = { left: 0, right: 0 };

        // Effect triggers (finger spread)
        this.effectLastTrigger = [0, 0, 0];

        // Pinch state for "grabbing" controls
        this.isPinching = { left: false, right: false };
    }

    update(hands, timestamp) {
        const state = {
            // Use sticky values by default
            crossfader: this.stickyValues.crossfader,
            volumeLeft: this.stickyValues.volumeLeft,
            volumeRight: this.stickyValues.volumeRight,
            filterSweep: this.stickyValues.filterSweep,
            // Event triggers
            playPauseLeft: false,
            playPauseRight: false,
            trackSwitchLeft: 0,   // -1 = prev, 0 = none, 1 = next
            trackSwitchRight: 0,
            effectTrigger: -1,    // -1 = none, 0-2 = effect index
            // Active zones
            activeZones: { deck_left: false, deck_right: false, crossfader: false },
            // Hands detected
            handsDetected: hands.length,
        };

        for (const hand of hands) {
            const handId = hand.handedness.toLowerCase();
            const zone = this._getZone(hand.palmCenter);

            if (zone) {
                state.activeZones[zone] = true;

                // Only update values if pinching (grabbing the control)
                if (hand.isPinching) {
                    this.isPinching[handId] = true;

                    if (zone === 'crossfader') {
                        this._processCrossfader(hand, state);
                    } else if (zone === 'deck_left') {
                        this._processVolume(hand, state, 'left');
                        this._processFilterSweep(hand, state);
                    } else if (zone === 'deck_right') {
                        this._processVolume(hand, state, 'right');
                    }
                } else {
                    this.isPinching[handId] = false;
                }
            }

            // Play/pause - fist gesture (works anywhere in deck zone)
            this._processPlayPause(hand, state, timestamp, zone);

            // Track switch - wrist flick
            this._processTrackSwitch(hand, state, timestamp, zone);

            // Effects - specific finger patterns
            this._processEffects(hand, state, timestamp);
        }

        return state;
    }

    _getZone(point) {
        for (const [zoneName, zone] of Object.entries(CONFIG.ZONES)) {
            if (this._inZone(point, zone)) {
                return zoneName;
            }
        }
        return null;
    }

    _inZone(point, zone) {
        return point.x >= zone.x1 && point.x <= zone.x2 &&
               point.y >= zone.y1 && point.y <= zone.y2;
    }

    _processCrossfader(hand, state) {
        const zone = CONFIG.ZONES.crossfader;
        let rawValue = (hand.palmCenter.x - zone.x1) / (zone.x2 - zone.x1);
        rawValue = clamp(rawValue, 0, 1);

        // Apply dead zone at center
        if (Math.abs(rawValue - 0.5) < CONFIG.CROSSFADER_DEAD_ZONE) {
            rawValue = 0.5;
        }

        const smoothed = this.crossfaderFilter.filter(rawValue);
        this.stickyValues.crossfader = smoothed;
        state.crossfader = smoothed;
    }

    _processVolume(hand, state, deck) {
        const zone = CONFIG.ZONES[`deck_${deck}`];
        let rawValue = 1 - (hand.palmCenter.y - zone.y1) / (zone.y2 - zone.y1);
        rawValue = clamp(rawValue, 0, 1);

        // Dead zones at extremes
        if (rawValue < CONFIG.VOLUME_DEAD_ZONE) rawValue = 0;
        if (rawValue > 1 - CONFIG.VOLUME_DEAD_ZONE) rawValue = 1;

        const filter = deck === 'left' ? this.volumeLeftFilter : this.volumeRightFilter;
        const smoothed = filter.filter(rawValue);

        if (deck === 'left') {
            this.stickyValues.volumeLeft = smoothed;
            state.volumeLeft = smoothed;
        } else {
            this.stickyValues.volumeRight = smoothed;
            state.volumeRight = smoothed;
        }
    }

    _processFilterSweep(hand, state) {
        let rawValue = mapRange(hand.rollAngle, CONFIG.ROLL_MIN, CONFIG.ROLL_MAX, 0, 1);
        rawValue = clamp(rawValue, 0, 1);

        const smoothed = this.filterSweepFilter.filter(rawValue);
        this.stickyValues.filterSweep = smoothed;
        state.filterSweep = smoothed;
    }

    _processPlayPause(hand, state, timestamp, zone) {
        const handId = hand.handedness.toLowerCase();

        // Determine which deck based on zone or hand
        let deck = null;
        if (zone === 'deck_left') deck = 'left';
        else if (zone === 'deck_right') deck = 'right';
        else if (handId === 'left') deck = 'left';
        else if (handId === 'right') deck = 'right';

        if (!deck) return;

        // Get current state
        let currentState = null;
        if (hand.isFist) currentState = 'fist';
        else if (hand.isOpenPalm) currentState = 'open';

        // Detect open palm -> fist transition
        if (this.lastHandState[handId] === 'open' && currentState === 'fist') {
            const lastTrigger = this.playPauseLastTrigger[deck];
            if (timestamp - lastTrigger > CONFIG.PLAY_PAUSE_DEBOUNCE_MS) {
                if (deck === 'left') state.playPauseLeft = true;
                else state.playPauseRight = true;
                this.playPauseLastTrigger[deck] = timestamp;
            }
        }

        if (currentState) {
            this.lastHandState[handId] = currentState;
        }
    }

    _processTrackSwitch(hand, state, timestamp, zone) {
        const handId = hand.handedness.toLowerCase();

        // Only in deck zones
        let deck = null;
        if (zone === 'deck_left') deck = 'left';
        else if (zone === 'deck_right') deck = 'right';

        if (!deck) {
            this.lastRollAngle[handId] = null;
            return;
        }

        const currentRoll = hand.rollAngle;

        if (this.lastRollAngle[handId] !== null) {
            const rollDelta = currentRoll - this.lastRollAngle[handId];

            // Detect quick wrist flick
            if (Math.abs(rollDelta) > CONFIG.FLICK_ANGLE_THRESHOLD) {
                const lastTrigger = this.trackSwitchLastTrigger[deck];
                if (timestamp - lastTrigger > CONFIG.TRACK_SWITCH_DEBOUNCE_MS) {
                    const direction = rollDelta > 0 ? 1 : -1;
                    if (deck === 'left') state.trackSwitchLeft = direction;
                    else state.trackSwitchRight = direction;
                    this.trackSwitchLastTrigger[deck] = timestamp;
                    console.log(`Track switch ${deck}: ${direction > 0 ? 'next' : 'prev'}`);
                }
            }
        }

        this.lastRollAngle[handId] = currentRoll;
    }

    _processEffects(hand, state, timestamp) {
        // Count extended fingers (fingertips far from palm)
        const fingerCount = this._countExtendedFingers(hand);

        // 1 finger = effect 1, 2 fingers = effect 2, 3 fingers = effect 3
        if (fingerCount >= 1 && fingerCount <= 3 && !hand.isFist) {
            const effectIndex = fingerCount - 1;
            if (timestamp - this.effectLastTrigger[effectIndex] > CONFIG.EFFECT_DEBOUNCE_MS) {
                // Only trigger if it's a "pointing" gesture (not open palm)
                if (!hand.isOpenPalm) {
                    state.effectTrigger = effectIndex;
                    this.effectLastTrigger[effectIndex] = timestamp;
                }
            }
        }
    }

    _countExtendedFingers(hand) {
        const palmCenter = hand.palmCenter;
        let count = 0;

        for (const tipIndex of CONFIG.FINGERTIPS) {
            const tip = hand.landmarks[tipIndex];
            const dist = Math.sqrt(
                Math.pow(tip.x - palmCenter.x, 2) +
                Math.pow(tip.y - palmCenter.y, 2)
            );
            if (dist > CONFIG.PALM_OPEN_THRESHOLD * 0.8) {
                count++;
            }
        }

        return count;
    }

    reset() {
        this.crossfaderFilter.reset();
        this.volumeLeftFilter.reset();
        this.volumeRightFilter.reset();
        this.filterSweepFilter.reset();
        this.lastHandState = { left: null, right: null };
        this.lastRollAngle = { left: null, right: null };
    }
}
