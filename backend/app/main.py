from __future__ import annotations

import os
from pathlib import Path
from typing import Literal
from urllib.parse import quote

import httpx

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

BASE_DIR = Path(__file__).resolve().parents[1]
load_dotenv(BASE_DIR / ".env")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-6-luna").strip()
ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY", "").strip()
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "").strip()
ELEVENLABS_MODEL_ID = os.getenv("ELEVENLABS_MODEL_ID", "eleven_multilingual_v2").strip()

app = FastAPI(title="Personal Avatar Companion API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

SYSTEM_PROMPT = """You are a warm, thoughtful personal AI avatar companion. Speak naturally and clearly, as if talking face to face. Keep most answers concise unless the user asks for detail. Be honest about uncertainty. Do not claim to see, hear, remember, or do anything unless the app actually provides that capability. You can refer to conversation messages included in the current request, but do not claim persistent memory across sessions."""


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=6000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    history: list[Message] = Field(default_factory=list, max_length=30)


class SpeakRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1600)


@app.get("/api/health")
def health() -> dict:
    return {
        "ok": True,
        "openai_configured": bool(OPENAI_API_KEY),
        "elevenlabs_configured": bool(ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID),
        "model": OPENAI_MODEL,
    }


@app.post("/api/chat")
def chat(payload: ChatRequest) -> dict:
    if not OPENAI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="AI chat is not configured yet. Add OPENAI_API_KEY to backend/.env and restart the backend.",
        )

    try:
        from openai import OpenAI

        client = OpenAI(api_key=OPENAI_API_KEY)
        input_items = [
            {"role": item.role, "content": item.content}
            for item in payload.history[-20:]
        ]
        input_items.append({"role": "user", "content": payload.message})
        response = client.responses.create(
            model=OPENAI_MODEL,
            instructions=SYSTEM_PROMPT,
            input=input_items,
            max_output_tokens=700,
        )
        answer = (response.output_text or "").strip()
        if not answer:
            raise HTTPException(status_code=502, detail="The AI returned an empty response. Please try again.")
        return {"reply": answer, "model": OPENAI_MODEL}
    except HTTPException:
        raise
    except Exception as exc:
        # Avoid returning SDK internals, request headers, or secrets to the browser.
        print(f"OpenAI chat request failed: {type(exc).__name__}: {exc}")
        raise HTTPException(status_code=502, detail="The AI request failed. Check the backend terminal and API key/model settings.") from exc


def character_to_viseme(characters: list[str], index: int) -> int:
    """Estimate a mouth pose from character timing; this is not phoneme-perfect lip-sync."""
    char = (characters[index] if index < len(characters) else " ").lower()
    pair = "".join(characters[index:index + 2]).lower()

    if not char.isalpha():
        return 0
    # Use the available pose IDs in AvatarStage.jsx as approximate mouth shapes.
    if pair in {"th"}:
        return 17
    if pair in {"sh", "ch", "zh"}:
        return 8
    if pair in {"ph"} or char in {"f", "v"}:
        return 16
    if char in {"b", "m", "p"}:
        return 20  # closed lips
    if char in {"s", "z", "x"}:
        return 19
    if char in {"k", "g", "q"}:
        return 18
    if char == "r":
        return 21
    if char in {"l", "t", "d", "n"}:
        return 14
    if char in {"o"}:
        return 10
    if char in {"u", "w"}:
        return 9
    if char in {"e", "i", "y"}:
        return 6
    if char == "a":
        return 2
    if char == "h":
        return 1
    return 4


def synthesize_elevenlabs_speech(text: str) -> dict:
    """Generate speech with ElevenLabs and derive approximate mouth cues from character timestamps."""
    if not (ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID):
        raise HTTPException(
            status_code=503,
            detail="ElevenLabs is not configured. Add ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID to backend/.env.",
        )

    endpoint = f"https://api.elevenlabs.io/v1/text-to-speech/{quote(ELEVENLABS_VOICE_ID, safe='')}/with-timestamps"
    try:
        response = httpx.post(
            endpoint,
            params={"output_format": "mp3_44100_128"},
            headers={"xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json"},
            json={"text": text, "model_id": ELEVENLABS_MODEL_ID},
            timeout=90.0,
        )
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="ElevenLabs speech generation timed out. Please try again.") from exc
    except httpx.HTTPError as exc:
        print(f"ElevenLabs connection failed: {type(exc).__name__}")
        raise HTTPException(status_code=502, detail="Could not connect to ElevenLabs. Check the backend connection.") from exc

    if response.is_error:
        # Log only a short provider message, never the request headers or API key.
        print(f"ElevenLabs returned HTTP {response.status_code}: {response.text[:400]}")
        if response.status_code in (401, 403):
            detail = "ElevenLabs rejected the API key or voice permissions. Check your backend/.env settings."
        elif response.status_code == 429:
            detail = "ElevenLabs rate limit or quota reached. Check your account usage and retry later."
        else:
            detail = f"ElevenLabs speech generation failed (HTTP {response.status_code}). Check the voice ID, model, and account access."
        raise HTTPException(status_code=502, detail=detail)

    try:
        result = response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="ElevenLabs returned an unreadable response.") from exc

    audio_base64 = result.get("audio_base64")
    if not audio_base64:
        raise HTTPException(status_code=502, detail="ElevenLabs returned no audio data.")

    alignment = result.get("normalized_alignment") or result.get("alignment") or {}
    characters = alignment.get("characters") or []
    starts = alignment.get("character_start_times_seconds") or []
    cues: list[dict] = []
    previous_id = None
    for index, start_time in enumerate(starts):
        if index >= len(characters):
            break
        viseme_id = character_to_viseme(characters, index)
        # Avoid redundant frames; timestamps remain relative to the audio start.
        if viseme_id != previous_id:
            cues.append({"t": max(0.0, float(start_time)), "id": viseme_id})
            previous_id = viseme_id

    return {
        "audio_base64": audio_base64,
        "audio_mime": "audio/mpeg",
        "cues": cues,
        "voice": ELEVENLABS_VOICE_ID,
        "sync_mode": "elevenlabs-character-timing-approximate-visemes",
    }


@app.post("/api/speech")
def speech(payload: SpeakRequest) -> dict:
    if not (ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID):
        raise HTTPException(
            status_code=503,
            detail="ElevenLabs is not configured. The browser will use its built-in voice and approximate lip movement instead.",
        )
    try:
        return synthesize_elevenlabs_speech(payload.text.strip())
    except HTTPException:
        raise
    except Exception as exc:
        print(f"Speech synthesis failed: {type(exc).__name__}: {exc}")
        raise HTTPException(status_code=502, detail="Speech synthesis failed. Check the backend terminal and ElevenLabs settings.") from exc
