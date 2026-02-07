"""
DJ Controller - connects gestures to audio actions.
Central hub that translates gesture states into audio changes.
"""

from typing import Dict
from gesture_detector import GestureState
from audio_engine import AudioEngine
import config


class DJController:
    """Maps gesture inputs to audio engine actions."""

    def __init__(self, audio_engine: AudioEngine):
        """
        Initialize DJ controller.

        Args:
            audio_engine: AudioEngine instance to control
        """
        self.audio = audio_engine

        # Track tempo values (converted from wheel rotation to tempo)
        self.tempo_left = 1.0
        self.tempo_right = 1.0

    def process_gestures(self, gesture_states: Dict[str, GestureState]):
        """
        Process gesture states and apply to audio.

        Args:
            gesture_states: Dictionary of gesture states from GestureDetector
        """
        # Process deck wheels (tempo control)
        self._process_wheel('left', gesture_states.get('deck_left'))
        self._process_wheel('right', gesture_states.get('deck_right'))

        # Process knobs (volume control)
        self._process_knob('left', gesture_states.get('knob_left'))
        self._process_knob('right', gesture_states.get('knob_right'))

    def _process_wheel(self, deck_id: str, state: GestureState):
        """Process wheel rotation for tempo control."""
        if state is None:
            return

        deck = self.audio.get_deck(deck_id)
        if deck is None:
            return

        if state.is_active and state.delta != 0:
            # Convert rotation to tempo change
            # Positive rotation (clockwise) = speed up
            tempo_delta = state.delta * 0.1  # Scale down the rotation

            if deck_id == 'left':
                self.tempo_left = max(
                    config.MIN_TEMPO,
                    min(config.MAX_TEMPO, self.tempo_left + tempo_delta)
                )
                deck.set_tempo(self.tempo_left)
            else:
                self.tempo_right = max(
                    config.MIN_TEMPO,
                    min(config.MAX_TEMPO, self.tempo_right + tempo_delta)
                )
                deck.set_tempo(self.tempo_right)

    def _process_knob(self, deck_id: str, state: GestureState):
        """Process knob movement for volume control."""
        if state is None:
            return

        deck = self.audio.get_deck(deck_id)
        if deck is None:
            return

        # Always update volume to match knob value
        deck.set_volume(state.value)

    def get_deck_info(self, deck_id: str) -> dict:
        """Get current info for a deck."""
        deck = self.audio.get_deck(deck_id)
        if deck is None:
            return {}

        return {
            'track': deck.get_track_name(),
            'volume': deck.volume,
            'tempo': deck.tempo,
            'is_playing': deck.is_playing,
        }

    def play_deck(self, deck_id: str):
        """Start playback on a deck."""
        deck = self.audio.get_deck(deck_id)
        if deck:
            deck.play()

    def stop_deck(self, deck_id: str):
        """Stop a deck."""
        deck = self.audio.get_deck(deck_id)
        if deck:
            deck.stop()

    def toggle_deck(self, deck_id: str):
        """Toggle play/pause on a deck."""
        deck = self.audio.get_deck(deck_id)
        if deck:
            if deck.is_playing:
                deck.pause()
            else:
                if deck.channel.get_busy():
                    deck.unpause()
                else:
                    deck.play()

    def next_track(self, deck_id: str):
        """Switch to next track on a deck."""
        deck = self.audio.get_deck(deck_id)
        if deck:
            deck.next_track()

    def play_all(self):
        """Start both decks."""
        self.audio.play_all()

    def stop_all(self):
        """Stop both decks."""
        self.audio.stop_all()
