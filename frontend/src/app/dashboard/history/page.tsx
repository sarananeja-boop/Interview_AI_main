"use client";
import SettingsModal from "@/app/components/SettingsModal";
import ThemeToggle from "../../components/ThemeToggle";
import Logo from "@/app/components/Logo";
import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isAuthenticated, listInterviewHistory, ensureAuth, deleteInterview, deleteAllInterviews, logout } from "@/lib/api";

interface InterviewRecord {
  id: string;
  status: string;
  interview_type: string;
  target_iim?: string;
  started_at: string;
  ended_at?: string;
  persona: string;
  overall_score?: number;
  overall_assessment?: string;
  panel_perception?: string;
}

const PERSONA_DISPLAY_NAMES: Record<string, string> = {
  iim_a: "IIM Ahmedabad",
  iim_b: "IIM Bangalore",
  iim_c: "IIM Calcutta",
  iim_l: "IIM Lucknow",
  iim_general: "General IIM",
};

const TYPE_DISPLAY_NAMES: Record<string, string> = {
  iim_general: "General Mock Interview",
  stress: "Stress Interview",
  technical: "Technical Interview",
};

type FilterType = "all" | "practice" | "completed" | "in_progress";

function getStatusLabel(interview: InterviewRecord): string {
  if (interview.status !== "completed") return "In Progress";
  if (interview.overall_score != null && interview.overall_score >= 8) return "Mastered";
  if (interview.overall_score != null && interview.overall_score < 5) return "Practice Needed";
  return "Completed";
}

function getStatusClass(interview: InterviewRecord): string {
  if (interview.status !== "completed") return "status-in-progress";
  if (interview.overall_score != null && interview.overall_score >= 8) return "status-mastered";
  if (interview.overall_score != null && interview.overall_score < 5) return "status-practice";
  return "status-completed";
}

function truncate(str: string | undefined | null, len: number): string {
  if (!str) return "";
  if (str.length <= len) return str;
  return str.slice(0, len).trimEnd() + "…";
}

