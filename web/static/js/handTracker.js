/**
 * Hand tracking using MediaPipe Tasks Vision API.
 */

import { CONFIG } from './config.js';
import {
    FilesetResolver,
    HandLandmarker
} from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/+esm';

export class HandTracker {
    constructor() {
        this.handLandmarker = null;
        this.lastResults = null;
        this.isInitialized = false;
        this.controlHandLabel = null;
    }

    async initialize() {
        const vision = await FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm'
        );

        this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: CONFIG.MODEL_PATH,
                delegate: 'CPU',
            },
            runningMode: 'VIDEO',
            numHands: 2,
            minHandDetectionConfidence: 0.5,
            minHandPresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
        });

        this.isInitialized = true;
        console.log('Hand tracking ready');
    }

    processFrame(video, timestamp) {
        if (!this.isInitialized || !this.handLandmarker) {
            return [];
        }

        try {
            this.lastResults = this.handLandmarker.detectForVideo(video, timestamp);
        } catch (e) {
            return [];
        }

        return this._extractHandData(this.lastResults);
    }

    _extractHandData(results) {
        const hands = [];

        if (!results.landmarks || !results.handedness) {
            return hands;
        }

        for (let i = 0; i < results.landmarks.length; i++) {
            const landmarks = results.landmarks[i];
            const handedness = results.handedness[i];

            const rawLabel = handedness[0].categoryName;
            const actualHandedness = rawLabel === 'Left' ? 'Right' : 'Left';

            const thumbTip = landmarks[CONFIG.LANDMARKS.THUMB_TIP];
            const indexTip = landmarks[CONFIG.LANDMARKS.INDEX_TIP];
            const wrist = landmarks[CONFIG.LANDMARKS.WRIST];
            const indexMCP = landmarks[CONFIG.LANDMARKS.INDEX_MCP];
            const pinkyMCP = landmarks[CONFIG.LANDMARKS.PINKY_MCP];
            const middleMCP = landmarks[CONFIG.LANDMARKS.MIDDLE_MCP];

            const pinchDist = this._distance(thumbTip, indexTip);
            const isPinching = pinchDist < CONFIG.PINCH_THRESHOLD;

            const pinchPosition = {
                x: (thumbTip.x + indexTip.x) / 2,
                y: (thumbTip.y + indexTip.y) / 2,
            };

            const palmCenter = {
                x: (wrist.x + indexMCP.x + middleMCP.x + pinkyMCP.x) / 4,
                y: (wrist.y + indexMCP.y + middleMCP.y + pinkyMCP.y) / 4,
            };

            const { isFist, isOpenPalm } = this._detectHandState(landmarks, palmCenter);
            const rollAngle = this._calculateRollAngle(indexMCP, pinkyMCP);

            hands.push({
                landmarks,
                handedness: actualHandedness,
                isPinching,
                pinchPosition,
                palmCenter,
                isFist,
                isOpenPalm,
                rollAngle,
            });
        }
        // Single-hand control mode: lock control to one hand label.
        if (hands.length === 0) return hands;

        if (!this.controlHandLabel) {
            const preferred = hands.find(h => h.handedness === CONFIG.CONTROL_HAND);
            const chosen = preferred || hands[0];
            this.controlHandLabel = chosen.handedness;
            return [chosen];
        }

        const tracked = hands.find(h => h.handedness === this.controlHandLabel);
        if (tracked) return [tracked];

        // Fallback if hand label temporarily drops.
        return [hands[0]];
    }

    _detectHandState(landmarks, palmCenter) {
        const fingertipDistances = CONFIG.FINGERTIPS.map(idx => {
            const tip = landmarks[idx];
            return this._distance(tip, palmCenter);
        });

        const isFist = fingertipDistances.every(d => d < CONFIG.FIST_THRESHOLD);
        const isOpenPalm = fingertipDistances.every(d => d > CONFIG.PALM_OPEN_THRESHOLD);

        return { isFist, isOpenPalm };
    }

    _calculateRollAngle(indexMCP, pinkyMCP) {
        const dx = indexMCP.x - pinkyMCP.x;
        const dy = indexMCP.y - pinkyMCP.y;
        return Math.atan2(dy, dx);
    }

    _distance(p1, p2) {
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    isReady() {
        return this.isInitialized;
    }
}
