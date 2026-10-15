# Personal AI Avatar Companion (v0.1)

A browser-based personal avatar starter with:

- A Three.js 3D face (loads the Face Cap sample from the Three.js examples; falls back to a procedural face if the sample cannot load).
- Facial animation driven by morph targets where the model provides them.
- **Conversation mode:** text chat plus microphone input (Web Speech API in supported browsers), backed by OpenAI.
- **Speak my text mode:** reads the exact text you enter.
- Optional ElevenLabs neural TTS with character-level timestamps. When configured, the browser plays the generated audio and uses timestamp-derived approximate mouth cues. ElevenLabs returns character alignment rather than a true viseme track, so this is not phoneme-perfect lip-sync. Without ElevenLabs settings, the app falls back to browser speech synthesis with approximate mouth movement.
- Upload a `.glb` avatar from your computer. For high-quality face animation, use a model with ARKit facial blendshapes (for example, `jawOpen`, `mouthFunnel`, `eyeBlinkLeft`) or compatible Oculus viseme targets.

This is an MVP. It does not persist conversation memory across browser sessions, and microphone speech recognition depends on the browser. Chrome or Edge on localhost is recommended.

## Requirements

- Python 3.10+
- Node.js 20+ (a recent LTS release is recommended)
- An OpenAI API key for conversation mode
- Optional: ElevenLabs API key and voice ID for neural speech with character-level timing
- An internet connection for npm package installation and the default Face Cap sample model

## 1. Configure the backend (Windows PowerShell)

Open terminal 1:

```powershell
cd avatar_companion\backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
notepad .env
```

Add your API key to `backend/.env`:

```dotenv
OPENAI_API_KEY=your_real_key_here
OPENAI_MODEL=gpt-6-luna
```

To enable ElevenLabs text-to-speech, also set the API key from your ElevenLabs account settings and the Voice ID from the voice you choose in your voice library:

```dotenv
ELEVENLABS_API_KEY=your_elevenlabs_api_key
ELEVENLABS_VOICE_ID=your_elevenlabs_voice_id
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
```

Then start the API:

```powershell
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Keep this terminal running. The health endpoint is http://127.0.0.1:8000/api/health.

> If your PowerShell execution policy blocks the virtual-environment activation, use `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` in that terminal and activate again.

## 2. Start the web app

Open terminal 2:

```powershell
cd avatar_companion\frontend
npm install
npm run dev
```

Open the local URL printed by Vite, normally http://127.0.0.1:5173.

## 3. Use it

### Talk with your avatar

1. Open **Conversation**.
2. Type a question and press **Send**, or select the microphone and speak.
3. The AI's answer is spoken automatically unless sound is muted.

### Have it speak your text

1. Open **Speak my text**.
2. Enter the words that the avatar should say.
3. Press **Speak this text**. This reads your text rather than sending it to the AI.

### Load a more realistic custom avatar

Choose **Change avatar** and select a `.glb` file. The most reliable lip-sync is achieved with a model containing facial blendshapes. Models without morph targets can render, but this starter cannot animate their actual facial geometry.

The default Face Cap sample is provided by the Three.js examples and credited to **Face Cap**. Three.js's example page identifies the model creator and demonstrates its morph targets: https://threejs.org/examples/webgl_morphtargets_face.html. The app loads that sample remotely, so it is not bundled inside this ZIP; network availability affects whether it loads. See also the Three.js model-loading guide: https://threejs.org/manual/pages/loading-3d-models.html.

## Lip-sync accuracy

- **ElevenLabs configured:** the backend calls the ElevenLabs `with-timestamps` text-to-speech endpoint, receives generated audio plus character start/end timing, and converts character timings into approximate mouth-shape cues. API reference: https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps.
- **Important limitation:** character alignment is not the same as phoneme/viseme detection. The first version estimates a mouth shape from each character; expect approximate synchronization, not production-grade phoneme-perfect lip-sync. For higher fidelity, add a dedicated phoneme/viseme pipeline or a facial-animation system.
- **ElevenLabs not configured:** browser speech synthesis is used. A simple fallback animation creates approximate movement; this is not phoneme-accurate lip-sync.
- **Model requirement:** accurate-looking animation depends on the model's facial rig. For ARKit-style GLBs, the app maps common mouth shapes such as `jawOpen`, `mouthPucker`, `mouthFunnel`, and `mouthStretchLeft/Right`. Different models may name controls differently, so adjust the mapping in `frontend/src/avatar/AvatarStage.jsx` if needed.

## Project structure

```text
avatar_companion/
├── README.md
├── backend/
│   ├── .env.example
│   ├── requirements.txt
│   └── app/
│       └── main.py
└── frontend/
    ├── index.html
    ├── package.json
    ├── vite.config.js
    └── src/
        ├── App.jsx
        ├── main.jsx
        ├── styles.css
        └── avatar/
            └── AvatarStage.jsx
```

## Security and costs

- Never commit `backend/.env` or paste API keys into frontend code.
- OpenAI and ElevenLabs usage may incur charges under your own accounts.
- The API server is intended for local development, not public deployment as-is. Before exposing it to the internet, add authentication, rate limits, HTTPS, stronger input limits, and operational logging controls.
- Voice recognition is browser-dependent. This MVP sends only the resulting recognized text to the FastAPI chat endpoint; the raw microphone recording is not uploaded by this code.

## Troubleshooting

- **AI setup needed:** add `OPENAI_API_KEY` to `backend/.env`, then restart Uvicorn and refresh the page.
- **Browser voice fallback:** this is expected when ElevenLabs credentials are blank or the speech request fails; text-to-speech still works in supported browsers.
- **No microphone:** allow microphone access and use localhost in Chrome or Edge. If recognition is unsupported, type in the composer.
- **Avatar sample failed:** the app displays a fallback procedural face. Check network access to `threejs.org`, then refresh; or load your own `.glb`.
- **Model mouth stays still:** confirm the GLB contains facial morph targets. A mesh with no facial rig can be rendered but does not have geometry to animate.
