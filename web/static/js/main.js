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
            const audioState = this.audioEngine.getState();

            this.uiRenderer.render(hands, gestureState, audioState);

            // Debug: log hands detected every second
            if (!this._lastLog || timestamp - this._lastLog > 1000) {
                console.log(`Hands: ${hands.length}, Canvas: ${this.canvas.width}x${this.canvas.height}`);
                this._lastLog = timestamp;
            }
        } catch (e) {
            console.error('Loop error:', e);
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
