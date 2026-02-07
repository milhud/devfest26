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

        // Apply crossfader
        this.audio.setCrossfader(gestureState.crossfader);

        // Apply volumes
        this.audio.setVolume('left', gestureState.volumeLeft);
        this.audio.setVolume('right', gestureState.volumeRight);

        // Apply filter
        this.audio.setFilterFrequency('left', gestureState.filterSweep);

        // Handle play/pause
        if (gestureState.playPauseLeft) {
            this.audio.togglePlayPause('left');
        }
        if (gestureState.playPauseRight) {
            this.audio.togglePlayPause('right');
        }

        // Handle track switching
        if (gestureState.trackSwitchLeft !== 0) {
            this.audio.switchTrack('left', gestureState.trackSwitchLeft);
        }
        if (gestureState.trackSwitchRight !== 0) {
            this.audio.switchTrack('right', gestureState.trackSwitchRight);
        }

        // Handle effects
        if (gestureState.effectTrigger >= 0) {
            this.audio.playEffect(gestureState.effectTrigger);
        }

        return gestureState;
    }

    getState() {
        return {
            deckLeft: this.audio.getDeckInfo('left'),
            deckRight: this.audio.getDeckInfo('right'),
            crossfader: this.audio.getCrossfader(),
            gestures: this.lastGestureState,
        };
    }

    reset() {
        this.gestureDetector.reset();
        this.lastGestureState = null;
    }

    getLastGestureState() {
        return this.lastGestureState;
    }
}
