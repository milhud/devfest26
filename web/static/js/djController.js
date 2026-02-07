/**
 * DJ Controller - bridges gestures to audio engine.
 */

import { GestureDetector } from './gestureDetector.js';

export class DJController {
    constructor(audioEngine) {
        this.audio = audioEngine;
        this.gestureDetector = new GestureDetector();
        this.lastGestureState = null;
    }

    processGestures(hands, timestamp) {
        const gestureState = this.gestureDetector.update(hands, timestamp);
        this.lastGestureState = gestureState;

        // Stem selection (1-5 fingers)
        if (gestureState.stemSelect >= 0) {
            this.audio.selectStem(gestureState.stemSelect);
        }

        // Play/pause toggle
        if (gestureState.playPause) {
            this.audio.togglePlayPause();
        }

        // Pinch controls volume for currently selected stem
        const audioState = this.audio.getState();
        if (gestureState.isPinching && audioState.selectedStem >= 0) {
            this.audio.setStemVolume(audioState.selectedStem, gestureState.volume);
        }

        // Track switch (wave)
        if (gestureState.trackSwitch) {
            this.audio.nextTrack();
        }

        return gestureState;
    }

    getState() {
        return {
            audio: this.audio.getState(),
            gestures: this.lastGestureState,
        };
    }

    reset() {
        this.gestureDetector.reset();
        this.lastGestureState = null;
    }
}
