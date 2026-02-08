/**
 * E2E test for the ElevenLabs Music Consumer pipeline.
 * Tests: env → Supabase Storage → ElevenLabs API → full flow.
 *
 * Usage:  npm run test-music
 */

import { createClient } from '@supabase/supabase-js';

const NEXT_JS_BASE_URL = process.env.NEXT_JS_BASE_URL || 'http://localhost:3000';
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STORAGE_BUCKET = 'music';

let passed = 0;
let failed = 0;

function ok(label: string, detail?: string) {
  passed++;
  console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ''}`);
}
function fail(label: string, detail: string) {
  failed++;
  console.error(`  ❌ ${label} — ${detail}`);
}

async function main() {
  console.log('===========================================');
  console.log(' Music Consumer — E2E Test');
  console.log('===========================================\n');

  // -------------------------------------------------------
  // 1. Env vars
  // -------------------------------------------------------
  console.log('[1] Environment variables');
  if (ELEVENLABS_API_KEY) ok('ELEVENLABS_API_KEY', `${ELEVENLABS_API_KEY.slice(0, 8)}...`);
  else fail('ELEVENLABS_API_KEY', 'MISSING — add to .env.local');

  if (SUPABASE_URL) ok('SUPABASE_URL', SUPABASE_URL);
  else fail('SUPABASE_URL', 'MISSING');

  if (SUPABASE_SERVICE_ROLE_KEY) ok('SUPABASE_SERVICE_ROLE_KEY', `${SUPABASE_SERVICE_ROLE_KEY.slice(0, 12)}...`);
  else fail('SUPABASE_SERVICE_ROLE_KEY', 'MISSING — find in Supabase Dashboard → Settings → API');

  if (!ELEVENLABS_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.log('\n⛔ Cannot continue without all env vars. Fix and retry.');
    process.exit(1);
  }

  // -------------------------------------------------------
  // 2. Next.js music queue API
  // -------------------------------------------------------
  console.log('\n[2] Next.js music queue API');
  try {
    const res = await fetch(`${NEXT_JS_BASE_URL}/api/music-queue`);
    const data = await res.json();
    ok('GET /api/music-queue', `total=${data.total}, queued=${data.queued}, ready=${data.ready}`);
  } catch (e: any) {
    fail('GET /api/music-queue', `${e.message} — is Next.js running on ${NEXT_JS_BASE_URL}?`);
    console.log('\n⛔ Next.js must be running. Start with: npm run dev');
    process.exit(1);
  }

  // -------------------------------------------------------
  // 3. Supabase Storage — bucket check/create
  // -------------------------------------------------------
  console.log('\n[3] Supabase Storage');
  const sb = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  const { data: bucketData, error: bucketErr } = await sb.storage.getBucket(STORAGE_BUCKET);
  if (bucketErr && bucketErr.message.includes('not found')) {
    console.log(`  ⚙️  Bucket "${STORAGE_BUCKET}" not found, creating...`);
    const { error: createErr } = await sb.storage.createBucket(STORAGE_BUCKET, {
      public: true,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg', 'audio/webm'],
    });
    if (createErr) fail('Create bucket', createErr.message);
    else ok('Created bucket', `"${STORAGE_BUCKET}" (public)`);
  } else if (bucketErr) {
    fail('Bucket check', bucketErr.message);
  } else {
    ok('Bucket exists', `"${STORAGE_BUCKET}" (public=${bucketData?.public})`);
  }

  // Test upload with a tiny audio-typed file
  const testFilename = `_test-${Date.now()}.mp3`;
  const { error: uploadErr } = await sb.storage
    .from(STORAGE_BUCKET)
    .upload(testFilename, Buffer.from('test'), { contentType: 'audio/mpeg', upsert: true });

  if (uploadErr) {
    fail('Test upload', uploadErr.message);
  } else {
    const { data: urlData } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(testFilename);
    ok('Test upload + public URL', urlData.publicUrl.slice(0, 80) + '...');
    // Cleanup
    await sb.storage.from(STORAGE_BUCKET).remove([testFilename]);
  }

  // -------------------------------------------------------
  // 4. ElevenLabs API — short sound generation
  // -------------------------------------------------------
  console.log('\n[4] ElevenLabs API (short test generation)');
  let testAudioBuffer: Buffer | null = null;

  try {
    const res = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: 'A short electronic beat with a kick drum',
        duration_seconds: 5, // Shortest possible to save credits
        prompt_influence: 0.3,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      fail('Sound generation', `HTTP ${res.status}: ${errText.slice(0, 200)}`);
    } else {
      const arrayBuffer = await res.arrayBuffer();
      testAudioBuffer = Buffer.from(arrayBuffer);
      ok('Sound generation', `${(testAudioBuffer.length / 1024).toFixed(0)} KB audio returned`);
    }
  } catch (e: any) {
    fail('Sound generation', e.message);
  }

  // -------------------------------------------------------
  // 5. Full pipeline: upload generated audio → patch queue
  // -------------------------------------------------------
  if (testAudioBuffer) {
    console.log('\n[5] Full pipeline — upload + queue patch');

    // Upload test audio
    const audioFilename = `test-e2e-${Date.now()}.mp3`;
    const { error: audioUpErr } = await sb.storage
      .from(STORAGE_BUCKET)
      .upload(audioFilename, testAudioBuffer, { contentType: 'audio/mpeg' });

    if (audioUpErr) {
      fail('Audio upload', audioUpErr.message);
    } else {
      const { data: audioUrl } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(audioFilename);
      ok('Audio uploaded to Supabase', audioUrl.publicUrl.slice(0, 80) + '...');

      // Queue a test item
      const postRes = await fetch(`${NEXT_JS_BASE_URL}/api/music-queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: 'E2E test track',
          genre: 'electronic',
          bpm: 128,
          energy: 0.7,
          mood: 'test',
          duration_seconds: 5,
          agentReasoning: 'E2E test — will be cleaned up',
        }),
      });
      const postData = await postRes.json();
      const testId = postData.item?.id;

      if (!testId) {
        fail('Queue POST', 'No item ID returned');
      } else {
        ok('Queued test item', testId);

        // Patch to generating
        await fetch(`${NEXT_JS_BASE_URL}/api/music-queue`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: testId, status: 'generating' }),
        });
        ok('Patched → generating');

        // Patch to ready with audio URL
        await fetch(`${NEXT_JS_BASE_URL}/api/music-queue`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: testId, status: 'ready', audioUrl: audioUrl.publicUrl }),
        });
        ok('Patched → ready with audioUrl');

        // Verify it shows up as nextReady
        const verifyRes = await fetch(`${NEXT_JS_BASE_URL}/api/music-queue`);
        const verifyData = await verifyRes.json();
        const readyItem = verifyData.queue.find((i: any) => i.id === testId);
        if (readyItem?.status === 'ready' && readyItem?.audioUrl) {
          ok('Verified in queue', `status=${readyItem.status}, audioUrl set ✓`);
        } else {
          fail('Verify', 'Item not found or missing audioUrl');
        }
      }
    }
  } else {
    console.log('\n[5] Skipped — no audio from step 4');
  }

  // -------------------------------------------------------
  // Summary
  // -------------------------------------------------------
  console.log('\n===========================================');
  console.log(`  ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log('  🎉 ALL TESTS PASSED — ready to run: npm run music-consumer');
  } else {
    console.log('  ⚠️  Fix failures above before running the consumer.');
  }
  console.log('===========================================');
  process.exit(failed > 0 ? 1 : 0);
}

main();
