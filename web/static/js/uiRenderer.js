/**
 * UI Renderer - updates visual controls and draws hand overlay.
 */

import { CONFIG } from './config.js';

export class UIRenderer {
    constructor(canvas, video) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.video = video;
        this.statusMessage = 'Show your hand';

        // DOM elements
        this.elements = {
            trackName: document.getElementById('track-name'),
            stemNumber: document.getElementById('stem-number'),
            playStatus: document.getElementById('play-status'),
            volumeValue: document.getElementById('volume-value'),
            stemDots: [
                document.getElementById('stem-1'),
                document.getElementById('stem-2'),
                document.getElementById('stem-3'),
            ],
            hintStem: document.getElementById('hint-stem'),
            hintFist: document.getElementById('hint-fist'),
            hintVolume: document.getElementById('hint-volume'),
            hintWave: document.getElementById('hint-wave'),
            hintStatus: document.getElementById('gesture-status'),
        };
    }

    resize() {
        if (this.video.videoWidth && this.video.videoHeight) {
            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;
            console.log(`Canvas resized to ${this.canvas.width}x${this.canvas.height}`);
        } else {
            // Fallback: use client dimensions
            const rect = this.video.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                this.canvas.width = rect.width;
                this.canvas.height = rect.height;
                console.log(`Canvas fallback to ${this.canvas.width}x${this.canvas.height}`);
            }
        }
    }

    render(hands, gestureState, audioState) {
        const { ctx, canvas } = this;

        // Ensure canvas is sized
        if (canvas.width === 0 || canvas.height === 0) {
            this.resize();
        }

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Debug: draw border to confirm canvas is visible
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 3;
        ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);

        // Draw hands
        for (const hand of hands) {
            this._drawHand(hand);
        }

        // Draw finger count indicator
        if (gestureState && gestureState.handDetected) {
            this._drawFingerCount(gestureState.fingerCount);
        } else {
            // Show "no hand" message
            ctx.font = 'bold 24px Arial';
            ctx.fillStyle = '#888';
            ctx.textAlign = 'center';
            ctx.fillText('Show your hand', canvas.width / 2, 50);
        }

        // Update DJ booth display
        this.statusMessage = this._updateDisplay(gestureState, audioState);
        this._drawStatusMessage(this.statusMessage);
    }

    _drawHand(hand) {
        const { ctx, canvas } = this;
        const landmarks = hand.landmarks;

        // Draw connections
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.6)';
        ctx.lineWidth = 2;

        for (const [start, end] of CONFIG.HAND_CONNECTIONS) {
            const p1 = landmarks[start];
            const p2 = landmarks[end];
            ctx.beginPath();
            ctx.moveTo(p1.x * canvas.width, p1.y * canvas.height);
            ctx.lineTo(p2.x * canvas.width, p2.y * canvas.height);
            ctx.stroke();
        }

        // Draw landmarks
        for (let i = 0; i < landmarks.length; i++) {
            const lm = landmarks[i];
            const x = lm.x * canvas.width;
            const y = lm.y * canvas.height;

            const isFingertip = CONFIG.FINGERTIPS.includes(i);
            ctx.beginPath();
            ctx.arc(x, y, isFingertip ? 6 : 3, 0, Math.PI * 2);
            ctx.fillStyle = isFingertip ? '#ff6b35' : '#00ffff';
            ctx.fill();
        }
    }

    _drawFingerCount(count) {
        const { ctx, canvas } = this;

        // Draw big finger count in top-left
        ctx.font = 'bold 80px Arial';
        ctx.fillStyle = count === 0 ? '#ff3250' : '#00ff88';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(count.toString(), 30, 30);

        // Label
        ctx.font = '16px Arial';
        ctx.fillStyle = '#888';
        ctx.fillText('FINGERS', 30, 115);
    }

    _drawStatusMessage(message) {
        if (!message) return;

        const { ctx, canvas } = this;
        const x = canvas.width / 2;
        const y = canvas.height - 90;

        ctx.font = '700 24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const width = Math.min(canvas.width - 40, Math.max(220, message.length * 13));
        const height = 42;
        const left = x - width / 2;
        const top = y - height / 2;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(left, top, width, height);

        ctx.strokeStyle = 'rgba(255, 107, 53, 0.85)';
        ctx.lineWidth = 2;
        ctx.strokeRect(left, top, width, height);

        ctx.fillStyle = '#ffffff';
        ctx.fillText(message, x, y);
    }

    _updateDisplay(gestureState, audioState) {
        let statusMessage = 'Show your hand';
        if (!audioState) return statusMessage;

        // Track name
        if (this.elements.trackName) {
            this.elements.trackName.textContent = audioState.trackFolder.toUpperCase();
        }

        // Stem number
        if (this.elements.stemNumber) {
            this.elements.stemNumber.textContent = audioState.selectedStem >= 0
                ? `${audioState.selectedStem + 1}`
                : '--';
        }

        // Play status
        if (this.elements.playStatus) {
            if (audioState.isPlaying) {
                this.elements.playStatus.textContent = 'PLAYING';
                this.elements.playStatus.classList.add('playing');
            } else {
                this.elements.playStatus.textContent = 'PAUSED';
                this.elements.playStatus.classList.remove('playing');
            }
        }

        // Volume
        if (this.elements.volumeValue) {
            this.elements.volumeValue.textContent = `${Math.round(audioState.volume * 100)}%`;
        }

        // Stem dots
        for (let i = 0; i < this.elements.stemDots.length; i++) {
            const dot = this.elements.stemDots[i];
            if (!dot) continue;

            const stemVolume = (audioState.stemVolumes && audioState.stemVolumes[i]) || 0;
            const isActiveLayer = stemVolume > 0.02;
            const isSelected = audioState.selectedStem === i;
            const isPlaying = isActiveLayer && audioState.isPlaying;

            dot.classList.toggle('active', isActiveLayer);
            dot.classList.toggle('selected', isSelected);
            dot.classList.toggle('playing', isPlaying);
        }

        // Gesture hints + status
        if (gestureState) {
            const hasHand = gestureState.handDetected;
            const isSelecting = hasHand && gestureState.fingerCount >= 1 && gestureState.fingerCount <= CONFIG.STEMS_PER_TRACK;
            const isFist = hasHand && gestureState.isFist;
            const isWave = gestureState.trackSwitch;
            const isPinching = !!gestureState.isPinching;

            if (this.elements.hintStem) this.elements.hintStem.classList.toggle('active', isSelecting);
            if (this.elements.hintFist) this.elements.hintFist.classList.toggle('active', isFist);
            if (this.elements.hintVolume) this.elements.hintVolume.classList.toggle('active', isPinching);
            if (this.elements.hintWave) this.elements.hintWave.classList.toggle('active', isWave);

            if (this.elements.hintStatus) {
                if (!hasHand) {
                    statusMessage = 'Show your hand';
                } else if (gestureState.playPause) {
                    statusMessage = audioState.isPlaying ? 'Playing' : 'Paused';
                } else if (gestureState.trackSwitch) {
                    statusMessage = 'Next track';
                } else if (gestureState.stemSelectionLocked && gestureState.stemSelectionLockRemainingMs > 0) {
                    const secs = Math.ceil(gestureState.stemSelectionLockRemainingMs / 1000);
                    statusMessage = `Stem lock ${secs}s - pinch to mix`;
                } else if (gestureState.stemSelect >= 0) {
                    const stemIndex = gestureState.stemSelect;
                    const stemVolume = (audioState.stemVolumes && audioState.stemVolumes[stemIndex]) || 0;
                    statusMessage = `Selected stem ${stemIndex + 1} (${Math.round(stemVolume * 100)}%)`;
                } else if (gestureState.isPinching) {
                    const selected = audioState.selectedStem >= 0 ? audioState.selectedStem + 1 : '--';
                    statusMessage = `Stem ${selected} volume ${Math.round(gestureState.volume * 100)}%`;
                } else {
                    statusMessage = audioState.selectedStem >= 0
                        ? `Stem ${audioState.selectedStem + 1} ready - pinch to set volume`
                        : `Hold 1-${CONFIG.STEMS_PER_TRACK} fingers to choose a stem`;
                }
                this.elements.hintStatus.textContent = statusMessage;
            }
        }

        return statusMessage;
    }
}
