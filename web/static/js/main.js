/**
 * DJ Booth Application
 */

import { CONFIG } from './config.js';
import { HandTracker } from './handTracker.js';
import { AudioEngine } from './audioEngine.js';
import { DJController } from './djController.js';
import { UIRenderer } from './uiRenderer.js';

class DJBoothApp {
    constructor() {
        this.video = document.getElementById('webcam');
        this.canvas = document.getElementById('overlay');
        this.startBtn = document.getElementById('start-btn');
        this.startOverlay = document.getElementById('start-overlay');
        this.loadingOverlay = document.getElementById('loading-overlay');
        this.errorOverlay = document.getElementById('error-overlay');
        this.errorMessage = document.getElementById('error-message');
        this.retryBtn = document.getElementById('retry-btn');

        this.handTracker = new HandTracker();
        this.audioEngine = new AudioEngine();
        this.djController = new DJController(this.audioEngine);
        this.uiRenderer = new UIRenderer(this.canvas, this.video);

        this.isRunning = false;
    }

    async init() {
        this.startBtn.addEventListener('click', () => this.start());
        if (this.retryBtn) {
            this.retryBtn.addEventListener('click', () => this.start());
        }

        // Play buttons
        const playA = document.getElementById('play-a');
        const playB = document.getElementById('play-b');
        if (playA) playA.addEventListener('click', () => this.audioEngine.togglePlayPause('left'));
        if (playB) playB.addEventListener('click', () => this.audioEngine.togglePlayPause('right'));

        // Effect buttons
        const fx1 = document.getElementById('fx-1');
        const fx2 = document.getElementById('fx-2');
        const fx3 = document.getElementById('fx-3');
        if (fx1) fx1.addEventListener('click', () => this.audioEngine.playEffect(0));
        if (fx2) fx2.addEventListener('click', () => this.audioEngine.playEffect(1));
        if (fx3) fx3.addEventListener('click', () => this.audioEngine.playEffect(2));

        this.video.addEventListener('loadedmetadata', () => this.uiRenderer.resize());
        window.addEventListener('resize', () => this.uiRenderer.resize());

        console.log('DJ Booth ready');
    }

    async start() {
        try {
            this._showLoading();

            console.log('Initializing audio...');
            await this.audioEngine.initialize();

            console.log('Loading hand tracking...');
            await this.handTracker.initialize();

            console.log('Requesting camera...');
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: CONFIG.CAMERA_WIDTH },
                    height: { ideal: CONFIG.CAMERA_HEIGHT },
                    facingMode: 'user',
                },
                audio: false,
            });

            this.video.srcObject = stream;
            await this.video.play();

            this.uiRenderer.resize();
            this._hideOverlays();

            this.isRunning = true;
            this._loop();

            console.log('DJ Booth started!');

        } catch (error) {
            console.error('Failed to start:', error);
            this._showError(error.message || 'Unknown error');
        }
    }

    _loop() {
        if (!this.isRunning) return;

        const timestamp = performance.now();

        try {
            const hands = this.handTracker.processFrame(this.video, timestamp);
            const gestureState = this.djController.processGestures(hands, timestamp);

            const deckInfo = {
                left: this.audioEngine.getDeckInfo('left'),
                right: this.audioEngine.getDeckInfo('right'),
            };

            this.uiRenderer.render(hands, gestureState, deckInfo);
        } catch (e) {
            // Continue on errors
        }

        requestAnimationFrame(() => this._loop());
    }

    _showLoading() {
        if (this.startOverlay) this.startOverlay.style.display = 'none';
        if (this.errorOverlay) this.errorOverlay.style.display = 'none';
        if (this.loadingOverlay) this.loadingOverlay.style.display = 'flex';
    }

    _hideOverlays() {
        if (this.startOverlay) this.startOverlay.style.display = 'none';
        if (this.loadingOverlay) this.loadingOverlay.style.display = 'none';
        if (this.errorOverlay) this.errorOverlay.style.display = 'none';
    }

    _showError(message) {
        if (this.startOverlay) this.startOverlay.style.display = 'none';
        if (this.loadingOverlay) this.loadingOverlay.style.display = 'none';
        if (this.errorOverlay) this.errorOverlay.style.display = 'flex';
        if (this.errorMessage) this.errorMessage.textContent = message;
    }
}

const app = new DJBoothApp();
app.init();
