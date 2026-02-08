/**
 * ElevenLabs Music Consumer — Stem Generator
 *
 * Polls the Next.js music queue for queued items, generates 3 separate
 * stems (drums, bass, melody) via ElevenLabs, saves them locally to
 * /music/trackN/ as stem1.mp3, stem2.mp3, stem3.mp3 for the DJ Booth,
 * uploads to Supabase Storage as backup, and patches the queue with
 * an audioUrl so the dashboard can play the full mix.
 *
 * Usage:  npm run music-consumer
 * Env:    ELEVENLABS_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *         NEXT_JS_BASE_URL (default http://localhost:3000)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, writeFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import AdmZip from 'adm-zip';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const NEXT_JS_BASE_URL = process.env.NEXT_JS_BASE_URL || 'http://localhost:3000';
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const POLL_INTERVAL_MS = 3_000; // Poll every 3 seconds
const STORAGE_BUCKET = 'music';
const STEMS_TO_SAVE = 3; // Save first 3 stems from separation

// Resolve the music directory (repo root /music/)
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');
const MUSIC_DIR = resolve(__dirname, '..', '..', 'music');

// ---------------------------------------------------------------------------
// Validate env
// ---------------------------------------------------------------------------

function validateEnv() {
  const missing: string[] = [];
  if (!ELEVENLABS_API_KEY) missing.push('ELEVENLABS_API_KEY');
  if (!SUPABASE_URL) missing.push('NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL');
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (missing.length > 0) {
    console.error(`[Music Consumer] Missing env vars: ${missing.join(', ')}`);
    console.error('Add them to .env.local and restart.');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Supabase client (service role — bypasses RLS for storage uploads)
// ---------------------------------------------------------------------------

let supabase: SupabaseClient;

function getSupabase() {
  if (!supabase) {
    supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
  }
  return supabase;
}

// ---------------------------------------------------------------------------
// Ensure storage bucket exists
// ---------------------------------------------------------------------------

async function ensureBucket() {
  const sb = getSupabase();
  const { data, error } = await sb.storage.getBucket(STORAGE_BUCKET);
  if (error && error.message.includes('not found')) {
    console.log(`[Music Consumer] Creating storage bucket "${STORAGE_BUCKET}"...`);
    const { error: createErr } = await sb.storage.createBucket(STORAGE_BUCKET, {
      public: true,
      fileSizeLimit: 10 * 1024 * 1024, // 10 MB
      allowedMimeTypes: ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg', 'audio/webm'],
    });
    if (createErr) {
      console.error('[Music Consumer] Failed to create bucket:', createErr.message);
      process.exit(1);
    }
    console.log(`[Music Consumer] Bucket "${STORAGE_BUCKET}" created (public).`);
  } else if (error) {
    console.error('[Music Consumer] Bucket check error:', error.message);
    process.exit(1);
  } else {
    console.log(`[Music Consumer] Bucket "${STORAGE_BUCKET}" exists.`);
  }
}

// ---------------------------------------------------------------------------
// ElevenLabs music generation
// ---------------------------------------------------------------------------

interface QueueItem {
  id: string;
  prompt: string;
  genre: string;
  bpm: number;
  energy: number;
  mood: string;
  duration_seconds: number;
  status: string;
  audioUrl?: string;
  agentReasoning?: string;
}

/**
 * Build a prompt under 450 chars for the full track.
 */
function buildPrompt(item: QueueItem): string {
  const MAX_TEXT_LEN = 440;
  const meta = `${item.genre}, ${item.bpm}bpm, ${item.mood}. `;
  const available = MAX_TEXT_LEN - meta.length;
  const body = item.prompt.length > available
    ? item.prompt.slice(0, available - 3) + '...'
    : item.prompt;
  return meta + body;
}

/**
 * Step 1: Generate a full track via ElevenLabs sound generation.
 */
