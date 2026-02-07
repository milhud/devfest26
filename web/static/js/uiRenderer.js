/**
 * UI Renderer - updates visual DJ controls and draws hand overlay.
 */

import { CONFIG } from './config.js';

export class UIRenderer {
    constructor(canvas, video) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.video = video;

        // DOM elements
        this.elements = {
            handStatus: document.getElementById('hand-status'),
            vinylA: document.getElementById('vinyl-a'),
            vinylB: document.getElementById('vinyl-b'),
            playA: document.getElementById('play-a'),
            playB: document.getElementById('play-b'),
            knobVolA: document.getElementById('knob-vol-a'),
            knobVolB: document.getElementById('knob-vol-b'),
            knobFilter: document.getElementById('knob-filter'),
            volAValue: document.getElementById('vol-a-value'),
            volBValue: document.getElementById('vol-b-value'),
            filterValue: document.getElementById('filter-value'),
            crossfader: document.getElementById('crossfader'),
            trackLabelA: document.getElementById('track-label-a'),
            trackLabelB: document.getElementById('track-label-b'),
            trackTypeA: document.getElementById('track-type-a'),
            trackTypeB: document.getElementById('track-type-b'),
            fx1: document.getElementById('fx-1'),
            fx2: document.getElementById('fx-2'),
            fx3: document.getElementById('fx-3'),
        };

        this.effectFlashTimers = [null, null, null];
    }

    resize() {
        if (this.video.videoWidth && this.video.videoHeight) {
            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;
        }
    }

    render(hands, gestureState, deckInfo) {
        const { ctx, canvas } = this;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Update status
        this._updateHandStatus(hands, gestureState);

        // Draw hands
        for (const hand of hands) {
            this._drawHand(hand);
        }

        // Update DJ controls
        this._updateDeckControls(deckInfo);
        this._updateMixer(gestureState, deckInfo);

        // Flash effect button if triggered
        if (gestureState?.effectTrigger >= 0) {
            this._flashEffect(gestureState.effectTrigger);
        }
    }

    _updateHandStatus(hands, gestureState) {
        const status = this.elements.handStatus;
        if (!status) return;

        if (hands.length === 0) {
            status.textContent = 'Show your hands to control';
            status.style.color = '#888';
        } else {
            const hand = hands[0];
            let gesture = 'tracking';
            if (hand.isFist) gesture = 'FIST (play/pause)';
            else if (hand.isPinching) gesture = 'PINCH (adjusting)';
            else if (hand.isOpenPalm) gesture = 'OPEN';

            status.textContent = `${hands.length} hand${hands.length > 1 ? 's' : ''}: ${gesture}`;
            status.style.color = '#00ff88';
        }
    }

    _drawHand(hand) {
        const { ctx, canvas } = this;
        const landmarks = hand.landmarks;

        // Draw connections
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.7)';
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

            const isFingertip = [4, 8, 12, 16, 20].includes(i);
            ctx.beginPath();
            ctx.arc(x, y, isFingertip ? 5 : 3, 0, Math.PI * 2);
            ctx.fillStyle = isFingertip ? '#ff6b35' : '#00ffff';
            ctx.fill();
        }

        // Palm center with state indicator
        ctx.beginPath();
        ctx.arc(
            hand.palmCenter.x * canvas.width,
            hand.palmCenter.y * canvas.height,
            12, 0, Math.PI * 2
        );
        ctx.strokeStyle = hand.isFist ? '#ff3250' : hand.isPinching ? '#00ff88' : 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 3;
        ctx.stroke();

        // State label
        if (hand.isFist) {
            ctx.font = 'bold 14px Arial';
            ctx.fillStyle = '#ff3250';
            ctx.textAlign = 'center';
            ctx.fillText('FIST', hand.palmCenter.x * canvas.width, hand.palmCenter.y * canvas.height - 20);
        } else if (hand.isPinching) {
            ctx.font = 'bold 14px Arial';
            ctx.fillStyle = '#00ff88';
            ctx.textAlign = 'center';
            ctx.fillText('PINCH', hand.palmCenter.x * canvas.width, hand.palmCenter.y * canvas.height - 20);
        }
    }

    _updateDeckControls(deckInfo) {
        // Deck A
        if (deckInfo.left) {
            const info = deckInfo.left;

            if (this.elements.volAValue) {
                this.elements.volAValue.textContent = `${Math.round(info.volume * 100)}%`;
            }

            if (this.elements.knobVolA) {
                const rotation = (info.volume - 0.5) * 270;
                const indicator = this.elements.knobVolA.querySelector('.knob-indicator');
                if (indicator) indicator.style.transform = `translateX(-50%) rotate(${rotation}deg)`;
            }

            if (this.elements.playA) {
                this.elements.playA.classList.toggle('playing', info.isPlaying);
                this.elements.playA.textContent = info.isPlaying ? 'STOP' : 'PLAY';
            }

            if (this.elements.vinylA) {
                this.elements.vinylA.classList.toggle('playing', info.isPlaying);
            }

            if (this.elements.trackLabelA) {
                this.elements.trackLabelA.textContent = info.trackName.toUpperCase();
            }

            if (this.elements.trackTypeA) {
                this.elements.trackTypeA.textContent = info.trackType.toUpperCase();
            }
        }

        // Deck B
        if (deckInfo.right) {
            const info = deckInfo.right;

            if (this.elements.volBValue) {
                this.elements.volBValue.textContent = `${Math.round(info.volume * 100)}%`;
            }

            if (this.elements.knobVolB) {
                const rotation = (info.volume - 0.5) * 270;
                const indicator = this.elements.knobVolB.querySelector('.knob-indicator');
                if (indicator) indicator.style.transform = `translateX(-50%) rotate(${rotation}deg)`;
            }

            if (this.elements.playB) {
                this.elements.playB.classList.toggle('playing', info.isPlaying);
                this.elements.playB.textContent = info.isPlaying ? 'STOP' : 'PLAY';
            }

            if (this.elements.vinylB) {
                this.elements.vinylB.classList.toggle('playing', info.isPlaying);
            }

            if (this.elements.trackLabelB) {
                this.elements.trackLabelB.textContent = info.trackName.toUpperCase();
            }

            if (this.elements.trackTypeB) {
                this.elements.trackTypeB.textContent = info.trackType.toUpperCase();
            }
        }
    }

    _updateMixer(gestureState, deckInfo) {
        // Crossfader
        if (this.elements.crossfader && gestureState) {
            const percent = gestureState.crossfader * 100;
            this.elements.crossfader.style.left = `${percent}%`;
        }

        // Filter
        if (deckInfo.left && this.elements.filterValue) {
            const freq = deckInfo.left.filterFreq;
            this.elements.filterValue.textContent = freq >= 1000
                ? `${(freq / 1000).toFixed(1)}kHz`
                : `${Math.round(freq)}Hz`;
        }

        if (this.elements.knobFilter && gestureState) {
            const rotation = (gestureState.filterSweep - 0.5) * 270;
            const indicator = this.elements.knobFilter.querySelector('.knob-indicator');
            if (indicator) indicator.style.transform = `translateX(-50%) rotate(${rotation}deg)`;
        }
    }

    _flashEffect(index) {
        const btns = [this.elements.fx1, this.elements.fx2, this.elements.fx3];
        const btn = btns[index];
        if (!btn) return;

        // Clear previous timer
        if (this.effectFlashTimers[index]) {
            clearTimeout(this.effectFlashTimers[index]);
        }

        btn.classList.add('active');
        this.effectFlashTimers[index] = setTimeout(() => {
            btn.classList.remove('active');
        }, 200);
    }
}
