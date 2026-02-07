"""
Configuration constants for the DJ Booth hand gesture controller.
Easy to modify zones, thresholds, and visual settings.
"""

# Camera settings
CAMERA_WIDTH = 1280
CAMERA_HEIGHT = 720
CAMERA_ID = 0

# Control zones (normalized 0-1 coordinates: x1, y1, x2, y2)
# These define where on screen each control is located
ZONES = {
    'deck_left': (0.02, 0.25, 0.35, 0.85),
    'deck_right': (0.65, 0.25, 0.98, 0.85),
    'knob_left': (0.38, 0.35, 0.48, 0.75),
    'knob_right': (0.52, 0.35, 0.62, 0.75),
}

# Gesture thresholds
PINCH_THRESHOLD = 0.05  # Distance between thumb and index to detect pinch (normalized)
ROTATION_SENSITIVITY = 2.0  # Multiplier for wheel rotation speed
KNOB_SENSITIVITY = 1.5  # Multiplier for knob movement

# Audio settings
SAMPLE_RATE = 44100
AUDIO_BUFFER = 512
MIN_TEMPO = 0.5  # 50% speed
MAX_TEMPO = 1.5  # 150% speed
DEFAULT_VOLUME = 0.7

# Track assignments (supports .mp3 and .wav)
# The system will auto-detect which extension exists
DECK_TRACKS = {
    'left': ['track1', 'track2'],   # Will look for .mp3 or .wav
    'right': ['track3', 'track4'],
}
SUPPORTED_EXTENSIONS = ['.wav', '.mp3']  # Order of preference

# Colors (BGR for OpenCV)
COLORS = {
    'deck_inactive': (100, 100, 100),
    'deck_active': (0, 255, 100),
    'knob_inactive': (80, 80, 80),
    'knob_active': (255, 150, 0),
    'knob_fill': (255, 200, 100),
    'hand_landmark': (0, 255, 255),
    'hand_connection': (0, 200, 200),
    'text': (255, 255, 255),
    'tempo_indicator': (0, 200, 255),
    'pinch_active': (0, 255, 0),
}

# UI settings
DECK_LINE_THICKNESS = 3
KNOB_LINE_THICKNESS = 2
LANDMARK_RADIUS = 5
FONT_SCALE = 0.6
