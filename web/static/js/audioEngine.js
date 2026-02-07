/**
 * Audio engine with support for track folders and effects.
 */

import { CONFIG } from './config.js';

export class AudioEngine {
    constructor() {
        this.decks = { left: null, right: null };
        this.effects = [];
        this.crossfaderValue = CONFIG.DEFAULT_CROSSFADE;
        this.isInitialized = false;
        this.tracksLoaded = false;
    }

    async initialize() {
        await Tone.start();
        console.log('Audio context started');

        // Create decks
        this.decks.left = await this._createDeck('left', 0);
        this.decks.right = await this._createDeck('right', 1);

        // Load effects
        await this._loadEffects();

        this.isInitialized = true;
        this.tracksLoaded = true;
    }

    async _createDeck(deckId, trackIndex) {
        const trackFolder = CONFIG.TRACK_FOLDERS[trackIndex];
        const trackInfo = await this._loadTrackFolder(trackFolder);

        const deck = {
            trackIndex,
            trackFolder,
            trackInfo,
            players: {},
            volume: new Tone.Volume(0).toDestination(),
            filter: new Tone.Filter(CONFIG.FILTER_MAX_FREQ, 'lowpass', -24).toDestination(),
            volumeLevel: CONFIG.DEFAULT_VOLUME,
            isPlaying: false,
            filterFreq: CONFIG.FILTER_MAX_FREQ,
        };

        // Create players for each audio file
        for (const [key, url] of Object.entries(trackInfo.files)) {
            const player = new Tone.Player(url);
            player.loop = true;
            player.chain(deck.filter, deck.volume);
            deck.players[key] = player;
        }

        // Wait for all players to load
        await Promise.all(
            Object.values(deck.players).map(p =>
                new Promise(resolve => {
                    if (p.loaded) resolve();
                    else p.buffer.onload = resolve;
                })
            )
        );

        console.log(`Deck ${deckId} loaded: ${trackFolder}`, trackInfo.type);
        return deck;
    }

    async _loadTrackFolder(folder) {
        // Try to find vocals and instrumental first
        const possibleFiles = [
            { key: 'vocals', paths: [`/music/${folder}/vocals.wav`, `/music/${folder}/vocals.mp3`] },
            { key: 'instrumental', paths: [`/music/${folder}/instrumental.wav`, `/music/${folder}/instrumental.mp3`] },
            { key: 'track', paths: [`/music/${folder}/${folder}.wav`, `/music/${folder}/${folder}.mp3`, `/music/${folder}/track.wav`, `/music/${folder}/track.mp3`] },
        ];

        const files = {};
        let type = 'single';

        // Check for each file type
        for (const file of possibleFiles) {
            for (const path of file.paths) {
                try {
                    const response = await fetch(path, { method: 'HEAD' });
                    if (response.ok) {
                        files[file.key] = path;
                        break;
                    }
                } catch (e) {
                    // File doesn't exist
                }
            }
        }

        // Determine type
        if (files.vocals && files.instrumental) {
            type = 'stems';
            delete files.track;  // Don't need single track if we have stems
        } else if (files.track) {
            type = 'single';
            delete files.vocals;
            delete files.instrumental;
        } else if (Object.keys(files).length === 0) {
            // Fallback: try to find any audio file
            console.warn(`No audio files found in ${folder}, using silence`);
            files.track = null;
        }

        return { type, files, folder };
    }

    async _loadEffects() {
        for (let i = 0; i < CONFIG.EFFECTS.length; i++) {
            try {
                const player = new Tone.Player(CONFIG.EFFECTS[i]).toDestination();
                await new Promise(resolve => {
                    if (player.loaded) resolve();
                    else player.buffer.onload = resolve;
                });
                this.effects.push(player);
                console.log(`Effect ${i + 1} loaded`);
            } catch (e) {
                console.warn(`Failed to load effect ${i + 1}:`, e);
                this.effects.push(null);
            }
        }
    }

    playEffect(index) {
        if (index >= 0 && index < this.effects.length && this.effects[index]) {
            this.effects[index].start();
            console.log(`Playing effect ${index + 1}`);
        }
    }

    setCrossfader(value) {
        this.crossfaderValue = value;
        this._updateGains();
    }

