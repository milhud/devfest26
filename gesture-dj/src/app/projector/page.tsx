'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface VizParams {
  colorPalette: string[];    // hex colors the agent can set
  vizTheme: string;          // e.g. 'cosmic', 'fire', 'ocean', 'neon', 'matrix'
  cameraMode: string;        // 'orbit', 'static', 'pulse', 'fly'
  energy: number;            // 0-1 overall energy
  bpm: number;
  animationIntensity: number; // 0-1
  filterCutoff: number;       // 0-1
  dropActive: boolean;
}

const DEFAULT_PALETTES: Record<string, string[]> = {
  neon: ['#ff00ff', '#00ffff', '#ffff00', '#ff0088'],
  cosmic: ['#4a0080', '#0040ff', '#00ffcc', '#ff00aa'],
  fire: ['#ff4400', '#ff8800', '#ffcc00', '#ff0000'],
  ocean: ['#003366', '#0066cc', '#00ccff', '#66ffff'],
  matrix: ['#00ff00', '#008800', '#00ff88', '#44ff44'],
};

const DEFAULT_PARAMS: VizParams = {
  colorPalette: DEFAULT_PALETTES.neon,
  vizTheme: 'neon',
  cameraMode: 'orbit',
  energy: 0.5,
  bpm: 120,
  animationIntensity: 0.7,
  filterCutoff: 0.5,
  dropActive: false,
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ProjectorPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paramsRef = useRef<VizParams>({ ...DEFAULT_PARAMS });
  const audioDataRef = useRef<{ bass: number; mid: number; high: number; raw: Uint8Array<ArrayBuffer> | null }>({
    bass: 0, mid: 0, high: 0, raw: null,
  });
  const [started, setStarted] = useState(false);
  const initRef = useRef(false);
  const animFrameRef = useRef<number>(0);

  // ── Start mic + scene on click ──────────────────────────────────────────
  const startViz = useCallback(async () => {
    if (initRef.current) return;
    initRef.current = true;
    setStarted(true);

    const canvas = canvasRef.current;
    if (!canvas) return;

    // ── Audio setup (mic input → analyser) ──────────────────────────────
    let analyser: AnalyserNode | null = null;
    let freqData: Uint8Array<ArrayBuffer> | null = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);
      freqData = new Uint8Array(analyser.frequencyBinCount) as Uint8Array<ArrayBuffer>;
    } catch {
      console.warn('[Projector] No mic access — using simulated audio');
    }

    // ── Three.js scene ──────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 2000);
    camera.position.set(0, 2, 10);

    // ── Load GLB model (your teammate's scene, rendered faithfully) ──────
    const loader = new GLTFLoader();
    let model: THREE.Group | null = null;
    let mixer: THREE.AnimationMixer | null = null;
    let modelCenter = new THREE.Vector3();
    let baseScale = 1;

    try {
      const gltf = await loader.loadAsync('/scene.glb');
      model = gltf.scene;
      scene.add(model);

      // Use any cameras/lights baked in the GLB
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      modelCenter = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);

      // Auto-fit to view if model is very large or very small
      if (maxDim > 50 || maxDim < 0.1) {
        baseScale = 10 / maxDim;
        model.scale.setScalar(baseScale);
        const box2 = new THREE.Box3().setFromObject(model);
        modelCenter = box2.getCenter(new THREE.Vector3());
      } else {
        baseScale = model.scale.x;
      }

      // Position camera to see the whole model
      const fitBox = new THREE.Box3().setFromObject(model);
      const fitSize = fitBox.getSize(new THREE.Vector3());
      const fitCenter = fitBox.getCenter(new THREE.Vector3());
      const maxFitDim = Math.max(fitSize.x, fitSize.y, fitSize.z);
      camera.position.set(fitCenter.x, fitCenter.y + maxFitDim * 0.3, fitCenter.z + maxFitDim * 1.5);
      camera.lookAt(fitCenter);
      modelCenter = fitCenter;

      // Play animations if present
      if (gltf.animations.length > 0) {
        mixer = new THREE.AnimationMixer(model);
        for (const clip of gltf.animations) {
          mixer.clipAction(clip).play();
        }
      }

      console.log(`[Projector] GLB loaded: ${gltf.animations.length} animations, size: ${size.x.toFixed(1)}x${size.y.toFixed(1)}x${size.z.toFixed(1)}, maxDim: ${maxDim.toFixed(1)}`);
    } catch (err) {
      console.error('[Projector] Failed to load GLB:', err);
    }

    // ── Lighting (neutral so model looks like it does in Blender) ────────
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
    dirLight.position.set(5, 10, 7);
    scene.add(dirLight);
    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight2.position.set(-5, -3, 5);
    scene.add(dirLight2);
    // Agent-controlled accent lights (subtle, off by default)
    const accentLight1 = new THREE.PointLight(0xff00ff, 0, 50);
    accentLight1.position.set(5, 5, 5);
    scene.add(accentLight1);
    const accentLight2 = new THREE.PointLight(0x00ffff, 0, 50);
    accentLight2.position.set(-5, -3, 5);
    scene.add(accentLight2);

    // ── Helpers ──────────────────────────────────────────────────────────
    const hexToThreeColor = (hex: string) => new THREE.Color(hex);

    const getAudioBands = () => {
      if (analyser && freqData) {
        analyser.getByteFrequencyData(freqData);
        const len = freqData.length;
        let bass = 0, mid = 0, high = 0;
        const bassEnd = Math.floor(len * 0.15);
        const midEnd = Math.floor(len * 0.5);
        for (let i = 0; i < bassEnd; i++) bass += freqData[i];
        for (let i = bassEnd; i < midEnd; i++) mid += freqData[i];
        for (let i = midEnd; i < len; i++) high += freqData[i];
        bass /= bassEnd * 255;
        mid /= (midEnd - bassEnd) * 255;
        high /= (len - midEnd) * 255;
        audioDataRef.current = { bass, mid, high, raw: freqData };
      } else {
        // Simulated audio based on BPM
        const t = performance.now() / 1000;
        const bpm = paramsRef.current.bpm;
        const beat = Math.sin(t * (bpm / 60) * Math.PI) * 0.5 + 0.5;
        const e = paramsRef.current.energy;
        audioDataRef.current = {
          bass: beat * e * 0.8,
          mid: (0.3 + Math.sin(t * 2.5) * 0.3) * e,
          high: (0.2 + Math.sin(t * 5) * 0.2) * e,
          raw: null,
        };
      }
      return audioDataRef.current;
    };

    // ── Compute orbit radius from model bounds ────────────────────────
    const fitBox2 = model ? new THREE.Box3().setFromObject(model) : new THREE.Box3();
    const fitSize2 = fitBox2.getSize(new THREE.Vector3());
    const orbitRadius = Math.max(fitSize2.x, fitSize2.y, fitSize2.z) * 1.5 || 15;

    // ── Animation loop ──────────────────────────────────────────────────
    const clock = new THREE.Clock();

    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const t = clock.getElapsedTime();
      const p = paramsRef.current;
      const { bass, mid, high } = getAudioBands();
      const intensity = p.animationIntensity;

      // Update GLTF animation mixer (speed reacts to bass)
      if (mixer) {
        mixer.timeScale = 0.8 + bass * 1.5 * intensity;
        mixer.update(delta);
      }

      // ── Agent accent lights (subtle color wash controlled by agent) ──
      const c0 = hexToThreeColor(p.colorPalette[0] || '#ff00ff');
      const c1 = hexToThreeColor(p.colorPalette[1] || '#00ffff');
      accentLight1.color.copy(c0);
      accentLight1.intensity = bass * 3 * intensity;
      accentLight2.color.copy(c1);
      accentLight2.intensity = mid * 2 * intensity;

      // ── Subtle model pulse with bass (scale only) ───────────────────
      if (model) {
        const pulse = baseScale * (1 + bass * 0.08 * intensity);
        model.scale.setScalar(pulse);
      }

      // ── Drop effect ─────────────────────────────────────────────────
      if (p.dropActive) {
        const flash = Math.sin(t * 20) * 0.5 + 0.5;
        scene.background = new THREE.Color(flash * 0.1, flash * 0.03, flash * 0.15);
        accentLight1.intensity = 5;
        accentLight2.intensity = 5;
      } else {
        scene.background = new THREE.Color(0x000000);
      }

      // ── Camera modes (orbits around model center) ───────────────────
      const lookTarget = modelCenter.clone();
      const r = orbitRadius;
      switch (p.cameraMode) {
        case 'orbit':
          camera.position.x = modelCenter.x + Math.cos(t * 0.2) * r;
          camera.position.z = modelCenter.z + Math.sin(t * 0.2) * r;
          camera.position.y = modelCenter.y + Math.sin(t * 0.1) * r * 0.3;
          break;
        case 'pulse': {
          const pz = r + Math.sin(t * (p.bpm / 60) * Math.PI) * r * 0.3 * intensity;
          camera.position.set(modelCenter.x, modelCenter.y + r * 0.2, modelCenter.z + pz);
          break;
        }
        case 'fly':
          camera.position.x = modelCenter.x + Math.cos(t * 0.5) * (r * 0.6 + mid * r * 0.5);
          camera.position.y = modelCenter.y + Math.sin(t * 0.3) * (r * 0.4 + high * r * 0.3);
          camera.position.z = modelCenter.z + Math.sin(t * 0.5) * (r * 0.6 + bass * r * 0.5);
          break;
        default: // 'static' — stay at initial fitted position
          break;
      }
      camera.lookAt(lookTarget);

      renderer.render(scene, camera);
    };

    animate();

    // ── Resize handler ──────────────────────────────────────────────────
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    // Cleanup stored for unmount
    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(animFrameRef.current);
      renderer.dispose();
    };
  }, []);

  // ── WebSocket connection (type=viz) ─────────────────────────────────────
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      try {
        ws = new WebSocket(`${process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080'}?type=viz`);

        ws.onopen = () => {
          console.log('[Projector WS] Connected as viz client');
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            const p = paramsRef.current;

            // Agent decisions
            if (msg.source === 'agent' && msg.type === 'agent_decision' && msg.data) {
              const actions: Array<{ type: string; value: unknown }> = msg.data.actions || [];
              for (const action of actions) {
                switch (action.type) {
                  case 'change_viz_theme': {
                    const theme = String(action.value);
                    p.vizTheme = theme;
                    if (DEFAULT_PALETTES[theme]) {
                      p.colorPalette = DEFAULT_PALETTES[theme];
                    }
                    break;
                  }
                  case 'set_color_palette': {
                    if (Array.isArray(action.value)) {
                      p.colorPalette = action.value as string[];
                    }
                    break;
                  }
                  case 'set_camera_mode':
                    p.cameraMode = String(action.value);
                    break;
                  case 'adjust_energy':
                    p.energy = Math.max(0, Math.min(1, p.energy + Number(action.value)));
                    break;
                  case 'adjust_bpm':
                    p.bpm = Math.max(80, Math.min(180, p.bpm + Number(action.value)));
                    break;
                  case 'trigger_drop':
                    p.dropActive = true;
                    setTimeout(() => { p.dropActive = false; }, 4000);
                    break;
                  case 'set_filter':
                    p.filterCutoff = Math.max(0, Math.min(1, Number(action.value)));
                    break;
                  case 'set_animation_intensity':
                    p.animationIntensity = Math.max(0, Math.min(1, Number(action.value)));
                    break;
                }
              }

              // Also update from audioState if present
              if (msg.data.audioState) {
                if (msg.data.audioState.energy != null) p.energy = msg.data.audioState.energy;
                if (msg.data.audioState.bpm != null) p.bpm = msg.data.audioState.bpm;
                if (msg.data.audioState.vizTheme) {
                  p.vizTheme = msg.data.audioState.vizTheme;
                  if (DEFAULT_PALETTES[msg.data.audioState.vizTheme]) {
                    p.colorPalette = DEFAULT_PALETTES[msg.data.audioState.vizTheme];
                  }
                }
              }
            }

            // CV gesture data — use for supplemental reactivity
            if (msg.source === 'cv' && msg.type === 'gesture_update' && msg.data?.audio) {
              const audio = msg.data.audio;
              if (audio.isPlaying) {
                // Boost energy from live playback state
                const vol = audio.volume ?? 0;
                paramsRef.current.energy = Math.max(paramsRef.current.energy, vol * 0.8);
              }
            }
          } catch { /* ignore parse errors */ }
        };

        ws.onclose = () => {
          console.log('[Projector WS] Disconnected');
          reconnectTimer = setTimeout(connect, 3000);
        };

        ws.onerror = () => { /* reconnect handled by onclose */ };
      } catch {
        reconnectTimer = setTimeout(connect, 3000);
      }
    };

    connect();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#000',
        cursor: 'none',
        overflow: 'hidden',
      }}
      onClick={startViz}
    >
      <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />

      {/* Click-to-start overlay */}
      {!started && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.9)',
            color: '#fff',
            fontFamily: 'system-ui, sans-serif',
            zIndex: 10,
          }}
        >
          <div style={{ fontSize: '4rem', fontWeight: 700, letterSpacing: '-2px', marginBottom: '1rem' }}>
            GESTURE DJ
          </div>
          <div style={{ fontSize: '1.2rem', opacity: 0.6, marginBottom: '2rem' }}>
            3D Audio Visualizer — Projector Mode
          </div>
          <button
            onClick={startViz}
            style={{
              padding: '1rem 3rem',
              fontSize: '1.3rem',
              fontWeight: 600,
              background: 'linear-gradient(135deg, #ff00ff, #00ffff)',
              border: 'none',
              borderRadius: '12px',
              color: '#000',
              cursor: 'pointer',
              letterSpacing: '1px',
            }}
          >
            LAUNCH VISUALS
          </button>
          <div style={{ fontSize: '0.85rem', opacity: 0.4, marginTop: '1rem' }}>
            Microphone access needed for audio reactivity
          </div>
        </div>
      )}
    </div>
  );
}
