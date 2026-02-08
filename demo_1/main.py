#!/usr/bin/env python3
"""
DJ Booth Hand Gesture Controller
Control a virtual DJ booth using hand gestures detected via webcam.

Usage:
    python main.py

Controls:
    - Pinch (thumb + index) to grab controls
    - Rotate in deck zones to change tempo
    - Move up/down in knob zones to change volume
    - SPACE: Play/pause all decks
    - 1/2: Toggle individual decks
    - N/M: Next track on deck left/right
    - Q: Quit
"""

import cv2
import config
from hand_tracker import HandTracker
from gesture_detector import GestureDetector
from audio_engine import AudioEngine
from dj_controller import DJController
from ui_renderer import UIRenderer


def main():
    """Main application loop."""
    print("DJ Booth - Hand Gesture Controller")
    print("=" * 40)
    print("Starting up...")

    # Initialize components
    hand_tracker = HandTracker()
    gesture_detector = GestureDetector()
    audio_engine = AudioEngine()
    dj_controller = DJController(audio_engine)
    ui_renderer = UIRenderer(config.CAMERA_WIDTH, config.CAMERA_HEIGHT)

    # Open webcam
    cap = cv2.VideoCapture(config.CAMERA_ID)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, config.CAMERA_WIDTH)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, config.CAMERA_HEIGHT)

    if not cap.isOpened():
        print("Error: Could not open webcam")
        return

    print("Webcam opened successfully")
    print("\nControls:")
    print("  SPACE - Play/pause all decks")
    print("  1/2   - Toggle deck left/right")
    print("  N/M   - Next track on deck left/right")
    print("  Q     - Quit")
    print("\nGestures:")
    print("  Pinch + rotate in deck area = tempo control")
    print("  Pinch + move up/down in knob area = volume control")
    print("\nAdd audio files to the 'music' folder (.wav or .mp3):")
    print("  track1, track2 -> Left deck")
    print("  track3, track4 -> Right deck")
    print("-" * 40)

    try:
        while True:
            # Read frame
            ret, frame = cap.read()
            if not ret:
                print("Error: Could not read frame")
                break

            # Flip frame horizontally for mirror effect
            frame = cv2.flip(frame, 1)

            # Process hands
            hands = hand_tracker.process_frame(frame)

            # Detect gestures
            gesture_states = gesture_detector.update(hands)

            # Apply gestures to audio
            dj_controller.process_gestures(gesture_states)

            # Render UI
            frame = ui_renderer.render(frame, gesture_states, dj_controller, hands)

            # Display frame
            cv2.imshow('DJ Booth', frame)

            # Handle keyboard input
            key = cv2.waitKey(1) & 0xFF

            if key == ord('q'):
                break
            elif key == ord(' '):
                # Toggle all decks
                left_info = dj_controller.get_deck_info('left')
                right_info = dj_controller.get_deck_info('right')
                if left_info.get('is_playing') or right_info.get('is_playing'):
                    dj_controller.stop_all()
                else:
                    dj_controller.play_all()
            elif key == ord('1'):
                dj_controller.toggle_deck('left')
            elif key == ord('2'):
                dj_controller.toggle_deck('right')
            elif key == ord('n'):
                dj_controller.next_track('left')
            elif key == ord('m'):
                dj_controller.next_track('right')

    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        # Cleanup
        cap.release()
        cv2.destroyAllWindows()
        hand_tracker.close()
        audio_engine.close()
        print("Goodbye!")


if __name__ == '__main__':
    main()