function getDuration(start: string, end?: string | null): string {
  if (!end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "<1 min";
  return `${mins} min`;
}

export default function HistoryPage() {
  const router = useRouter();
  const [interviews, setInterviews] = useState<InterviewRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");

  useEffect(() => {
    async function init() {
      await ensureAuth();
      listInterviewHistory()
        .then((data) => setInterviews(data))
        .catch(console.error)
        .finally(() => setLoading(false));
    }
    init();
  }, [router]);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this interview and its evaluation?")) return;
    setDeletingId(id);
    try {
      await deleteInterview(id);
      setInterviews((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      console.error(err);
      alert("Failed to delete interview.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm("Are you sure you want to delete ALL your interview sessions and evaluations? This action cannot be undone.")) return;
    setDeletingId("all");
    try {
      await deleteAllInterviews();
      setInterviews([]);
    } catch (err) {
      console.error(err);
      alert("Failed to delete all interviews.");
    } finally {
      setDeletingId(null);
    }
  };

  const filteredInterviews = useMemo(() => {
    if (activeFilter === "all") return interviews;
    return interviews.filter((i) => {
      const label = getStatusLabel(i);
      if (activeFilter === "practice") return label === "Practice Needed";
      if (activeFilter === "completed") return label === "Completed" || label === "Mastered";
      if (activeFilter === "in_progress") return label === "In Progress";
      return true;
    });
  }, [interviews, activeFilter]);

  const filterCounts = useMemo(() => {
    const counts = { all: interviews.length, practice: 0, completed: 0, in_progress: 0 };
    interviews.forEach((i) => {
      const label = getStatusLabel(i);
      if (label === "Practice Needed") counts.practice++;
      else if (label === "Completed" || label === "Mastered") counts.completed++;
      else if (label === "In Progress") counts.in_progress++;
    });
    return counts;
  }, [interviews]);

  return (
    <div className="dashboard-layout">
      {/* ── Sidebar ── */}
      <nav className="sidebar">
        <div className="sidebar-header" style={{ marginBottom: "1rem", paddingLeft: "0.5rem" }}>
          <Logo width={36} height={36} showText={true} />
        </div>

        <button className="sidebar-cta" onClick={() => router.push("/interview/setup")}>
          <span className="material-symbols-outlined filled" style={{ fontSize: 18 }}>add</span>
          New Mock Interview
        </button>

        <div className="sidebar-nav">
          <div className="sidebar-nav-label">Menu</div>
          <Link className="nav-item" href="/dashboard">
            <span className="material-symbols-outlined filled" style={{ fontSize: 20 }}>space_dashboard</span>
            Dashboard
          </Link>
          

          <Link className="nav-item" href="/interview/setup">
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>psychology</span>
            New Interview
          </Link>
          <Link className="nav-item nav-item-active" href="/dashboard/history">
            <span className="material-symbols-outlined filled" style={{ fontSize: 20 }}>history_edu</span>
            Interview History
          </Link>
        </div>

        <div className="sidebar-footer">
          <button className="nav-item logout-btn" onClick={logout}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>logout</span>
            Log Out
          </button>
        </div>
      </nav>

      {/* ── Main Content ── */}
      <main className="main-content">
        <header className="page-header">
          <div>
            <h1 className="page-title">Interview History</h1>
            <p className="page-subtitle">Review your past sessions, scores, and feedback.</p>
          </div>
          <div className="header-actions" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {interviews.length > 0 && (
              <button 
                className="action-btn delete-all-btn" 
                onClick={handleDeleteAll}
                disabled={deletingId === "all"}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete_sweep</span>
                Delete All
              </button>
            )}
            <div className="header-stat">
              <span className="stat-number">{interviews.length}</span>
              <span className="stat-label">Total Sessions</span>
            </div>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <ThemeToggle />
              <button 
                className="settings-top-btn" 
                onClick={() => setIsSettingsOpen(true)}
                title="Control Center Settings"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 24 }}>settings</span>
              </button>
            </div>
          </div>
        </header>

        {/* ── Filter Bar ── */}
        <div className="filter-bar">
          {([
            { key: "all" as FilterType, label: "All", icon: "list" },
            { key: "practice" as FilterType, label: "Practice Needed", icon: "warning" },
            { key: "completed" as FilterType, label: "Completed", icon: "check_circle" },
            { key: "in_progress" as FilterType, label: "In Progress", icon: "pending" },
          ]).map(({ key, label, icon }) => (
            <button
              key={key}
              className={`filter-btn ${activeFilter === key ? "filter-active" : ""}`}
              onClick={() => setActiveFilter(key)}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{icon}</span>
              {label}
              <span className="filter-count">{filterCounts[key]}</span>
            </button>
          ))}
        </div>

        {/* ── Content ── */}
        {loading ? (
          <div className="loading-state">
            <div className="spinner" />
            <p className="loading-text">Loading sessions…</p>
          </div>
        ) : filteredInterviews.length === 0 ? (
          <div className="empty-state">
            <span className="material-symbols-outlined" style={{ fontSize: 40, color: "var(--outline)", marginBottom: "0.75rem" }}>
              {activeFilter === "all" ? "history_toggle_off" : "filter_list_off"}
            </span>
            <h3 className="empty-title">
              {activeFilter === "all" ? "No Sessions Yet" : "No Matching Sessions"}
            </h3>
            <p className="empty-sub">
              {activeFilter === "all"
                ? "Complete a mock interview to start building your history."
                : "No sessions match the selected filter. Try a different one."}
            </p>
            {activeFilter === "all" && (
              <button className="start-btn" onClick={() => router.push("/interview/setup")}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>play_arrow</span>
                Start an Interview
              </button>
            )}
          </div>
        ) : (
          <div className="sessions-list">
            {filteredInterviews.map((interview) => {
              const statusLabel = getStatusLabel(interview);
              const statusClass = getStatusClass(interview);
              return (
                <div key={interview.id} className="session-card">
                  <div className="session-left">
                    {/* Score circle */}
                    <div className={`score-circle ${statusClass}`}>
                      {interview.status === "completed" && interview.overall_score != null
                        ? interview.overall_score.toFixed(1)
                        : "—"}
                    </div>
                  </div>

                  <div className="session-middle">
                    <div className="session-top-row">
                      <h3 className="session-title">
                        {PERSONA_DISPLAY_NAMES[interview.persona] || (interview.persona ? interview.persona.charAt(0).toUpperCase() + interview.persona.slice(1) : "IIM")} Panel
                      </h3>
                      <span className={`status-pill ${statusClass}`}>{statusLabel}</span>
                    </div>

                    <div className="session-meta">
                      <span className="meta-item">
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>calendar_today</span>
                        {new Date(interview.started_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                      <span className="meta-item">
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>schedule</span>
                        {getDuration(interview.started_at, interview.ended_at)}
                      </span>
                      <span className="meta-item">
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>category</span>
                        {TYPE_DISPLAY_NAMES[interview.interview_type] || interview.interview_type || "Mock Interview"}
                      </span>
                    </div>

                    {/* Summary line */}
                    {interview.overall_assessment && (
                      <p className="session-summary">
                        <span className="summary-label">Summary:</span> {truncate(interview.overall_assessment, 120)}
                      </p>
                    )}

                    {/* Review line */}
                    {interview.panel_perception && (
                      <p className="session-review">
                        <span className="review-label">Panel Review:</span> {truncate(interview.panel_perception, 120)}
                      </p>
                    )}
                  </div>

                  <div className="session-right">
                    {interview.status === "completed" ? (
                      <button
                        className="action-btn view-btn"
                        onClick={() => router.push(`/interview/review?id=${interview.id}`)}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>visibility</span>
                        View Evaluation
                      </button>
                    ) : (
                      <button
                        className="action-btn resume-btn"
                        onClick={() => router.push(`/interview/live?id=${interview.id}`)}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>play_arrow</span>
                        Resume
                      </button>
                    )}
                    <button
                      className="action-btn delete-btn"
                      onClick={() => handleDelete(interview.id)}
                      disabled={deletingId === interview.id}
                      title="Delete session"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <style jsx>{`
        /* ═══════════════════════════════════
           Layout
           ═══════════════════════════════════ */
        .dashboard-layout {
          display: flex;
          min-height: 100vh;
          background-color: var(--background);
          background-image:
            radial-gradient(at 0% 0%, rgba(21, 69, 57, 0.03) 0px, transparent 50%),
            radial-gradient(at 100% 100%, rgba(21, 69, 57, 0.04) 0px, transparent 50%);
          background-attachment: fixed;
          width: 100vw;
          min-width: 100vw;
          overflow-x: hidden;
        }

        /* ═══════════════════════════════════
           Sidebar
           ═══════════════════════════════════ */
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

        .sidebar-nav-divider {
          height: 1px;
          background: rgba(0, 0, 0, 0.06);
          margin: 0.5rem 0.75rem;
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
          background: rgba(21, 69, 57, 0.08);
          color: var(--primary);
          font-weight: 600;
        }

        .sidebar-footer {
          margin-top: auto;
          padding: 0.75rem 0.5rem 0;
          border-top: 1px solid rgba(0, 0, 0, 0.06);
        }

        .logout-btn {
          color: var(--on-surface-variant);
          font-size: 0.8rem;
          padding: 0.5rem 0.75rem;
        }

        .logout-btn:hover {
          color: var(--error);
          background: rgba(239, 68, 68, 0.06);
        }

        /* ═══════════════════════════════════
           Main Content
           ═══════════════════════════════════ */
        .main-content {
          margin-left: var(--sidebar-width, 260px);
          padding: 2.5rem 4rem 4rem 3rem;
          width: calc(100vw - 260px);
        }

        /* ── Page Header ── */
        .page-header {
          display: flex;
          justify-content: space-between;
          padding: 1.75rem;
          margin-bottom: 1.5rem;
          animation: slideUp 0.6s ease-out both;
          box-shadow: var(--shadow-md);
          transition: all var(--transition-base);
        }

        .page-title {
          font-family: var(--font-display);
          font-size: 2rem;
          font-weight: 600;
          letter-spacing: -0.025em;
          color: var(--on-background);
          line-height: 1.2;
          margin-bottom: 0.25rem;
        }

        .page-subtitle {
          font-size: 0.95rem;
          color: var(--outline);
          font-weight: 400;
        }

        .header-stat {
          display: flex;
          flex-direction: column;
          align-items: center;
          background: var(--surface);
          border: 1px solid var(--border-subtle);
          border-radius: 12px;
          padding: 0.75rem 1.5rem;
          flex-shrink: 0;
        }

        .stat-number {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--primary);
          line-height: 1;
        }

        .stat-label {
          font-size: 0.65rem;
          font-weight: 500;
          color: var(--outline);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-top: 0.25rem;
        }

        .settings-top-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          border-radius: 50%;
          border: 1px solid var(--border-subtle);
          background: var(--surface);
          color: var(--on-surface-variant);
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: var(--shadow-sm);
        }
        
        .settings-top-btn:hover {
          background: var(--surface-variant);
          color: var(--on-surface);
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
        }

        /* ── Filter Bar ── */
        .filter-bar {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1.5rem;
          flex-wrap: wrap;
          animation: fadeIn 0.5s ease-out 0.1s both;
        }

        .filter-btn {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.5rem 1rem;
          border: 1px solid var(--border-subtle);
          border-radius: 8px;
          font-family: var(--font-sans);
          font-size: 0.8rem;
          font-weight: 500;
          color: var(--on-surface-variant);
          background: var(--surface);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .filter-btn:hover {
          border-color: rgba(0, 0, 0, 0.15);
          color: var(--on-surface);
        }

        .filter-active {
          background: var(--primary);
          color: white;
          border-color: var(--primary);
        }

        .filter-active:hover {
          background: var(--primary-container);
          border-color: var(--primary-container);
          color: white;
        }

        .filter-count {
          font-size: 0.7rem;
          font-weight: 600;
          background: rgba(0, 0, 0, 0.06);
          padding: 0.1rem 0.4rem;
          border-radius: 4px;
          min-width: 1.2rem;
          text-align: center;
        }

        .filter-active .filter-count {
          background: rgba(255, 255, 255, 0.2);
        }

        /* ── Sessions List ── */
        .sessions-list {
          display: flex;
          flex-direction: column;
          gap: 0.625rem;
          animation: slideUp 0.6s ease-out 0.15s both;
        }

        .session-card {
          display: flex;
          align-items: stretch;
          gap: 1.25rem;
          padding: 1.25rem 1.5rem;
          background: var(--surface);
          border: 1px solid var(--border-subtle);
          border-radius: 12px;
          transition: all 0.2s ease;
        }

        .session-card:hover {
          border-color: rgba(0, 0, 0, 0.1);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
        }

        /* Score Circle */
        .session-left {
          display: flex;
          align-items: center;
          flex-shrink: 0;
        }

        .score-circle {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.95rem;
          font-weight: 700;
          font-family: var(--font-sans);
          flex-shrink: 0;
        }

        .score-circle.status-completed {
          background: rgba(21, 69, 57, 0.08);
          color: var(--primary);
        }

        .score-circle.status-mastered {
          background: rgba(16, 185, 129, 0.1);
          color: #059669;
        }

        .score-circle.status-practice {
          background: rgba(239, 68, 68, 0.08);
          color: #dc2626;
        }

        .score-circle.status-in-progress {
          background: rgba(245, 158, 11, 0.1);
          color: #d97706;
        }

        /* Middle Content */
        .session-middle {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
        }

        .session-top-row {
          display: flex;
          align-items: center;
          gap: 0.625rem;
          flex-wrap: wrap;
        }

        .session-title {
          font-family: var(--font-display);
          font-size: 1rem;
          font-weight: 600;
          color: var(--on-surface);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .status-pill {
          font-size: 0.6rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          padding: 0.2rem 0.5rem;
          border-radius: 4px;
          flex-shrink: 0;
        }

        .status-pill.status-completed {
          background: rgba(21, 69, 57, 0.08);
          color: var(--primary);
        }

        .status-pill.status-mastered {
          background: rgba(16, 185, 129, 0.1);
          color: #059669;
        }

        .status-pill.status-practice {
          background: rgba(239, 68, 68, 0.08);
          color: #dc2626;
        }

        .status-pill.status-in-progress {
          background: rgba(245, 158, 11, 0.1);
          color: #d97706;
        }

        .session-meta {
          display: flex;
          align-items: center;
          gap: 1rem;
          flex-wrap: wrap;
        }

        .meta-item {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.73rem;
          color: var(--outline);
          font-weight: 500;
        }

        .session-summary,
        .session-review {
          font-size: 0.8rem;
          color: var(--on-surface-variant);
          line-height: 1.4;
          margin: 0;
        }

        .summary-label,
        .review-label {
          font-weight: 600;
          color: var(--on-surface);
          font-size: 0.75rem;
        }

        .session-review {
          color: var(--outline);
          font-style: italic;
        }

        .review-label {
          color: var(--outline);
          font-style: normal;
        }

        /* Right Actions */
        .session-right {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          flex-shrink: 0;
        }

        .action-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.45rem 0.875rem;
          border: none;
          border-radius: 8px;
          font-family: var(--font-sans);
          font-size: 0.78rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
        }

        .view-btn {
          background: rgba(21, 69, 57, 0.08);
          color: var(--primary);
        }

        .view-btn:hover {
          background: rgba(21, 69, 57, 0.14);
        }

        .resume-btn {
          background: var(--primary);
          color: white;
        }

        .resume-btn:hover {
          background: var(--primary-container);
        }

        .delete-btn {
          background: rgba(239, 68, 68, 0.06);
          color: var(--error);
          padding: 0.45rem 0.5rem;
        }

        .delete-btn:hover {
          background: rgba(239, 68, 68, 0.12);
        }

        .delete-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .delete-all-btn {
          background: rgba(239, 68, 68, 0.08);
          color: var(--error);
          padding: 0.6rem 1rem;
          border: 1px solid rgba(239, 68, 68, 0.2);
        }

        .delete-all-btn:hover {
          background: rgba(239, 68, 68, 0.15);
        }

        .delete-all-btn:disabled {
          opacity: 0.5;
          cursor: wait;
        }

        /* ── Empty / Loading ── */
        .loading-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          padding: 4rem 0;
        }

        .spinner {
          width: 32px;
          height: 32px;
          border: 3px solid rgba(21, 69, 57, 0.12);
          border-top-color: var(--primary);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .loading-text {
          font-family: var(--font-sans);
          color: var(--outline);
          font-weight: 500;
          font-size: 0.9rem;
        }

        .empty-state {
          background: var(--surface);
          border: 1px solid var(--border-subtle);
          border-radius: 16px;
          padding: 3rem 2rem;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .empty-title {
          font-family: var(--font-display);
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--on-background);
          margin-bottom: 0.375rem;
        }

        .empty-sub {
          font-size: 0.85rem;
          color: var(--outline);
          max-width: 360px;
          margin-bottom: 1.25rem;
        }

        .start-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.6rem 1.25rem;
          border: none;
          border-radius: 8px;
          background: var(--primary);
          color: var(--on-primary);
          font-family: var(--font-sans);
          font-size: 0.85rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .start-btn:hover {
          background: var(--primary-container);
        }

        /* ═══════════════════════════════════
           Responsive — Mobile
           ═══════════════════════════════════ */
        @media (max-width: 768px) {
          .sidebar {
            display: none;
          }

          .main-content {
            margin-left: 0;
            padding: 1.5rem 1.25rem 3rem;
            width: 100vw;
          }

          .page-header {
            flex-direction: column;
            gap: 1rem;
          }

          .page-title {
            font-size: 1.5rem;
          }

          .session-card {
            flex-direction: column;
            gap: 0.75rem;
          }

          .session-left {
            align-self: flex-start;
          }

          .session-right {
            width: 100%;
          }

          .view-btn,
          .resume-btn {
            flex: 1;
            justify-content: center;
          }

          .filter-bar {
            overflow-x: auto;
            flex-wrap: nowrap;
            -webkit-overflow-scrolling: touch;
          }

          .filter-btn {
            flex-shrink: 0;
          }
        }
      `}</style>
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
}