async function generateFullTrack(item: QueueItem): Promise<Buffer> {
  const url = 'https://api.elevenlabs.io/v1/sound-generation';
  const prompt = buildPrompt(item);

  console.log(`[Music Consumer] Generating full track: "${prompt.slice(0, 80)}..."`);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: prompt,
      duration_seconds: Math.min(item.duration_seconds, 22),
      prompt_influence: 0.3,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ElevenLabs sound generation ${res.status}: ${errText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Step 2: Send audio to ElevenLabs Stem Separation API.
 * Returns a ZIP buffer containing individual stem files.
 */
async function separateStems(audioBuffer: Buffer): Promise<Buffer> {
  const url = 'https://api.elevenlabs.io/v1/music/stem-separation?output_format=mp3_22050_32';

  // Build multipart form data
  const formData = new FormData();
  const blob = new Blob([audioBuffer as unknown as BlobPart], { type: 'audio/mpeg' });
  formData.append('file', blob, 'track.mp3');
  formData.append('stem_variation_id', 'six_stems_v1');

  console.log(`[Music Consumer] Sending ${(audioBuffer.length / 1024).toFixed(0)} KB to stem separation...`);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY!,
    },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ElevenLabs stem separation ${res.status}: ${errText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Step 3: Extract stems from the ZIP archive.
 * Returns an array of { name, buffer } for each stem file.
 */
function extractStemsFromZip(zipBuffer: Buffer): { name: string; buffer: Buffer }[] {
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries()
    .filter(e => !e.isDirectory && (e.entryName.endsWith('.mp3') || e.entryName.endsWith('.wav')))
    .sort((a, b) => a.entryName.localeCompare(b.entryName));

  console.log(`[Music Consumer] ZIP contains ${entries.length} stem(s): ${entries.map(e => e.entryName).join(', ')}`);

  return entries.map(entry => ({
    name: entry.entryName,
    buffer: entry.getData(),
  }));
}

// ---------------------------------------------------------------------------
// Local music directory helpers
// ---------------------------------------------------------------------------

/**
 * Find the next available track number by scanning /music/ for trackN folders.
 * Never overwrites existing tracks.
 */
function getNextTrackNumber(): number {
  if (!existsSync(MUSIC_DIR)) {
    mkdirSync(MUSIC_DIR, { recursive: true });
    return 3; // Start at 3 to leave track1/track2 untouched
  }

  const existing = readdirSync(MUSIC_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && /^track\d+$/.test(d.name))
    .map(d => parseInt(d.name.replace('track', ''), 10))
    .sort((a, b) => a - b);

  const max = existing.length > 0 ? existing[existing.length - 1] : 2;
  return max + 1;
}

/**
 * Save a stem buffer to disk as /music/trackN/stemX.mp3
 */
function saveStemToDisk(trackFolder: string, stemNumber: number, buffer: Buffer): string {
  const dir = join(MUSIC_DIR, trackFolder);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const filename = `stem${stemNumber}.mp3`;
  const filepath = join(dir, filename);
  writeFileSync(filepath, buffer);
  return filepath;
}

// ---------------------------------------------------------------------------
// Upload to Supabase Storage
// ---------------------------------------------------------------------------

async function uploadToStorage(audioBuffer: Buffer, storagePath: string): Promise<string> {
  const sb = getSupabase();

  const { error } = await sb.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, audioBuffer, {
      contentType: 'audio/mpeg',
      upsert: false,
    });

  if (error) {
    throw new Error(`Supabase upload failed: ${error.message}`);
  }

  const { data } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
}

// ---------------------------------------------------------------------------
// Music queue helpers (talks to Next.js API)
// ---------------------------------------------------------------------------

async function fetchQueuedItems(): Promise<QueueItem[]> {
  try {
    const res = await fetch(`${NEXT_JS_BASE_URL}/api/music-queue?status=queued`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.queue || [];
  } catch {
    return [];
  }
}

async function patchQueueItem(id: string, updates: Record<string, unknown>) {
  await fetch(`${NEXT_JS_BASE_URL}/api/music-queue`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...updates }),
  });
}

// ---------------------------------------------------------------------------
// Process a single queue item:
//   1. Generate full track  2. Stem separate  3. Save stems  4. Upload
// ---------------------------------------------------------------------------

