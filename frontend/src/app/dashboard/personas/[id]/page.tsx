"use client";

import SettingsModal from "@/app/components/SettingsModal";
import ThemeToggle from "@/app/components/ThemeToggle";
import Logo from "@/app/components/Logo";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isAuthenticated, getUser, logout, listProfiles, uploadResume, deleteProfile, pasteResume, setActiveProfileId } from "@/lib/api";

export default function PersonaDetailsPage() {
  const router = useRouter();
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [activeTab, setActiveTab] = useState<"upload" | "paste">("upload");
  const [pasteText, setPasteText] = useState("");
  const [pasteName, setPasteName] = useState("");

  const loadProfiles = useCallback(async () => {
    try {
      const data = await listProfiles();
      setProfiles(data);
    } catch { }
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
    if (profiles.length >= 5) {
      setUploadError("Maximum 5 personas allowed.");
      return;
    }
    setUploadError(""); setUploading(true);
    try { await uploadResume(file); await loadProfiles(); } 
    catch (err: any) { setUploadError(err.message); } 
    finally { setUploading(false); }
  };
  const handleDrop = (e: any) => { e.preventDefault(); setDragActive(false); const f = e.dataTransfer.files[0]; if(f) handleFileUpload(f); };
  const handleFileInput = (e: any) => { const f = e.target.files?.[0]; if(f) handleFileUpload(f); };
  const handlePasteSubmit = async () => {
    if (profiles.length >= 5) { setUploadError("Maximum 5 personas allowed."); return; }
    if (!pasteText.trim()) { setUploadError("Paste text first."); return; }
    setUploadError(""); setUploading(true);
    try { await pasteResume(pasteText, pasteName || "Pasted Resume"); setPasteText(""); setPasteName(""); await loadProfiles(); }
    catch (err: any) { setUploadError(err.message); }
    finally { setUploading(false); }
  };
  const handleDeleteProfile = async (id: string) => {
    if (!window.confirm("Delete persona?")) return;
    try { await deleteProfile(id); await loadProfiles(); } catch (err: any) { alert(err.message); }
  };

    if (!user) return null;

  return (
    <div className="dashboard-layout">
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
      
        .setup-page {
          min-height: 100vh;
          background: var(--background);
          position: relative;
        }

        /* Main Content */
        .main-content {
          position: relative;
          z-index: 10;
          padding-top: 8rem;
          padding-bottom: var(--section-gap);
          padding-left: var(--margin-mobile);
          padding-right: var(--margin-mobile);
        }

        /* Page Header */
        .page-header {
          position: relative;
          text-align: center;
          margin-bottom: 3rem;
        }

        .step-label {
          font-family: var(--font-sans);
          font-size: var(--text-label-caps);
          font-weight: 600;
          color: var(--outline);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-bottom: 1rem;
          display: block;
        }

        .page-title {
          font-family: var(--font-display);
          font-size: var(--text-display-lg-mobile);
          font-weight: 500;
          color: var(--on-background);
          letter-spacing: -0.01em;
          line-height: 48px;
          margin-bottom: 1rem;
        }

        .page-subtitle {
          font-family: var(--font-sans);
          font-size: var(--text-body-lg);
          line-height: 28px;
          color: var(--on-surface-variant);
          max-width: 640px;
          margin: 0 auto;
        }

        /* Profile Summary */
        .profile-summary {
          border-radius: var(--radius-xl);
          padding: var(--space-xl) var(--space-xl);
          margin-bottom: 3rem;
        }

        .profile-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: var(--space-lg);
        }

        .profile-icon {
          font-size: 24px;
          color: var(--primary);
          background: var(--primary-fixed);
          padding: 8px;
          border-radius: var(--radius-lg);
        }

        .profile-title {
          font-family: var(--font-display);
          font-size: var(--text-headline-md);
          font-weight: 500;
          color: var(--on-surface);
        }

        .profile-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--space-lg);
          margin-bottom: var(--space-md);
        }

        .profile-field {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .field-label {
          font-family: var(--font-sans);
          font-size: var(--text-label-caps);
          font-weight: 600;
          color: var(--outline);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .label-icon {
          font-size: 16px;
        }

        .warning-icon {
          color: var(--accent-warning);
        }

        .field-value {
          font-family: var(--font-sans);
          font-size: var(--text-body-md);
          font-weight: 500;
          color: var(--on-surface);
          line-height: 24px;
        }

        .profile-section {
          margin-top: var(--space-lg);
          padding-top: var(--space-lg);
          border-top: 1px solid rgba(192, 200, 196, 0.3);
        }

        .education-list {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-top: 8px;
        }

        .education-item {
          font-size: var(--text-body-md);
          font-weight: 500;
          color: var(--on-surface);
          line-height: 24px;
        }

        .pressure-points-list {
          margin-top: 8px;
          padding-left: 1.25rem;
          list-style: disc;
        }

        .pressure-point-item {
          font-size: var(--text-body-md);
          color: var(--on-surface-variant);
          line-height: 24px;
          margin-bottom: 4px;
        }

        /* Persona Grid */
        .persona-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
          gap: 2rem;
          margin-bottom: 2rem;
        }

        /* Institute Card */
        .institute-card {
          display: flex;
          flex-direction: column;
          background: var(--surface);
          border-radius: 12px;
          overflow: hidden;
          border: 1px solid var(--border-subtle);
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .institute-card:hover {
          transform: translateY(-4px);
          box-shadow: 0px 20px 60px rgba(37, 37, 37, 0.08);
        }

        .institute-card:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: 4px;
        }

        .institute-selected {
          border-color: var(--primary) !important;
          box-shadow: 0 0 0 2px var(--primary), 0px 20px 60px rgba(21, 69, 57, 0.12) !important;
        }

        /* Card Gradient Header Area */
        .card-image-area {
          position: relative;
          height: 200px;
          width: 100%;
          overflow: hidden;
        }

        .card-gradient-bg {
          position: absolute;
          inset: 0;
          background: var(--gradient-hero);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }

        .institute-card:hover .card-gradient-bg {
          transform: scale(1.05);
        }

        .card-overlay {
          position: absolute;
          inset: 0;
          background: linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 60%);
        }

        .card-header-content {
          position: absolute;
          bottom: 1.25rem;
          left: 1.25rem;
          right: 1.25rem;
        }

        .card-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 12px;
          border-radius: var(--radius-full);
          background: rgba(255, 255, 255, 0.9);
          backdrop-filter: blur(8px);
          font-size: var(--text-label-caps);
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--primary);
          margin-bottom: 0.5rem;
        }

        .badge-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--primary);
        }

        .card-name {
          font-family: var(--font-display);
          font-size: var(--text-headline-lg);
          font-weight: 500;
          color: #ffffff;
          line-height: 40px;
        }

        .selected-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          margin-top: 8px;
          padding: 4px 10px;
          border-radius: var(--radius-full);
          background: rgba(188, 237, 220, 0.9);
          color: var(--primary);
          font-size: var(--text-label-caps);
          font-weight: 600;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        .selected-check {
          font-size: 14px;
        }

        /* Layout */
        .dashboard-layout {
          display: flex;
          min-height: 100vh;
          background: var(--background);
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
          padding: 1rem 0.5rem;
          border-top: 1px solid var(--border-subtle);
        }

        .logout-btn:hover {
          color: var(--error);
        }

        .main-content {
          margin-left: var(--sidebar-width, 260px);
          padding: 2.5rem 4rem 6rem;
          width: calc(100vw - var(--sidebar-width, 260px));
        }

        /* Card Body */
        .card-body {
          padding: 1.5rem;
          background: var(--surface);
          position: relative;
          z-index: 20;
        }

        .card-desc-row {
          display: flex;
          align-items: flex-start;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .desc-icon {
          color: var(--primary);
          font-size: 22px;
          margin-top: 2px;
          flex-shrink: 0;
        }

        .desc-label {
          font-size: var(--text-label-md);
          font-weight: 500;
          color: var(--on-background);
          margin-bottom: 2px;
        }

        .desc-text {
          font-size: var(--text-body-md);
          color: var(--on-surface);
          line-height: 24px;
        }

        /* Card Pressure */
        .card-pressure {
          margin-bottom: 1rem;
        }

        .pressure-label-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
        }

        .pressure-label-text {
          font-size: 12px;
          font-weight: 500;
          color: var(--outline);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .pressure-pct {
          font-size: 12px;
          font-weight: 600;
          color: var(--on-surface-variant);
        }

        .card-divider {
          height: 1px;
          width: 100%;
          background: var(--border-subtle);
          margin-bottom: 1rem;
        }

        .card-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .card-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .tag-pill {
          padding: 4px 12px;
          border-radius: var(--radius-full);
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .tag-blue { background: rgba(0, 100, 255, 0.1); color: #0064ff; }
        .tag-teal { background: rgba(0, 150, 150, 0.1); color: #009696; }

        .card-arrow {
          color: var(--primary);
          opacity: 0;
          transform: translateX(-10px);
          transition: all 0.3s ease;
        }

        .institute-card:hover .card-arrow {
          opacity: 1;
          transform: translateX(0);
        }

        .settings-top-btn {
          position: absolute;
          right: 0;
          top: 0;
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

        /* Candidate Details Section */
        .candidate-details-section {
          background: var(--surface);
          border: 1px solid var(--border-subtle);
          border-radius: 16px;
          padding: 2rem;
          margin-bottom: 2rem;
        }

        .section-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1.5rem;
        }

        .section-icon {
          font-size: 28px;
          color: var(--primary);
          background: var(--primary-fixed);
          padding: 10px;
          border-radius: 12px;
        }

        .section-title {
          font-family: var(--font-display);
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--on-surface);
          margin-bottom: 2px;
        }

        .section-subtitle {
          font-size: 0.85rem;
          color: var(--outline);
        }

        .details-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1.5rem;
          margin-bottom: 1.5rem;
        }

        .detail-field {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .detail-label {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--on-surface-variant);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .detail-input {
          padding: 0.75rem 1rem;
          border: 1px solid var(--border-subtle);
          border-radius: 10px;
          background: var(--background);
          color: var(--on-surface);
          font-family: var(--font-sans);
          font-size: 0.95rem;
          transition: border-color 0.2s ease;
        }

        .detail-input:focus {
          outline: none;
          border-color: var(--primary);
          box-shadow: 0 0 0 3px rgba(21, 69, 57, 0.1);
        }

        .detail-select {
          cursor: pointer;
          -webkit-appearance: none;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 12px center;
          padding-right: 2rem;
        }

        .interests-section {
          margin-top: 0.5rem;
        }

        .interests-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }

        .interest-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border: 1px solid var(--border-subtle);
          border-radius: 20px;
          background: var(--background);
          color: var(--on-surface-variant);
          font-family: var(--font-sans);
          font-size: 0.8rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .interest-chip:hover:not(:disabled) {
          border-color: var(--primary);
          color: var(--on-surface);
          background: var(--primary-fixed);
        }

        .interest-chip:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .interest-selected {
          border-color: var(--primary) !important;
          background: var(--primary-fixed) !important;
          color: var(--primary) !important;
          font-weight: 600;
        }

        .chip-icon {
          font-size: 18px;
        }

        .chip-check {
          font-size: 16px;
          color: var(--primary);
        }

        .custom-interest-row {
          display: flex;
          gap: 0.5rem;
          align-items: stretch;
        }

        .custom-interest-input {
          flex: 1;
        }

        .add-interest-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 0 1rem;
          border: 1px solid var(--primary);
          border-radius: 10px;
          background: var(--primary-fixed);
          color: var(--primary);
          font-family: var(--font-sans);
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          white-space: nowrap;
        }

        .add-interest-btn:hover:not(:disabled) {
          background: var(--primary);
          color: var(--on-primary);
        }

        .add-interest-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .custom-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          margin-top: 0.75rem;
        }

        .custom-tag {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 12px;
          background: var(--primary-fixed);
          color: var(--primary);
          border-radius: 20px;
          font-size: 0.8rem;
          font-weight: 500;
          text-transform: capitalize;
        }

        .remove-tag {
          display: flex;
          align-items: center;
          background: none;
          border: none;
          color: var(--primary);
          cursor: pointer;
          padding: 0;
          margin-left: 2px;
        }

        @media (max-width: 768px) {
          .details-grid {
            grid-template-columns: 1fr;
          }
        }

        /* CTA Button */
        .cta-button {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.75rem;
          width: 100%;
          max-width: 480px;
          margin: 2rem auto 0;
          padding: 1rem 2rem;
          background: var(--primary);
          color: var(--on-primary);
          border: none;
          border-radius: var(--radius-xl);
          font-family: var(--font-sans);
          font-size: 1rem;
          font-weight: 500;
          cursor: pointer;
          box-shadow: var(--shadow-button);
          transition: all var(--transition-smooth);
        }

        .cta-button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: var(--shadow-button-hover);
          background: var(--primary-container);
        }

        .cta-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          transform: none;
        }

        .cta-arrow {
          font-size: 20px;
          transition: transform var(--transition-base);
        }

        .cta-button:hover:not(:disabled) .cta-arrow {
          transform: translateX(4px);
        }

        /* Error */
        .auth-error {
          color: var(--error);
          background: var(--error-container);
          padding: var(--space-sm) var(--space-md);
          border-radius: var(--radius-md);
          font-size: 0.85rem;
          text-align: center;
          margin-top: var(--space-md);
        }

        /* Responsive */
        @media (min-width: 769px) {
          .nav-inner {
            padding-left: var(--margin-desktop);
            padding-right: var(--margin-desktop);
          }

          .main-content {
            padding-left: var(--margin-desktop);
            padding-right: var(--margin-desktop);
          }

          .page-title {
            font-size: var(--text-display-lg);
            line-height: 72px;
            letter-spacing: -0.02em;
          }

          .page-header {
            margin-bottom: 4rem;
          }

          .card-image-area {
            height: 260px;
          }
        }

        @media (max-width: 768px) {
          .persona-grid {
            grid-template-columns: 1fr;
          }

          .profile-grid {
            grid-template-columns: 1fr;
          }

          .card-image-area {
            height: 180px;
          }
        }
      `}</style>
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
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
            <span className="material-symbols-outlined filled" style={{ fontSize: 20 }}>space_dashboard</span>Dashboard
          </Link>
          <Link className="nav-item nav-item-active" href="/dashboard/personas">
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>folder_shared</span>Personas
          </Link>
          <Link className="nav-item" href="/interview/setup">
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>psychology</span>New Interview
          </Link>
          <Link className="nav-item" href="/dashboard/history">
            <span className="material-symbols-outlined filled" style={{ fontSize: 20 }}>history_edu</span>Interview History
          </Link>
        </div>
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <div className="user-avatar">{user.name?.[0] || "U"}</div>
            <div className="user-info">
              <div className="user-name">{user.name}</div>
              <div className="user-email">{user.email}</div>
            </div>
          </div>
          <button className="nav-item logout-btn" onClick={logout}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>logout</span>Log Out
          </button>
        </div>
      </nav>

      {/* ── Main Content ── */}
      <main className="main-content">
        <header className="hero-section" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 className="hero-heading">Manage Personas</h1>
            <p className="hero-subtitle">Upload and customize up to 5 Candidate Personas.</p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <ThemeToggle />
            <button className="settings-top-btn" onClick={() => setIsSettingsOpen(true)} title="Settings">
              <span className="material-symbols-outlined" style={{ fontSize: 24 }}>settings</span>
            </button>
          </div>
        </header>

        {/* ── Upload Section ── */}
        {profiles.length < 5 && (
          <section className="upload-card" style={{ marginTop: "2rem" }}>
            <div className="upload-card-header">
              <h3 className="upload-card-title">Add Persona from Resume</h3>
              <div className="tab-switcher">
                <button className={`tab-btn ${activeTab === "upload" ? "tab-active" : ""}`} onClick={() => setActiveTab("upload")}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>upload_file</span>Upload File
                </button>
                <button className={`tab-btn ${activeTab === "paste" ? "tab-active" : ""}`} onClick={() => setActiveTab("paste")}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>content_paste</span>Paste Text
                </button>
              </div>
            </div>

            {activeTab === "upload" ? (
              <div className={`upload-zone ${dragActive ? "upload-zone-active" : ""} ${uploading ? "upload-zone-uploading" : ""}`} onDragOver={(e) => { e.preventDefault(); setDragActive(true); }} onDragLeave={() => setDragActive(false)} onDrop={handleDrop}>
                {uploading ? (
                  <div className="upload-loading"><div className="spinner" /><p className="loading-text">Parsing...</p></div>
                ) : (
                  <>
                    <div className="upload-icon-wrap"><span className="material-symbols-outlined" style={{ fontSize: 40, color: "var(--primary)" }}>cloud_upload</span></div>
                    <p className="upload-main-text">Drop your resume here or click to upload</p>
                    <p className="upload-sub-text">PDF, DOCX, or TXT — max 10MB</p>
                    <input type="file" accept=".pdf,.docx,.doc,.txt" onChange={handleFileInput} className="upload-input" id="resume-upload" />
                    <label htmlFor="resume-upload" className="upload-btn"><span className="material-symbols-outlined" style={{ fontSize: 18 }}>folder_open</span>Choose File</label>
                  </>
                )}
              </div>
            ) : (
              <div className="paste-zone">
                {uploading ? (
                  <div className="upload-loading"><div className="spinner" /><p className="loading-text">Parsing...</p></div>
                ) : (
                  <div className="paste-form">
                    <input type="text" className="input" placeholder="Candidate Name" value={pasteName} onChange={(e) => setPasteName(e.target.value)} />
                    <textarea className="input" placeholder="Paste resume text..." rows={8} style={{ resize: "vertical", fontFamily: "var(--font-sans)", fontSize: "0.9rem" }} value={pasteText} onChange={(e) => setPasteText(e.target.value)} />
                    <button className="btn btn-primary paste-submit-btn" onClick={handlePasteSubmit}><span className="material-symbols-outlined" style={{ fontSize: 18 }}>play_arrow</span>Process Resume</button>
                  </div>
                )}
              </div>
            )}
            {uploadError && <div className="auth-error" style={{ marginTop: "var(--space-md)" }}>{uploadError}</div>}
          </section>
        )}

        {/* ── Profiles List ── */}
        <section className="profiles-section" style={{ marginTop: "3rem" }}>
          <div className="profiles-header">
              <div className="profiles-title-row">
                <span className="material-symbols-outlined" style={{ color: "var(--primary)", fontSize: 22 }}>
                  folder_shared
                </span>
                <h3 className="profiles-title">Your Personas</h3>
              </div>
              <span className="profile-count">{profiles.length} profile{profiles.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="profiles-list">
            {profiles.map((p) => (
              <div key={p.id} className="profile-card">
                <div className="profile-icon-wrap">
                  <span className="material-symbols-outlined" style={{ fontSize: 22, color: "var(--primary)" }}>description</span>
                </div>
                <div className="profile-info">
                  <div className="profile-name">{p.name || "Unnamed Profile"}</div>
                  <div className="profile-meta">{p.resume_filename} • {new Date(p.created_at).toLocaleDateString()}</div>
                </div>
                <div className="profile-actions" style={{ gap: '0.5rem' }}>
                  <button className="action-btn delete-btn" onClick={() => handleDeleteProfile(p.id)} title="Delete">
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                  </button>
                                    <Link href={`/dashboard/personas/${p.id}`} className="action-btn" style={{ textDecoration: 'none', background: 'var(--surface-raised)', border: '1px solid var(--border)' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>edit</span> Details
                  </Link>
                  <Link href={`/interview/setup?profile=${p.id}`} className="action-btn start-btn" style={{ textDecoration: 'none' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>play_arrow</span> Start Interview
                  </Link>
                </div>
              </div>
            ))}
            {profiles.length === 0 && !uploading && (
              <div className="auth-error" style={{ background: "transparent", color: "var(--outline)" }}>No personas yet. Create one above.</div>
            )}
          </div>
        </section>
      </main>


    </div>
  );
}