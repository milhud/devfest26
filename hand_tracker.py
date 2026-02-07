"""
Hand tracking module using Google MediaPipe Tasks API.
Handles hand detection, landmark extraction, and finger state analysis.
"""

import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import numpy as np
from dataclasses import dataclass
from typing import Optional, List, Tuple
from pathlib import Path
import config


@dataclass
class HandData:
    """Processed hand data for gesture detection."""
    landmarks: List[Tuple[float, float]]  # Normalized (x, y) for each of 21 landmarks
    handedness: str  # 'Left' or 'Right'
    is_pinching: bool
    pinch_position: Tuple[float, float]  # Position of pinch (midpoint of thumb-index)
    index_tip: Tuple[float, float]
    thumb_tip: Tuple[float, float]


class HandTracker:
    """MediaPipe hand tracking wrapper using Tasks API."""

    # Landmark indices
    THUMB_TIP = 4
    INDEX_TIP = 8
    MIDDLE_TIP = 12
    RING_TIP = 16
    PINKY_TIP = 20
    WRIST = 0

    def __init__(self, model_path: str = "hand_landmarker.task"):
        """Initialize MediaPipe HandLandmarker."""
        # Find model file
        model_file = Path(model_path)
        if not model_file.exists():
            model_file = Path(__file__).parent / model_path

        base_options = python.BaseOptions(model_asset_path=str(model_file))
        options = vision.HandLandmarkerOptions(
            base_options=base_options,
            num_hands=2,
            min_hand_detection_confidence=0.5,
            min_hand_presence_confidence=0.5,
            min_tracking_confidence=0.5
        )
        self.detector = vision.HandLandmarker.create_from_options(options)
        self.last_result = None

    def process_frame(self, frame) -> List[HandData]:
        """
        Process a frame and return detected hands.

        Args:
            frame: BGR image from OpenCV

        Returns:
            List of HandData objects for each detected hand
        """
        # Convert BGR to RGB for MediaPipe
        rgb_frame = frame[:, :, ::-1].copy()

        # Create MediaPipe Image
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)

        # Detect hands
        result = self.detector.detect(mp_image)
        self.last_result = result

        hands = []
        if result.hand_landmarks and result.handedness:
            for hand_landmarks, handedness in zip(
                result.hand_landmarks,
                result.handedness
            ):
                hand_data = self._process_hand(hand_landmarks, handedness)
                hands.append(hand_data)

        return hands

    def _process_hand(self, hand_landmarks, handedness) -> HandData:
        """Extract useful data from raw hand landmarks."""
        # Get all landmark positions
        landmarks = [
            (lm.x, lm.y) for lm in hand_landmarks
        ]

        # Get handedness (MediaPipe returns mirrored, so flip it)
        hand_label = handedness[0].category_name
        # Flip because webcam is mirrored
        actual_handedness = 'Right' if hand_label == 'Left' else 'Left'

        # Get key finger positions
        thumb_tip = landmarks[self.THUMB_TIP]
        index_tip = landmarks[self.INDEX_TIP]

        # Calculate pinch
        pinch_distance = self._distance(thumb_tip, index_tip)
        is_pinching = pinch_distance < config.PINCH_THRESHOLD

        # Pinch position is midpoint between thumb and index
        pinch_position = (
            (thumb_tip[0] + index_tip[0]) / 2,
            (thumb_tip[1] + index_tip[1]) / 2
        )

        return HandData(
            landmarks=landmarks,
            handedness=actual_handedness,
            is_pinching=is_pinching,
            pinch_position=pinch_position,
            index_tip=index_tip,
            thumb_tip=thumb_tip
        )

    def _distance(self, p1: Tuple[float, float], p2: Tuple[float, float]) -> float:
        """Calculate Euclidean distance between two points."""
        return np.sqrt((p1[0] - p2[0])**2 + (p1[1] - p2[1])**2)

    def get_last_result(self):
        """Get the last detection result for drawing."""
        return self.last_result

    def close(self):
        """Release resources."""
        self.detector.close()
