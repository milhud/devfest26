"""
Audio engine using pygame mixer.
Handles track loading, playback, and volume control.
"""

import pygame
import os
from typing import Optional, Dict
from pathlib import Path
import config


class Deck:
    """Represents a single DJ deck with track playback."""

    def __init__(self, deck_id: str, channel: pygame.mixer.Channel):
        """
        Initialize a deck.

        Args:
            deck_id: Identifier ('left' or 'right')
            channel: Pygame mixer channel for this deck
        """
        self.deck_id = deck_id
        self.channel = channel
        self.tracks = config.DECK_TRACKS[deck_id]
        self.current_track_index = 0
        self.current_sound: Optional[pygame.mixer.Sound] = None
        self.current_track_file: str = ""  # Actual loaded filename
        self.volume = config.DEFAULT_VOLUME
        self.tempo = 1.0  # 1.0 = normal speed
        self.is_playing = False

    def _find_track_file(self, track_name: str) -> Optional[Path]:
        """
        Find track file with any supported extension.

        Args:
            track_name: Base track name without extension

        Returns:
            Path to file if found, None otherwise
        """
        for ext in config.SUPPORTED_EXTENSIONS:
            track_path = Path('music') / f"{track_name}{ext}"
            if track_path.exists():
                return track_path
        return None

    def load_track(self, index: int) -> bool:
        """
        Load a track by index.

        Args:
            index: Track index (0 or 1 for this deck)

        Returns:
            True if loaded successfully
        """
        if index < 0 or index >= len(self.tracks):
            return False

        track_name = self.tracks[index]
        track_path = self._find_track_file(track_name)

        if track_path is None:
            print(f"Track not found: {track_name} (tried {config.SUPPORTED_EXTENSIONS})")
            return False

        try:
            self.current_sound = pygame.mixer.Sound(str(track_path))
            self.current_track_index = index
            self.current_track_file = track_path.name
            self.channel.set_volume(self.volume)
            print(f"Loaded: {track_path.name} on deck {self.deck_id}")
            return True
        except Exception as e:
            print(f"Error loading track: {e}")
            return False

    def play(self, loops: int = -1):
        """Start playback (loops=-1 for infinite loop)."""
        if self.current_sound:
            self.channel.play(self.current_sound, loops=loops)
            self.is_playing = True

    def stop(self):
        """Stop playback."""
        self.channel.stop()
        self.is_playing = False

    def pause(self):
        """Pause playback."""
        self.channel.pause()
        self.is_playing = False

    def unpause(self):
        """Resume playback."""
        self.channel.unpause()
        self.is_playing = True

    def set_volume(self, volume: float):
        """Set volume (0.0 to 1.0)."""
        self.volume = max(0.0, min(1.0, volume))
        self.channel.set_volume(self.volume)

    def set_tempo(self, tempo: float):
        """
        Set tempo/playback speed.

        Note: Pygame doesn't support real-time tempo change.
        This stores the value for display purposes.
        For true tempo control, would need pydub or librosa.
        """
        self.tempo = max(config.MIN_TEMPO, min(config.MAX_TEMPO, tempo))

    def get_track_name(self) -> str:
        """Get current track filename."""
        if self.current_track_file:
            return self.current_track_file
        if self.current_track_index < len(self.tracks):
            return self.tracks[self.current_track_index]
        return "No track"

    def next_track(self):
        """Load next track in deck's track list."""
        next_index = (self.current_track_index + 1) % len(self.tracks)
        was_playing = self.is_playing
        if was_playing:
            self.stop()
        self.load_track(next_index)
        if was_playing:
            self.play()


class AudioEngine:
    """Main audio engine managing both decks."""

    def __init__(self):
        """Initialize pygame mixer and decks."""
        pygame.mixer.init(
            frequency=config.SAMPLE_RATE,
            size=-16,
            channels=2,
            buffer=config.AUDIO_BUFFER
        )
        pygame.mixer.set_num_channels(4)  # 2 decks + headroom

        self.decks: Dict[str, Deck] = {
            'left': Deck('left', pygame.mixer.Channel(0)),
            'right': Deck('right', pygame.mixer.Channel(1)),
        }

        # Try to load initial tracks
        self._load_initial_tracks()

    def _load_initial_tracks(self):
        """Attempt to load first track on each deck."""
        for deck in self.decks.values():
            deck.load_track(0)

    def get_deck(self, deck_id: str) -> Optional[Deck]:
        """Get a deck by ID."""
        return self.decks.get(deck_id)

    def play_all(self):
        """Start playback on all decks."""
        for deck in self.decks.values():
            if deck.current_sound:
                deck.play()

    def stop_all(self):
        """Stop all decks."""
        for deck in self.decks.values():
            deck.stop()

    def set_master_volume(self, volume: float):
        """Set volume on all decks."""
        for deck in self.decks.values():
            deck.set_volume(volume)

    def close(self):
        """Clean up pygame mixer."""
        pygame.mixer.quit()
