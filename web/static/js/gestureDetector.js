/**
 * Gesture detection for stem-based DJ control.
 * - Hold 1-N fingers = select stem 1-N
 * - Hold open palm = play/pause
 * - Pinch height = volume
 * - Wave = switch track
 */

import { CONFIG } from './config.js';
import { KalmanFilter, clamp } from './kalmanFilter.js';

export class GestureDetector {
    constructor() {
        this.volumeFilter = new KalmanFilter(CONFIG.KALMAN_Q, CONFIG.KALMAN_R);

        // State tracking
        this.currentFingerCount = 0;
        this.lastStemSelectTime = 0;
        this.fingerCandidate = -1;
        this.fingerCandidateStart = 0;
        this.lastCommittedFinger = -1;
        this.stemSelectLockUntil = 0;

        // Play/pause tracking (open-palm hold)
        this.openHoldStartTime = 0;
        this.openHoldTriggered = false;
        this.lastPlayPauseTime = 0;

        // Wave detection
        this.waveHistory = [];
        this.lastWaveTime = 0;
        this.lastWaveMotionTime = 0;
        this.lastX = null;
        this.waveDirection = 0;
        this.waveCount = 0;

        // Volume (sticky)
        this.stickyVolume = CONFIG.DEFAULT_VOLUME;
    }

    update(hands, timestamp) {
        const state = {
            fingerCount: 0,
            stemSelect: -2,  // -2 = no change, -1 = deselect, 0-4 = select stem
            playPause: false,
            trackSwitch: false,
            volume: this.stickyVolume,
            handDetected: false,
            isFist: false,
            isOpen: false,
            isPlayPauseGesture: false,
            isPinching: false,
            stemSelectionLocked: false,
            stemSelectionLockRemainingMs: 0,
        };

        if (hands.length === 0) {
            this.lastX = null;
            this.waveCount = 0;
            this.fingerCandidate = -1;
            this.fingerCandidateStart = 0;
            this.lastCommittedFinger = -1;
            return state;
        }

        const hand = hands[0];
        state.handDetected = true;

        // Count fingers
        const fingerCount = this._countFingers(hand);
        state.fingerCount = fingerCount;
        state.isFist = fingerCount === 0;
        state.isOpen = fingerCount >= 4;
        state.isPinching = !!hand.isPinching;
        state.stemSelectionLocked = timestamp < this.stemSelectLockUntil;
        state.stemSelectionLockRemainingMs = Math.max(0, this.stemSelectLockUntil - timestamp);

        // Stem selection based on stable finger hold
        if (fingerCount >= 1 && fingerCount <= CONFIG.STEMS_PER_TRACK && !hand.isPinching && !state.stemSelectionLocked) {
            if (this.fingerCandidate !== fingerCount) {
                this.fingerCandidate = fingerCount;
                this.fingerCandidateStart = timestamp;
            } else if (
                this.lastCommittedFinger !== fingerCount &&
                timestamp - this.fingerCandidateStart >= CONFIG.STEM_SELECT_HOLD_MS &&
                timestamp - this.lastStemSelectTime >= CONFIG.STEM_SELECT_DEBOUNCE_MS
            ) {
                state.stemSelect = fingerCount - 1;  // 1-5 -> 0-4
                this.lastCommittedFinger = fingerCount;
                this.lastStemSelectTime = timestamp;
            }
        } else {
            this.fingerCandidate = -1;
            this.fingerCandidateStart = 0;
            if (fingerCount === 0) {
                this.lastCommittedFinger = -1;
            }
        }

        if (state.stemSelect >= 0) {
            this.stemSelectLockUntil = timestamp + CONFIG.STEM_SELECT_LOCK_MS;
            state.stemSelectionLocked = true;
            state.stemSelectionLockRemainingMs = CONFIG.STEM_SELECT_LOCK_MS;
        }

        // Play/pause: hold open palm to toggle
        const openPalmForPause = state.isOpen && !state.isPinching;
        if (openPalmForPause) {
            state.isPlayPauseGesture = true;
            if (this.openHoldStartTime === 0) {
                this.openHoldStartTime = timestamp;
            }
            const holdElapsed = timestamp - this.openHoldStartTime;
            if (
                !this.openHoldTriggered &&
                holdElapsed >= CONFIG.PLAY_PAUSE_HOLD_MS &&
                timestamp - this.lastPlayPauseTime >= CONFIG.PLAY_PAUSE_DEBOUNCE_MS
            ) {
                state.playPause = true;
                this.lastPlayPauseTime = timestamp;
                this.openHoldTriggered = true;
            }
        } else {
            this.openHoldStartTime = 0;
            this.openHoldTriggered = false;
        }

        // Volume based on pinch height (higher = louder)
        if (hand.isPinching) {
            const volume = 1 - hand.pinchPosition.y;  // Invert: top = 1, bottom = 0
            const smoothedVolume = this.volumeFilter.filter(clamp(volume, 0, 1));
            this.stickyVolume = smoothedVolume;
        }
        state.volume = this.stickyVolume;

        // Wave detection for track switch
        this._detectWave(hand, timestamp, state);

        return state;
    }

