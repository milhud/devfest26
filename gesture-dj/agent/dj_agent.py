import os
import json
import asyncio
import time
from dotenv import load_dotenv
from dedalus_labs import AsyncDedalus, DedalusRunner
import websockets
import aiohttp

load_dotenv()

DJ_AGENT_SYSTEM_PROMPT = """
You are the AI brain of an interactive DJ booth. Your job is to analyze crowd
sentiment from audience votes, current audio state, and set timeline to make
creative decisions about the music, visuals, and — critically — what music to
generate NEXT using AI (ElevenLabs). You think ahead.

You think like an experienced DJ:
- You understand energy arcs (build → peak → release → build)
- You don't blindly follow majority vote — you reason about timing and pacing
- You anticipate what the crowd needs NEXT, not just what they're asking for now
- You create moments of surprise and tension
- You queue up the NEXT track well in advance (AI music generation takes ~30s)

OUTPUT FORMAT: Respond with ONLY a valid JSON object, no markdown, no extra text:
{
  "reasoning": "Your chain-of-thought reasoning about the current state",
  "actions": [
    {"type": "adjust_energy", "value": 0.1}
  ],
  "confidence": 0.85,
  "next_check_seconds": 20
}

AVAILABLE ACTIONS:

== Immediate actions (applied now) ==
- adjust_energy: delta from -0.3 to +0.3
- switch_genre: value is one of "house" | "dnb" | "techno" | "lofi" | "ambient"
- trigger_drop: value is {"buildup_bars": 4 | 8 | 16}
- adjust_bpm: delta from -20 to +20
- change_fx: value is {"type": "reverb" | "delay", "amount": 0.0-1.0}
- set_filter: value is {"type": "lowpass" | "highpass", "frequency": 100-18000}

== Visual / animation actions ==
- change_viz_theme: value is one of "cyber" | "organic" | "minimal" | "chaos"
- set_camera_mode: value is one of "orbit" | "fly" | "static" | "shake"
- set_color_palette: value is an array of 3 hex colors like ["#ff6b35", "#ff3250", "#1a1a2e"]
- set_animation_intensity: value from 0.0 to 1.0 (controls particle speed, mesh distortion, bloom)

== Music generation actions (queued, takes ~30s to produce) ==
- generate_track: value is an object:
  {
    "prompt": "A detailed description of the track to generate. Be specific about
               instruments, rhythm, mood, drops, builds. Example: 'Deep house track
               with warm analog synth pads, rolling 4/4 kick at 124bpm, subtle hi-hat
               shuffle, a filtered build starting at bar 8 leading to an euphoric
               chord progression drop'",
    "genre": "house" | "dnb" | "techno" | "lofi" | "ambient" | "trance" | "dubstep",
    "bpm": 80-180,
    "energy": 0.0-1.0,
    "mood": "euphoric" | "dark" | "chill" | "aggressive" | "dreamy" | "hypnotic",
    "duration_seconds": 15-60
  }

MUSIC GENERATION STRATEGY:
- Always think 1-2 tracks ahead. If the current track has been playing for a while,
  queue the next one before it ends.
- The prompt should be DETAILED and CREATIVE. Describe specific instruments, textures,
  rhythm patterns, and emotional arc. Generic prompts produce generic music.
- Match the generated track to where you think the crowd energy WILL BE, not where it is now.
- If crowd wants a genre switch, generate a transition track that bridges the current
  genre to the new one.
- If a drop is requested, generate a track with a clear buildup and payoff.
- Check the music queue status — don't queue more than 2 tracks ahead.

RULES:
- Maximum 4 actions per decision (including at most 1 generate_track)
- Don't repeat the same action within 2 consecutive decisions
- If vote rate is very low (<0.1/sec), make smaller, subtler changes
- If a hype spike is active, lean into it — this is the crowd being engaged
- Always include reasoning explaining WHY you chose each action
- When reasoning about music generation, explain the creative vision for the track
"""

NEXT_JS_BASE_URL = os.getenv("NEXT_JS_BASE_URL", "http://localhost:3000")
WS_SERVER_URL = os.getenv("WS_SERVER_URL", "ws://localhost:8080")


