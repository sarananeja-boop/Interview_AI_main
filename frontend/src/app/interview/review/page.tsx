"use client";
import SettingsModal from "@/app/components/SettingsModal";
import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getEvaluation, ensureAuth, getUser, logout } from "@/lib/api";

import ThemeToggle from "../../components/ThemeToggle";
import Logo from "@/app/components/Logo";
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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"evaluation" | "transcript">("evaluation");
  const user = getUser();

  useEffect(() => {
    async function init() {
      await ensureAuth();
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
    }
    init();
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
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
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
  const strengths = (evaluation.strengths || []) as Record<string, unknown>[];
  const improvementPlan = (evaluation.improvement_plan || []) as string[];
  const panelPerception = evaluation.panel_perception as string;
  const candidatePotential = evaluation.candidate_potential as string;
  const overallAssessment = evaluation.overall_assessment as string;
  const behavioralMetrics = evaluation.behavioral_metrics as Record<string, number> | undefined;
  const hasBehavioralMetrics = behavioralMetrics && Object.keys(behavioralMetrics).length > 0;

  return (
    <div className="dashboard-layout">
      {/* ── Sidebar ── */}
      <nav className="sidebar">
        {/* Branding */}
        <div className="sidebar-header" style={{ marginBottom: "1rem", paddingLeft: "0.5rem" }}>
          <Logo width={36} height={36} showText={true} />
        </div>

        {/* New Interview CTA */}
        <button
          className="sidebar-cta"
          onClick={() => router.push("/interview/setup")}
        >
          <span className="material-symbols-outlined filled" style={{ fontSize: 18 }}>add</span>
          New Mock Interview
        </button>

        {/* Navigation */}
        <div className="sidebar-nav">
          <div className="sidebar-nav-label">Menu</div>
          <Link className="nav-item" href="/dashboard">
            <span className="material-symbols-outlined filled" style={{ fontSize: 20 }}>space_dashboard</span>
            Dashboard
          </Link>
          <Link className="nav-item" href="/dashboard/news">
            <span className="material-symbols-outlined filled" style={{ fontSize: 20 }}>article</span>
            Daily News
          </Link>
          <Link className="nav-item" href="/interview/setup">
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>psychology</span>
            New Interview
          </Link>
          <Link className="nav-item nav-item-active" href="#">
            <span className="material-symbols-outlined filled" style={{ fontSize: 20 }}>analytics</span>
            Report
          </Link>
          <Link className="nav-item" href="/dashboard/history">
            <span className="material-symbols-outlined filled" style={{ fontSize: 20 }}>history_edu</span>
            Interview History
          </Link>
        </div>

        {/* Footer: User + Logout */}
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="user-avatar">{user?.name?.[0] || "U"}</div>
            <div className="user-info">
              <div className="user-name">{user?.name || "User"}</div>
              <div className="user-email">{user?.email || ""}</div>
            </div>
          </div>
          <button className="nav-item logout-btn" onClick={logout}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>logout</span>
            Log Out
          </button>
        </div>
      </nav>

      {/* ── Main Content ── */}
      <main className="main-content">
        <div style={{ display: "flex", gap: "1rem", marginBottom: "2rem", justifyContent: "space-between", alignItems: "center" }} className="no-print">
          <button className="btn-ghost" onClick={() => router.push("/dashboard/history")}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_back</span>
            Back to Archive
          </button>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            <ThemeToggle />
            <button className="btn-ghost" onClick={() => window.print()} style={{ background: "var(--surface-container-high)", color: "var(--primary)" }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>download</span>
              Download PDF
            </button>
          </div>
        </div>

        <div className="tab-switcher">
          <button 
            className={`tab-btn ${activeTab === "evaluation" ? "active" : ""}`}
            onClick={() => setActiveTab("evaluation")}
          >
            Intelligence Report
          </button>
          <button 
            className={`tab-btn ${activeTab === "transcript" ? "active" : ""}`}
            onClick={() => setActiveTab("transcript")}
          >
            Raw Transcript
          </button>
        </div>

        {activeTab === "evaluation" ? (
          <div className="evaluation-layout">
            {/* 1. Hero Intelligence Card */}
            <section className="glass-card hero-card">
              <div className="hero-bg-decoration" />
              <div className="hero-content">
                {/* Score */}
                <div className="score-container">
                  <svg className="circular-chart" viewBox="0 0 36 36">
                    <path className="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                    <path className="circle" style={{ strokeDasharray: `${overallScore * 10}, 100`, stroke: getScoreColor(overallScore) }} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  </svg>
                  <div className="score-text">
                    <span className="score-value" style={{ color: getScoreColor(overallScore) }}>{overallScore.toFixed(1)}</span>
                    <span className="score-label">Overall Index</span>
                  </div>
                </div>

                {/* Executive Summary */}
                <div className="executive-summary">
                  <div className="status-badge">
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>bolt</span>
                    Analysis Complete
                  </div>
                  <h2 className="hero-title">Interview Assessment</h2>
                  
                  {/* Replaced small metrics grid with dedicated section below */}

                  <p className="assessment-text">
                    {overallAssessment || "No overall assessment available."}
                  </p>
                  
                  {candidatePotential && (
                    <p className="potential-text mt-4">
                      <strong>Candidate Potential:</strong> {candidatePotential}
                    </p>
                  )}
                  {panelPerception && (
                    <p className="perception-text mt-2">
                      <strong>Panel Perception:</strong> &ldquo;{panelPerception}&rdquo;
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* 2. Matrix & Progress (Dimension Scores) */}
            <section className="matrix-section">
              <div className="glass-card matrix-card">
                <div className="section-header">
                  <div>
                    <h3 className="section-title">Performance Matrix</h3>
                    <p className="section-subtitle">Dimensional vector analysis of traits.</p>
                  </div>
                </div>
                
                <div className="dimensions-list">
                  {dimensions.map((d, i) => (
                    <div key={i} className="dimension-item">
                      <div className="dimension-header">
                        <span className="dimension-name">{formatDimension(d.dimension)}</span>
                        <span className="dimension-score" style={{ color: getScoreColor(d.score) }}>
                          {d.score.toFixed(1)}/10
                        </span>
                      </div>
                      <div className="dimension-bar">
                        <div className="dimension-bar-fill" style={{ width: `${d.score * 10}%`, background: getScoreColor(d.score) }} />
                      </div>
                      <p className="dimension-reason">{d.reasoning}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* 3. Behavioral Analysis */}
            {hasBehavioralMetrics && (
              <section className="behavioral-section layered-card" style={{ padding: "2rem", borderRadius: "1.5rem" }}>
                <div className="section-header">
                  <h3 className="section-title">Behavioral {"&"} Non-Verbal Analysis</h3>
                  <p className="section-subtitle">Real-time webcam metrics captured during the interview.</p>
                </div>
                {behavioralMetrics.multiple_people_detected && (
                  <div className="warning-alert">
                    <span className="material-symbols-outlined icon-box danger" style={{ padding: "0.4rem" }}>warning</span>
                    <strong>Multiple people detected in the webcam frame during this session.</strong>
                  </div>
                )}
                {behavioralMetrics.inappropriate_gesture && (
                  <div className="warning-alert">
                    <span className="material-symbols-outlined icon-box danger" style={{ padding: "0.4rem" }}>warning</span>
                    <strong>An inappropriate gesture was detected during the interview. This is a severe professionalism violation.</strong>
                  </div>
                )}
                {behavioralMetrics.phone_violation && (
                  <div className="warning-alert">
                    <span className="material-symbols-outlined icon-box danger" style={{ padding: "0.4rem" }}>warning</span>
                    <strong>A cell phone was detected in the frame. Phone use is strictly prohibited.</strong>
                  </div>
                )}
                <div className="metrics-grid behavioral-metrics-grid">
                  <div className="metric-box">
                    <p className="metric-label">Face Visibility</p>
                    <p className="metric-value">{Math.round((behavioralMetrics.face_visible_pct || 0) * 100)}%</p>
                    <p className="dimension-reason" style={{ marginTop: "0.5rem", fontSize: "0.8rem" }}>Consistency of candidate framing within the camera view.</p>
                  </div>
                  <div className="metric-box">
                    <p className="metric-label">Eye Contact</p>
                    <p className="metric-value">{Math.round((behavioralMetrics.eye_contact_score || 0) * 100)}%</p>
                    <p className="dimension-reason" style={{ marginTop: "0.5rem", fontSize: "0.8rem" }}>Engagement and focus tracking relative to the lens.</p>
                  </div>
                  <div className="metric-box">
                    <p className="metric-label">Posture Stability</p>
                    <p className="metric-value">{Math.round((behavioralMetrics.posture_score || 0) * 100)}%</p>
                    <p className="dimension-reason" style={{ marginTop: "0.5rem", fontSize: "0.8rem" }}>Upright positioning and body language confidence.</p>
                  </div>
                  <div className="metric-box">
                    <p className="metric-label">Looking Down</p>
                    <p className="metric-value">{behavioralMetrics.looking_down_count || 0} times</p>
                    <p className="dimension-reason" style={{ marginTop: "0.5rem", fontSize: "0.8rem" }}>Instances of averting gaze or checking notes.</p>
                  </div>
                </div>
              </section>
            )}

            {/* 4. Coaching Annotations */}
            <section className="coaching-section">
              <h2 className="section-title" style={{ marginBottom: "1.5rem" }}>Coaching Annotations</h2>
              
              {strengths.length === 0 && weakAnswers.length === 0 ? (
                <div className="layered-card" style={{ padding: "2rem", textAlign: "center", borderRadius: "1.5rem" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: "2.5rem", color: "var(--text-muted)", marginBottom: "1rem", display: "block" }}>school</span>
                  <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", lineHeight: "1.6" }}>
                    No detailed coaching annotations were generated for this session. This can happen when the interview is very short or the evaluation model did not produce granular feedback.
                    Try running a longer interview (5+ questions) for a more thorough analysis.
                  </p>
                </div>
              ) : (
              <div className="coaching-grid">
                {/* Strengths */}
                {strengths.map((str, i) => (
                  <div key={`str-${i}`} className="layered-card strength-card">
                    <div className="card-icon-header">
                      <span className="material-symbols-outlined icon-box success">psychiatry</span>
                      <h3 className="card-type-title">Primary Strength</h3>
                    </div>
                    <h4 className="card-focus-area">{(str.strength as string) || "Key Strength"}</h4>
                    <div className="answer-block">
                      <span className="block-label">Your Answer</span>
                      <p className="block-text">"{(str.original as string)}"</p>
                    </div>
                    <p className="card-description">
                      <strong>Impact:</strong> {(str.impact as string) || "—"}
                    </p>
                  </div>
                ))}

                {/* Weaknesses */}
                {weakAnswers.map((wa, i) => (
                  <div key={`wa-${i}`} className="layered-card weakness-card">
                    <div className="critical-badge">CRITICAL FOCUS</div>
                    <div className="card-icon-header">
                      <span className="material-symbols-outlined icon-box danger">insights</span>
                      <h3 className="card-type-title">Primary Growth Area</h3>
                    </div>
                    <h4 className="card-focus-area">{(wa.issue as string) || "Area for Improvement"}</h4>
                    <div className="answer-block">
                      <span className="block-label">Your Answer</span>
                      <p className="block-text">"{(wa.original as string)}"</p>
                    </div>
                    <div className="rewrite-block">
                      <span className="block-label highlight">Suggested Delivery</span>
                      <p className="block-text highlight">"{(wa.suggested_rewrite as string)}"</p>
                    </div>
                  </div>
                ))}
              </div>
              )}
            </section>

            {/* Improvement Plan */}
            {improvementPlan.length > 0 && (
              <section className="improvement-section layered-card" style={{ padding: "2rem", borderRadius: "1.5rem", marginTop: "2rem" }}>
                <div className="flex items-center gap-3 mb-6">
                  <span className="material-symbols-outlined bg-surface-variant p-2 rounded-xl text-primary">trending_up</span>
                  <h2 className="section-title">Improvement Roadmap</h2>
                </div>
                <ol className="improvement-list">
                  {improvementPlan.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ol>
              </section>
            )}
          </div>
        ) : (
          /* Transcript Tab */
          <div className="transcript-layout">
            <div className="glass-card p-8 rounded-3xl">
              <h2 className="section-title mb-8">Raw Transcript Log</h2>
              <div className="transcript-list">
                {((evaluation.conversation_log as any[]) || []).map((turn: any, i: number) => (
                  <div key={i} className={`interactive-row rounded-2xl p-4 flex gap-4 ${turn.role === "interviewer" ? "border-l-4 border-l-primary" : "border-l-4 border-l-secondary"}`}>
                    <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold flex-shrink-0" style={{ background: turn.role === "interviewer" ? "var(--primary-container)" : "var(--secondary-container)", color: turn.role === "interviewer" ? "var(--on-primary-container)" : "var(--on-secondary-container)" }}>
                      {turn.role === "interviewer" ? "I" : "U"}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-label-md font-semibold text-on-background mb-1">
                        {turn.role === "interviewer" ? "Interviewer" : "You"}
                      </h4>
                      <p className="text-on-surface-variant text-[15px] leading-relaxed whitespace-pre-wrap">
                        {turn.content}
                      </p>
                    </div>
                  </div>
                ))}
                {((evaluation.conversation_log as any[]) || []).length === 0 && (
                  <p className="text-muted">No transcript data available for this session.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      <style jsx>{`
        /* ═══════════════════════════════════
           Layout Base & Sidebar
           ═══════════════════════════════════ */
        .dashboard-layout {
          display: flex;
          min-height: 100vh;
          background-color: var(--background);
          color: var(--on-background);
          width: 100vw;
          min-width: 100vw;
          overflow-x: hidden;
        }

        .sidebar {
          width: var(--sidebar-width, 260px);
          height: 100vh;
          position: fixed;
          left: 0;
          top: 0;
          z-index: 40;
          display: flex;
          flex-direction: column;
          padding: 1.25rem 1rem;
          background: var(--surface);
          border-right: 1px solid var(--border-subtle);
        }

        .sidebar-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding-left: 0.5rem;
          margin-bottom: 1.5rem;
        }

        .sidebar-logo-icon {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          background: var(--primary-container);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .sidebar-brand {
          font-family: var(--font-display);
          font-size: 1.15rem;
          font-weight: 700;
          color: var(--on-surface);
          letter-spacing: -0.02em;
          line-height: 1.2;
        }

        .sidebar-subtitle {
          font-size: 0.65rem;
          font-weight: 600;
          color: var(--outline);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-top: 2px;
        }

        .sidebar-cta {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.875rem 1rem;
          margin: 0 0.5rem 1.5rem;
          background: var(--primary);
          color: var(--on-primary);
          font-family: var(--font-sans);
          font-size: 0.875rem;
          font-weight: 600;
          border: none;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .sidebar-cta:hover {
          background: var(--primary-container);
          color: var(--on-primary-container);
          transform: translateY(-1px);
        }

        .sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          flex: 1;
          padding: 0 0.5rem;
        }

        .sidebar-nav-label {
          font-size: 0.65rem;
          font-weight: 600;
          color: var(--outline);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          padding: 0 0.75rem;
          margin-bottom: 0.5rem;
        }

        .nav-item {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem 1rem;
          border-radius: 8px;
          font-size: 0.85rem;
          font-weight: 500;
          color: var(--on-surface-variant);
          cursor: pointer;
          transition: all 0.15s ease;
          border: none;
          text-decoration: none;
          background: none;
          font-family: var(--font-sans);
          width: 100%;
          text-align: left;
        }

        .nav-item:hover {
          background: var(--surface-variant);
          color: var(--on-surface);
        }

        .nav-item.nav-item-active {
          background: var(--primary-container);
          color: var(--on-primary-container);
          font-weight: 600;
        }

        .sidebar-footer {
          margin-top: auto;
          padding: 0.75rem 0.5rem 0;
          border-top: 1px solid var(--border-subtle);
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .sidebar-user {
          display: flex;
          align-items: center;
          gap: 0.625rem;
          padding: 0.625rem 0.75rem;
          border-radius: 8px;
        }

        .user-avatar {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: var(--primary);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.8rem;
          color: var(--on-primary);
          flex-shrink: 0;
        }

        .user-name {
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--on-surface);
        }

        .user-email {
          font-size: 0.7rem;
          color: var(--outline);
        }

        .logout-btn {
          color: var(--on-surface-variant);
          font-size: 0.8rem;
          padding: 0.5rem 0.75rem;
        }

        .logout-btn:hover {
          color: var(--error);
        }

        /* ═══════════════════════════════════
           Main Content Area
           ═══════════════════════════════════ */
        .main-content {
          margin-left: var(--sidebar-width, 260px);
          padding: 2.5rem 4rem 4rem 3rem;
          width: calc(100vw - 260px);
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .btn-ghost {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 1rem;
          background: var(--surface-container);
          border: 1px solid var(--outline-variant);
          border-radius: 8px;
          color: var(--on-surface-variant);
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .btn-ghost:hover {
          background: var(--surface-container-high);
          color: var(--primary);
          transform: translateX(-2px);
        }

        .tab-switcher {
          display: flex;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .tab-btn {
          padding: 0.75rem 1.5rem;
          border-radius: 12px;
          background: var(--surface-container);
          border: 1px solid var(--outline-variant);
          color: var(--on-surface-variant);
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          font-family: var(--font-sans);
        }

        .tab-btn:hover {
          background: var(--surface-container-high);
        }

        .tab-btn.active {
          background: var(--primary-container);
          border-color: var(--primary);
          color: var(--on-primary-container);
          box-shadow: var(--shadow-sm);
        }

        .evaluation-layout {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .glass-card {
          background: var(--surface-container-low);
          border: 1px solid var(--outline-variant);
          box-shadow: var(--shadow-md);
        }

        .layered-card {
          background: var(--surface-container-lowest);
          box-shadow: var(--shadow-layer);
          border: 1px solid var(--outline-variant);
          transition: transform 0.3s ease, box-shadow 0.3s ease;
        }

        .layered-card:hover {
          transform: translateY(-4px);
          box-shadow: var(--shadow-lg);
        }

        /* Hero Card */
        .hero-card {
          border-radius: 1.5rem;
          padding: 3rem;
          position: relative;
          overflow: hidden;
        }

        .hero-bg-decoration {
          position: absolute;
          right: -5rem;
          top: -5rem;
          width: 24rem;
          height: 24rem;
          background: var(--primary-fixed);
          opacity: 0.2;
          border-radius: 50%;
          filter: blur(48px);
          pointer-events: none;
        }

        .hero-content {
          position: relative;
          z-index: 10;
          display: flex;
          gap: 3rem;
          align-items: center;
        }

        @media (max-width: 1024px) {
          .hero-content {
            flex-direction: column;
            text-align: center;
          }
        }

        .score-container {
          width: 16rem;
          height: 16rem;
          position: relative;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .circular-chart {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }

        .circle-bg {
          fill: none;
          stroke: var(--outline-variant);
          stroke-width: 1.5;
        }

        .circle {
          fill: none;
          stroke-width: 1.5;
          stroke-linecap: round;
          animation: progress 1.5s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }

        @keyframes progress {
          0% { stroke-dasharray: 0 100; }
        }

        .score-text {
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .score-value {
          font-family: var(--font-display);
          font-size: 5rem;
          font-weight: 500;
          line-height: 1;
          letter-spacing: -0.02em;
        }

        .score-label {
          font-family: var(--font-sans);
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--on-surface-variant);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-top: 0.5rem;
        }

        .executive-summary {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.25rem 0.75rem;
          background: var(--surface-container-lowest);
          border-radius: 999px;
          color: var(--primary);
          font-family: var(--font-sans);
          font-size: 0.65rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          border: 1px solid var(--primary-fixed);
          align-self: flex-start;
        }

        .hero-title {
          font-family: var(--font-display);
          font-size: 3rem;
          font-weight: 500;
          color: var(--on-background);
          line-height: 1.1;
          letter-spacing: -0.01em;
        }

        .metrics-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1rem;
          margin-top: 0.5rem;
        }

        .behavioral-metrics-grid {
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 1.5rem;
        }

        .metric-box {
          background: var(--surface-container);
          padding: 1rem;
          border-radius: 1rem;
          border: 1px solid var(--outline-variant);
        }

        .metric-label {
          font-family: var(--font-sans);
          font-size: 0.65rem;
          font-weight: 600;
          color: var(--primary);
          text-transform: uppercase;
          margin-bottom: 0.25rem;
        }

        .metric-value {
          font-family: var(--font-display);
          font-size: 1.5rem;
          color: var(--primary);
          font-weight: 500;
        }

        .assessment-text {
          font-family: var(--font-sans);
          font-size: 1.1rem;
          color: var(--on-surface-variant);
          line-height: 1.6;
          max-width: 48rem;
          margin-top: 0.5rem;
        }

        .potential-text, .perception-text {
          font-family: var(--font-sans);
          font-size: 0.95rem;
          color: var(--on-surface-variant);
          line-height: 1.5;
          padding: 1rem;
          background: var(--surface-container);
          border-radius: 0.75rem;
          border-left: 3px solid var(--primary);
        }

        /* Warning Alert */
        .warning-alert {
          background: var(--surface-container-low);
          border: 1px solid var(--outline-variant);
          border-left: 4px solid var(--error);
          padding: 1rem 1.25rem;
          border-radius: 12px;
          margin-bottom: 1.5rem;
          color: var(--on-surface);
          display: flex;
          align-items: center;
          gap: 1rem;
          box-shadow: var(--shadow-sm);
        }

        /* Matrix Section */
        .matrix-card {
          border-radius: 1.5rem;
          padding: 2rem;
        }

        .section-header {
          margin-bottom: 2rem;
        }

        .section-title {
          font-family: var(--font-display);
          font-size: 1.5rem;
          font-weight: 500;
          color: var(--on-background);
        }

        .section-subtitle {
          font-family: var(--font-sans);
          font-size: 1rem;
          color: var(--on-surface-variant);
          margin-top: 0.25rem;
        }

        .dimensions-list {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 1.5rem;
        }

        .dimension-item {
          background: var(--surface-container);
          padding: 1.25rem;
          border-radius: 1rem;
          border: 1px solid var(--outline-variant);
        }

        .dimension-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.75rem;
        }

        .dimension-name {
          font-weight: 600;
          font-size: 0.95rem;
          color: var(--on-surface);
        }

        .dimension-score {
          font-weight: 700;
          font-family: var(--font-sans);
          font-size: 1.1rem;
        }

        .dimension-bar {
          height: 6px;
          background: var(--surface-variant);
          border-radius: 999px;
          overflow: hidden;
          margin-bottom: 0.75rem;
        }

        .dimension-bar-fill {
          height: 100%;
          border-radius: 999px;
          transition: width 1s ease-out;
        }

        .dimension-reason {
          font-size: 0.85rem;
          color: var(--on-surface-variant);
          line-height: 1.4;
        }

        /* Coaching Annotations */
        .coaching-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 2rem;
        }

        .strength-card {
          border-radius: 1.5rem;
          padding: 2rem;
          border-left: 4px solid var(--primary);
        }

        .weakness-card {
          border-radius: 1.5rem;
          padding: 2rem;
          border-left: 4px solid var(--error);
          position: relative;
        }

        .critical-badge {
          position: absolute;
          top: 0;
          right: 0;
          background: var(--error);
          color: var(--on-error);
          font-size: 0.65rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          padding: 0.25rem 0.75rem;
          border-bottom-left-radius: 1rem;
          border-top-right-radius: 1.5rem;
        }

        .card-icon-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 1.5rem;
        }

        .icon-box {
          padding: 0.5rem;
          border-radius: 0.75rem;
        }

        .icon-box.success {
          background: var(--primary-container);
          color: var(--primary);
        }

        .icon-box.danger {
          background: var(--error-container);
          color: var(--error);
        }

        .card-type-title {
          font-family: var(--font-display);
          font-size: 1.25rem;
          font-weight: 500;
          color: var(--on-surface);
        }

        .card-focus-area {
          font-weight: 700;
          font-size: 1.1rem;
          margin-bottom: 1rem;
          color: var(--on-surface);
        }

        .answer-block {
          background: var(--surface-container-low);
          padding: 1rem;
          border-radius: 0.75rem;
          margin-bottom: 1rem;
        }

        .rewrite-block {
          background: var(--surface-container);
          padding: 1rem;
          border-radius: 0.75rem;
          border-left: 3px solid var(--primary);
        }

        .block-label {
          font-size: 0.7rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--on-surface-variant);
          display: block;
          margin-bottom: 0.5rem;
        }

        .block-label.highlight {
          color: var(--primary);
        }

        .block-text {
          font-size: 0.95rem;
          line-height: 1.5;
          color: var(--on-surface-variant);
          font-style: italic;
        }

        .block-text.highlight {
          color: var(--primary);
          font-weight: 500;
          font-style: normal;
        }

        .card-description {
          font-size: 0.95rem;
          line-height: 1.6;
          color: var(--on-surface-variant);
        }

        /* Improvement List */
        .improvement-list {
          padding-left: 1.5rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .improvement-list li {
          font-size: 1rem;
          line-height: 1.6;
          color: var(--on-surface-variant);
        }

        .improvement-list li::marker {
          color: var(--primary);
          font-weight: 700;
        }

        /* Transcript Row */
        .interactive-row {
          background: var(--surface-container-low);
          border: 1px solid var(--outline-variant);
          transition: all 0.2s ease;
          margin-bottom: 1rem;
        }

        .interactive-row:hover {
          background: var(--surface-container);
          transform: scale(1.01);
          box-shadow: var(--shadow-sm);
        }

        @media (max-width: 768px) {
          .sidebar { display: none; }
          .main-content { margin-left: 0; padding: 2rem 1.25rem 6rem; width: 100vw; }
          .coaching-grid { grid-template-columns: 1fr; }
        }

        /* ═══════════════════════════════════
           Print Styles (Download as PDF)
           ═══════════════════════════════════ */
        @media print {
          .no-print, .sidebar, .tab-switcher, .sidebar-cta, .sidebar-nav, .sidebar-footer {
            display: none !important;
          }
          
          .dashboard-layout {
            background: white !important;
            display: block;
          }
          
          .main-content {
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
          }
          
          .glass-card, .layered-card, .metric-box, .dimension-item, .answer-block, .rewrite-block {
            break-inside: avoid;
            background: white !important;
            border: 1px solid #ddd !important;
            box-shadow: none !important;
            color: black !important;
          }
          
          .text-gradient {
            background: none !important;
            color: black !important;
            -webkit-text-fill-color: black !important;
          }
          
          .circle-bg {
            stroke: #eee !important;
          }
          
          h1, h2, h3, h4, p, span {
            color: black !important;
          }
          
          .hero-bg-decoration {
            display: none !important;
          }

          .hero-card {
            padding: 1.5rem !important;
            margin-bottom: 2rem !important;
            break-inside: avoid;
          }
          
          .metrics-grid, .behavioral-metrics-grid, .dimensions-list, .coaching-grid {
            gap: 1rem !important;
            page-break-inside: avoid;
          }
          
          .dimension-bar {
            background: #eee !important;
          }
          
          /* Prevent page breaks inside important sections */
          section {
            page-break-inside: avoid;
            margin-bottom: 2rem !important;
          }
        }
      `}</style>
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
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
