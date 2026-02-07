/**
 * Audio engine with stem-based playback.
 * Each track folder has N stems (stem1..stemN.mp3/wav).
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
        this.isTrackLoading = false;
        this.effects = []; // Array of Tone.Player for one-shot FX
    }

    async initialize() {
        await Tone.start();
        console.log('Audio context started');

        // Master volume node (used for play/pause gating)
        this.masterVolume = new Tone.Volume(0).toDestination();

        // Load first track's stems
        await this._loadTrack(0);
        await this._loadEffects();

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

        // Load all configured stems
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
            const player = await this._createPlayer(path, { loop: true, timeoutMs: 10000 });
            if (player) {
                const gain = new Tone.Gain(0);
                player.connect(gain);
                gain.connect(this.masterVolume);
                console.log(`  Loaded stem${stemNumber} from ${path}`);
                return { player, gain };
            }
        }

        console.log(`  stem${stemNumber}: no playable file found`);
        return null;
    }

    async _loadEffects() {
        this.effects = [];
        for (let i = 1; i <= CONFIG.EFFECTS_PER_HAND; i++) {
            const effect = await this._loadEffect(i);
            this.effects.push(effect);
        }
        console.log(`Loaded ${this.effects.filter(e => e !== null).length} effects`);
    }

    async _loadEffect(effectNumber) {
        const paths = [
            `/music/effects/effect${effectNumber}.mp3`,
            `/music/effects/effect${effectNumber}.wav`,
        ];

        for (const path of paths) {
            const player = await this._createPlayer(path, { loop: false, timeoutMs: 5000 });
            if (player) {
                player.toDestination();
                console.log(`  Loaded effect${effectNumber} from ${path}`);
                return player;
            }
        }

        console.log(`  effect${effectNumber}: no playable file found`);
        return null;
    }

    async _createPlayer(path, options) {
        let done = false;
        let hadError = false;

        const player = new Tone.Player({
            url: path,
            loop: !!options.loop,
            onload: () => { done = true; },
            onerror: () => {
                hadError = true;
                done = true;
            },
        });

        const timeoutAt = Date.now() + (options.timeoutMs || 5000);
        while (!done && Date.now() < timeoutAt) {
            await new Promise((resolve) => setTimeout(resolve, 80));
            if (player.loaded) {
                done = true;
            }
        }

        if (!player.loaded || hadError) {
            try { player.dispose(); } catch (e) {}
            return null;
        }

        return player;
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

    playEffect(effectIndex) {
        if (effectIndex < 0 || effectIndex >= this.effects.length) return false;
        const effect = this.effects[effectIndex];
        if (!effect) return false;

        try {
            if (effect.state === 'started') {
                effect.stop();
            }
            effect.start();
            return true;
        } catch (e) {
            console.error('Effect play error:', e);
            return false;
        }
    }

    async nextTrack() {
        if (this.isTrackLoading) return;
        this.isTrackLoading = true;

        const wasPlaying = this.isPlaying;
        const wasStem = this.selectedStem;
        const wasStemVolumes = [...this.stemVolumes];

        try {
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
        } finally {
            this.isTrackLoading = false;
        }
    }

    getState() {
        return {
            trackFolder: this.currentTrackFolder,
            trackIndex: this.currentTrackIndex,
            selectedStem: this.selectedStem,
            stemVolumes: [...this.stemVolumes],
            isPlaying: this.isPlaying,
            isTrackLoading: this.isTrackLoading,
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
