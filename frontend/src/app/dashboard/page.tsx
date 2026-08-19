"use client";

import SettingsModal from "@/app/components/SettingsModal";
import ThemeToggle from "@/app/components/ThemeToggle";
import Logo from "@/app/components/Logo";
import ActivityCalendar from "@/app/components/ActivityCalendar";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isAuthenticated, getUser, logout, listProfiles, uploadResume, listInterviewHistory, deleteProfile } from "@/lib/api";

interface Profile {
  id: string;
  resume_filename: string;
  name: string;
  created_at: string;
}

interface InterviewRecord {
  id: string;
  status: string;
  interview_type: string;
  started_at: string;
  overall_score?: number;
  persona: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [recentInterviews, setRecentInterviews] = useState<InterviewRecord[]>([]);
  const [activityData, setActivityData] = useState<Record<string, number>>({});
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const PERSONA_DISPLAY_NAMES: Record<string, string> = {
    iim_a: "IIM Ahmedabad",
    iim_b: "IIM Bangalore",
    iim_c: "IIM Calcutta",
    iim_l: "IIM Lucknow",
    iim_general: "General IIM",
  };

  const loadProfiles = useCallback(async () => {
    try {
      const data = await listProfiles();
      setProfiles(data);
    } catch {
      /* ignore */
    }
  }, []);

  const loadRecentInterviews = useCallback(async () => {
    try {
      const data = await listInterviewHistory();
      setRecentInterviews(data.slice(0, 3));
      
      const counts: Record<string, number> = {};
      data.forEach((interview: InterviewRecord) => {
        if (interview.started_at) {
          const date = new Date(interview.started_at);
          const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
          counts[dateStr] = (counts[dateStr] || 0) + 1;
        }
      });
      setActivityData(counts);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }
    setUser(getUser());
    loadProfiles();
    loadRecentInterviews();
  }, [router, loadProfiles, loadRecentInterviews]);

