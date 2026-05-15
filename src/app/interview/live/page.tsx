"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { isAuthenticated, respondToInterviewer, endInterview, getInterview } from "@/lib/api";

interface Message {
  role: "interviewer" | "candidate";
  content: string;
  stage?: string;
  turnNumber?: number;
}

function LiveContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const interviewId = searchParams.get("id");

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [pressureLevel, setPressureLevel] = useState(0.3);
  const [currentStage, setCurrentStage] = useState("warmup");
  const [isComplete, setIsComplete] = useState(false);
  const [contradictions, setContradictions] = useState(0);
  const [weakAnswers, setWeakAnswers] = useState(0);
  const [turnCount, setTurnCount] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Timer
  useEffect(() => {
    if (isComplete) return;
    const timer = setInterval(() => setElapsedTime((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [isComplete]);

  // Load initial state
  useEffect(() => {
    if (!isAuthenticated()) { router.push("/login"); return; }
    if (!interviewId) return;

    getInterview(interviewId).then((data) => {
      if (data.conversation_log?.length > 0) {
        setMessages(data.conversation_log.map((t: Record<string, unknown>) => ({
          role: t.role as string,
          content: t.content as string,
          stage: t.stage as string,
          turnNumber: t.turn_number as number,
        })));
        setPressureLevel(data.pressure_level ?? 0.3);
        setCurrentStage(data.current_stage ?? "warmup");
        setTurnCount(data.turn_count ?? 0);
        setContradictions(data.contradiction_count ?? 0);
        setWeakAnswers(data.weak_answer_count ?? 0);
      }
    }).catch(console.error);
  }, [interviewId, router]);

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || sending || isComplete || !interviewId) return;

    const answer = input.trim();
    setInput("");
    setSending(true);

    // Add candidate message immediately
    setMessages((prev) => [...prev, { role: "candidate", content: answer, stage: currentStage }]);

    try {
      const response = await respondToInterviewer(interviewId, answer);

      // Add interviewer response
      setMessages((prev) => [
        ...prev,
        {
          role: "interviewer",
          content: response.interviewer_message,
          stage: response.current_stage,
          turnNumber: response.turn_number,
        },
      ]);

      setPressureLevel(response.pressure_level ?? pressureLevel);
      setCurrentStage(response.current_stage ?? currentStage);
      setTurnCount(response.turn_number ?? turnCount);
      setContradictions(response.metadata?.contradiction_count ?? contradictions);
      setWeakAnswers(response.metadata?.weak_answer_count ?? weakAnswers);

      if (response.is_complete) {
        setIsComplete(true);
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        { role: "interviewer", content: "⚠ Connection error. Please try again.", stage: currentStage },
      ]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleEnd = async () => {
    if (!interviewId) return;
    try {
      await endInterview(interviewId);
      setIsComplete(true);
    } catch {
      /* ignore */
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (s: number) => {
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

  const pressureColor = pressureLevel < 0.4 ? "var(--accent-success)" : pressureLevel < 0.7 ? "var(--accent-warning)" : "var(--accent-danger)";

  return (
    <div className="interview-page">
      {/* Top Bar */}
      <header className="interview-header glass-strong">
        <div className="header-left">
          <span className="text-gradient" style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1rem" }}>
            IIM Simulator
          </span>
          <span className="badge badge-accent">{stageLabels[currentStage] || currentStage}</span>
        </div>
        <div className="header-center">
          <div className="timer-display">{formatTime(elapsedTime)}</div>
        </div>
        <div className="header-right">
          {!isComplete ? (
            <button className="btn btn-danger" onClick={handleEnd} style={{ fontSize: "0.85rem" }}>
              End Interview
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => router.push(`/interview/review?id=${interviewId}`)}>
              View Evaluation →
            </button>
          )}
        </div>
      </header>

      <div className="interview-body">
        {/* Chat Area */}
        <div className="chat-area">
          <div className="chat-messages">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`message ${msg.role === "interviewer" ? "message-interviewer" : "message-candidate"} animate-fade-in`}
              >
                <div className="message-avatar">
                  {msg.role === "interviewer" ? "🎓" : "👤"}
                </div>
                <div className="message-content">
                  <div className="message-meta">
                    <span className="message-role">
                      {msg.role === "interviewer" ? "Interviewer" : "You"}
                    </span>
                    {msg.stage && (
                      <span className="text-dim" style={{ fontSize: "0.7rem" }}>
                        {stageLabels[msg.stage] || msg.stage}
                      </span>
                    )}
                  </div>
                  <div className="message-text">{msg.content}</div>
                </div>
              </div>
            ))}

            {sending && (
              <div className="message message-interviewer animate-fade-in">
                <div className="message-avatar">🎓</div>
                <div className="message-content">
                  <div className="typing-indicator">
                    <span></span><span></span><span></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          {!isComplete && (
            <div className="chat-input-area">
              <textarea
                ref={inputRef}
                className="chat-input"
                placeholder="Type your answer... (Enter to send, Shift+Enter for new line)"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={sending}
                rows={3}
              />
              <button
                className="btn btn-primary send-btn"
                onClick={handleSend}
                disabled={!input.trim() || sending}
              >
                {sending ? "..." : "Send"}
              </button>
            </div>
          )}

          {isComplete && (
            <div className="interview-complete glass-strong">
              <div style={{ fontSize: "2rem", marginBottom: "var(--space-sm)" }}>✅</div>
              <h3 style={{ fontWeight: 600 }}>Interview Complete</h3>
              <p className="text-muted" style={{ marginTop: "var(--space-xs)", marginBottom: "var(--space-lg)" }}>
                Your responses are being evaluated across 12 dimensions
              </p>
              <button className="btn btn-primary btn-lg" onClick={() => router.push(`/interview/review?id=${interviewId}`)}>
                View Evaluation & Scores →
              </button>
            </div>
          )}
        </div>

        {/* Side Panel — Interview Metrics */}
        <aside className="metrics-panel">
          <h3 style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "var(--space-lg)", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-tertiary)" }}>
            Interview Metrics
          </h3>

          <div className="metric">
            <div className="metric-label">Pressure Level</div>
            <div className="pressure-bar" style={{ marginTop: 6 }}>
              <div className="pressure-bar-fill" style={{ width: `${pressureLevel * 100}%` }} />
            </div>
            <div style={{ fontSize: "0.75rem", color: pressureColor, marginTop: 4, fontFamily: "var(--font-mono)" }}>
              {(pressureLevel * 100).toFixed(0)}%
            </div>
          </div>

          <div className="metric">
            <div className="metric-label">Stage</div>
            <div className="metric-value">{stageLabels[currentStage] || currentStage}</div>
          </div>

          <div className="metric">
            <div className="metric-label">Turns</div>
            <div className="metric-value" style={{ fontFamily: "var(--font-mono)" }}>{turnCount}</div>
          </div>

          <div className="metric">
            <div className="metric-label">Contradictions</div>
            <div className="metric-value" style={{ color: contradictions > 0 ? "var(--accent-danger)" : "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
              {contradictions}
            </div>
          </div>

          <div className="metric">
            <div className="metric-label">Weak Answers</div>
            <div className="metric-value" style={{ color: weakAnswers > 0 ? "var(--accent-warning)" : "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
              {weakAnswers}
            </div>
          </div>

          <div className="metric">
            <div className="metric-label">Duration</div>
            <div className="metric-value" style={{ fontFamily: "var(--font-mono)" }}>{formatTime(elapsedTime)}</div>
          </div>
        </aside>
      </div>

      <style jsx>{`
        .interview-page {
          height: 100vh;
          display: flex;
          flex-direction: column;
          background: var(--bg-primary);
          overflow: hidden;
        }

        .interview-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 var(--space-xl);
          height: var(--header-height);
          border-bottom: var(--border-subtle);
          flex-shrink: 0;
        }

        .header-left, .header-right {
          display: flex;
          align-items: center;
          gap: var(--space-md);
        }

        .timer-display {
          font-family: var(--font-mono);
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--text-secondary);
        }

        .interview-body {
          flex: 1;
          display: flex;
          overflow: hidden;
        }

        .chat-area {
          flex: 1;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: var(--space-xl);
          display: flex;
          flex-direction: column;
          gap: var(--space-lg);
        }

        .message {
          display: flex;
          gap: var(--space-md);
          max-width: 80%;
        }

        .message-interviewer {
          align-self: flex-start;
        }

        .message-candidate {
          align-self: flex-end;
          flex-direction: row-reverse;
        }

        .message-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--bg-tertiary);
          font-size: 1rem;
          flex-shrink: 0;
        }

        .message-content {
          background: var(--bg-secondary);
          border: var(--border-subtle);
          border-radius: var(--radius-lg);
          padding: var(--space-md) var(--space-lg);
        }

        .message-candidate .message-content {
          background: rgba(99, 102, 241, 0.1);
          border-color: rgba(99, 102, 241, 0.2);
        }

        .message-meta {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          margin-bottom: var(--space-xs);
        }

        .message-role {
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--text-secondary);
        }

        .message-text {
          font-size: 0.95rem;
          line-height: 1.6;
          white-space: pre-wrap;
        }

        .typing-indicator {
          display: flex;
          gap: 4px;
          padding: 4px 0;
        }

        .typing-indicator span {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--text-tertiary);
          animation: typing 1.4s infinite;
        }

        .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
        .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }

        @keyframes typing {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1); }
        }

        .chat-input-area {
          padding: var(--space-md) var(--space-xl);
          border-top: var(--border-subtle);
          display: flex;
          gap: var(--space-md);
          align-items: flex-end;
          background: var(--bg-secondary);
        }

        .chat-input {
          flex: 1;
          background: var(--bg-tertiary);
          border: var(--border-subtle);
          border-radius: var(--radius-md);
          color: var(--text-primary);
          font-family: var(--font-sans);
          font-size: 0.95rem;
          padding: var(--space-md);
          resize: none;
          outline: none;
          line-height: 1.5;
        }

        .chat-input:focus {
          border-color: var(--accent-primary);
          box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
        }

        .chat-input::placeholder {
          color: var(--text-muted);
        }

        .send-btn {
          padding: var(--space-md) var(--space-lg);
          height: fit-content;
        }

        .interview-complete {
          text-align: center;
          padding: var(--space-2xl);
          margin: var(--space-xl);
          border-radius: var(--radius-xl);
        }

        .metrics-panel {
          width: 240px;
          padding: var(--space-xl);
          border-left: var(--border-subtle);
          background: var(--bg-secondary);
          overflow-y: auto;
          flex-shrink: 0;
        }

        .metric {
          margin-bottom: var(--space-lg);
        }

        .metric-label {
          font-size: 0.75rem;
          color: var(--text-tertiary);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 4px;
        }

        .metric-value {
          font-size: 1.1rem;
          font-weight: 600;
        }

        @media (max-width: 768px) {
          .metrics-panel {
            display: none;
          }
          .message {
            max-width: 95%;
          }
        }
      `}</style>
    </div>
  );
}

export default function LiveInterviewPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "var(--bg-primary)" }} />}>
      <LiveContent />
    </Suspense>
  );
}
