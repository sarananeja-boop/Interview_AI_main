"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { isAuthenticated, getEvaluation } from "@/lib/api";

interface DimensionScore {
  dimension: string;
  score: number;
  reasoning: string;
}

function ReviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const interviewId = searchParams.get("id");

  const [evaluation, setEvaluation] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isAuthenticated()) { router.push("/login"); return; }
    if (!interviewId) return;

    getEvaluation(interviewId)
      .then((data) => {
        setEvaluation(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load evaluation");
        setLoading(false);
      });
  }, [interviewId, router]);

  const formatDimension = (d: string) => d.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const getScoreColor = (score: number) => {
    if (score >= 8) return "var(--accent-success)";
    if (score >= 6) return "var(--accent-info)";
    if (score >= 4) return "var(--accent-warning)";
    return "var(--accent-danger)";
  };

  if (loading) {
    return (
      <div className="review-loading">
        <div className="spinner-lg" />
        <h2 style={{ marginTop: "var(--space-lg)" }}>Generating Evaluation...</h2>
        <p className="text-muted" style={{ marginTop: "var(--space-sm)" }}>
          The AI is scoring your interview across 12 dimensions
        </p>

        <style jsx>{`
          .review-loading {
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: var(--bg-primary);
          }
          .spinner-lg {
            width: 48px;
            height: 48px;
            border: 4px solid rgba(99, 102, 241, 0.2);
            border-top-color: var(--accent-primary);
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg-primary)", flexDirection: "column", gap: "var(--space-md)" }}>
        <p style={{ color: "var(--accent-danger)" }}>{error}</p>
        <button className="btn btn-secondary" onClick={() => router.push("/dashboard")}>Back to Dashboard</button>
      </div>
    );
  }

  if (!evaluation) return null;

  const dimensions = (evaluation.dimension_scores || []) as DimensionScore[];
  const overallScore = (evaluation.overall_score as number) || 0;
  const weakAnswers = (evaluation.weak_answers || []) as Record<string, unknown>[];
  const improvementPlan = (evaluation.improvement_plan || []) as string[];
  const panelPerception = evaluation.panel_perception as string;
  const overallAssessment = evaluation.overall_assessment as string;

  return (
    <div className="review-page">
      <div className="review-container animate-fade-in">
        <button className="btn btn-ghost" onClick={() => router.push("/dashboard")} style={{ marginBottom: "var(--space-lg)" }}>
          ← Back to Dashboard
        </button>

        <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "var(--space-xs)" }}>
          Interview Evaluation
        </h1>
        <p className="text-muted" style={{ marginBottom: "var(--space-2xl)" }}>
          AI-generated scoring across 12 interview dimensions
        </p>

        {/* Overall Score */}
        <div className="overall-card glass-strong">
          <div className="overall-score-ring" style={{ borderColor: getScoreColor(overallScore) }}>
            <span style={{ color: getScoreColor(overallScore) }}>{overallScore.toFixed(1)}</span>
          </div>
          <div>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Overall Score</h2>
            <p className="text-muted" style={{ fontSize: "0.9rem", marginTop: "var(--space-xs)", maxWidth: 500, lineHeight: 1.6 }}>
              {overallAssessment || "No assessment available."}
            </p>
          </div>
        </div>

        {/* Dimension Scores */}
        <div className="section-card">
          <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "var(--space-lg)" }}>📊 Dimension Scores</h2>
          <div className="dimensions-grid">
            {dimensions.map((d, i) => (
              <div key={i} className="dimension-item">
                <div className="dimension-header">
                  <span style={{ fontSize: "0.85rem", fontWeight: 500 }}>{formatDimension(d.dimension)}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: getScoreColor(d.score) }}>
                    {d.score.toFixed(1)}
                  </span>
                </div>
                <div className="dimension-bar">
                  <div className="dimension-bar-fill" style={{ width: `${d.score * 10}%`, background: getScoreColor(d.score) }} />
                </div>
                <p className="text-dim" style={{ fontSize: "0.8rem", marginTop: 4, lineHeight: 1.4 }}>{d.reasoning}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Panel Perception */}
        {panelPerception && (
          <div className="section-card">
            <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "var(--space-md)" }}>🎭 Panel Perception</h2>
            <p style={{ lineHeight: 1.7, color: "var(--text-secondary)" }}>
              &ldquo;{panelPerception}&rdquo;
            </p>
          </div>
        )}

        {/* Weak Answers */}
        {weakAnswers.length > 0 && (
          <div className="section-card">
            <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "var(--space-lg)" }}>⚠ Weak Answers — Rewrites</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
              {weakAnswers.map((wa, i) => (
                <div key={i} className="weak-answer-card">
                  <div className="wa-section">
                    <span className="badge badge-danger">Your Answer</span>
                    <p className="text-muted" style={{ marginTop: "var(--space-sm)", fontSize: "0.9rem", lineHeight: 1.6 }}>
                      {(wa.original as string) || "—"}
                    </p>
                  </div>
                  <div className="wa-section">
                    <span className="badge badge-warning">Issue</span>
                    <p className="text-muted" style={{ marginTop: "var(--space-sm)", fontSize: "0.9rem", lineHeight: 1.6 }}>
                      {(wa.issue as string) || "—"}
                    </p>
                  </div>
                  <div className="wa-section">
                    <span className="badge badge-success">Suggested Rewrite</span>
                    <p style={{ marginTop: "var(--space-sm)", fontSize: "0.9rem", lineHeight: 1.6, color: "var(--accent-success)" }}>
                      {(wa.suggested_rewrite as string) || "—"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Improvement Plan */}
        {improvementPlan.length > 0 && (
          <div className="section-card">
            <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "var(--space-lg)" }}>📈 Improvement Plan</h2>
            <ol className="improvement-list">
              {improvementPlan.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ol>
          </div>
        )}

        {/* Back CTA */}
        <div style={{ textAlign: "center", padding: "var(--space-xl) 0 var(--space-3xl)" }}>
          <button className="btn btn-primary btn-lg" onClick={() => router.push("/dashboard")}>
            Start Another Interview →
          </button>
        </div>
      </div>

      <style jsx>{`
        .review-page {
          min-height: 100vh;
          background: var(--bg-primary);
          padding: var(--space-2xl);
        }

        .review-container {
          max-width: 800px;
          margin: 0 auto;
        }

        .overall-card {
          display: flex;
          align-items: center;
          gap: var(--space-xl);
          padding: var(--space-xl);
          border-radius: var(--radius-xl);
          margin-bottom: var(--space-xl);
        }

        .overall-score-ring {
          width: 90px;
          height: 90px;
          border-radius: 50%;
          border: 4px solid;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2rem;
          font-weight: 800;
          font-family: var(--font-mono);
          flex-shrink: 0;
        }

        .section-card {
          background: var(--bg-secondary);
          border: var(--border-subtle);
          border-radius: var(--radius-lg);
          padding: var(--space-xl);
          margin-bottom: var(--space-xl);
        }

        .dimensions-grid {
          display: flex;
          flex-direction: column;
          gap: var(--space-lg);
        }

        .dimension-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
        }

        .dimension-bar {
          height: 6px;
          background: var(--bg-tertiary);
          border-radius: var(--radius-full);
          overflow: hidden;
        }

        .dimension-bar-fill {
          height: 100%;
          border-radius: var(--radius-full);
          transition: width 0.8s ease-out;
        }

        .weak-answer-card {
          background: var(--bg-tertiary);
          border-radius: var(--radius-md);
          padding: var(--space-lg);
          display: flex;
          flex-direction: column;
          gap: var(--space-md);
        }

        .improvement-list {
          padding-left: var(--space-lg);
          display: flex;
          flex-direction: column;
          gap: var(--space-md);
        }

        .improvement-list li {
          font-size: 0.95rem;
          line-height: 1.6;
          color: var(--text-secondary);
        }

        .improvement-list li::marker {
          color: var(--accent-primary);
          font-weight: 700;
        }
      `}</style>
    </div>
  );
}

export default function ReviewPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "var(--bg-primary)" }} />}>
      <ReviewContent />
    </Suspense>
  );
}