    _countFingers(hand) {
        const palmCenter = hand.palmCenter;
        let count = 0;

        // Check each fingertip distance from palm
        for (const tipIndex of CONFIG.FINGERTIPS) {
            const tip = hand.landmarks[tipIndex];
            const dist = Math.sqrt(
                Math.pow(tip.x - palmCenter.x, 2) +
                Math.pow(tip.y - palmCenter.y, 2)
            );

            // Thumb has different threshold (it's more sideways)
            const threshold = tipIndex === 4
                ? CONFIG.PALM_OPEN_THRESHOLD * 0.7
                : CONFIG.PALM_OPEN_THRESHOLD;

            if (dist > threshold) {
                count++;
            }
        }

        return count;
    }

    _detectWave(hand, timestamp, state) {
        const x = hand.palmCenter.x;

        if (this.lastX !== null) {
            const dx = x - this.lastX;

            // Single-direction flick trigger (more reliable than direction-change-only wave)
            if (
                Math.abs(dx) > CONFIG.FLICK_VELOCITY_THRESHOLD &&
                timestamp - this.lastWaveTime > CONFIG.TRACK_SWITCH_DEBOUNCE_MS
            ) {
                state.trackSwitch = true;
                this.lastWaveTime = timestamp;
                this.waveCount = 0;
                this.waveDirection = dx > 0 ? 1 : -1;
                this.lastX = x;
                this.lastWaveMotionTime = timestamp;
                return;
            }

            // Detect direction change
            if (Math.abs(dx) > CONFIG.WAVE_VELOCITY_THRESHOLD) {
                this.lastWaveMotionTime = timestamp;
                const newDirection = dx > 0 ? 1 : -1;

                if (this.waveDirection !== 0 && newDirection !== this.waveDirection) {
                    // Direction changed = one wave
                    this.waveCount++;

                    if (this.waveCount >= CONFIG.WAVE_COUNT_THRESHOLD) {
                        if (timestamp - this.lastWaveTime > CONFIG.TRACK_SWITCH_DEBOUNCE_MS) {
                            state.trackSwitch = true;
                            this.lastWaveTime = timestamp;
                            this.waveCount = 0;
                        }
                    }
                }

                this.waveDirection = newDirection;
            }
        }

        this.lastX = x;

        // Reset wave count if too much time passed
        if (timestamp - this.lastWaveMotionTime > CONFIG.WAVE_TIMEOUT_MS) {
            this.waveCount = 0;
            this.waveDirection = 0;
        }
    }

    reset() {
        this.volumeFilter.reset();
        this.lastStemSelectTime = 0;
        this.fingerCandidate = -1;
        this.fingerCandidateStart = 0;
        this.lastCommittedFinger = -1;
        this.stemSelectLockUntil = 0;
        this.openHoldStartTime = 0;
        this.openHoldTriggered = false;
        this.lastPlayPauseTime = 0;
        this.lastX = null;
        this.waveCount = 0;
        this.waveDirection = 0;
        this.lastWaveMotionTime = 0;
    }
}
