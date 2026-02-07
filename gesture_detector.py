"""
Gesture detection for DJ controls.
Handles wheel rotation and knob movements.
"""

import numpy as np
from typing import Optional, Tuple, Dict
from dataclasses import dataclass
import config
from hand_tracker import HandData


@dataclass
class GestureState:
    """Current state of a gesture control."""
    is_active: bool = False
    value: float = 0.0  # Current value (0-1 for knobs, angle for wheels)
    delta: float = 0.0  # Change since last frame


class WheelGesture:
    """Detects circular rotation gestures for deck wheels."""

    def __init__(self, zone: Tuple[float, float, float, float], name: str):
        """
        Initialize wheel gesture detector.

        Args:
            zone: (x1, y1, x2, y2) normalized coordinates
            name: Identifier for this wheel
        """
        self.zone = zone
        self.name = name
        self.center = (
            (zone[0] + zone[2]) / 2,
            (zone[1] + zone[3]) / 2
        )
        self.last_angle: Optional[float] = None
        self.is_grabbed = False
        self.cumulative_rotation = 0.0

    def update(self, hand: Optional[HandData]) -> GestureState:
        """
        Update wheel state based on hand position.

        Args:
            hand: HandData if hand is in zone, None otherwise

        Returns:
            GestureState with current wheel state
        """
        state = GestureState()

        if hand is None or not hand.is_pinching:
            # Release the wheel
            self.is_grabbed = False
            self.last_angle = None
            return state

        # Check if pinch is in zone
        if not self._in_zone(hand.pinch_position):
            self.is_grabbed = False
            self.last_angle = None
            return state

        # Hand is pinching in zone - grab the wheel
        self.is_grabbed = True
        state.is_active = True

        # Calculate angle from center to pinch position
        current_angle = self._calculate_angle(hand.pinch_position)

        if self.last_angle is not None:
            # Calculate rotation delta
            delta = current_angle - self.last_angle

            # Handle wrap-around at 360/0 degrees
            if delta > np.pi:
                delta -= 2 * np.pi
            elif delta < -np.pi:
                delta += 2 * np.pi

            # Apply sensitivity
            delta *= config.ROTATION_SENSITIVITY
            self.cumulative_rotation += delta
            state.delta = delta

        self.last_angle = current_angle
        state.value = self.cumulative_rotation

        return state

    def _in_zone(self, pos: Tuple[float, float]) -> bool:
        """Check if position is within the zone."""
        x, y = pos
        return (self.zone[0] <= x <= self.zone[2] and
                self.zone[1] <= y <= self.zone[3])

    def _calculate_angle(self, pos: Tuple[float, float]) -> float:
        """Calculate angle from center to position."""
        dx = pos[0] - self.center[0]
        dy = pos[1] - self.center[1]
        return np.arctan2(dy, dx)

    def reset(self):
        """Reset wheel state."""
        self.last_angle = None
        self.is_grabbed = False
        self.cumulative_rotation = 0.0


class KnobGesture:
    """Detects vertical movement for volume knobs."""

    def __init__(self, zone: Tuple[float, float, float, float], name: str):
        """
        Initialize knob gesture detector.

        Args:
            zone: (x1, y1, x2, y2) normalized coordinates
            name: Identifier for this knob
        """
        self.zone = zone
        self.name = name
        self.last_y: Optional[float] = None
        self.is_grabbed = False
        self.value = config.DEFAULT_VOLUME  # Start at default volume

    def update(self, hand: Optional[HandData]) -> GestureState:
        """
        Update knob state based on hand position.

        Args:
            hand: HandData if hand is in zone, None otherwise

        Returns:
            GestureState with current knob state
        """
        state = GestureState()
        state.value = self.value

        if hand is None or not hand.is_pinching:
            # Release the knob
            self.is_grabbed = False
            self.last_y = None
            return state

        # Check if pinch is in zone
        if not self._in_zone(hand.pinch_position):
            self.is_grabbed = False
            self.last_y = None
            return state

        # Hand is pinching in zone - grab the knob
        self.is_grabbed = True
        state.is_active = True

        current_y = hand.pinch_position[1]

        if self.last_y is not None:
            # Calculate vertical movement (inverted: up = increase)
            delta = (self.last_y - current_y) * config.KNOB_SENSITIVITY

            # Update value, clamped to 0-1
            self.value = max(0.0, min(1.0, self.value + delta))
            state.delta = delta

        self.last_y = current_y
        state.value = self.value

        return state

    def _in_zone(self, pos: Tuple[float, float]) -> bool:
        """Check if position is within the zone."""
        x, y = pos
        return (self.zone[0] <= x <= self.zone[2] and
                self.zone[1] <= y <= self.zone[3])

    def reset(self):
        """Reset knob state."""
        self.last_y = None
        self.is_grabbed = False


class GestureDetector:
    """Main gesture detector managing all DJ controls."""

    def __init__(self):
        """Initialize all gesture detectors."""
        self.wheel_left = WheelGesture(config.ZONES['deck_left'], 'deck_left')
        self.wheel_right = WheelGesture(config.ZONES['deck_right'], 'deck_right')
        self.knob_left = KnobGesture(config.ZONES['knob_left'], 'knob_left')
        self.knob_right = KnobGesture(config.ZONES['knob_right'], 'knob_right')

    def update(self, hands: list) -> Dict[str, GestureState]:
        """
        Update all gestures based on detected hands.

        Args:
            hands: List of HandData from hand tracker

        Returns:
            Dictionary of gesture states for each control
        """
        # Find which hand is in which zone
        left_hand = None
        right_hand = None

        for hand in hands:
            if hand.handedness == 'Left':
                left_hand = hand
            else:
                right_hand = hand

        # Update each control
        # Left hand controls left deck and left knob
        # Right hand controls right deck and right knob
        states = {
            'deck_left': self.wheel_left.update(left_hand),
            'deck_right': self.wheel_right.update(right_hand),
            'knob_left': self.knob_left.update(left_hand),
            'knob_right': self.knob_right.update(right_hand),
        }

        return states

    def reset_all(self):
        """Reset all gesture states."""
        self.wheel_left.reset()
        self.wheel_right.reset()
        self.knob_left.reset()
        self.knob_right.reset()