    setVolume(deckId, value) {
        const deck = this.decks[deckId];
        if (deck) {
            deck.volumeLevel = value;
            this._updateGains();
        }
    }

    _updateGains() {
        const leftCrossfade = Math.cos(this.crossfaderValue * Math.PI / 2);
        const rightCrossfade = Math.sin(this.crossfaderValue * Math.PI / 2);

        if (this.decks.left) {
            const leftGain = this.decks.left.volumeLevel * leftCrossfade;
            this.decks.left.volume.volume.value = this._gainToDb(leftGain);
        }

        if (this.decks.right) {
            const rightGain = this.decks.right.volumeLevel * rightCrossfade;
            this.decks.right.volume.volume.value = this._gainToDb(rightGain);
        }
    }

    _gainToDb(gain) {
        if (gain <= 0) return -Infinity;
        return 20 * Math.log10(gain);
    }

    setFilterFrequency(deckId, normalizedValue) {
        const deck = this.decks[deckId];
        if (deck) {
            const minFreq = CONFIG.FILTER_MIN_FREQ;
            const maxFreq = CONFIG.FILTER_MAX_FREQ;
            const freq = minFreq * Math.pow(maxFreq / minFreq, normalizedValue);
            deck.filterFreq = freq;
            deck.filter.frequency.rampTo(freq, 0.05);
        }
    }

    togglePlayPause(deckId) {
        const deck = this.decks[deckId];
        if (!deck) return;

        if (deck.isPlaying) {
            // Stop all players
            for (const player of Object.values(deck.players)) {
                if (player) player.stop();
            }
            deck.isPlaying = false;
            console.log(`${deckId} deck: stopped`);
        } else {
            // Start all players
            for (const player of Object.values(deck.players)) {
                if (player) player.start();
            }
            deck.isPlaying = true;
            console.log(`${deckId} deck: playing`);
        }
    }

    async switchTrack(deckId, direction = 1) {
        const deck = this.decks[deckId];
        if (!deck) return;

        const wasPlaying = deck.isPlaying;

        // Stop current playback
        if (wasPlaying) {
            for (const player of Object.values(deck.players)) {
                if (player) player.stop();
            }
        }

        // Calculate new track index
        let newIndex = deck.trackIndex + direction;
        if (newIndex < 0) newIndex = CONFIG.TRACK_FOLDERS.length - 1;
        if (newIndex >= CONFIG.TRACK_FOLDERS.length) newIndex = 0;

        // Dispose old players
        for (const player of Object.values(deck.players)) {
            if (player) player.dispose();
        }

        // Load new track
        const trackFolder = CONFIG.TRACK_FOLDERS[newIndex];
        const trackInfo = await this._loadTrackFolder(trackFolder);

        deck.trackIndex = newIndex;
        deck.trackFolder = trackFolder;
        deck.trackInfo = trackInfo;
        deck.players = {};

        // Create new players
        for (const [key, url] of Object.entries(trackInfo.files)) {
            if (url) {
                const player = new Tone.Player(url);
                player.loop = true;
                player.chain(deck.filter, deck.volume);
                deck.players[key] = player;
            }
        }

        // Wait for load
        await Promise.all(
            Object.values(deck.players).map(p =>
                new Promise(resolve => {
                    if (p.loaded) resolve();
                    else p.buffer.onload = resolve;
                })
            )
        );

        console.log(`Switched ${deckId} to: ${trackFolder}`);

        // Resume if was playing
        if (wasPlaying) {
            for (const player of Object.values(deck.players)) {
                if (player) player.start();
            }
            deck.isPlaying = true;
        }
    }

    getDeckInfo(deckId) {
        const deck = this.decks[deckId];
        if (!deck) {
            return {
                trackName: '--',
                trackType: 'single',
                volume: 0,
                isPlaying: false,
                filterFreq: CONFIG.FILTER_MAX_FREQ,
            };
        }

        return {
            trackName: deck.trackFolder,
            trackType: deck.trackInfo?.type || 'single',
            volume: deck.volumeLevel,
            isPlaying: deck.isPlaying,
            filterFreq: deck.filterFreq,
        };
    }

    getCrossfader() {
        return this.crossfaderValue;
    }

    isReady() {
        return this.isInitialized && this.tracksLoaded;
    }
}
