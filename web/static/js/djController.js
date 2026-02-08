/**
 * DJ Controller - bridges gestures to audio engine.
 */

import { CONFIG } from './config.js';
import { GestureDetector } from './gestureDetector.js';

export class DJController {
    constructor(audioEngine) {
        this.audio = audioEngine;
        this.gestureDetector = new GestureDetector();
        this.lastGestureState = null;
        this.lastEffectFinger = 0;
        this.lastEffectTriggerTime = 0;
    }

    processGestures(hands, timestamp) {
        const controlHand = hands.find((h) => h.handedness === CONFIG.CONTROL_HAND) || null;
        const controlHands = controlHand ? [controlHand] : [];
        const gestureState = this.gestureDetector.update(controlHands, timestamp);
        gestureState.effectTrigger = 0;
        this.lastGestureState = gestureState;

        // Stem selection (1..N fingers)
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
            const audioStateNow = this.audio.getState();
            if (!audioStateNow.isTrackLoading) {
                this.audio.nextTrack();
            }
        }

        // Effects: second hand maps finger count 1..3 to effect1..3
        const effectHand = hands.find((h) => h.handedness === CONFIG.EFFECT_HAND) || null;
        if (!effectHand) {
            this.lastEffectFinger = 0;
            return gestureState;
        }

        const effectFinger = this._countFingers(effectHand);
        if (effectFinger >= 1 && effectFinger <= CONFIG.EFFECTS_PER_HAND) {
            const changed = effectFinger !== this.lastEffectFinger;
            const cooldown = timestamp - this.lastEffectTriggerTime > CONFIG.EFFECT_TRIGGER_DEBOUNCE_MS;
            if (changed && cooldown) {
                const played = this.audio.playEffect(effectFinger - 1);
                if (played) {
                    this.lastEffectTriggerTime = timestamp;
                    gestureState.effectTrigger = effectFinger;
                }
            }
            this.lastEffectFinger = effectFinger;
        } else {
            this.lastEffectFinger = 0;
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
        this.lastEffectFinger = 0;
        this.lastEffectTriggerTime = 0;
    }

    _countFingers(hand) {
        const palmCenter = hand.palmCenter;
        let count = 0;

        for (const tipIndex of CONFIG.FINGERTIPS) {
            const tip = hand.landmarks[tipIndex];
            const dx = tip.x - palmCenter.x;
            const dy = tip.y - palmCenter.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const threshold = tipIndex === 4
                ? CONFIG.PALM_OPEN_THRESHOLD * 0.7
                : CONFIG.PALM_OPEN_THRESHOLD;
            if (dist > threshold) count++;
        }

        return count;
    }
}
