/**
 * Configuration for the DJ Booth.
 */

export const CONFIG = {
    // Camera settings
    CAMERA_WIDTH: 1280,
    CAMERA_HEIGHT: 720,

    // Track folders (each contains stem1-5.mp3/wav)
    TRACK_FOLDERS: ['track1', 'track2'],
    STEMS_PER_TRACK: 3,

    // Gesture thresholds
    PINCH_THRESHOLD: 0.08,
    FIST_THRESHOLD: 0.12,
    PALM_OPEN_THRESHOLD: 0.15,

    // Smoothing
    KALMAN_Q: 0.08,
    KALMAN_R: 0.3,

    // Debouncing
    STEM_SELECT_DEBOUNCE_MS: 300,
    STEM_SELECT_HOLD_MS: 220,
    STEM_SELECT_LOCK_MS: 4000,
    PLAY_PAUSE_DEBOUNCE_MS: 300,
    PLAY_PAUSE_HOLD_MS: 650,
    TRACK_SWITCH_DEBOUNCE_MS: 600,
    EFFECT_TRIGGER_DEBOUNCE_MS: 350,

    // Hand roles
    CONTROL_HAND: 'Left',
    EFFECT_HAND: 'Right',

    // Wave detection
    WAVE_VELOCITY_THRESHOLD: 0.03,
    FLICK_VELOCITY_THRESHOLD: 0.06,
    WAVE_COUNT_THRESHOLD: 1,
    WAVE_TIMEOUT_MS: 800,

    DEFAULT_VOLUME: 0,
    SELECTED_STEM_DEFAULT_VOLUME: 0.35,
    EFFECTS_PER_HAND: 3,

    // MediaPipe model
    MODEL_PATH: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',

    // Hand connections for skeleton drawing
    HAND_CONNECTIONS: [
        [0, 1], [1, 2], [2, 3], [3, 4],
        [0, 5], [5, 6], [6, 7], [7, 8],
        [0, 9], [9, 10], [10, 11], [11, 12],
        [0, 13], [13, 14], [14, 15], [15, 16],
        [0, 17], [17, 18], [18, 19], [19, 20],
        [5, 9], [9, 13], [13, 17],
    ],

    LANDMARKS: {
        WRIST: 0,
        THUMB_TIP: 4,
        INDEX_MCP: 5,
        INDEX_TIP: 8,
        MIDDLE_MCP: 9,
        MIDDLE_TIP: 12,
        RING_TIP: 16,
        PINKY_MCP: 17,
        PINKY_TIP: 20,
    },

    // All fingertips including thumb
    FINGERTIPS: [4, 8, 12, 16, 20],
};
