"""
UI Renderer - draws DJ controls and hand tracking overlay.
"""

import cv2
import numpy as np
from typing import Dict, List, Tuple
import config
from gesture_detector import GestureState
from dj_controller import DJController
from hand_tracker import HandData

# Hand landmark connections for drawing skeleton
HAND_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 4),      # Thumb
    (0, 5), (5, 6), (6, 7), (7, 8),      # Index
    (0, 9), (9, 10), (10, 11), (11, 12), # Middle
    (0, 13), (13, 14), (14, 15), (15, 16), # Ring
    (0, 17), (17, 18), (18, 19), (19, 20), # Pinky
    (5, 9), (9, 13), (13, 17),           # Palm
]


class UIRenderer:
    """Renders DJ booth overlay on webcam feed."""

    def __init__(self, width: int, height: int):
        """
        Initialize renderer.

        Args:
            width: Frame width in pixels
            height: Frame height in pixels
        """
        self.width = width
        self.height = height

    def render(self, frame, gesture_states: Dict[str, GestureState],
               dj_controller: DJController, hands: List[HandData]) -> np.ndarray:
        """
        Render full UI overlay on frame.

        Args:
            frame: Input video frame
            gesture_states: Current gesture states
            dj_controller: DJ controller for deck info
            hands: List of detected hands

        Returns:
            Frame with overlay drawn
        """
        # Draw deck wheels
        self._draw_deck(frame, 'left', gesture_states.get('deck_left'),
                        dj_controller.get_deck_info('left'))
        self._draw_deck(frame, 'right', gesture_states.get('deck_right'),
                        dj_controller.get_deck_info('right'))

        # Draw knobs
        self._draw_knob(frame, 'left', gesture_states.get('knob_left'),
                        dj_controller.get_deck_info('left'))
        self._draw_knob(frame, 'right', gesture_states.get('knob_right'),
                        dj_controller.get_deck_info('right'))

        # Draw hand landmarks
        for hand in hands:
            self._draw_hand_landmarks(frame, hand)

        # Draw pinch indicators
        for hand in hands:
            if hand.is_pinching:
                px = int(hand.pinch_position[0] * self.width)
                py = int(hand.pinch_position[1] * self.height)
                cv2.circle(frame, (px, py), 15, config.COLORS['pinch_active'], 3)

        # Draw instructions
        self._draw_instructions(frame)

        return frame

    def _draw_hand_landmarks(self, frame, hand: HandData):
        """Draw hand skeleton on frame."""
        landmarks = hand.landmarks

        # Draw connections
        for start_idx, end_idx in HAND_CONNECTIONS:
            start = landmarks[start_idx]
            end = landmarks[end_idx]
            start_px = (int(start[0] * self.width), int(start[1] * self.height))
            end_px = (int(end[0] * self.width), int(end[1] * self.height))
            cv2.line(frame, start_px, end_px, config.COLORS['hand_connection'], 2)

        # Draw landmark points
        for lm in landmarks:
            px = int(lm[0] * self.width)
            py = int(lm[1] * self.height)
            cv2.circle(frame, (px, py), 4, config.COLORS['hand_landmark'], -1)

    def _draw_deck(self, frame, deck_id: str, state: GestureState, deck_info: dict):
        """Draw a deck wheel."""
        zone = config.ZONES[f'deck_{deck_id}']
        x1, y1, x2, y2 = self._zone_to_pixels(zone)

        # Calculate center and radius
        cx = (x1 + x2) // 2
        cy = (y1 + y2) // 2
        radius = min(x2 - x1, y2 - y1) // 2 - 10

        # Choose color based on active state
        color = config.COLORS['deck_active'] if (state and state.is_active) else config.COLORS['deck_inactive']

        # Draw outer circle
        cv2.circle(frame, (cx, cy), radius, color, config.DECK_LINE_THICKNESS)

        # Draw inner circle
        cv2.circle(frame, (cx, cy), radius // 2, color, 2)

        # Draw tempo indicator line
        tempo = deck_info.get('tempo', 1.0)
        angle = (tempo - 1.0) * np.pi  # Map tempo to angle (-0.5 to 0.5 maps to -π/2 to π/2)
        end_x = int(cx + radius * 0.8 * np.cos(angle - np.pi/2))
        end_y = int(cy + radius * 0.8 * np.sin(angle - np.pi/2))
        cv2.line(frame, (cx, cy), (end_x, end_y), config.COLORS['tempo_indicator'], 3)

        # Draw deck label
        label = f"DECK {deck_id.upper()}"
        cv2.putText(frame, label, (x1 + 10, y1 - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, config.FONT_SCALE,
                    config.COLORS['text'], 2)

        # Draw track name
        track = deck_info.get('track', 'No track')
        cv2.putText(frame, track, (x1 + 10, y2 + 25),
                    cv2.FONT_HERSHEY_SIMPLEX, config.FONT_SCALE * 0.8,
                    config.COLORS['text'], 1)

        # Draw tempo value
        tempo_text = f"Tempo: {tempo:.2f}x"
        cv2.putText(frame, tempo_text, (x1 + 10, y2 + 50),
                    cv2.FONT_HERSHEY_SIMPLEX, config.FONT_SCALE * 0.7,
                    config.COLORS['tempo_indicator'], 1)

    def _draw_knob(self, frame, knob_id: str, state: GestureState, deck_info: dict):
        """Draw a volume knob."""
        zone = config.ZONES[f'knob_{knob_id}']
        x1, y1, x2, y2 = self._zone_to_pixels(zone)

        # Choose color based on active state
        is_active = state and state.is_active
        color = config.COLORS['knob_active'] if is_active else config.COLORS['knob_inactive']

        # Draw knob outline (vertical slider style)
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, config.KNOB_LINE_THICKNESS)

        # Draw fill based on volume
        volume = deck_info.get('volume', config.DEFAULT_VOLUME)
        fill_height = int((y2 - y1) * volume)
        fill_y = y2 - fill_height
        cv2.rectangle(frame, (x1 + 2, fill_y), (x2 - 2, y2 - 2),
                      config.COLORS['knob_fill'], -1)

        # Draw label
        label = f"VOL {knob_id.upper()[0]}"
        label_x = x1 + (x2 - x1) // 4
        cv2.putText(frame, label, (label_x - 10, y1 - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, config.FONT_SCALE * 0.6,
                    config.COLORS['text'], 1)

        # Draw volume percentage
        vol_text = f"{int(volume * 100)}%"
        cv2.putText(frame, vol_text, (label_x - 5, y2 + 20),
                    cv2.FONT_HERSHEY_SIMPLEX, config.FONT_SCALE * 0.5,
                    config.COLORS['text'], 1)

    def _draw_instructions(self, frame):
        """Draw help text."""
        instructions = [
            "CONTROLS:",
            "Pinch + rotate in deck = tempo",
            "Pinch + move up/down in knob = volume",
            "SPACE = play/pause all | Q = quit",
            "1/2 = toggle deck L/R | N/M = next track"
        ]

        y = 30
        for line in instructions:
            cv2.putText(frame, line, (10, y),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5,
                        config.COLORS['text'], 1)
            y += 20

    def _zone_to_pixels(self, zone: Tuple[float, float, float, float]) -> Tuple[int, int, int, int]:
        """Convert normalized zone to pixel coordinates."""
        x1 = int(zone[0] * self.width)
        y1 = int(zone[1] * self.height)
        x2 = int(zone[2] * self.width)
        y2 = int(zone[3] * self.height)
        return x1, y1, x2, y2