  const handleFileUpload = async (file: File) => {
    setUploadError("");
    setUploading(true);
    try {
      await uploadResume(file);
      await loadProfiles();
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteProfile = async (id: string) => {
    if (!confirm("Are you sure you want to delete this profile?")) return;
    try {
      await deleteProfile(id);
      await loadProfiles();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete profile");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  };

  if (!user) return null;

  const completedCount = recentInterviews.filter(i => i.status === "completed").length;

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
          <Link className="nav-item nav-item-active" href="/dashboard">
            <span className="material-symbols-outlined filled" style={{ fontSize: 20 }}>space_dashboard</span>
            Dashboard
          </Link>
          <Link className="nav-item" href="/dashboard/news">
            <span className="material-symbols-outlined filled" style={{ fontSize: 20 }}>article</span>
            Daily News
          </Link>
          <Link className="nav-item" href="/dashboard/personas">
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>folder_shared</span>
            Personas
          </Link>
          <Link className="nav-item" href="/interview/setup">
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>psychology</span>
            New Interview
          </Link>
          <Link className="nav-item" href="/dashboard/history">
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>history_edu</span>
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
            <h1 className="page-title">
              Welcome back, <span className="name-highlight">{user.name?.split(" ")[0]}</span>
            </h1>
            <p className="page-subtitle">Upload your resume and start a mock interview</p>
          </div>
          <div className="header-actions">
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



        {/* ── Upload Zone ── */}
        <div className="section-card">
          <h2 className="section-title">
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>upload_file</span>
            Upload Resume
          </h2>

          <div
            className={`upload-zone ${dragActive ? "upload-zone-active" : ""} ${uploading ? "upload-zone-uploading" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
          >
            {uploading ? (
              <div className="upload-loading">
                <div className="spinner" />
                <p>Parsing your resume with AI...</p>
                <p className="upload-hint">This may take 15-30 seconds</p>
              </div>
            ) : (
              <>
                <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 48, color: "var(--primary)" }}>cloud_upload</span>
                </div>
                <p style={{ fontWeight: 500, color: "var(--on-surface)" }}>Drop your resume here or click to upload</p>
                <p className="upload-hint">
                  PDF, DOCX, or TXT — max 10MB
                </p>
                <input
                  type="file"
                  accept=".pdf,.docx,.doc,.txt"
                  onChange={handleFileInput}
                  className="upload-input"
                  id="resume-upload"
                />
                <label htmlFor="resume-upload" className="upload-btn">
                  Choose File
                </label>
              </>
            )}
          </div>

          {uploadError && (
            <div className="error-msg">{uploadError}</div>
          )}
        </div>

        {/* ── Activity Calendar ── */}
        <div className="section-card">
          <h2 className="section-title">
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>calendar_month</span>
            Practice Consistency
          </h2>
          <ActivityCalendar data={activityData} weeks={52} />
        </div>

        {/* ── Profiles List ── */}
        {profiles.length > 0 && (
          <div className="section-card">
            <h2 className="section-title">
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>folder_open</span>
              Your Profiles
            </h2>
            <div className="profiles-list">
              {profiles.map((p) => (
                <div key={p.id} className="profile-card">
                  <div className="profile-icon">
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: "var(--primary)" }}>person</span>
                  </div>
                  <div className="profile-info">
                    <div className="profile-name">{p.name || "Unnamed Profile"}</div>
                    <div className="profile-meta">
                      {p.resume_filename} • {new Date(p.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="profile-actions" style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      className="delete-profile-btn"
                      onClick={() => handleDeleteProfile(p.id)}
                      style={{ background: 'transparent', border: '1px solid var(--error)', color: 'var(--error)', borderRadius: 'var(--radius-full)', padding: '0.5rem 1rem', display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', transition: 'all 0.2s' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--error)'; e.currentTarget.style.color = 'var(--on-error)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--error)' }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                      Delete
                    </button>
                    <button
                      className="start-interview-btn"
                      onClick={() => router.push(`/interview/setup?profile=${p.id}`)}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>play_arrow</span>
                      Start Interview
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Recent Activity ── */}
        {recentInterviews.length > 0 && (
          <div className="section-card">
            <div className="section-title-row">
              <h2 className="section-title">
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>schedule</span>
                Recent Activity
              </h2>
              <Link href="/dashboard/history" className="view-all-link">
                View All
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_forward</span>
              </Link>
            </div>
            <div className="recent-list">
              {recentInterviews.map((interview) => (
                <div key={interview.id} className="recent-item">
                  <div className={`recent-score ${interview.status === "completed" ? "score-completed" : "score-pending"}`}>
                    {interview.status === "completed" && interview.overall_score != null
                      ? interview.overall_score.toFixed(1)
                      : "—"}
                  </div>
                  <div className="recent-info">
                    <div className="recent-title">
                      {PERSONA_DISPLAY_NAMES[interview.persona] 
                        ? `${PERSONA_DISPLAY_NAMES[interview.persona]} Panel` 
                        : (interview.persona ? `${interview.persona.charAt(0).toUpperCase() + interview.persona.slice(1)} Panel` : "Mock Interview")}
                    </div>
                    <div className="recent-meta">
                      {new Date(interview.started_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      {" • "}
                      {interview.status === "completed" ? "Completed" : "In Progress"}
                    </div>
                  </div>
                  <button
                    className="recent-action-btn"
                    onClick={() => router.push(
                      interview.status === "completed"
                        ? `/interview/review?id=${interview.id}`
                        : `/interview/live?id=${interview.id}`
                    )}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                      {interview.status === "completed" ? "visibility" : "play_arrow"}
                    </span>
                  </button>
                </div>
              ))}
            </div>
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
          background: color-mix(in srgb, var(--on-surface) 3%, transparent);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border-right: 1px solid color-mix(in srgb, var(--on-surface) 10%, transparent);
        }

        .sidebar-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding-left: 0.5rem;
          margin-bottom: 1.5rem;
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
          align-items: flex-start;
          margin-bottom: 2rem;
          animation: fadeIn 0.5s ease-out both;
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

        .name-highlight {
          color: var(--primary);
        }

        .page-subtitle {
          font-size: 0.95rem;
          color: var(--outline);
          font-weight: 400;
        }

        .header-actions {
          display: flex;
          gap: 1rem;
          align-items: center;
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



        /* ── Section Cards ── */
        .section-card {
          background: color-mix(in srgb, var(--on-surface) 5%, transparent);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid color-mix(in srgb, var(--on-surface) 10%, transparent);
          border-radius: 16px;
          padding: 1.75rem;
          margin-bottom: 1.5rem;
          animation: slideUp 0.6s ease-out both;
          box-shadow: var(--shadow-md);
          transition: all var(--transition-base);
        }
        
        .section-card:hover {
          border-color: rgba(255, 255, 255, 0.1);
          box-shadow: var(--shadow-lg);
        }

        .section-card:nth-child(3) { animation-delay: 0.15s; }
        .section-card:nth-child(4) { animation-delay: 0.2s; }
        .section-card:nth-child(5) { animation-delay: 0.25s; }

        .section-title {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-family: var(--font-display);
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--on-background);
          margin-bottom: 1.25rem;
        }

        .section-title-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .view-all-link {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.8rem;
          font-weight: 500;
          color: var(--primary);
          text-decoration: none;
          transition: all 0.15s ease;
        }

        .view-all-link:hover {
          color: var(--primary-container);
        }

        /* ── Upload Zone ── */
        .upload-zone {
          border: 2px dashed color-mix(in srgb, var(--on-surface) 15%, transparent);
          border-radius: 12px;
          padding: 2.5rem;
          text-align: center;
          transition: all 0.2s ease;
          cursor: pointer;
          position: relative;
          background: color-mix(in srgb, var(--on-surface) 2%, transparent);
        }

        .upload-zone:hover,
        .upload-zone-active {
          border-color: var(--primary);
          background: rgba(21, 69, 57, 0.04);
        }

        .upload-zone-uploading {
          border-color: var(--primary);
          background: rgba(21, 69, 57, 0.03);
          cursor: wait;
        }

        .upload-input {
          position: absolute;
          inset: 0;
          opacity: 0;
          cursor: pointer;
        }

        .upload-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
        }

        .upload-hint {
          font-size: 0.8rem;
          color: var(--outline);
          margin-top: 0.25rem;
        }

        .upload-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.6rem 1.25rem;
          background: var(--primary);
          color: var(--on-primary);
          border: none;
          border-radius: 8px;
          font-family: var(--font-sans);
          font-size: 0.85rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
          margin-top: 1rem;
        }

        .upload-btn:hover {
          background: var(--primary-container);
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

        .error-msg {
          margin-top: 0.75rem;
          padding: 0.625rem 1rem;
          background: rgba(239, 68, 68, 0.06);
          border: 1px solid rgba(239, 68, 68, 0.15);
          border-radius: 8px;
          color: var(--error);
          font-size: 0.85rem;
          font-weight: 500;
        }

        /* ── Profiles ── */
        .profiles-list {
          display: flex;
          flex-direction: column;
          gap: 0.625rem;
        }

        .profile-card {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem 1.25rem;
          border: 1px solid color-mix(in srgb, var(--on-surface) 10%, transparent);
          border-radius: 10px;
          transition: all 0.15s ease;
        }

        .profile-card:hover {
          border-color: color-mix(in srgb, var(--on-surface) 20%, transparent);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
          background: color-mix(in srgb, var(--on-surface) 2%, transparent);
        }

        .profile-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: rgba(21, 69, 57, 0.06);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .profile-info {
          flex: 1;
          min-width: 0;
        }

        .profile-name {
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--on-surface);
        }

        .profile-meta {
          font-size: 0.75rem;
          color: var(--outline);
          margin-top: 2px;
        }

        .start-interview-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.3rem;
          padding: 0.5rem 1rem;
          background: rgba(21, 69, 57, 0.08);
          color: var(--primary);
          border: none;
          border-radius: 8px;
          font-family: var(--font-sans);
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
          white-space: nowrap;
        }

        .start-interview-btn:hover {
          background: rgba(21, 69, 57, 0.14);
        }

        /* ── Recent Activity ── */
        .recent-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .recent-item {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.875rem 1rem;
          border: 1px solid var(--border-subtle);
          border-radius: 10px;
          transition: all 0.15s ease;
        }

        .recent-item:hover {
          border-color: rgba(0, 0, 0, 0.1);
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03);
        }

        .recent-score {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.85rem;
          font-weight: 700;
          flex-shrink: 0;
        }

        .score-completed {
          background: rgba(21, 69, 57, 0.08);
          color: var(--primary);
        }

        .score-pending {
          background: rgba(245, 158, 11, 0.1);
          color: #d97706;
        }

        .recent-info {
          flex: 1;
          min-width: 0;
        }

        .recent-title {
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--on-surface);
        }

        .recent-meta {
          font-size: 0.73rem;
          color: var(--outline);
          margin-top: 2px;
        }

        .recent-action-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: 8px;
          border: 1px solid var(--border-subtle);
          background: var(--surface);
          color: var(--primary);
          cursor: pointer;
          transition: all 0.15s ease;
          flex-shrink: 0;
        }

        .recent-action-btn:hover {
          background: rgba(21, 69, 57, 0.06);
          border-color: rgba(21, 69, 57, 0.15);
        }

        /* ═══════════════════════════════════
           Animations
           ═══════════════════════════════════ */
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
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

          .stats-row {
            flex-direction: column;
          }

          .profile-card {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.75rem;
          }

          .start-interview-btn {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
}
