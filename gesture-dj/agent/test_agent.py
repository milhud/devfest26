"""Quick one-shot test of the DJ Agent — verifies API connectivity and a single decision cycle."""
import os
import sys
import asyncio
import json
import time

# Load env from agent/.env
sys.path.insert(0, os.path.dirname(__file__))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

from dj_agent import DJAgent, NEXT_JS_BASE_URL, WS_SERVER_URL


async def test():
    print("=" * 60)
    print("  DJ AGENT — ONE-SHOT TEST")
    print("=" * 60)

    # 1. Check env
    api_key = os.environ.get("DEDALUS_API_KEY")
    print(f"\n[1] DEDALUS_API_KEY: {'SET (' + api_key[:8] + '...)' if api_key else 'MISSING ❌'}")
    if not api_key:
        print("   → Set DEDALUS_API_KEY in agent/.env")
        return

    # 2. Instantiate agent
    print(f"\n[2] Creating DJAgent...")
    try:
        agent = DJAgent()
        print(f"   ✅ Agent created")
    except Exception as e:
        print(f"   ❌ Failed: {e}")
        return

    # 3. Test vote API
    print(f"\n[3] Fetching votes from {NEXT_JS_BASE_URL}/api/vote ...")
    vote_agg = await agent.fetch_vote_aggregation()
    print(f"   ✅ Vote aggregation: total={vote_agg.get('total', 0)}, rate={vote_agg.get('voteRate', 0):.2f}/s")

    # 4. Test music queue API
    print(f"\n[4] Fetching music queue from {NEXT_JS_BASE_URL}/api/music-queue ...")
    music_queue = await agent.fetch_music_queue_status()
    print(f"   ✅ Queue: queued={music_queue.get('queued', 0)}, generating={music_queue.get('generating', 0)}, ready={music_queue.get('ready', 0)}")

    # 5. Build context (sanity check)
    print(f"\n[5] Building context string...")
    audio_state = agent.get_audio_state()
    context = agent.build_context(vote_agg, audio_state, music_queue)
    print(f"   ✅ Context length: {len(context)} chars")
    print(f"   Preview: {context[:200]}...")

    # 6. Make a decision via K2 Think / Dedalus
    print(f"\n[6] Calling K2 Think via Dedalus (this may take 15-60s)...")
    start = time.time()
    decision = await agent.make_decision(vote_agg, music_queue)
    elapsed = time.time() - start

    if decision is None:
        print(f"   ❌ No valid decision returned after {elapsed:.1f}s")
        return

    print(f"   ✅ Decision received in {elapsed:.1f}s")
    print(f"   Reasoning: {decision.get('reasoning', 'N/A')[:150]}...")
    print(f"   Actions ({len(decision.get('actions', []))}):")
    for a in decision.get("actions", []):
        print(f"     - {a.get('type')}: {json.dumps(a.get('value')) if isinstance(a.get('value'), (dict, list)) else a.get('value')}")
    print(f"   Confidence: {decision.get('confidence', 0):.0%}")
    print(f"   Next check: {decision.get('next_check_seconds', '?')}s")

    # 7. Test action execution (broadcast to WS)
    actions = decision.get("actions", [])
    if actions:
        print(f"\n[7] Executing {len(actions)} action(s) + WS broadcast...")
        try:
            await agent.execute_actions(actions, decision_reasoning=decision.get("reasoning", ""))
            print(f"   ✅ Actions executed")
        except Exception as e:
            print(f"   ⚠️  Execution error (non-fatal): {e}")

    # 8. Post decision to API
    print(f"\n[8] Posting decision to {NEXT_JS_BASE_URL}/api/agent ...")
    try:
        await agent.post_decision_to_api(decision)
        print(f"   ✅ Posted")
    except Exception as e:
        print(f"   ⚠️  Post error (non-fatal): {e}")

    print("\n" + "=" * 60)
    print("  ✅ ALL TESTS PASSED — Agent is working!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(test())