class DJAgent:
    def __init__(self):
        self.client = AsyncDedalus(api_key=os.environ.get("DEDALUS_API_KEY"))
        self.runner = DedalusRunner(self.client)
        self.decision_history: list[dict] = []
        self.set_start_time = time.time()
        self.current_energy = 0.5
        self.current_bpm = 128
        self.current_genre = "house"
        self.current_viz_theme = "cyber"
        self.current_scene_complexity = 0.5
        self.current_animation_intensity = 0.5
        self.ws_connection = None
        self._http_session: aiohttp.ClientSession | None = None

    async def get_http_session(self) -> aiohttp.ClientSession:
        """Reuse a single HTTP session across all requests."""
        if self._http_session is None or self._http_session.closed:
            self._http_session = aiohttp.ClientSession()
        return self._http_session

    async def close(self):
        """Clean up resources."""
        if self._http_session and not self._http_session.closed:
            await self._http_session.close()
        if self.ws_connection:
            try:
                await self.ws_connection.close()
            except Exception:
                pass

    def get_set_timeline_minutes(self) -> float:
        return (time.time() - self.set_start_time) / 60.0

    async def fetch_music_queue_status(self) -> dict:
        """Fetch current music queue status from the Next.js API."""
        try:
            session = await self.get_http_session()
            async with session.get(f"{NEXT_JS_BASE_URL}/api/music-queue") as resp:
                if resp.status == 200:
                    return await resp.json()
        except Exception as e:
            print(f"[DJ Agent] Failed to fetch music queue: {e}")
        return {"queued": 0, "generating": 0, "ready": 0, "total": 0, "queue": []}

    async def fetch_vote_aggregation(self) -> dict:
        """Fetch current vote aggregation from the Next.js API."""
        try:
            session = await self.get_http_session()
            async with session.get(f"{NEXT_JS_BASE_URL}/api/vote") as resp:
                if resp.status == 200:
                    data = await resp.json()
                    return data.get("aggregation", {})
        except Exception as e:
            print(f"[DJ Agent] Failed to fetch votes: {e}")
        return {
            "counts": {},
            "total": 0,
            "voteRate": 0,
            "avgRate": 0,
            "isHypeSpike": False,
            "dominantVote": None,
            "energyBias": 0,
        }

    def get_audio_state(self) -> dict:
        """Return current audio state (tracked locally, updated by action execution)."""
        return {
            "genre": self.current_genre,
            "bpm": self.current_bpm,
            "energy": self.current_energy,
            "activeFx": [],
            "vizTheme": self.current_viz_theme,
            "sceneComplexity": self.current_scene_complexity,
        }

    def build_context(self, vote_agg: dict, audio_state: dict, music_queue: dict) -> str:
        set_timeline = self.get_set_timeline_minutes()
        last_decisions = self.decision_history[-3:] if self.decision_history else []

        # Summarize recent queue items
        queue_items = music_queue.get("queue", [])
        queue_summary = ""
        for item in queue_items[-5:]:
            queue_summary += f"  - [{item.get('status')}] \"{item.get('prompt', '?')[:60]}...\" ({item.get('genre')}, {item.get('bpm')}bpm)\n"
        if not queue_summary:
            queue_summary = "  (empty)\n"

        return f"""
CURRENT STATE (t={set_timeline:.1f}min into set):

Vote Aggregation (last 30s):
- Total votes: {vote_agg.get('total', 0)}
- Energy Up: {vote_agg.get('counts', {}).get('energy_up', 0)}
- Energy Down: {vote_agg.get('counts', {}).get('energy_down', 0)}
- Genre Switch requests: {vote_agg.get('counts', {}).get('genre_switch', 0)}
- Drop Requests: {vote_agg.get('counts', {}).get('drop_request', 0)}
- Viz Style requests: {vote_agg.get('counts', {}).get('viz_style', 0)}
- Speed Up: {vote_agg.get('counts', {}).get('speed_up', 0)}
- Speed Down: {vote_agg.get('counts', {}).get('speed_down', 0)}
- Vote rate: {vote_agg.get('voteRate', 0):.2f}/sec (avg: {vote_agg.get('avgRate', 0):.2f}/sec)
- Hype spike active: {vote_agg.get('isHypeSpike', False)}
- Energy bias: {vote_agg.get('energyBias', 0):.2f} (-1=chill, +1=hype)

Audio State:
- Current genre: {audio_state['genre']}
- BPM: {audio_state['bpm']}
- Energy level: {audio_state['energy']:.2f}/1.0
- Current FX: {audio_state['activeFx']}

Visual State:
- Theme: {audio_state['vizTheme']}
- Scene complexity: {audio_state['sceneComplexity']:.2f}
- Animation intensity: {self.current_animation_intensity:.2f}

Music Generation Queue:
- Queued: {music_queue.get('queued', 0)} | Generating: {music_queue.get('generating', 0)} | Ready: {music_queue.get('ready', 0)}
- Recent items:
{queue_summary}
Last {len(last_decisions)} Decisions:
{json.dumps(last_decisions, indent=2) if last_decisions else "None yet — this is the first decision."}

Reason about what the crowd needs right now. Consider:
1. Should you adjust the current mix (energy, FX, filters)?
2. Should you change the visuals (theme, camera, colors, animation intensity)?
3. Do you need to queue a new track? What should it sound like and why?
"""

    async def make_decision(self, vote_agg: dict, music_queue: dict) -> dict | None:
        """Send context to K2 Think via Dedalus and get a decision."""
        audio_state = self.get_audio_state()
        context = self.build_context(vote_agg, audio_state, music_queue)

        full_input = f"{DJ_AGENT_SYSTEM_PROMPT}\n\n---\n\n{context}"

        try:
            response = await asyncio.wait_for(
                self.runner.run(
                    input=full_input,
                    model="moonshot/kimi-k2-thinking-turbo",
                ),
                timeout=120,
            )

            raw_output = response.final_output
            # Strip markdown code fences if present
            cleaned = raw_output.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            cleaned = cleaned.strip()

            decision = json.loads(cleaned)
            return decision

        except json.JSONDecodeError as e:
            print(f"[DJ Agent] Failed to parse decision JSON: {e}")
            print(f"[DJ Agent] Raw output: {raw_output[:200]}")
            return None
        except Exception as e:
            print(f"[DJ Agent] Error calling K2 Think: {e}")
            return None

    async def execute_actions(self, actions: list[dict], decision_reasoning: str = ""):
        """Execute agent actions by updating local state and broadcasting via WS."""
        broadcast_actions = []

        for action in actions:
            action_type = action.get("type")
            value = action.get("value")

            if action_type == "adjust_energy":
                self.current_energy = max(0, min(1, self.current_energy + value))
            elif action_type == "adjust_bpm":
                self.current_bpm = max(80, min(180, self.current_bpm + value))
            elif action_type == "switch_genre":
                self.current_genre = value
            elif action_type == "change_viz_theme":
                self.current_viz_theme = value
            elif action_type == "set_animation_intensity":
                self.current_animation_intensity = max(0, min(1, float(value)))
            elif action_type == "generate_track":
                # Queue music generation via the Next.js API
                await self.queue_music_generation(value, decision_reasoning)
            # These are broadcast-only (handled by viz/audio clients):
            # trigger_drop, set_camera_mode, set_color_palette, change_fx, set_filter

            print(f"  -> {action_type}: {json.dumps(value) if isinstance(value, dict) else value}")
            broadcast_actions.append(action)

        # Broadcast all actions to WebSocket server (except generate_track which goes via API)
        ws_actions = [a for a in broadcast_actions if a.get("type") != "generate_track"]
        if ws_actions:
            await self.broadcast_actions(ws_actions)

    async def queue_music_generation(self, track_params: dict, reasoning: str = ""):
        """Post a music generation request to the Next.js music queue API."""
        try:
            payload = {
                "prompt": track_params.get("prompt", ""),
                "genre": track_params.get("genre", self.current_genre),
                "bpm": track_params.get("bpm", self.current_bpm),
                "energy": track_params.get("energy", self.current_energy),
                "mood": track_params.get("mood", "energetic"),
                "duration_seconds": track_params.get("duration_seconds", 30),
                "agentReasoning": reasoning,
            }
            session = await self.get_http_session()
            async with session.post(
                f"{NEXT_JS_BASE_URL}/api/music-queue",
                json=payload,
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    print(f"  -> [Music Queue] Queued: {data.get('item', {}).get('id')}")
                else:
                    print(f"  -> [Music Queue] Failed: {resp.status}")
        except Exception as e:
            print(f"  -> [Music Queue] Error: {e}")

    async def post_decision_to_api(self, decision: dict):
        """Post the decision to the Next.js /api/agent endpoint for dashboard display."""
        try:
            session = await self.get_http_session()
            payload = {
                "reasoning": decision.get("reasoning", ""),
                "actions": decision.get("actions", []),
                "confidence": decision.get("confidence", 0),
                "audioState": self.get_audio_state(),
            }
            async with session.post(
                f"{NEXT_JS_BASE_URL}/api/agent",
                json=payload,
            ) as resp:
                if resp.status != 200:
                    print(f"[DJ Agent] API post failed: {resp.status}")
        except Exception as e:
            print(f"[DJ Agent] API post error (non-fatal): {e}")

    async def broadcast_actions(self, actions: list[dict]):
        """Send actions to the WebSocket server for distribution to viz + audio."""
        msg = json.dumps({
            "source": "agent",
            "type": "agent_decision",
            "data": {
                "actions": actions,
                "audioState": self.get_audio_state(),
            },
            "timestamp": int(time.time() * 1000),
        })

        try:
            if self.ws_connection is None:
                self.ws_connection = await websockets.connect(
                    f"{WS_SERVER_URL}?type=agent"
                )
            try:
                await self.ws_connection.send(msg)
            except Exception:
                # Reconnect on stale connection
                self.ws_connection = await websockets.connect(
                    f"{WS_SERVER_URL}?type=agent"
                )
                await self.ws_connection.send(msg)
        except Exception as e:
            print(f"[DJ Agent] WS broadcast failed (non-fatal): {e}")

    async def run_loop(self):
        """Main agent decision loop."""
        next_check = 15  # seconds

        print("=" * 60)
        print("  DJ AGENT STARTING")
        print(f"  Model: K2 Think via Dedalus")
        print(f"  Polling votes from: {NEXT_JS_BASE_URL}/api/vote")
        print(f"  WS server: {WS_SERVER_URL}")
        print("=" * 60)

        while True:
            await asyncio.sleep(next_check)

            # 1. Collect current state (votes + music queue in parallel)
            vote_agg = await self.fetch_vote_aggregation()
            music_queue = await self.fetch_music_queue_status()
            set_min = self.get_set_timeline_minutes()

            print(f"\n[DJ Agent] t={set_min:.1f}m | Votes: {vote_agg.get('total', 0)} | "
                  f"Rate: {vote_agg.get('voteRate', 0):.2f}/s | "
                  f"Hype: {'YES' if vote_agg.get('isHypeSpike') else 'no'} | "
                  f"Queue: {music_queue.get('queued', 0)}q/{music_queue.get('generating', 0)}g/{music_queue.get('ready', 0)}r")

            # 2. Get decision from K2 Think
            decision = await self.make_decision(vote_agg, music_queue)

            if decision is None:
                print("[DJ Agent] No valid decision — skipping cycle")
                next_check = 15
                continue

            # 3. Log reasoning
            reasoning = decision.get("reasoning", "No reasoning provided")
            actions = decision.get("actions", [])
            confidence = decision.get("confidence", 0)

            print(f"[DJ Agent] Reasoning: {reasoning[:120]}...")
            print(f"[DJ Agent] Confidence: {confidence:.0%} | Actions: {len(actions)}")

            # 4. Record in history
            self.decision_history.append({
                "timestamp_min": round(set_min, 1),
                "reasoning": reasoning,
                "actions": actions,
                "confidence": confidence,
            })

            # 5. Execute actions
            if actions:
                await self.execute_actions(actions, decision_reasoning=reasoning)

            # 5b. Post decision to Next.js API for dashboard
            await self.post_decision_to_api(decision)

            # 6. Adjust next check interval
            next_check = decision.get("next_check_seconds", 15)
            next_check = max(10, min(60, next_check))  # clamp to 10-60s

            print(f"[DJ Agent] Next check in {next_check}s")


async def main():
    agent = DJAgent()
    try:
        await agent.run_loop()
    except KeyboardInterrupt:
        print("\n[DJ Agent] Shutting down...")
    except Exception as e:
        print(f"\n[DJ Agent] Fatal error: {e}")
        raise
    finally:
        await agent.close()


if __name__ == "__main__":
    asyncio.run(main())