async function processItem(item: QueueItem) {
  console.log(`\n[Music Consumer] Processing ${item.id}...`);
  console.log(`[Music Consumer] Genre: ${item.genre}, BPM: ${item.bpm}, Mood: ${item.mood}`);

  // 1. Mark as generating
  await patchQueueItem(item.id, { status: 'generating' });

  try {
    // 2. Determine track folder (never overwrite existing tracks)
    const trackNum = getNextTrackNumber();
    const trackFolder = `track${trackNum}`;
    console.log(`[Music Consumer] Target: /music/${trackFolder}/`);

    // 3. Generate full track via ElevenLabs
    const fullTrack = await generateFullTrack(item);
    console.log(`[Music Consumer] Full track: ${(fullTrack.length / 1024).toFixed(0)} KB`);

    // 4. Stem separate via ElevenLabs
    const zipBuffer = await separateStems(fullTrack);
    console.log(`[Music Consumer] Stem ZIP: ${(zipBuffer.length / 1024).toFixed(0)} KB`);

    // 5. Extract stems from ZIP
    const stems = extractStemsFromZip(zipBuffer);
    if (stems.length === 0) {
      throw new Error('Stem separation returned no audio files');
    }

    // 6. Save stems to disk + upload to Supabase
    const stemsToSave = stems.slice(0, STEMS_TO_SAVE);
    const stemUrls: string[] = [];

    for (let i = 0; i < stemsToSave.length; i++) {
      const stem = stemsToSave[i];
      const stemNum = i + 1;

      // Save locally
      const localPath = saveStemToDisk(trackFolder, stemNum, stem.buffer);
      console.log(`[Music Consumer]   stem${stemNum}.mp3 (${stem.name}): ${(stem.buffer.length / 1024).toFixed(0)} KB → ${localPath}`);

      // Upload to Supabase
      try {
        const storagePath = `${trackFolder}/stem${stemNum}.mp3`;
        const publicUrl = await uploadToStorage(stem.buffer, storagePath);
        stemUrls.push(publicUrl);
      } catch (uploadErr: unknown) {
        const msg = uploadErr instanceof Error ? uploadErr.message : String(uploadErr);
        console.warn(`[Music Consumer]   stem${stemNum}: Supabase upload failed (non-fatal): ${msg}`);
      }
    }

    // Also save any extra stems beyond 3 (bonus stems for the folder)
    for (let i = STEMS_TO_SAVE; i < stems.length; i++) {
      const stem = stems[i];
      saveStemToDisk(trackFolder, i + 1, stem.buffer);
      console.log(`[Music Consumer]   stem${i + 1}.mp3 (${stem.name}): ${(stem.buffer.length / 1024).toFixed(0)} KB (bonus)`);
    }

    // 7. Use stem1 as audioUrl for dashboard playback
    const dashboardAudioUrl = stemUrls[0] || `http://localhost:8000/music/${trackFolder}/stem1.mp3`;

    // 8. Patch queue as ready
    await patchQueueItem(item.id, { status: 'ready', audioUrl: dashboardAudioUrl });
    console.log(`[Music Consumer] ✅ ${item.id} → /music/${trackFolder}/ (${stemsToSave.length} stems + ${stems.length - stemsToSave.length} bonus)`);
    console.log(`[Music Consumer]    DJ Booth will auto-discover ${trackFolder} on next poll!`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Music Consumer] ❌ ${item.id} failed: ${msg}`);
    await patchQueueItem(item.id, { error: msg });
  }
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

let processing = false;

async function poll() {
  if (processing) return;
  processing = true;

  try {
    const queued = await fetchQueuedItems();
    if (queued.length > 0) {
      // Process oldest first
      await processItem(queued[0]);
    }
  } catch (err) {
    console.error('[Music Consumer] Poll error:', err);
  } finally {
    processing = false;
  }
}

async function main() {
  console.log('===========================================');
  console.log(' ElevenLabs Music Consumer');
  console.log('===========================================');
  console.log(`Next.js:    ${NEXT_JS_BASE_URL}`);
  console.log(`Supabase:   ${SUPABASE_URL}`);
  console.log(`Bucket:     ${STORAGE_BUCKET}`);
  console.log(`Music dir:  ${MUSIC_DIR}`);
  console.log(`Stems:      generate → stem-separate (six_stems_v1) → save ${STEMS_TO_SAVE}+`);
  console.log(`Poll every: ${POLL_INTERVAL_MS / 1000}s`);
  console.log('-------------------------------------------');

  validateEnv();
  await ensureBucket();

  console.log('[Music Consumer] Polling for queued items...\n');
  setInterval(poll, POLL_INTERVAL_MS);
  poll(); // Immediate first poll
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Music Consumer] Shutting down...');
  process.exit(0);
});

main().catch((err) => {
  console.error('[Music Consumer] Fatal:', err);
  process.exit(1);
});
