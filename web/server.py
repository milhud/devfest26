"""
FastAPI server for the DJ Booth web frontend.
Serves static files and music tracks.
"""

from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

app = FastAPI(title="DJ Booth")

# Enable CORS for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Get paths
BASE_DIR = Path(__file__).parent
STATIC_DIR = BASE_DIR / "static"
MUSIC_DIR = BASE_DIR.parent / "music"

# Mount static files
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
app.mount("/music", StaticFiles(directory=str(MUSIC_DIR)), name="music")


@app.get("/")
async def root():
    """Serve the main HTML page."""
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}


if __name__ == "__main__":
    print("Starting DJ Booth server...")
    print(f"Static files: {STATIC_DIR}")
    print(f"Music files: {MUSIC_DIR}")
    print("Open http://localhost:8000 in your browser")
    uvicorn.run(app, host="0.0.0.0", port=8000)
