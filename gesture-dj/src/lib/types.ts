// shared/types.ts — Shared interface between all streams

// ====== Visualization Params (Stream B consumes these) ======
export interface VizParams {
  // Audio-driven (every frame, ~60fps)
  fftBands: number[];          // 8 normalized frequency bands [0-1]
  beatDetected: boolean;       // true on transient
  bpm: number;                 // current BPM
  waveform: number[];          // 256 samples for mesh displacement

  // Audience-driven (every 2-5s from vote aggregation)
  audienceEnergy: number;      // 0-1, smoothed
  hypeSpikeActive: boolean;    // true when vote rate > 2x average
  moodColor: [number, number, number]; // RGB 0-255

  // Agent-driven (every 15-30s from K2 Think)
  visualTheme: 'cyber' | 'organic' | 'minimal' | 'chaos';
  transitionSpeed: number;     // 0-1
  sceneComplexity: number;     // 0-1
  colorPalette: string[];      // hex colors
  cameraMode: 'orbit' | 'fly' | 'static' | 'shake';
}

// ====== Voting System (Stream C) ======
export type VoteType =
  | 'energy_up'       // More hype
  | 'energy_down'     // Chill out
  | 'genre_switch'    // Change genre
  | 'drop_request'    // Build and drop
  | 'viz_style'       // Change visuals
  | 'speed_up'        // BPM +10
  | 'speed_down';     // BPM -10

export interface Vote {
  id: string;
  userId: string;
  voteType: VoteType;
  voteValue?: string;  // e.g. genre name, viz style
  timestamp: number;
}

export interface VoteAggregation {
  counts: Partial<Record<VoteType, number>>;
  total: number;
  voteRate: number;          // votes per second
  avgRate: number;           // running average
  isHypeSpike: boolean;
  dominantVote: [string, number] | null;
  energyBias: number;       // -1 to 1
  timestamp: number;
}

// ====== Agent System (Stream D) ======
export type AgentActionType =
  | 'adjust_energy'
  | 'switch_genre'
  | 'trigger_drop'
  | 'change_viz_theme'
  | 'adjust_bpm'
  | 'change_fx'
  | 'set_filter'
  | 'set_camera_mode'
  | 'set_color_palette';

export interface AgentAction {
  type: AgentActionType;
  value: unknown;
}

export interface AgentDecision {
  reasoning: string;
  actions: AgentAction[];
  confidence: number;
  next_check_seconds: number;
}

export interface AudioState {
  genre: string;
  bpm: number;
  energy: number;
  activeFx: string[];
  vizTheme: string;
  sceneComplexity: number;
}

// ====== WebSocket Messages ======
export type WSMessageSource = 'cv' | 'votes' | 'agent' | 'viz' | 'server';

export interface WSMessage {
  source: WSMessageSource;
  type: string;
  data: unknown;
  timestamp: number;
}
