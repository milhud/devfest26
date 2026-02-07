/**
 * Configuration for the DJ Booth.
 */

export const CONFIG = {
    // Camera settings
    CAMERA_WIDTH: 1280,
    CAMERA_HEIGHT: 720,

    // Control zones (normalized 0-1 coordinates)
    ZONES: {
        deck_left: { x1: 0.0, y1: 0.0, x2: 0.35, y2: 0.8 },
        deck_right: { x1: 0.65, y1: 0.0, x2: 1.0, y2: 0.8 },
        crossfader: { x1: 0.2, y1: 0.8, x2: 0.8, y2: 1.0 },
    },

    // Gesture thresholds
    PINCH_THRESHOLD: 0.08,
    FIST_THRESHOLD: 0.15,
    PALM_OPEN_THRESHOLD: 0.12,

    // Dead zones
    CROSSFADER_DEAD_ZONE: 0.05,
    VOLUME_DEAD_ZONE: 0.02,

    // Smoothing
    KALMAN_Q: 0.08,
    KALMAN_R: 0.3,

    // Debouncing
    PLAY_PAUSE_DEBOUNCE_MS: 600,
    TRACK_SWITCH_DEBOUNCE_MS: 800,
    EFFECT_DEBOUNCE_MS: 400,

    // Wrist flick detection
    FLICK_VELOCITY_THRESHOLD: 0.15,  // Minimum velocity for flick
    FLICK_ANGLE_THRESHOLD: 0.3,       // Radians - how much roll change needed

    // Track folders
    TRACK_FOLDERS: ['track1', 'track2', 'track3'],

    // Effects
    EFFECTS: [
        '/music/effects/effect1.mp3',
        '/music/effects/effect2.mp3',
        '/music/effects/effect3.mp3',
    ],

    DEFAULT_VOLUME: 0.7,
    DEFAULT_CROSSFADE: 0.5,

    // Filter settings
    FILTER_MIN_FREQ: 100,
    FILTER_MAX_FREQ: 20000,

    // Roll angle thresholds
    ROLL_MIN: -Math.PI / 4,
    ROLL_MAX: Math.PI / 4,

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

    FINGERTIPS: [8, 12, 16, 20],
};
