"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getInterview, ensureAuth } from "@/lib/api";
import Logo from "@/app/components/Logo";
function PrepareContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const interviewId = searchParams.get("id");
  const [micReady, setMicReady] = useState(false);
  const [micError, setMicError] = useState("");
  const [persona, setPersona] = useState("iim_general");
  const [personaName, setPersonaName] = useState("Prof. Sharma");
  const [loading, setLoading] = useState(true);

  const personaMap: Record<string, { name: string; role: string; emoji: string }> = {
    iim_a: { name: "IIM Ahmedabad", role: "The Pinnacle", emoji: "🏛️" },
    iim_b: { name: "IIM Bangalore", role: "The Pragmatist", emoji: "🏢" },
    iim_c: { name: "IIM Calcutta", role: "The Analyst", emoji: "📈" },
    iim_l: { name: "IIM Lucknow", role: "The Strategist", emoji: "🎯" },
    iim_general: { name: "General IIM Panel", role: "The All-Rounder", emoji: "🎓" },
  };

  useEffect(() => {
    async function init() {
      await ensureAuth();
      if (interviewId) {
        try {
          const data = await getInterview(interviewId);
          const p = data.persona || "iim_general";
          setPersona(p);
          setPersonaName(personaMap[p]?.name || "Interviewer");
        } catch {
          // Fallback
        }
      }
      setLoading(false);
    }
    init();
  }, [interviewId]);

  // Request mic permission
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => {
        setMicReady(true);
        stream.getTracks().forEach(t => t.stop()); // Release immediately
      })
      .catch(() => {
        setMicError("Microphone access denied. Please allow mic access and reload.");
      });
  }, []);

  const handleStart = () => {
    // Unlock speech synthesis on user interaction (fixes iOS/Safari/Chrome auto-play block)
    if (typeof window !== "undefined" && window.speechSynthesis) {
      const u = new SpeechSynthesisUtterance("");
      u.volume = 0;
      window.speechSynthesis.speak(u);
    }
    router.push(`/interview/live?id=${interviewId}`);
  };

  const info = personaMap[persona] || personaMap.iim_general;

  return (
    <div className="prepare-page">
      <div className="texture-overlay" />

      {/* Top Navigation */}
      <header className="top-nav">
        <div className="nav-inner">
          <div className="nav-brand">
            <Logo width={28} height={28} showText={true} />
          </div>
          <button className="nav-return" onClick={() => router.push("/interview/setup")}>
            <span className="material-symbols-outlined return-arrow">arrow_back</span>
            Return
          </button>
        </div>
      </header>

      <main className="main-content">
        <div className="prepare-card glass-panel animate-fade-in">
          {/* Avatar */}
          <div className="avatar-wrapper">
            <div className="avatar-ring" />
            <div className="avatar-circle">
              <span className="material-symbols-outlined avatar-icon">{(info as any)?.icon || "school"}</span>
            </div>
          </div>

          {/* Title */}
          <h1 className="prepare-title">{info?.name || personaName}</h1>
          <p className="prepare-role">{info?.role || "Interview Panel"}</p>

          <div className="divider-line" />

          {/* Step indicator */}
          <p className="step-indicator">Step 02 / Pre-Interview Briefing</p>

          {/* Tips */}
          <div className="tips-section">
            <div className="tip-item">
              <span className="material-symbols-outlined tip-icon">mic</span>
              <span className="tip-text">Speak clearly and concisely</span>
            </div>
            <div className="tip-item">
              <span className="material-symbols-outlined tip-icon">timer</span>
              <span className="tip-text">You have 15–20 minutes</span>
            </div>
            <div className="tip-item">
              <span className="material-symbols-outlined tip-icon">psychology</span>
              <span className="tip-text">Support answers with examples</span>
            </div>
            <div className="tip-item">
              <span className="material-symbols-outlined tip-icon">visibility</span>
              <span className="tip-text">Maintain composure under pressure</span>
            </div>
          </div>

          {/* Mic Status */}
          <div className="mic-status">
            {micReady ? (
              <div className="mic-ok">
                <span className="material-symbols-outlined mic-status-icon">check_circle</span>
                Microphone ready
              </div>
            ) : micError ? (
              <div className="mic-err">
                <span className="material-symbols-outlined mic-status-icon">error</span>
                {micError}
              </div>
            ) : (
              <div className="mic-loading">
                <span className="material-symbols-outlined mic-status-icon animate-spin">progress_activity</span>
                Requesting microphone access...
              </div>
            )}
          </div>

          {/* Start CTA */}
          <button
            className="start-button"
            onClick={handleStart}
            disabled={!micReady || !interviewId}
          >
            <span className="material-symbols-outlined start-icon">play_arrow</span>
            I&apos;m Ready — Start Interview
          </button>

          {/* Back */}
          <button className="back-link" onClick={() => router.push("/dashboard")}>
            <span className="material-symbols-outlined back-arrow">arrow_back</span>
            Back to Dashboard
          </button>
        </div>
      </main>

      <style jsx>{`
        .prepare-page {
          min-height: 100vh;
          background: var(--background);
          position: relative;
        }

        /* Top Navigation */
        .top-nav {
          position: fixed;
          top: 0;
          width: 100%;
          z-index: 40;
          background: rgba(249, 250, 247, 0.5);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid rgba(192, 200, 196, 0.2);
        }

        :global([data-theme="dark"]) .top-nav {
          background: rgba(17, 20, 18, 0.7);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .nav-inner {
          width: 100%;
          padding: 1.25rem 2rem;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .nav-brand {
          font-family: var(--font-display);
          font-size: var(--text-headline-md);
          font-weight: 500;
          color: var(--primary);
          display: flex;
          align-items: center;
          gap: 0.5rem;
          line-height: 32px;
        }

        .brand-icon {
          font-size: 28px;
          color: var(--primary);
        }

        .nav-return {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: none;
          border: none;
          color: var(--on-surface-variant);
          font-family: var(--font-sans);
          font-size: var(--text-label-md);
          font-weight: 500;
          cursor: pointer;
          transition: color var(--transition-fast);
          padding: 0.5rem 1rem;
          border-radius: var(--radius-md);
        }

        .nav-return:hover {
          color: var(--primary);
        }

        .nav-return:hover .return-arrow {
          transform: translateX(-4px);
        }

        .return-arrow {
          font-size: 20px;
          transition: transform var(--transition-base);
        }

        /* Main Content */
        .main-content {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 6rem var(--margin-mobile) 2rem;
        }

        .prepare-card {
          text-align: center;
          max-width: 520px;
          width: 100%;
          padding: var(--space-3xl) var(--space-xl);
          border-radius: var(--radius-2xl);
        }

        /* Avatar */
        .avatar-wrapper {
          position: relative;
          width: 120px;
          height: 120px;
          margin: 0 auto var(--space-lg);
        }

        .avatar-ring {
          position: absolute;
          inset: -8px;
          border-radius: 50%;
          border: 2px solid rgba(21, 69, 57, 0.15);
          animation: breathe 4s ease-in-out infinite;
        }

        .avatar-circle {
          width: 120px;
          height: 120px;
          border-radius: 50%;
          background: var(--gradient-hero);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: var(--shadow-glow);
          animation: ai-pulse 3s ease-in-out infinite;
        }

        .avatar-icon {
          font-size: 48px;
          color: rgba(255, 255, 255, 0.9);
          font-variation-settings: 'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 48;
        }

        /* Title */
        .prepare-title {
          font-family: var(--font-display);
          font-size: var(--text-headline-lg);
          font-weight: 500;
          color: var(--primary);
          line-height: 40px;
          margin-bottom: 4px;
        }

        .prepare-role {
          font-family: var(--font-sans);
          font-size: var(--text-body-md);
          color: var(--on-surface-variant);
          margin-bottom: var(--space-lg);
        }

        .divider-line {
          width: 60px;
          height: 2px;
          background: var(--gradient-hero);
          margin: 0 auto var(--space-lg);
          border-radius: 2px;
        }

        .step-indicator {
          font-family: var(--font-sans);
          font-size: var(--text-label-caps);
          font-weight: 600;
          color: var(--outline);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-bottom: var(--space-lg);
        }

        /* Tips */
        .tips-section {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin-bottom: var(--space-xl);
          text-align: left;
        }

        .tip-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          border-radius: var(--radius-lg);
          background: var(--surface-variant);
          border: 1px solid var(--border-subtle);
          transition: all var(--transition-fast);
        }

        .tip-item:hover {
          border-color: var(--outline);
        }

        .tip-icon {
          font-size: 20px;
          color: var(--primary);
          flex-shrink: 0;
        }

        .tip-text {
          font-family: var(--font-sans);
          font-size: var(--text-body-md);
          color: var(--on-surface);
          line-height: 24px;
        }

        /* Mic Status */
        .mic-status {
          margin-bottom: var(--space-lg);
        }

        .mic-ok {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          font-size: var(--text-body-md);
          font-weight: 500;
          color: var(--on-surface);
          padding: 0.75rem 1rem;
          border-radius: var(--radius-lg);
          background: var(--surface-variant);
          border: 1px solid var(--primary);
        }

        .mic-ok .mic-status-icon {
          color: var(--primary);
        }

        .mic-err {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          font-size: var(--text-body-md);
          font-weight: 500;
          color: var(--on-surface);
          padding: 0.75rem 1rem;
          border-radius: var(--radius-lg);
          background: var(--surface-variant);
          border: 1px solid var(--error);
          text-align: center;
        }
        
        .mic-err .mic-status-icon {
          color: var(--error);
        }

        .mic-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          font-size: var(--text-body-md);
          color: var(--on-surface);
          padding: 0.75rem 1rem;
          border-radius: var(--radius-lg);
          background: var(--surface-variant);
          border: 1px solid var(--border-subtle);
        }

        .mic-status-icon {
          font-size: 20px;
          flex-shrink: 0;
        }

        /* Start Button */
        .start-button {
          width: 100%;
          padding: 1rem 2rem;
          font-size: 1rem;
          font-weight: 500;
          font-family: var(--font-sans);
          color: var(--on-primary);
          background: var(--primary);
          border: none;
          border-radius: var(--radius-xl);
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          transition: all var(--transition-smooth);
          box-shadow: var(--shadow-button);
        }

        .start-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: var(--shadow-button-hover);
          background: var(--primary-container);
        }

        .start-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }

        .start-icon {
          font-size: 22px;
        }

        /* Back Link */
        .back-link {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          margin-top: var(--space-lg);
          padding: 0.5rem 1rem;
          background: none;
          border: none;
          color: var(--on-surface-variant);
          font-family: var(--font-sans);
          font-size: var(--text-label-md);
          font-weight: 500;
          cursor: pointer;
          transition: color var(--transition-fast);
          border-radius: var(--radius-md);
        }

        .back-link:hover {
          color: var(--primary);
        }

        .back-link:hover .back-arrow {
          transform: translateX(-4px);
        }

        .back-arrow {
          font-size: 18px;
          transition: transform var(--transition-base);
        }

        @media (min-width: 769px) {
          .nav-inner {
            padding-left: 3rem;
            padding-right: 3rem;
          }
        }
      `}</style>
    </div>
  );
}

export default function PreparePage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "var(--background)" }} />}>
      <PrepareContent />
    </Suspense>
  );
}
