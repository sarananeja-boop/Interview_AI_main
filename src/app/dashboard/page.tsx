"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated, getUser, logout, listProfiles, uploadResume } from "@/lib/api";

interface Profile {
  id: string;
  resume_filename: string;
  name: string;
  created_at: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [dragActive, setDragActive] = useState(false);

  const loadProfiles = useCallback(async () => {
    try {
      const data = await listProfiles();
      setProfiles(data);
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
  }, [router, loadProfiles]);

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

  return (
    <div className="dashboard">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="text-gradient" style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.1rem" }}>
            IIM Simulator
          </span>
        </div>
        <nav className="sidebar-nav">
          <a className="sidebar-link active" href="/dashboard">
            <span className="sidebar-icon">📊</span>
            Dashboard
          </a>
          <a className="sidebar-link" href="/interview/setup">
            <span className="sidebar-icon">🎤</span>
            New Interview
          </a>
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="user-avatar">{user.name?.[0] || "U"}</div>
            <div>
              <div style={{ fontSize: "0.85rem", fontWeight: 500 }}>{user.name}</div>
              <div className="text-dim" style={{ fontSize: "0.75rem" }}>{user.email}</div>
            </div>
          </div>
          <button className="btn btn-ghost" style={{ width: "100%", marginTop: "var(--space-sm)" }} onClick={logout}>
            Log Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="dashboard-main">
        <div className="dashboard-header">
          <div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>
              Welcome back, <span className="text-gradient">{user.name?.split(" ")[0]}</span>
            </h1>
            <p className="text-muted" style={{ marginTop: "var(--space-xs)" }}>Upload your resume and start a mock interview</p>
          </div>
        </div>

        {/* Upload Zone */}
        <div className="section-card">
          <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "var(--space-lg)" }}>
            📄 Upload Resume
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
                <p className="text-dim" style={{ fontSize: "0.8rem" }}>This may take 15-30 seconds</p>
              </div>
            ) : (
              <>
                <div style={{ fontSize: "2.5rem", marginBottom: "var(--space-md)" }}>📎</div>
                <p style={{ fontWeight: 500 }}>Drop your resume here or click to upload</p>
                <p className="text-dim" style={{ fontSize: "0.85rem", marginTop: "var(--space-xs)" }}>
                  PDF, DOCX, or TXT — max 10MB
                </p>
                <input
                  type="file"
                  accept=".pdf,.docx,.doc,.txt"
                  onChange={handleFileInput}
                  className="upload-input"
                  id="resume-upload"
                />
                <label htmlFor="resume-upload" className="btn btn-secondary" style={{ marginTop: "var(--space-md)" }}>
                  Choose File
                </label>
              </>
            )}
          </div>

          {uploadError && (
            <div className="auth-error" style={{ marginTop: "var(--space-md)" }}>{uploadError}</div>
          )}
        </div>

        {/* Profiles List */}
        {profiles.length > 0 && (
          <div className="section-card">
            <h2 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "var(--space-lg)" }}>
              📋 Your Profiles
            </h2>
            <div className="profiles-list">
              {profiles.map((p) => (
                <div key={p.id} className="profile-card card">
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{p.name || "Unnamed Profile"}</div>
                    <div className="text-dim" style={{ fontSize: "0.8rem", marginTop: 2 }}>
                      {p.resume_filename} • {new Date(p.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={() => router.push(`/interview/setup?profile=${p.id}`)}
                  >
                    Start Interview →
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <style jsx>{`
        .dashboard {
          display: flex;
          min-height: 100vh;
          background: var(--bg-primary);
        }

        .sidebar {
          width: 260px;
          background: var(--bg-secondary);
          border-right: var(--border-subtle);
          display: flex;
          flex-direction: column;
          padding: var(--space-lg);
          position: fixed;
          top: 0;
          bottom: 0;
          left: 0;
        }

        .sidebar-logo {
          padding: var(--space-sm) 0;
          margin-bottom: var(--space-xl);
        }

        .sidebar-nav {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: var(--space-xs);
        }

        .sidebar-link {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
          padding: 0.6rem 0.8rem;
          border-radius: var(--radius-md);
          color: var(--text-secondary);
          font-size: 0.9rem;
          transition: all var(--transition-fast);
        }

        .sidebar-link:hover {
          color: var(--text-primary);
          background: var(--bg-glass);
        }

        .sidebar-link.active {
          color: var(--text-primary);
          background: rgba(99, 102, 241, 0.1);
          border: 1px solid rgba(99, 102, 241, 0.2);
        }

        .sidebar-icon {
          font-size: 1.1rem;
        }

        .sidebar-footer {
          border-top: var(--border-subtle);
          padding-top: var(--space-md);
        }

        .sidebar-user {
          display: flex;
          align-items: center;
          gap: var(--space-sm);
        }

        .user-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: var(--gradient-hero);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          font-size: 0.85rem;
        }

        .dashboard-main {
          flex: 1;
          margin-left: 260px;
          padding: var(--space-2xl);
          max-width: 900px;
        }

        .dashboard-header {
          margin-bottom: var(--space-2xl);
        }

        .section-card {
          background: var(--bg-secondary);
          border: var(--border-subtle);
          border-radius: var(--radius-lg);
          padding: var(--space-xl);
          margin-bottom: var(--space-xl);
        }

        .upload-zone {
          border: 2px dashed rgba(255, 255, 255, 0.1);
          border-radius: var(--radius-lg);
          padding: var(--space-2xl);
          text-align: center;
          transition: all var(--transition-base);
          cursor: pointer;
          position: relative;
        }

        .upload-zone:hover,
        .upload-zone-active {
          border-color: var(--accent-primary);
          background: rgba(99, 102, 241, 0.05);
        }

        .upload-zone-uploading {
          border-color: var(--accent-primary);
          background: rgba(99, 102, 241, 0.03);
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
          gap: var(--space-sm);
        }

        .spinner {
          width: 32px;
          height: 32px;
          border: 3px solid rgba(99, 102, 241, 0.2);
          border-top-color: var(--accent-primary);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .profiles-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-md);
        }

        .profile-card {
          display: flex;
          align-items: center;
          gap: var(--space-lg);
          padding: var(--space-lg);
        }

        @media (max-width: 768px) {
          .sidebar {
            display: none;
          }
          .dashboard-main {
            margin-left: 0;
          }
        }
      `}</style>
    </div>
  );
}
