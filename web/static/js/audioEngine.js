/**
 * Audio engine with stem-based playback.
 * Each track folder has 5 stems (stem1-5.mp3/wav).
 * All stems run in sync; selection targets a layer for volume control.
 */

import { CONFIG } from './config.js';

export class AudioEngine {
    constructor() {
        this.currentTrackIndex = 0;
        this.currentTrackFolder = CONFIG.TRACK_FOLDERS[0];
        this.stems = [];  // Array of { player, gain } for current track
        this.masterVolume = null;
        this.selectedStem = -1;  // -1 = none selected
        this.stemVolumes = [];   // 0..1 volume per stem
        this.isPlaying = false;
        this.isInitialized = false;
        this.isStarted = false;
    }

    async initialize() {
        await Tone.start();
        console.log('Audio context started');

        // Master volume node (used for play/pause gating)
        this.masterVolume = new Tone.Volume(0).toDestination();

        // Load first track's stems
        await this._loadTrack(0);

        // Keep stems running in sync from the start
        this.isPlaying = true;
        this._applyStemGains();

        this.isInitialized = true;
        console.log('Audio engine ready');
    }

    async _loadTrack(trackIndex) {
        // Dispose old stems
        for (const stem of this.stems) {
            if (!stem) continue;
            try { stem.player.stop(); } catch (e) {}
            stem.player.dispose();
            stem.gain.dispose();
        }
        this.stems = [];
        this.stemVolumes = [];
        this.isStarted = false;

        const folder = CONFIG.TRACK_FOLDERS[trackIndex];
        this.currentTrackIndex = trackIndex;
        this.currentTrackFolder = folder;

        console.log(`Loading track: ${folder}`);

        // Load all 5 stems
        for (let i = 1; i <= CONFIG.STEMS_PER_TRACK; i++) {
            const stem = await this._loadStem(folder, i);
            this.stems.push(stem);
            this.stemVolumes.push(0);
        }

        console.log(`Loaded ${this.stems.filter(s => s !== null).length} stems from ${folder}`);

        // Start all available stems at zero gain to keep them in sync
        this._startAllStems();
        this._applyStemGains();
    }

    async _loadStem(folder, stemNumber) {
        const paths = [
            `/music/${folder}/stem${stemNumber}.mp3`,
            `/music/${folder}/stem${stemNumber}.wav`,
        ];

        for (const path of paths) {
            try {
                const response = await fetch(path, { method: 'HEAD' });
                if (response.ok) {
                    const gain = new Tone.Gain(0);
                    const player = new Tone.Player({
                        url: path,
                        loop: true,
                        onload: () => console.log(`  Loaded stem${stemNumber}`),
                        onerror: (e) => console.error(`  Error loading stem${stemNumber}:`, e),
                    });
                    player.connect(gain);
                    gain.connect(this.masterVolume);

                    // Wait for load with timeout
                    await new Promise((resolve, reject) => {
                        const timeout = setTimeout(() => resolve(), 10000);  // 10s timeout
                        const check = () => {
                            if (player.loaded) {
                                clearTimeout(timeout);
                                resolve();
                            } else {
                                setTimeout(check, 100);
                            }
                        };
                        check();
                    });

                    return { player, gain };
                }
            } catch (e) {
                console.log(`  stem${stemNumber}: ${path} not found`);
            }
        }

        return null;
    }

    _startAllStems() {
        if (this.isStarted) return;
        const startTime = Tone.now() + 0.05;
        for (const stem of this.stems) {
            if (!stem) continue;
            try { stem.player.start(startTime); } catch (e) { console.error('Start error:', e); }
        }
        this.isStarted = true;
    }

    _applyStemGains() {
        for (let i = 0; i < this.stems.length; i++) {
            const stem = this.stems[i];
            if (!stem) continue;
            const target = this.isPlaying ? this.stemVolumes[i] : 0;
            stem.gain.gain.value = target;
        }
    }

    selectStem(stemIndex) {
        // stemIndex: 0-4 (for stems 1-5)
        if (stemIndex < 0) return;

        // Check if stem exists
        if (stemIndex >= 0 && !this.stems[stemIndex]) {
            console.log(`Stem ${stemIndex + 1} not available`);
            return;  // Don't select non-existent stems
        }

        this.selectedStem = stemIndex;
        if (this.stemVolumes[stemIndex] <= 0) {
            this.stemVolumes[stemIndex] = CONFIG.SELECTED_STEM_DEFAULT_VOLUME;
            this._applyStemGains();
        }
        console.log(`Selected stem ${stemIndex + 1}`);
    }

    play() {
        if (this.isPlaying) return;
        this._startAllStems();
        this.isPlaying = true;
        this._applyStemGains();
        console.log(`Playing stem ${this.selectedStem >= 0 ? this.selectedStem + 1 : 'none'}`);
    }

    stop() {
        if (!this.isPlaying) return;
        this.isPlaying = false;
        this._applyStemGains();
        console.log('Stopped');
    }

    togglePlayPause() {
        if (this.isPlaying) {
            this.stop();
        } else {
            this.play();
        }
    }

    setStemVolume(stemIndex, value) {
        if (stemIndex < 0 || stemIndex >= this.stems.length) return;
        if (!this.stems[stemIndex]) return;
        this.stemVolumes[stemIndex] = clamp01(value);
        this._applyStemGains();
    }

    async nextTrack() {
        const wasPlaying = this.isPlaying;
        const wasStem = this.selectedStem;
        const wasStemVolumes = [...this.stemVolumes];

        // Stop current
        this.stop();

        // Load next track
        let nextIndex = this.currentTrackIndex + 1;
        if (nextIndex >= CONFIG.TRACK_FOLDERS.length) nextIndex = 0;

        await this._loadTrack(nextIndex);

        // Restore layer state and transport state
        this.selectedStem = wasStem;
        for (let i = 0; i < this.stemVolumes.length; i++) {
            if (this.stems[i]) {
                this.stemVolumes[i] = wasStemVolumes[i] ?? 0;
            }
        }
        if (wasPlaying) {
            this.play();
        } else {
            this._applyStemGains();
        }
    }

    getState() {
        return {
            trackFolder: this.currentTrackFolder,
            trackIndex: this.currentTrackIndex,
            selectedStem: this.selectedStem,
            stemVolumes: [...this.stemVolumes],
            isPlaying: this.isPlaying,
            volume: this.selectedStem >= 0 ? this.stemVolumes[this.selectedStem] || 0 : 0,
            stemCount: this.stems.filter(s => s !== null).length,
            availableStems: this.stems.map(s => s !== null),
        };
    }

    isReady() {
        return this.isInitialized;
    }
}

function clamp01(value) {
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
}
