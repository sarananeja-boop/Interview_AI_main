"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { respondToInterviewer, endInterview, getInterview, ensureAuth, sendTelemetry } from "@/lib/api";
import { initFaceLandmarker, initPoseLandmarker, initHandLandmarker, resetVisionSession, extractVisionMetrics, VisionMetricsSnapshot, initObjectDetector, detectPhone } from "./vision";

interface Message {
  role: "interviewer" | "candidate";
  content: string;
  stage?: string;
  turnNumber?: number;
  timestamp?: string;
}

function LiveContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const interviewId = searchParams.get("id");

  // Chat & Interview state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const [pressureLevel, setPressureLevel] = useState(0.3);
  const [currentStage, setCurrentStage] = useState("warmup");
  const [isComplete, setIsComplete] = useState(false);
  const [contradictions, setContradictions] = useState(0);
  const [weakAnswers, setWeakAnswers] = useState(0);
  const [turnCount, setTurnCount] = useState(0);
  const [countdown, setCountdown] = useState(1200); // 20 min in seconds

  // Error & resilience state
  const [sttError, setSttError] = useState<string | null>(null);
  const [respondError, setRespondError] = useState(false);
  const sttReconnectAttempts = useRef(0);
  const MAX_STT_RECONNECTS = 3;
  const [isSpeaking, setIsSpeaking] = useState(false); // AI is speaking
  const isCompleteRef = useRef(false); // Track completion for cleanup

  const DEEPGRAM_VOICES = [
    { id: "aura-asteria-en", name: "Asteria (Female)" },
    { id: "aura-luna-en", name: "Luna (Female)" },
    { id: "aura-hera-en", name: "Hera (Female)" },
    { id: "aura-orion-en", name: "Orion (Male)" },
    { id: "aura-arcas-en", name: "Arcas (Male)" }
  ];

  // Audio state
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState(""); // Current STT transcript
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [selectedVoice, setSelectedVoice] = useState(DEEPGRAM_VOICES[0].id);
  const selectedVoiceRef = useRef(DEEPGRAM_VOICES[0].id); // Ref to avoid re-triggering effects
  const voiceEnabledRef = useRef(true); // Same for voiceEnabled
  const [sttConnected, setSttConnected] = useState(false);

  // Refs
  const intentionalCloseRef = useRef(false);
  const speakAbortControllerRef = useRef<AbortController | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<AudioWorkletNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const stutterRef = useRef(0);
  const transcriptRef = useRef("");
  const telemetryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastAnswerRef = useRef(""); // For retry on timeout
  const hasInitRef = useRef(false); // Prevent double-init (StrictMode)
  const speakRef = useRef<(text: string) => void>(() => {}); // Stable ref for speak

  // Vision Refs
  const faceIndicatorRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const visionBufferRef = useRef<VisionMetricsSnapshot[]>([]);
  const animationFrameRef = useRef<number | null>(null);
  const visionEnabledRef = useRef(false);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const [webcamActive, setWebcamActive] = useState(false);

  // Init FaceLandmarker + start webcam independently
  useEffect(() => {
    let cancelled = false;

    async function startVision() {
      // Init MediaPipe face and object detection tasks
      resetVisionSession();
      const lm = await initFaceLandmarker();
      const pl = await initPoseLandmarker();
      const od = await initObjectDetector();
      const hl = await initHandLandmarker();
      if ((lm || od || pl || hl) && !cancelled) visionEnabledRef.current = true;

      // Start webcam (separate from mic)
      // Use 640x480 for reliable face detection — 320x240 causes FaceLandmarker
      // to frequently miss faces, resulting in 0% for all face-based metrics.
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }
        });
        if (cancelled) { camStream.getTracks().forEach(t => t.stop()); return; }
        videoStreamRef.current = camStream;
        if (videoRef.current) {
          videoRef.current.srcObject = camStream;
          videoRef.current.onloadeddata = () => {
            if (!cancelled) setWebcamActive(true);
          };
          videoRef.current.play().catch(e => console.warn("Video play failed:", e));
        }
      } catch (err) {
        console.warn("Webcam not available:", err);
      }
    }

    startVision();

    return () => {
      cancelled = true;
      if (videoStreamRef.current) {
        videoStreamRef.current.getTracks().forEach(t => t.stop());
        videoStreamRef.current = null;
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // ====== COUNTDOWN TIMER ======
  const handleEndRef = useRef<() => void>(() => {});
  useEffect(() => {
    handleEndRef.current = handleEnd;
  });

  useEffect(() => {
    if (isComplete) return;
    const timer = setInterval(() => {
      setCountdown((t) => {
        if (t <= 1) {
          handleEndRef.current();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [isComplete]);

  // ====== BEFOREUNLOAD WARNING ======
  useEffect(() => {
    if (isComplete) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isComplete]);

  // ====== AUTO-DISMISS STT ERROR ======
  useEffect(() => {
    if (!sttError) return;
    const t = setTimeout(() => setSttError(null), 8000);
    return () => clearTimeout(t);
  }, [sttError]);

  // ====== LOADING TEXT ROTATION ======
  useEffect(() => {
    if (sending) {
      const steps = [
        "Analyzing your answer...",
        "Cross-checking resume...",
        "Evaluating against profile...",
        "Formulating response...",
        "Interviewer is thinking...",
      ];
      let i = 0;
      setLoadingText(steps[0]);
      const int = setInterval(() => {
        i = (i + 1) % steps.length;
        setLoadingText(steps[i]);
      }, 3000);
      return () => clearInterval(int);
    }
  }, [sending]);

  // ====== DEEPGRAM TTS (AURA) ======

  // Helper: stop all audio playback immediately
  const stopAllAudio = useCallback(() => {
    if (speakAbortControllerRef.current) {
      speakAbortControllerRef.current.abort();
      speakAbortControllerRef.current = null;
    }
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current.onended = null;
      currentAudioRef.current.onerror = null;
      currentAudioRef.current = null;
    }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(
    async (text: string) => {
      // Use refs to always get the latest values without re-triggering effects
      if (!voiceEnabledRef.current) return;
      if (isCompleteRef.current) return; // Don't speak if interview ended

      // Stop current playback if any
      stopAllAudio();

      const cleanText = text.replace(/\[.*?\]:\s*/g, "");
      if (!cleanText.trim()) return;

      speakAbortControllerRef.current = new AbortController();

      setIsSpeaking(true);
      const voice = selectedVoiceRef.current; // Read latest voice from ref
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/tts/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: cleanText, voice }),
          credentials: "include",
          signal: speakAbortControllerRef.current.signal,
        });

        if (!res.ok) throw new Error("Deepgram TTS failed (likely invalid API key)");

        const rawBlob = await res.blob();
        // Explicitly set MIME type — the response may lose content-type through CORS
        const blob = new Blob([rawBlob], { type: "audio/mpeg" });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        currentAudioRef.current = audio;

        audio.onended = () => {
          setIsSpeaking(false);
          currentAudioRef.current = null;
          URL.revokeObjectURL(url);
        };

        audio.onerror = () => {
          setIsSpeaking(false);
          currentAudioRef.current = null;
          URL.revokeObjectURL(url);
        };

        await audio.play();
      } catch (err: any) {
        if (err.name === "AbortError") {
          setIsSpeaking(false);
          return;
        }
        console.warn("TTS Error:", err, "— Falling back to browser built-in voice");
        if ("speechSynthesis" in window) {
          const utterance = new SpeechSynthesisUtterance(cleanText);
          
          // Try to find a matching voice if fallback triggers
          const voices = window.speechSynthesis.getVoices();
          const isMale = voice.includes("orion") || voice.includes("arcas");
          const preferredVoice = voices.find(v => 
            v.lang.startsWith('en') && 
            (isMale ? v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('guy') || v.name.toLowerCase().includes('daniel') || v.name.toLowerCase().includes('aaron')
                    : v.name.toLowerCase().includes('female') || v.name.toLowerCase().includes('girl') || v.name.toLowerCase().includes('samantha') || v.name.toLowerCase().includes('karen'))
          );
          if (preferredVoice) utterance.voice = preferredVoice;

          utterance.onend = () => setIsSpeaking(false);
          utterance.onerror = () => setIsSpeaking(false);
          window.speechSynthesis.speak(utterance);
        } else {
          setIsSpeaking(false);
        }
      }
    },
    [stopAllAudio] // No voiceEnabled/selectedVoice deps — uses refs instead
  );

  // Keep speak ref in sync so init effect can use stable reference
  useEffect(() => {
    speakRef.current = speak;
  }, [speak]);

  // Keep voice refs in sync with state
  useEffect(() => {
    selectedVoiceRef.current = selectedVoice;
  }, [selectedVoice]);

  useEffect(() => {
    voiceEnabledRef.current = voiceEnabled;
  }, [voiceEnabled]);

  const phoneDetectedRef = useRef<boolean>(false);
  const lastPhoneCheckRef = useRef<number>(0);
  const lastVideoTimeRef = useRef<number>(0);

  // ====== DEEPGRAM STT + VISION ======
  const processVideoFrames = useCallback(() => {
    if (videoRef.current && visionEnabledRef.current) {
      const now = performance.now();
      
      // Process frames at most every 100ms (10 FPS)
      if (now - lastVideoTimeRef.current >= 100) {
        lastVideoTimeRef.current = now;
        try {
          const metrics = extractVisionMetrics(videoRef.current, now);
          if (metrics) {
            visionBufferRef.current.push(metrics);
            if (faceIndicatorRef.current) {
               if (metrics.face_visible) {
                 faceIndicatorRef.current.textContent = "Face Detected";
                 faceIndicatorRef.current.className = "absolute top-2 left-2 px-2 py-1 rounded text-[10px] font-bold text-white bg-[var(--accent-success)]/80 backdrop-blur-md z-10";
               } else {
                 faceIndicatorRef.current.textContent = "No Face Detected (Keep laptop in front)";
                 faceIndicatorRef.current.className = "absolute top-2 left-2 px-2 py-1 rounded text-[10px] font-bold text-white bg-[var(--accent-danger)]/80 backdrop-blur-md z-10 animate-pulse";
               }
            }
          }
        } catch (err) {
          console.warn("Failed to extract vision metrics:", err);
        }
      }

      // Check for phone violation every 500ms
      if (now - lastPhoneCheckRef.current > 500) {
        lastPhoneCheckRef.current = now;
        try {
          const phoneDetected = detectPhone(videoRef.current, now);
          if (phoneDetected) {
            phoneDetectedRef.current = true;
          }
        } catch (err) {
          console.warn("Phone detection failed:", err);
        }
      }
    }
    animationFrameRef.current = requestAnimationFrame(processVideoFrames);
  }, []);

  const aggregateVisionBuffer = useCallback(() => {
    let visionAgg = undefined;
    if (visionBufferRef.current.length > 0) {
      const buf = [...visionBufferRef.current];
      visionBufferRef.current = [];
      const len = buf.length;
      const faceVisibleBuf = buf.filter(b => b.face_visible);
      const hasFaceData = faceVisibleBuf.length > 0;

      // When face detection fails (faceVisibleBuf is empty), use neutral defaults
      // instead of dividing empty arrays by 1 which produces misleading 0.0 values.
      // PoseLandmarker-based metrics (shoulder_alignment, posture_score from pose)
      // still work independently and should be reported accurately.
      const faceLen = hasFaceData ? faceVisibleBuf.length : 1;

      visionAgg = {
        eye_contact_score: hasFaceData
          ? faceVisibleBuf.reduce((a, b) => a + b.eye_contact_score, 0) / faceLen
          : -1, // Signal to backend that face tracking was unavailable
        head_yaw: hasFaceData
          ? faceVisibleBuf.reduce((a, b) => a + b.head_yaw, 0) / faceLen
          : 0,
        head_pitch: hasFaceData
          ? faceVisibleBuf.reduce((a, b) => a + b.head_pitch, 0) / faceLen
          : 0,
        posture_score: hasFaceData
          ? faceVisibleBuf.reduce((a, b) => a + b.posture_score, 0) / faceLen
          : buf.reduce((sum, v) => sum + v.posture_score, 0) / len, // fallback to pose-based posture
        face_visible: hasFaceData && faceVisibleBuf.length > len / 2,
        movement_stability: hasFaceData
          ? faceVisibleBuf.reduce((a, b) => a + b.movement_stability, 0) / faceLen
          : -1, // Signal unavailable
        looking_down_while_speaking: buf.some(v => v.looking_down),
        face_in_frame_pct: faceVisibleBuf.length / len,
        shoulder_alignment: buf.reduce((sum, v) => sum + v.shoulder_alignment, 0) / len,
        phone_violation: phoneDetectedRef.current,
        inappropriate_gesture: buf.some(v => v.inappropriate_gesture),
        multiple_people_detected: buf.some(v => v.multiple_people_detected)
      };
      phoneDetectedRef.current = false;
    }
    return visionAgg;
  }, []);

  // Start vision frame processing loop on mount
  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(processVideoFrames);
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [processVideoFrames]);

  const startSTT = useCallback(async () => {
    if (wsRef.current) return; // Already connected
    
    intentionalCloseRef.current = false; // Reset intentional close flag

    try {
      // Audio-only stream for STT (webcam is handled separately)
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      // Create AudioContext IMMEDIATELY inside the user gesture stack to prevent browser suspension
      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const wsUrl = baseUrl.replace(/^http/, "ws") + `/api/stt/stream?interview_id=${interviewId}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = async () => {
        setSttConnected(true);
        setIsListening(true);

        // Resume AudioContext if suspended (standard browser behavior check)
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }

        // AudioWorklet runs on a SEPARATE THREAD — immune to main thread MediaPipe blocking
        try {
          await audioContext.audioWorklet.addModule('/audio-processor.js');
          const source = audioContext.createMediaStreamSource(stream);
          const workletNode = new AudioWorkletNode(audioContext, 'pcm-processor');
          processorRef.current = workletNode;

          workletNode.port.onmessage = (event) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(event.data);
            }
          };

          source.connect(workletNode);
          workletNode.connect(audioContext.destination);
        } catch (workletErr) {
          // Fallback to ScriptProcessorNode if AudioWorklet not supported
          console.warn('AudioWorklet unavailable, falling back to ScriptProcessor:', workletErr);
          const source = audioContext.createMediaStreamSource(stream);
          const processor = audioContext.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor as any;

          processor.onaudioprocess = (e) => {
            if (ws.readyState === WebSocket.OPEN) {
              const inputData = e.inputBuffer.getChannelData(0);
              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                const s = Math.max(-1, Math.min(1, inputData[i]));
                int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
              }
              ws.send(int16.buffer);
            }
          };

          source.connect(processor);
          processor.connect(audioContext.destination);
        }
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "transcript") {
          sttReconnectAttempts.current = 0; // Reset on successful data
          if (data.is_final) {
            setInput((prev) => {
              const newText = prev + (prev && !prev.endsWith(" ") ? " " : "") + data.transcript;
              transcriptRef.current = newText;
              return newText;
            });
            setTranscript("");
          } else {
            setTranscript(data.transcript);
            // Stutter detection on interim results
            const words = data.transcript.split(/\s+/).filter((w: string) => w.length > 0);
            const fillers = words.filter((w: string) =>
              ["um", "uh", "ah", "like", "basically", "you know"].includes(w.toLowerCase())
            ).length;
            let repeated = 0;
            for (let k = 1; k < words.length; k++) {
              if (words[k] && words[k].toLowerCase() === words[k - 1].toLowerCase()) repeated++;
            }
            stutterRef.current = fillers + repeated;
          }
        } else if (data.type === "error") {
          // Backend sent a structured error (STT connection issue)
          setSttError(data.message || "Voice connection lost. Please type your answer.");
          stopSTT();
        }
      };

      ws.onclose = () => {
        setSttConnected(false);
        setIsListening(false);

        // Auto-reconnect with exponential backoff
        if (!intentionalCloseRef.current && sttReconnectAttempts.current < MAX_STT_RECONNECTS && !isCompleteRef.current) {
          const delay = Math.pow(2, sttReconnectAttempts.current) * 1000;
          sttReconnectAttempts.current += 1;
          console.log(`STT disconnected. Reconnecting in ${delay / 1000}s (attempt ${sttReconnectAttempts.current}/${MAX_STT_RECONNECTS})`);
          setTimeout(() => startSTT(), delay);
        } else if (!intentionalCloseRef.current && sttReconnectAttempts.current >= MAX_STT_RECONNECTS) {
          setSttError("Lost connection to transcription service. Please type your answer.");
        }
      };

      ws.onerror = () => {
        setSttConnected(false);
        setIsListening(false);
      };
    } catch (err) {
      console.error("STT error:", err);
      setSttError("Could not access microphone. Please type your answers.");
    }
  }, [interviewId]);

  const stopSTT = useCallback(() => {
    intentionalCloseRef.current = true;
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    // NOTE: Do NOT stop webcam or vision here — they run independently
    setIsListening(false);
    setSttConnected(false);
    setTranscript("");
    stutterRef.current = 0;
    transcriptRef.current = "";
  }, []);

  const toggleMic = () => {
    if (isListening) {
      stopSTT();
    } else {
      startSTT();
    }
  };

  // ====== TELEMETRY LOOP ======
  useEffect(() => {
    if ((!isListening && !webcamActive) || !interviewId) return;

    telemetryTimerRef.current = setInterval(async () => {
      const text = transcriptRef.current;
      const stutters = stutterRef.current;

      if (text.trim().length > 20 || stutters > 2 || visionBufferRef.current.length > 0) {
        try {
          // Calculate aggregate vision metrics
          const visionAgg = aggregateVisionBuffer();

          const res = await sendTelemetry(interviewId, text, stutters, false, visionAgg);
          if (res.should_interject && res.interjection_message) {
            stopSTT();
            setMessages((prev) => [
              ...prev,
              {
                role: "interviewer",
                content: `[INTERRUPTED]: ${res.interjection_message}`,
                stage: currentStage,
                timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
              },
            ]);
            speak(res.interjection_message);
          }
        } catch (err) {
          console.error("Telemetry error", err);
        }
      }
    }, 4000);

    return () => {
      if (telemetryTimerRef.current) clearInterval(telemetryTimerRef.current);
    };
  }, [isListening, webcamActive, interviewId, currentStage, stopSTT, speak]);

  // ====== LOAD INITIAL STATE + AUTO-SPEAK ======
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let isMounted = true;

    async function init() {
      await ensureAuth();
      if (!interviewId) return;

      try {
        const data = await getInterview(interviewId);
        if (!isMounted) return;

        if (data.conversation_log?.length > 0) {
          const mapped = data.conversation_log.map((t: Record<string, unknown>) => ({
            role: t.role as string,
            content: t.content as string,
            stage: t.stage as string,
            turnNumber: t.turn_number as number,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          }));
          setMessages(mapped);
          setPressureLevel(data.pressure_level ?? 0.3);
          setCurrentStage(data.current_stage ?? "warmup");
          setTurnCount(data.turn_count ?? 0);
          setContradictions(data.contradiction_count ?? 0);
          setWeakAnswers(data.weak_answer_count ?? 0);

          // Auto-speak the last interviewer message (use speakRef for stable reference)
          const lastInterviewer = [...mapped].reverse().find((m: Message) => m.role === "interviewer");
          if (lastInterviewer) {
            timeoutId = setTimeout(() => speakRef.current(lastInterviewer.content), 500);
          }
        }
      } catch (err) {
        console.error(err);
      }
    }
    init();

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [interviewId]); // Removed `speak` dep — uses speakRef instead to prevent re-init

  // ====== CLEANUP ON UNMOUNT (prevents audio leaking on navigation) ======
  useEffect(() => {
    return () => {
      // Do NOT set isCompleteRef.current = true here, because React StrictMode 
      // unmounts and remounts immediately, which would permanently break audio!
      stopAllAudio();
      stopSTT();
      if (telemetryTimerRef.current) clearInterval(telemetryTimerRef.current);
    };
  }, [stopAllAudio, stopSTT]);

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ====== SEND ANSWER ======
  const handleSend = async () => {
    if (!input.trim() || sending || isComplete || !interviewId) return;

    const answer = input.trim();
    setInput("");
    setTranscript("");
    transcriptRef.current = "";
    stutterRef.current = 0;
    setSending(true);

    // Stop mic while AI processes
    stopSTT();

    setMessages((prev) => [
      ...prev,
      {
        role: "candidate",
        content: answer,
        stage: currentStage,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);

    try {
      // Flush any remaining vision metrics before sending answer
      const visionAgg = aggregateVisionBuffer();
      if (visionAgg) {
        // Fire and forget to record metrics
        sendTelemetry(interviewId, answer, 0, false, visionAgg).catch(console.error);
      }

      setRespondError(false);
      const response = await respondToInterviewer(interviewId, answer);

      setMessages((prev) => [
        ...prev,
        {
          role: "interviewer",
          content: response.interviewer_message,
          stage: response.current_stage,
          turnNumber: response.turn_number,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);

      speak(response.interviewer_message);
      lastAnswerRef.current = "";

      setPressureLevel(response.pressure_level ?? pressureLevel);
      setCurrentStage(response.current_stage ?? currentStage);
      setTurnCount(response.turn_number ?? turnCount);
      setContradictions(response.metadata?.contradiction_count ?? contradictions);
      setWeakAnswers(response.metadata?.weak_answer_count ?? weakAnswers);

      if (response.is_complete) {
        isCompleteRef.current = true;
        setIsComplete(true);
        handleEnd(); // Ensure backend flushes telemetry and finalizes session
      }
    } catch (err) {
      console.warn("respond error:", err instanceof Error ? err.message : err);
      const isTimeout = err instanceof Error && (err.message.includes("timed out") || err.message.includes("504"));
      lastAnswerRef.current = answer;
      setRespondError(true);
      setMessages((prev) => [
        ...prev,
        {
          role: "interviewer",
          content: isTimeout
            ? "⏱ The interviewer is taking too long. Click 'Retry' below to resend your answer."
            : "⚠ Connection error. Click 'Retry' below to try again.",
          stage: currentStage,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleEnd = async () => {
    if (!interviewId) return;
    isCompleteRef.current = true; // Prevent any new audio from starting
    stopSTT();
    stopAllAudio(); // Fully stop all audio playback
    
    // Flush remaining vision buffer to ensure metrics are saved
    try {
      const visionAgg = aggregateVisionBuffer();
      if (visionAgg) {
        await sendTelemetry(interviewId, transcriptRef.current, stutterRef.current, false, visionAgg);
      }
    } catch (err) {
      console.warn("Failed to flush telemetry on end:", err);
    }

    try {
      await endInterview(interviewId);
      setIsComplete(true);
    } catch {
      /* ignore */
    }
  };



  const handleSendRef = useRef<() => void>(() => {});
  useEffect(() => {
    handleSendRef.current = handleSend;
  });

  const handleRetry = async () => {
    if (!lastAnswerRef.current || !interviewId) return;
    setInput(lastAnswerRef.current);
    setRespondError(false);
    // Remove the error message from messages
    setMessages((prev) => prev.filter((m) => !m.content.startsWith("⏱") && !m.content.startsWith("⚠")));
    // Re-trigger send on next tick
    setTimeout(() => handleSendRef.current(), 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatCountdown = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const stageLabels: Record<string, string> = {
    warmup: "Warmup",
    core_questioning: "Core Questioning",
    pressure_round: "Pressure Round",
    revisit: "Revisit",
    closing: "Closing",
    completed: "Completed",
  };

  const pressureColor =
    pressureLevel < 0.4 ? "var(--accent-success)" : pressureLevel < 0.7 ? "var(--accent-warning)" : "var(--accent-danger)";

  const countdownColor = countdown < 120 ? "var(--accent-danger)" : countdown < 300 ? "var(--accent-warning)" : "var(--text-secondary)";

  const personaMap: Record<string, { name: string; emoji: string }> = {
    warmup: { name: "Prof. Sharma", emoji: "🧐" },
    core_questioning: { name: "Prof. Sharma", emoji: "🧐" },
    pressure_round: { name: "Prof. Sharma", emoji: "🧐" },
    revisit: { name: "Prof. Sharma", emoji: "🧐" },
    closing: { name: "Prof. Sharma", emoji: "🧐" },
  };

  return (
    <div className="live-page">
      {/* Background Shader */}
      <div className="bg-shader" />
      <div className="texture-overlay" />

      {/* ====== ERROR BANNER ====== */}
      {sttError && (
        <div className="stt-error-banner">
          <span className="material-symbols-outlined">error</span>
          <span>{sttError}</span>
          <button className="error-close-btn" onClick={() => setSttError(null)}><span className="material-symbols-outlined">close</span></button>
        </div>
      )}

      {/* Top Layer OS Header */}
      <header className="live-header">
        {/* Status Indicator */}
        <div className="status-pill glass-panel layer-shadow">
          <div className="ping-dot-wrapper">
            {visionEnabledRef.current && <span className="ping-ring" />}
            <span className="ping-dot" style={{ background: visionEnabledRef.current ? 'var(--primary)' : 'var(--outline)' }} />
          </div>
          <span className="label-caps">
            {visionEnabledRef.current ? "Vision Active" : "Vision Inactive"}
          </span>
        </div>

        {/* Milestones */}
        <div className="milestones glass-panel layer-shadow">
          {["warmup", "core_questioning", "pressure_round", "revisit", "closing"].map((stage, idx, arr) => {
             const stages = ["warmup", "core_questioning", "pressure_round", "revisit", "closing", "completed"];
             const currentIndex = stages.indexOf(currentStage);
             const myIndex = stages.indexOf(stage);
             const isPast = myIndex < currentIndex || isComplete;
             const isCurrent = myIndex === currentIndex && !isComplete;
             const isFuture = myIndex > currentIndex && !isComplete;

             return (
               <div key={stage} className="milestone-item">
                 {isPast && (
                   <span className="milestone-label milestone-past">
                     <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check_circle</span>
                     {stageLabels[stage]}
                   </span>
                 )}
                 {isCurrent && (
                   <span className="milestone-label milestone-current">
                     <span className="current-dot-ring">
                       <span className="current-dot-inner" />
                     </span>
                     {stageLabels[stage]}
                   </span>
                 )}
                 {isFuture && (
                   <span className="milestone-label milestone-future">
                     <span className="future-dot" />
                     {stageLabels[stage]}
                   </span>
                 )}
                 {idx < arr.length - 1 && <span className="material-symbols-outlined milestone-chevron">chevron_right</span>}
               </div>
             );
          })}
        </div>

        <div style={{ width: 150 }} /> {/* Spacer */}
      </header>

      {/* Main Workspace Area */}
      <main className="main-workspace">
        
        {/* Left Column: Telemetry (Glassmorphism) */}
        <div className="telemetry-col">
          {/* Facecam (Google Meet style) */}
          <div 
            className="webcam-box layer-shadow"
            style={{ display: webcamActive ? 'block' : 'none', height: '200px' }}
          >
            <video 
              ref={videoRef} 
              className="webcam-video"
              playsInline 
              muted 
              style={{ transform: 'scaleX(-1)' }} 
            />
            <div className="webcam-label">
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>mic</span>
              You
            </div>
            {webcamActive && (
              <div ref={faceIndicatorRef} className="face-indicator">
                Initializing Vision...
              </div>
            )}
          </div>

          <div className="analysis-card glass-panel layer-shadow">
            <div className="analysis-gradient-bar" />
            <div className="analysis-header">
              <h3 className="analysis-title">
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--primary)' }}>data_usage</span>
                Live Analysis
              </h3>
              <span className="live-dot-wrapper">
                <span className="ping-ring-sm" />
                <span className="live-dot-sm" />
              </span>
            </div>

            {/* Metric 1 */}
            <div className="metric-group">
              <div className="metric-row">
                <span className="metric-label">Pressure Level</span>
                <span className="metric-value" style={{ color: 'var(--primary)' }}>{Math.round(pressureLevel * 100)}%</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${pressureLevel * 100}%` }}>
                  <div className="progress-shimmer" />
                </div>
              </div>
            </div>

            {/* Metric 2 */}
            <div className="metric-group">
              <div className="metric-row">
                <span className="metric-label">Turn Count</span>
                <span className="metric-value-mono">{turnCount}</span>
              </div>
            </div>

            {/* Metric 3 */}
            {contradictions > 0 && (
              <div className="metric-group">
                <div className="metric-row">
                  <span className="metric-label" style={{ color: 'var(--error)' }}>Contradictions</span>
                  <span className="metric-value" style={{ color: 'var(--error)' }}>{contradictions}</span>
                </div>
              </div>
            )}
            
            {weakAnswers > 0 && (
              <div className="metric-group">
                <div className="metric-row">
                  <span className="metric-label" style={{ color: '#d97706' }}>Weak Answers</span>
                  <span className="metric-value" style={{ color: '#d97706' }}>{weakAnswers}</span>
                </div>
              </div>
            )}
          </div>

          <div className="detected-card glass-panel layer-shadow">
            <h3 className="detected-title">Detected Info</h3>
            <div className="detected-tags">
              <span className="detected-tag analyzing-tag">
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>sync</span>Analyzing...
              </span>
              {sending && (
                <span className="detected-tag loading-tag">
                  {loadingText}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Center: AI Entity (The Void / Sphere) */}
        <div className="center-col">

          <div className="orb-wrapper" style={{ width: 'min(85vw, 500px)', height: 'min(85vw, 500px)' }}>
            <div className={`orb-glow ${isSpeaking ? "breathe-anim" : ""}`} />
            {isSpeaking && (
              <>
                <div className="pulse-ring" />
                <div className="pulse-ring pulse-ring-inner" style={{ animationDelay: '1s' }} />
              </>
            )}
            <div className={`orb-sphere glass-panel layer-shadow ${isSpeaking ? "breathe-anim" : ""}`} style={{ width: 'min(65vw, 360px)', height: 'min(65vw, 360px)', animationDuration: '3.5s', boxShadow: 'inset 0px 0px 40px var(--surface-container-highest), 0 0 60px rgba(21,69,57,0.15)' }}>
              <div className="orb-gradient-overlay" />
              
              <div className="voice-bars-container">
                {[...Array(5)].map((_, i) => {
                  const baseHeights = [24, 48, 64, 48, 24];
                  const activeHeights = [48, 80, 120, 80, 48];
                  const h = isSpeaking ? activeHeights[i] : baseHeights[i];
                  return (
                    <div 
                      key={i} 
                      className={`voice-bar ${isSpeaking ? 'voice-bar-active' : ''}`}
                      style={{ 
                        height: `${h}px`, 
                        animationDelay: `${i * 0.15}s`,
                        transitionDuration: '400ms'
                      }}
                    />
                  );
                })}
              </div>

            </div>
          </div>

          {/* Minimal Controls */}
          <div className="controls-bar glass-panel layer-shadow">
            <button className="ctrl-btn-wrap" style={{ background: 'transparent', border: 'none', cursor: 'pointer' }} onClick={toggleMic} disabled={sending || isComplete}>
              <div className="ctrl-btn" style={{ background: isListening ? 'color-mix(in srgb, var(--primary) 15%, transparent)' : 'var(--surface-container)', borderColor: isListening ? 'color-mix(in srgb, var(--primary) 30%, transparent)' : 'var(--outline-variant)', color: isListening ? 'var(--primary)' : 'var(--on-surface-variant)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, fontVariationSettings: "'wght' 300" }}>{isListening ? "mic" : "mic_off"}</span>
              </div>
              <span className="ctrl-label">{isListening ? "Mute" : "Unmute"}</span>
            </button>
            
            <button className="ctrl-btn-wrap" style={{ background: 'transparent', border: 'none', cursor: 'pointer' }} onClick={handleEnd} disabled={isComplete}>
              <div className="end-btn">
                <span className="material-symbols-outlined" style={{ fontSize: 30, fontVariationSettings: "'FILL' 1, 'wght' 400" }}>call_end</span>
              </div>
              <span className="ctrl-label">End</span>
            </button>
            
            <button className="ctrl-btn-wrap" style={{ background: 'transparent', border: 'none', cursor: 'pointer' }} onClick={() => {
                if (voiceEnabled) stopAllAudio();
                setVoiceEnabled(!voiceEnabled);
              }}>
              <div className="ctrl-btn" style={{ background: voiceEnabled ? 'var(--surface-container)' : 'color-mix(in srgb, var(--error) 15%, transparent)', borderColor: voiceEnabled ? 'var(--outline-variant)' : 'color-mix(in srgb, var(--error) 30%, transparent)', color: voiceEnabled ? 'var(--on-surface-variant)' : 'var(--error)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, fontVariationSettings: "'wght' 300" }}>{voiceEnabled ? "volume_up" : "volume_off"}</span>
              </div>
              <span className="ctrl-label">{voiceEnabled ? "Mute" : "Unmute"}</span>
            </button>

            <div className="countdown-display" style={{ color: countdown < 120 ? "var(--error)" : "var(--on-surface-variant)" }}>
              {formatCountdown(countdown)}
            </div>
            
            {voiceEnabled && (
              <div style={{ marginLeft: 8 }}>
                 <select
                  className="voice-select"
                  style={{ background: 'var(--surface-container)', color: 'var(--on-surface)', border: '1px solid var(--outline-variant)' }}
                  value={selectedVoice}
                  onChange={(e) => setSelectedVoice(e.target.value)}
                >
                  {DEEPGRAM_VOICES.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Live Transcript */}
        <div className="transcript-col">
          <h2 className="transcript-title">Live Session</h2>
          <div className="transcript-scroll" id="transcript-container">
            {messages.map((msg, i) => (
              msg.role === "interviewer" ? (
                <div key={i} className="ai-msg">
                  <div className="msg-header">
                    <div className="msg-avatar msg-avatar-ai">
                      <span className="material-symbols-outlined" style={{ fontSize: 16, fontVariationSettings: "'wght' 400" }}>smart_toy</span>
                    </div>
                    <span className="msg-name">Mentor</span>
                    <span className="msg-time">{msg.timestamp}</span>
                  </div>
                  <p className="ai-msg-text">
                    {msg.content}
                  </p>
                </div>
              ) : (
                <div key={i} className="user-msg">
                  <div className="msg-header msg-header-right">
                    <span className="msg-time" style={{ marginRight: 'auto' }}>{msg.timestamp}</span>
                    <span className="msg-name">You</span>
                    <div className="msg-avatar msg-avatar-user">
                      <span className="material-symbols-outlined" style={{ fontSize: 16, fontVariationSettings: "'wght' 400" }}>person</span>
                    </div>
                  </div>
                  <div className="user-bubble layer-shadow">
                    <p className="user-msg-text">
                      {msg.content}
                    </p>
                  </div>
                </div>
              )
            ))}

            {(transcript || input) && (
              <div className="user-msg" style={{ opacity: 0.7 }}>
                <div className="msg-header msg-header-right">
                  <span className="msg-name">You</span>
                  <div className="msg-avatar msg-avatar-user">
                    <span className="material-symbols-outlined" style={{ fontSize: 16, fontVariationSettings: "'wght' 400" }}>person</span>
                  </div>
                </div>
                <div className="user-bubble layer-shadow">
                  <p className="user-msg-text">
                    {input}{transcript && <span style={{ fontStyle: 'italic' }}> {transcript}</span>}
                    <span className="typing-cursor" />
                  </p>
                </div>
              </div>
            )}

            {sending && (
              <div className="ai-msg">
                <div className="msg-header">
                  <div className="msg-avatar msg-avatar-ai">
                    <span className="material-symbols-outlined" style={{ fontSize: 16, fontVariationSettings: "'wght' 400" }}>smart_toy</span>
                  </div>
                  <span className="msg-name">Mentor</span>
                </div>
                <p className="ai-msg-text" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span className="bounce-dot" />
                  <span className="bounce-dot" style={{ animationDelay: '0.2s' }} />
                  <span className="bounce-dot" style={{ animationDelay: '0.4s' }} />
                </p>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Input Area */}
          {!isComplete && (
            <div className="input-row">
              {respondError && lastAnswerRef.current ? (
                <button className="retry-btn" onClick={handleRetry}>
                  🔄 Retry Last Answer
                </button>
              ) : (
                <>
                  <textarea
                    className="chat-textarea"
                    style={{ background: 'var(--surface-container)', color: 'var(--on-surface)', border: '1px solid var(--outline-variant)' }}
                    placeholder="Type or use mic..."
                    value={input}
                    onChange={(e) => { setInput(e.target.value); transcriptRef.current = e.target.value; }}
                    onKeyDown={handleKeyDown}
                    disabled={sending}
                    rows={2}
                  />
                  <button className="send-btn" style={{ color: 'var(--on-primary)' }} onClick={handleSend} disabled={!input.trim() || sending}>
                    {sending ? "..." : <span className="material-symbols-outlined">send</span>}
                  </button>
                </>
              )}
            </div>
          )}

          {isComplete && (
            <div className="complete-box">
              <p className="complete-text">✅ Interview Complete</p>
              <button className="complete-btn" style={{ color: 'var(--on-primary)' }} onClick={() => router.push(`/interview/review?id=${interviewId}`)}>
                View Evaluation →
              </button>
            </div>
          )}

          <div className="transcript-fade" />
        </div>
      </main>

      <style jsx>{`
        /* ==================== LIVE PAGE ==================== */
        .live-page {
          background: var(--background);
          color: var(--on-surface);
          min-height: 100vh;
          position: relative;
          overflow: hidden;
          font-family: var(--font-sans);
          font-size: 16px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.02'/%3E%3C/svg%3E");
        }
        .bg-shader {
          position: absolute;
          inset: 0;
          z-index: 0;
          pointer-events: none;
          opacity: 0.4;
          mix-blend-mode: multiply;
        }
        .texture-overlay {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }

        /* ==================== ERROR BANNER ==================== */
        .stt-error-banner {
          position: absolute;
          top: 80px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 100;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 24px;
          border-radius: 999px;
          background: color-mix(in srgb, var(--error-container) 90%, transparent);
          border: 1px solid var(--error);
          color: var(--on-error-container);
          font-weight: 500;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          backdrop-filter: blur(16px);
        }
        .error-close-btn {
          background: transparent;
          border: none;
          color: var(--error);
          cursor: pointer;
          display: flex;
          align-items: center;
        }

        /* ==================== GLASS PANEL ==================== */
        .glass-panel {
          background: color-mix(in srgb, var(--on-surface) 5%, transparent);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid color-mix(in srgb, var(--on-surface) 10%, transparent);
        }
        .layer-shadow {
          box-shadow: 0 4px 20px rgba(21,69,57,0.08), 0 1px 3px rgba(21,69,57,0.05);
        }

        /* ==================== HEADER ==================== */
        .live-header {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          padding: 24px;
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          z-index: 50;
        }

        /* ==================== STATUS PILL ==================== */
        .status-pill {
          border-radius: 9999px;
          padding: 8px 16px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .ping-dot-wrapper {
          position: relative;
          display: flex;
          width: 12px;
          height: 12px;
        }
        .ping-ring {
          position: absolute;
          display: inline-flex;
          width: 100%;
          height: 100%;
          border-radius: 9999px;
          background: var(--primary);
          opacity: 0.75;
          animation: ping 1s cubic-bezier(0,0,0.2,1) infinite;
        }
        .ping-dot {
          position: relative;
          display: inline-flex;
          width: 12px;
          height: 12px;
          border-radius: 9999px;
        }
        .label-caps {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          font-weight: 600;
          color: var(--on-surface-variant);
        }

        /* ==================== MILESTONES ==================== */
        .milestones {
          border-radius: 9999px;
          padding: 12px 24px;
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .milestone-item {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .milestone-label {
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .milestone-past {
          color: var(--primary);
        }
        .milestone-current {
          color: var(--on-surface-variant);
        }
        .milestone-future {
          color: var(--outline);
          opacity: 0.5;
        }
        .current-dot-ring {
          width: 16px;
          height: 16px;
          border-radius: 9999px;
          border: 2px solid var(--primary);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .current-dot-inner {
          width: 6px;
          height: 6px;
          background: var(--primary);
          border-radius: 9999px;
          animation: pulse 2s ease-in-out infinite;
        }
        .future-dot {
          width: 16px;
          height: 16px;
          border-radius: 9999px;
          border: 1px solid var(--outline);
        }
        .milestone-chevron {
          color: var(--outline-variant);
          font-size: 16px;
        }

        /* ==================== MAIN WORKSPACE ==================== */
        .main-workspace {
          position: relative;
          z-index: 10;
          width: 100%;
          margin-left: auto;
          margin-right: auto;
          padding: 96px 32px 32px 32px;
          height: 100vh;
          max-height: 100vh;
          display: flex;
          flex-direction: row;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
        }

        /* ==================== LEFT: TELEMETRY ==================== */
        .telemetry-col {
          display: flex;
          flex-direction: column;
          gap: 24px;
          width: 280px;
          min-width: 280px;
          height: 100%;
          justify-content: center;
        }

        /* Webcam */
        .webcam-box {
          position: relative;
          border-radius: 16px;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,0.2);
        }
        .webcam-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          background: #000;
        }
        .webcam-label {
          position: absolute;
          bottom: 12px;
          left: 12px;
          background: rgba(0,0,0,0.6);
          color: #fff;
          font-size: 12px;
          padding: 4px 10px;
          border-radius: 6px;
          font-weight: 500;
          backdrop-filter: blur(12px);
          display: flex;
          align-items: center;
          gap: 6px;
          z-index: 10;
        }
        .face-indicator {
          position: absolute;
          top: 8px;
          left: 8px;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 10px;
          font-weight: 700;
          color: #fff;
          background: rgba(0,0,0,0.5);
          backdrop-filter: blur(12px);
          z-index: 10;
        }

        /* Analysis Card */
        .analysis-card {
          border-radius: 16px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          position: relative;
          overflow: hidden;
        }
        .analysis-gradient-bar {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 4px;
          background: linear-gradient(to right, var(--primary), var(--secondary));
        }
        .analysis-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid rgba(192,200,196,0.3);
          padding-bottom: 12px;
        }
        .analysis-title {
          font-size: 12px;
          text-transform: uppercase;
          font-weight: 600;
          color: var(--on-surface-variant);
          letter-spacing: 0.1em;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .live-dot-wrapper {
          display: flex;
          width: 8px;
          height: 8px;
          position: relative;
        }
        .ping-ring-sm {
          position: absolute;
          display: inline-flex;
          width: 100%;
          height: 100%;
          border-radius: 9999px;
          background: var(--secondary);
          opacity: 0.75;
          animation: ping 1s cubic-bezier(0,0,0.2,1) infinite;
        }
        .live-dot-sm {
          position: relative;
          display: inline-flex;
          width: 8px;
          height: 8px;
          border-radius: 9999px;
          background: var(--secondary);
        }

        /* Metrics */
        .metric-group {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .metric-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .metric-label {
          font-size: 14px;
          font-weight: 500;
          color: var(--on-surface);
          transition: color 0.2s;
        }
        .metric-value {
          font-size: 14px;
          font-weight: 600;
        }
        .metric-value-mono {
          font-size: 13px;
          font-weight: 500;
          color: var(--on-surface-variant);
          font-family: var(--font-mono);
        }
        .progress-track {
          width: 100%;
          height: 8px;
          background: var(--surface-variant);
          border-radius: 9999px;
          overflow: hidden;
          box-shadow: inset 0 1px 2px rgba(0,0,0,0.06);
        }
        .progress-fill {
          height: 100%;
          background: var(--primary);
          border-radius: 9999px;
          transition: width 1s ease-in-out;
          position: relative;
        }
        .progress-shimmer {
          position: absolute;
          inset: 0;
          background: rgba(255,255,255,0.2);
          animation: pulse 2s ease-in-out infinite;
        }

        /* Detected Info */
        .detected-card {
          border-radius: 16px;
          padding: 24px;
        }
        .detected-title {
          font-size: 12px;
          text-transform: uppercase;
          font-weight: 600;
          color: var(--on-surface-variant);
          letter-spacing: 0.1em;
          margin-bottom: 16px;
        }
        .detected-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .detected-tag {
          font-size: 12px;
          padding: 6px 12px;
          border-radius: 9999px;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .analyzing-tag {
          border: 1px solid var(--outline-variant);
          color: var(--on-surface-variant);
          animation: pulse 2s ease-in-out infinite;
        }
        .loading-tag {
          background: rgba(210,232,218,0.5);
          color: var(--on-secondary-container);
          border: 1px solid rgba(79,99,88,0.2);
          box-shadow: var(--shadow-sm);
        }

        /* ==================== CENTER: ORB ==================== */
        .center-col {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          position: relative;
        }
        .orb-wrapper {
          position: relative;
          border-radius: 9999px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 48px;
        }
        .orb-glow {
          position: absolute;
          inset: 0;
          background: var(--primary-fixed-dim);
          opacity: 0.3;
          filter: blur(48px);
          border-radius: 9999px;
        }
        .pulse-ring {
          position: absolute;
          inset: 0;
          border: 2px solid rgba(21,69,57,0.2);
          border-radius: 9999px;
          animation: pulse-ring-kf 2s cubic-bezier(0.215,0.61,0.355,1) infinite;
        }
        .pulse-ring-inner {
          inset: 16px;
          border-width: 1px;
          border-color: rgba(79,99,88,0.2);
        }
        .orb-sphere {
          position: relative;
          border-radius: 9999px;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .orb-gradient-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(to top right, rgba(21,69,57,0.15), transparent, rgba(79,99,88,0.15));
          opacity: 0.8;
          mix-blend-mode: overlay;
        }
        .voice-bars-container {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
        }
        .voice-bar {
          width: 12px;
          border-radius: 9999px;
          transition: all ease-in-out;
          background: color-mix(in srgb, var(--primary) 70%, transparent);
        }
        .voice-bar-active {
          animation: pulse 2s ease-in-out infinite;
        }

        /* ==================== CONTROLS BAR ==================== */
        .controls-bar {
          position: absolute;
          bottom: 32px;
          display: flex;
          align-items: center;
          gap: 24px;
          padding: 16px 32px;
          border-radius: 9999px;
        }
        .ctrl-btn-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          position: relative;
          color: var(--on-surface-variant);
          transition: color 0.3s;
          padding: 0;
        }
        .ctrl-btn-wrap:hover {
          color: var(--primary);
        }
        .ctrl-btn-wrap:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .ctrl-btn {
          width: 48px;
          height: 48px;
          border-radius: 9999px;
          border: 1px solid var(--outline-variant);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.25s;
        }
        .ctrl-btn:hover {
          background: var(--surface-container-high);
        }
        .end-btn {
          width: 64px;
          height: 64px;
          border-radius: 9999px;
          background: var(--error-container);
          color: var(--on-error-container);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.25s;
          border: none;
        }
        .ctrl-btn-wrap:hover .end-btn {
          background: var(--error);
          color: var(--on-error);
          transform: scale(1.1);
          box-shadow: 0 8px 24px rgba(186,26,26,0.3);
        }
        .ctrl-label {
          font-size: 10px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          opacity: 0;
          transition: opacity 0.2s;
          position: absolute;
          bottom: -20px;
          white-space: nowrap;
        }
        .ctrl-btn-wrap:hover .ctrl-label {
          opacity: 1;
        }
        .countdown-display {
          margin-left: 16px;
          font-family: var(--font-mono);
          font-size: 16px;
          font-weight: 600;
        }
        .voice-select {
          border-radius: 6px;
          font-size: 12px;
          padding: 4px;
        }

        /* ==================== RIGHT: TRANSCRIPT ==================== */
        .transcript-col {
          display: flex;
          flex-direction: column;
          width: 380px;
          min-width: 380px;
          height: 100%;
          padding: 32px 0;
        }
        .transcript-title {
          font-family: var(--font-display);
          font-size: 32px;
          font-weight: 500;
          color: var(--primary);
          margin-bottom: 32px;
          border-bottom: 1px solid rgba(192,200,196,0.3);
          padding-bottom: 16px;
        }
        .transcript-scroll {
          flex: 1;
          overflow-y: auto;
          padding-right: 24px;
          display: flex;
          flex-direction: column;
          gap: 32px;
        }
        .transcript-scroll::-webkit-scrollbar { width: 4px; }
        .transcript-scroll::-webkit-scrollbar-track { background: transparent; }
        .transcript-scroll::-webkit-scrollbar-thumb { background: rgba(64,73,69,0.2); border-radius: 4px; }

        /* Messages */
        .ai-msg {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .user-msg {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 16px;
        }
        .msg-header {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .msg-header-right {
          justify-content: flex-end;
        }
        .msg-avatar {
          width: 32px;
          height: 32px;
          border-radius: 9999px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: var(--shadow-sm);
          flex-shrink: 0;
        }
        .msg-avatar-ai {
          background: var(--primary-container);
          color: var(--on-primary-container);
        }
        .msg-avatar-user {
          background: var(--surface);
          border: 1px solid var(--outline-variant);
          color: var(--on-surface-variant);
        }
        .msg-name {
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--on-surface-variant);
        }
        .msg-time {
          font-size: 10px;
          color: var(--outline);
          font-family: var(--font-mono);
          margin-left: auto;
        }
        .ai-msg-text {
          font-size: 18px;
          color: var(--on-surface);
          line-height: 1.7;
          padding-left: 44px;
        }
        .user-bubble {
          background: var(--surface);
          padding: 20px;
          border-radius: 16px;
          border-top-right-radius: 0;
          border: 1px solid color-mix(in srgb, var(--on-surface) 10%, transparent);
        }
        .user-msg-text {
          font-size: 16px;
          color: var(--on-surface-variant);
          line-height: 1.7;
        }

        /* Typing cursor */
        .typing-cursor {
          display: inline-block;
          width: 6px;
          height: 16px;
          background: var(--primary);
          margin-left: 4px;
          vertical-align: middle;
          animation: cursor-blink 1s step-end infinite;
        }

        /* Bounce dots */
        .bounce-dot {
          width: 6px;
          height: 6px;
          background: var(--primary);
          border-radius: 9999px;
          animation: bounce 0.6s ease-in-out infinite alternate;
        }

        /* Input row */
        .input-row {
          margin-top: 16px;
          display: flex;
          gap: 8px;
        }
        .chat-textarea {
          flex: 1;
          border-radius: 12px;
          padding: 12px;
          font-size: 14px;
          resize: none;
          outline: none;
          font-family: var(--font-sans);
          box-shadow: inset 0 1px 2px rgba(0,0,0,0.06);
          transition: border-color 0.15s;
        }
        .chat-textarea:focus {
          border-color: var(--primary) !important;
        }
        .send-btn {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          background: var(--primary);
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          align-self: flex-end;
          cursor: pointer;
          transition: background 0.2s;
          box-shadow: var(--shadow-sm);
        }
        .send-btn:hover {
          background: var(--primary-container);
        }
        .send-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .retry-btn {
          width: 100%;
          padding: 12px;
          background: color-mix(in srgb, var(--error) 15%, transparent);
          color: var(--error);
          border-radius: 12px;
          font-weight: 600;
          border: 1px solid color-mix(in srgb, var(--error) 30%, transparent);
          cursor: pointer;
          font-family: var(--font-sans);
          font-size: 14px;
          transition: background 0.2s;
        }
        .retry-btn:hover {
          background: color-mix(in srgb, var(--error) 25%, transparent);
        }

        /* Complete state */
        .complete-box {
          margin-top: 16px;
          text-align: center;
        }
        .complete-text {
          color: var(--primary);
          font-weight: 600;
          font-size: 18px;
          margin-bottom: 8px;
        }
        .complete-btn {
          padding: 12px 24px;
          background: var(--primary);
          border-radius: 9999px;
          font-weight: 600;
          border: none;
          cursor: pointer;
          font-family: var(--font-sans);
          font-size: 14px;
          transition: background 0.2s;
          box-shadow: var(--shadow-sm);
        }
        .complete-btn:hover {
          background: var(--primary-container);
        }

        /* Transcript fade */
        .transcript-fade {
          height: 64px;
          width: 100%;
          background: linear-gradient(to top, var(--background) 0%, transparent 100%);
          margin-top: -64px;
          position: relative;
          z-index: 10;
          pointer-events: none;
        }

        /* ==================== ANIMATIONS ==================== */
        @keyframes breathe {
          0% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.05); opacity: 1; }
          100% { transform: scale(1); opacity: 0.8; }
        }
        .breathe-anim { animation: breathe 4s ease-in-out infinite; }

        @keyframes pulse-ring-kf {
          0% { transform: scale(0.8); opacity: 0.5; }
          100% { transform: scale(1.3); opacity: 0; }
        }

        @keyframes ping {
          75%, 100% { transform: scale(2); opacity: 0; }
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        @keyframes cursor-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }

        @keyframes bounce {
          0% { transform: translateY(0); }
          100% { transform: translateY(-6px); }
        }

        /* ==================== RESPONSIVE ==================== */
        @media (max-width: 768px) {
          .telemetry-col {
            display: none;
          }
          .transcript-col {
            display: none;
          }
          .main-workspace {
            flex-direction: column;
            padding: 96px 16px 32px 16px;
          }
          .controls-bar {
            bottom: 16px;
          }
        }
        @media (min-width: 769px) {
          .main-workspace {
            padding-left: 32px;
            padding-right: 32px;
          }
        }
      `}</style>
    </div>
  );
}

export default function LivePage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: 'var(--background)' }} />}>
      <LiveContent />
    </Suspense>
  );
}
