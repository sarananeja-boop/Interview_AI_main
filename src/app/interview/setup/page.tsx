"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { isAuthenticated, getProfile, startInterview } from "@/lib/api";

function SetupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const profileId = searchParams.get("profile");

  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [persona, setPersona] = useState("skeptic");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isAuthenticated()) { router.push("/login"); return; }
    if (profileId) {
      getProfile(profileId).then(setProfile).catch(() => setError("Failed to load profile"));
    }
  }, [profileId, router]);

  const personas = [
    { key: "skeptic", name: "Prof. Sharma", role: "The Skeptic", desc: "Challenges every claim. Demands evidence and numbers. High pressure.", pressure: 0.85, icon: "🔥" },
    { key: "academic", name: "Prof. Iyer", role: "The Academic", desc: "Probes technical depth. Tests fundamentals. Asks 'why' repeatedly.", pressure: 0.70, icon: "🎓" },
    { key: "friendly_trap", name: "Prof. Mehta", role: "The Friendly Trap", desc: "Seems warm but sets traps. The most dangerous interviewer.", pressure: 0.50, icon: "😊" },
    { key: "mixed", name: "Mixed Panel", role: "3-Member Panel", desc: "Rotates between skeptic, academic, and friendly styles. Most realistic.", pressure: 0.70, icon: "👥" },
  ];

  const handleStart = async () => {
    if (!profileId) return;
    setError("");
    setLoading(true);
    try {
      const data = await startInterview(profileId, persona);
      router.push(`/interview/live?id=${data.interview_id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to start interview");
      setLoading(false);
    }
  };

  const parsed = profile?.parsed_profile as Record<string, unknown> | undefined;

  return (
    <div className="setup-page">
      <div className="setup-container animate-fade-in">
        <button className="btn btn-ghost" onClick={() => router.push("/dashboard")} style={{ marginBottom: "var(--space-lg)" }}>
          ← Back to Dashboard
        </button>

        <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "var(--space-sm)" }}>
          Interview Setup
        </h1>
        <p className="text-muted" style={{ marginBottom: "var(--space-2xl)" }}>
          Choose your interviewer and prepare to face the panel
        </p>

        {/* Profile Summary */}
        {profile && parsed && (
          <div className="section-card" style={{ marginBottom: "var(--space-xl)" }}>
            <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "var(--space-md)" }}>📄 Candidate Profile</h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-md)" }}>
              <div>
                <span className="text-dim" style={{ fontSize: "0.8rem" }}>Name</span>
                <div style={{ fontWeight: 500 }}>{(parsed.name as string) || "Not extracted"}</div>
              </div>
              <div>
                <span className="text-dim" style={{ fontSize: "0.8rem" }}>Education</span>
                <div style={{ fontWeight: 500 }}>
                  {Array.isArray(parsed.education) && parsed.education.length > 0
                    ? `${(parsed.education[0] as Record<string, unknown>).degree} in ${(parsed.education[0] as Record<string, unknown>).field}`
                    : "—"}
                </div>
              </div>
            </div>

            {/* Pressure Points */}
            {Array.isArray(profile.pressure_points) && profile.pressure_points.length > 0 && (
              <div style={{ marginTop: "var(--space-lg)" }}>
                <span className="text-dim" style={{ fontSize: "0.8rem" }}>⚠ Panel will likely target:</span>
                <ul style={{ marginTop: "var(--space-xs)", paddingLeft: "var(--space-lg)" }}>
                  {(profile.pressure_points as string[]).slice(0, 3).map((p, i) => (
                    <li key={i} className="text-muted" style={{ fontSize: "0.85rem", marginBottom: 4 }}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Persona Selection */}
        <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "var(--space-md)" }}>🎭 Choose Interviewer</h2>
        <div className="persona-grid">
          {personas.map((p) => (
            <div
              key={p.key}
              className={`persona-card card ${persona === p.key ? "persona-selected" : ""}`}
              onClick={() => setPersona(p.key)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: "1.5rem", marginBottom: "var(--space-sm)" }}>{p.icon}</div>
                  <div style={{ fontWeight: 600, fontSize: "1rem" }}>{p.name}</div>
                  <div className="text-dim" style={{ fontSize: "0.8rem" }}>{p.role}</div>
                </div>
                {persona === p.key && <span className="badge badge-accent">Selected</span>}
              </div>
              <p className="text-muted" style={{ fontSize: "0.85rem", marginTop: "var(--space-sm)", lineHeight: 1.5 }}>{p.desc}</p>
              <div style={{ marginTop: "var(--space-md)" }}>
                <span className="text-dim" style={{ fontSize: "0.75rem" }}>Pressure Level</span>
                <div className="pressure-bar" style={{ marginTop: 4 }}>
                  <div className="pressure-bar-fill" style={{ width: `${p.pressure * 100}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {error && <div className="auth-error" style={{ marginTop: "var(--space-lg)" }}>{error}</div>}

        <button
          className="btn btn-primary btn-lg"
          onClick={handleStart}
          disabled={loading || !profileId}
          style={{ width: "100%", marginTop: "var(--space-xl)" }}
        >
          {loading ? "Preparing interview..." : "Enter Interview Room →"}
        </button>
      </div>

      <style jsx>{`
        .setup-page {
          min-height: 100vh;
          background: var(--bg-primary);
          padding: var(--space-2xl);
          display: flex;
          justify-content: center;
        }

        .setup-container {
          width: 100%;
          max-width: 700px;
        }

        .section-card {
          background: var(--bg-secondary);
          border: var(--border-subtle);
          border-radius: var(--radius-lg);
          padding: var(--space-xl);
        }

        .persona-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--space-md);
        }

        .persona-card {
          cursor: pointer;
          transition: all var(--transition-base);
        }

        .persona-selected {
          border-color: var(--accent-primary) !important;
          background: rgba(99, 102, 241, 0.08) !important;
          box-shadow: var(--shadow-glow);
        }

        .auth-error {
          padding: var(--space-sm) var(--space-md);
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: var(--radius-md);
          color: var(--accent-danger);
          font-size: 0.9rem;
        }

        @media (max-width: 768px) {
          .persona-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}

export default function SetupPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "var(--bg-primary)" }} />}>
      <SetupContent />
    </Suspense>
  );
}
