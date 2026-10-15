import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  Check,
  ChevronDown,
  CircleHelp,
  Headphones,
  LoaderCircle,
  MessageCircle,
  Mic,
  MicOff,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Volume2,
  VolumeX,
  Waves,
} from 'lucide-react';
import AvatarStage from './avatar/AvatarStage.jsx';

const STARTER_READ_TEXT = 'Hello! I am your personal AI companion. What would you like to talk about today?';

function inferViseme(word = '') {
  const value = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!value) return 0;
  if (/^[bmp]/.test(value)) return 20;
  if (/^[fv]/.test(value)) return 19;
  if (/^[ou]/.test(value)) return 9;
  if (/^[w]/.test(value)) return 8;
  if (/^[iy]/.test(value)) return 7;
  if (/^[ae]/.test(value)) return 1;
  if (/^[r]/.test(value)) return 5;
  if (/^[tdn]/.test(value)) return 4;
  if (/^[szhc]/.test(value)) return 18;
  return 2;
}

function timeLabel(date) {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date);
}

export default function App() {
  const [mode, setMode] = useState('talk');
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Hi! I’m here with you. Type a message or tap the microphone and let’s talk.',
      time: new Date(),
    },
  ]);
  const [draft, setDraft] = useState('');
  const [readText, setReadText] = useState(STARTER_READ_TEXT);
  const [isThinking, setIsThinking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [modelUrl, setModelUrl] = useState('');
  const [avatarStatus, setAvatarStatus] = useState('Loading 3D avatar…');
  const [health, setHealth] = useState({ openai_configured: false, elevenlabs_configured: false });
  const [notice, setNotice] = useState('');
  const messagesEndRef = useRef(null);
  const messagesRef = useRef(messages);
  const playbackRef = useRef(null);
  const audioRef = useRef(null);
  const recognitionRef = useRef(null);
  const fileInputRef = useRef(null);
  const objectUrlRef = useRef(null);
  const activeUtteranceRef = useRef(null);

  const setAvatarStatusSafe = useCallback((nextStatus) => setAvatarStatus(nextStatus), []);

  useEffect(() => {
    messagesRef.current = messages;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isThinking]);

  useEffect(() => {
    fetch('/api/health')
      .then((response) => response.json())
      .then(setHealth)
      .catch(() => setNotice('Backend is offline. Start the FastAPI server in the backend folder.'));
  }, []);

  useEffect(() => () => {
    try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
    window.speechSynthesis?.cancel();
    audioRef.current?.pause();
    if (audioRef.current?.src?.startsWith('blob:')) URL.revokeObjectURL(audioRef.current.src);
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  const stopCurrentSpeech = useCallback(() => {
    window.speechSynthesis?.cancel();
    activeUtteranceRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      if (audioRef.current.src?.startsWith('blob:')) URL.revokeObjectURL(audioRef.current.src);
      audioRef.current = null;
    }
    playbackRef.current = null;
    setIsSpeaking(false);
  }, []);

  const browserSpeak = useCallback((text) => {
    if (!text?.trim()) return;
    stopCurrentSpeech();
    if (!('speechSynthesis' in window)) {
      setNotice('This browser does not provide built-in speech. Try the latest Chrome or Edge.');
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text.trim());
    utterance.rate = 1.0;
    utterance.pitch = 0.98;
    utterance.lang = 'en-IN';
    const drive = {
      mode: 'browser',
      speaking: true,
      startedAt: performance.now(),
      wordStartedAt: performance.now(),
      visemeId: 1,
    };
    playbackRef.current = drive;
    activeUtteranceRef.current = utterance;
    utterance.onstart = () => {
      setIsSpeaking(true);
      setNotice('Speaking with browser voice · approximate lip-sync');
    };
    utterance.onboundary = (event) => {
      const fragment = text.slice(event.charIndex || 0);
      const word = fragment.split(/\s+/)[0] || '';
      drive.visemeId = inferViseme(word);
      drive.wordStartedAt = performance.now();
    };
    utterance.onend = () => {
      if (activeUtteranceRef.current === utterance) {
        activeUtteranceRef.current = null;
        playbackRef.current = null;
        setIsSpeaking(false);
      }
    };
    utterance.onerror = () => {
      if (activeUtteranceRef.current === utterance) {
        activeUtteranceRef.current = null;
        playbackRef.current = null;
        setIsSpeaking(false);
      }
    };
    window.speechSynthesis.speak(utterance);
  }, [stopCurrentSpeech]);

  const speakText = useCallback(async (text) => {
    if (!text?.trim()) return;
    stopCurrentSpeech();
    if (isMuted) {
      setNotice('Audio is muted. Turn sound on to hear the avatar.');
      return;
    }
    setNotice('Preparing speech…');
    try {
      const response = await fetch('/api/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim() }),
      });
      if (!response.ok) throw new Error('Cloud TTS not configured');
      const payload = await response.json();
      const raw = atob(payload.audio_base64);
      const bytes = new Uint8Array(raw.length);
      for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: payload.audio_mime || 'audio/wav' }));
      const audio = new Audio(blobUrl);
      audioRef.current = audio;
      playbackRef.current = { mode: 'audio', audio, cues: payload.cues || [] };
      audio.onplay = () => {
        setIsSpeaking(true);
        setNotice('Speaking with timestamped visemes');
      };
      audio.onended = () => {
        if (audioRef.current === audio) {
          playbackRef.current = null;
          audioRef.current = null;
          URL.revokeObjectURL(blobUrl);
          setIsSpeaking(false);
        }
      };
      audio.onerror = () => {
        if (audioRef.current === audio) {
          playbackRef.current = null;
          audioRef.current = null;
          URL.revokeObjectURL(blobUrl);
          setIsSpeaking(false);
          browserSpeak(text);
        }
      };
      await audio.play();
    } catch {
      browserSpeak(text);
    }
  }, [browserSpeak, isMuted, stopCurrentSpeech]);

  const appendMessage = useCallback((entry) => {
    setMessages((current) => {
      const next = [...current, entry];
      messagesRef.current = next;
      return next;
    });
  }, []);

  const sendMessage = useCallback(async (rawText) => {
    const text = String(rawText || '').trim();
    if (!text || isThinking) return;
    setDraft('');
    setNotice('');
    const priorMessages = messagesRef.current;
    appendMessage({ role: 'user', content: text, time: new Date() });
    setIsThinking(true);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: priorMessages
            .filter((message) => message.role === 'user' || message.role === 'assistant')
            .slice(-20)
            .map(({ role, content }) => ({ role, content })),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.detail || 'The AI request failed.');
      appendMessage({ role: 'assistant', content: payload.reply, time: new Date() });
      if (!isMuted) void speakText(payload.reply);
    } catch (error) {
      appendMessage({
        role: 'assistant',
        content: `I couldn’t complete that request. ${error.message || 'Check the backend connection.'}`,
        time: new Date(),
        isError: true,
      });
      setNotice('Check backend/.env and the backend terminal if AI chat is not configured.');
    } finally {
      setIsThinking(false);
    }
  }, [appendMessage, isMuted, isThinking, speakText]);

  const startListening = useCallback(() => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setNotice('Speech recognition is not available in this browser. Use Chrome or Edge, or type your message.');
      return;
    }
    try { recognitionRef.current?.abort(); } catch { /* no active session */ }
    const recognition = new Recognition();
    recognition.lang = 'en-IN';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      setIsListening(true);
      setNotice('Listening… speak naturally');
    };
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (transcript) void sendMessage(transcript);
    };
    recognition.onerror = (event) => {
      setNotice(event.error === 'not-allowed'
        ? 'Microphone access was blocked. Allow microphone access in your browser settings.'
        : `Microphone issue: ${event.error}. You can type instead.`);
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
  }, [sendMessage]);

  const toggleListening = () => {
    if (isListening) {
      try { recognitionRef.current?.stop(); } catch { /* already stopped */ }
      setIsListening(false);
    } else {
      startListening();
    }
  };

  const handleModelChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.glb')) {
      setNotice('Please choose a .glb file. For custom GLBs, use a model with ARKit blendshapes or Oculus visemes.');
      event.target.value = '';
      return;
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setModelUrl(url);
    setNotice(`Loading ${file.name}…`);
    event.target.value = '';
  };

  const visibleMessages = messages.filter((message) => message.role === 'user' || message.role === 'assistant');

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Companion home">
          <span className="brand-mark"><Sparkles size={18} /></span>
          <span className="brand-name">companion<span className="brand-dot">.</span></span>
        </a>
        <div className="topbar-right">
          <span className={`connection-pill ${health.openai_configured ? 'connected' : 'not-connected'}`}>
            <span className="connection-dot" />
            {health.openai_configured ? 'AI connected' : 'AI setup needed'}
          </span>
          <button className="icon-button settings-top-button" onClick={() => setShowSettings((value) => !value)} aria-label="Open settings">
            <Settings2 size={18} />
          </button>
        </div>
      </header>

      <main id="top" className="workspace">
        <section className="avatar-column">
          <div className="avatar-card">
            <div className="avatar-card-top">
              <div>
                <div className="eyebrow"><span className="eyebrow-line" /> YOUR PERSONAL COMPANION</div>
                <h1>A face for your<br /><span>conversations.</span></h1>
              </div>
              <button className={`sound-toggle ${isMuted ? 'muted' : ''}`} onClick={() => setIsMuted((value) => !value)} aria-label={isMuted ? 'Turn sound on' : 'Mute sound'}>
                {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
            </div>

            <div className="avatar-visual">
              <AvatarStage modelUrl={modelUrl} playbackRef={playbackRef} onStatus={setAvatarStatusSafe} />
              <div className="visual-vignette" />
              <div className="avatar-tag"><span className={`speaking-dot ${isSpeaking ? 'active' : ''}`} />{isSpeaking ? 'Speaking' : isListening ? 'Listening' : 'Ready when you are'}</div>
              <div className="avatar-controls">
                <button className="avatar-control-button" onClick={() => fileInputRef.current?.click()} title="Load your own rigged 3D human model">
                  <span className="upload-icon"><Settings2 size={15} /></span>
                  <span>Change avatar</span>
                </button>
                <input ref={fileInputRef} className="visually-hidden" type="file" accept=".glb,model/gltf-binary" onChange={handleModelChange} />
                <span className="drag-note">GLB · ARKit blendshapes recommended</span>
              </div>
            </div>

            <div className="avatar-card-bottom">
              <div className="avatar-status"><span className="status-check"><Check size={12} /></span><span>{avatarStatus}</span></div>
              <div className="voice-status"><Waves size={15} /> {health.elevenlabs_configured ? 'ElevenLabs voice' : 'Browser voice fallback'}</div>
            </div>
          </div>
          <div className="mini-note"><ShieldCheck size={15} /><span>Your OpenAI key stays in the backend `.env` file, never in the browser.</span></div>
        </section>

        <section className="conversation-column">
          <div className="conversation-header">
            <div>
              <div className="eyebrow"><span className="eyebrow-line" /> THE SPACE BETWEEN US</div>
              <h2>Let’s talk<span className="heading-period">.</span></h2>
              <p className="header-subtitle">A private-feeling space to think out loud, ask questions, or hear your words spoken back.</p>
            </div>
            <div className="online-indicator"><span className="online-dot" /> Ready</div>
          </div>

          <div className="mode-tabs" role="tablist" aria-label="Avatar mode">
            <button className={`mode-tab ${mode === 'talk' ? 'active' : ''}`} onClick={() => setMode('talk')} role="tab" aria-selected={mode === 'talk'}>
              <MessageCircle size={16} /> Conversation
            </button>
            <button className={`mode-tab ${mode === 'read' ? 'active' : ''}`} onClick={() => setMode('read')} role="tab" aria-selected={mode === 'read'}>
              <AudioLines size={16} /> Speak my text
            </button>
          </div>

          {mode === 'talk' ? (
            <>
              <div className="chat-feed" aria-live="polite">
                <div className="chat-day-label"><span /> TODAY <span /></div>
                {visibleMessages.map((message, index) => (
                  <div className={`message-row ${message.role === 'user' ? 'user-row' : 'assistant-row'}`} key={`${message.role}-${index}-${message.time?.getTime?.() || index}`}>
                    {message.role === 'assistant' && <div className="message-avatar"><Sparkles size={14} /></div>}
                    <div className={`message-bubble ${message.role === 'user' ? 'user-bubble' : 'assistant-bubble'} ${message.isError ? 'error-bubble' : ''}`}>
                      <p>{message.content}</p>
                      <div className="message-time">{message.time ? timeLabel(message.time) : ''}</div>
                    </div>
                    {message.role === 'user' && <div className="user-avatar-mark">Y</div>}
                  </div>
                ))}
                {isThinking && (
                  <div className="message-row assistant-row">
                    <div className="message-avatar"><Sparkles size={14} /></div>
                    <div className="message-bubble assistant-bubble thinking-bubble"><span /><span /><span /></div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {notice && <div className="notice-line"><CircleHelp size={14} /><span>{notice}</span></div>}

              <div className={`composer ${isListening ? 'listening' : ''}`}>
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void sendMessage(draft);
                    }
                  }}
                  placeholder="Write something to your companion…"
                  rows={2}
                  aria-label="Message to your companion"
                />
                <div className="composer-bottom">
                  <div className="composer-hint"><span className="keyboard-hint">↵</span> to send <span className="hint-divider">·</span> Shift + ↵ for new line</div>
                  <div className="composer-actions">
                    <button className={`mic-button ${isListening ? 'recording' : ''}`} onClick={toggleListening} title={isListening ? 'Stop listening' : 'Speak to your companion'} aria-label={isListening ? 'Stop microphone' : 'Start microphone'}>
                      {isListening ? <MicOff size={17} /> : <Mic size={17} />}
                    </button>
                    <button className="send-button" onClick={() => void sendMessage(draft)} disabled={!draft.trim() || isThinking} aria-label="Send message">
                      {isThinking ? <LoaderCircle size={16} className="spin" /> : <Send size={15} />}
                      <span>Send</span>
                    </button>
                  </div>
                </div>
              </div>
              <div className="composer-disclaimer">Voice input uses your browser’s speech recognition. You can switch to typing at any time.</div>
            </>
          ) : (
            <div className="read-panel">
              <div className="read-panel-intro">
                <div className="read-icon"><AudioLines size={22} /></div>
                <div><h3>Give your words a voice.</h3><p>The avatar will read the text below as written.</p></div>
              </div>
              <label className="field-label" htmlFor="read-text">TEXT FOR YOUR AVATAR</label>
              <textarea id="read-text" className="read-textarea" value={readText} onChange={(event) => setReadText(event.target.value)} maxLength={1600} placeholder="Type any text for your avatar to say…" />
              <div className="read-panel-meta"><span>{readText.length}/1600 characters</span><span>English voice</span></div>
              <button className="read-aloud-button" onClick={() => void speakText(readText)} disabled={!readText.trim() || isSpeaking}>
                {isSpeaking ? <LoaderCircle className="spin" size={17} /> : <Volume2 size={17} />}
                {isSpeaking ? 'Speaking…' : 'Speak this text'}
              </button>
              <button className="stop-speech-button" onClick={stopCurrentSpeech} disabled={!isSpeaking}><VolumeX size={15} /> Stop speech</button>
              {notice && <div className="notice-line read-notice"><CircleHelp size={14} /><span>{notice}</span></div>}
              <div className="sync-explainer"><Waves size={16} /><p><strong>Better sync is optional.</strong> Add ElevenLabs credentials to generate speech with character timestamps. Mouth shapes are estimated from character timing, so this is not phoneme-perfect lip-sync. Without credentials, the browser voice is used with approximate mouth movement.</p></div>
            </div>
          )}

          {showSettings && (
            <div className="settings-panel">
              <div className="settings-panel-title"><Settings2 size={16} /><h3>Setup status</h3><button onClick={() => setShowSettings(false)} aria-label="Close settings"><ChevronDown size={16} /></button></div>
              <div className="setting-row"><span>OpenAI conversations</span><strong className={health.openai_configured ? 'setting-good' : 'setting-warn'}>{health.openai_configured ? 'Connected' : 'Needs API key'}</strong></div>
              <div className="setting-row"><span>ElevenLabs neural speech</span><strong className={health.elevenlabs_configured ? 'setting-good' : 'setting-neutral'}>{health.elevenlabs_configured ? 'Connected' : 'Optional'}</strong></div>
              <div className="settings-help">Edit <code>backend/.env</code>, then restart the backend. Never paste your API key into this page.</div>
            </div>
          )}
        </section>
      </main>

      <footer className="page-footer">
        <div className="footer-brand"><span className="footer-orb"><Sparkles size={12} /></span>Built for conversation, shaped by you.</div>
        <div className="footer-right"><Headphones size={14} /> Best experienced with headphones <span className="footer-separator">·</span> v0.1 prototype</div>
      </footer>
    </div>
  );
}
