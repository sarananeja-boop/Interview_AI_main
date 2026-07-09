"use client";

import { useEffect, useState } from "react";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [settings, setSettings] = useState({
    monitoring: "strict",
    audioMode: "text",
    theme: "warm",
    verbosity: "detailed"
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("app_settings");
      if (saved) {
        try {
          setSettings(JSON.parse(saved));
        } catch (e) {
          console.error(e);
        }
      }
    }
  }, [isOpen]);

  const saveSetting = (key: string, value: string) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    localStorage.setItem("app_settings", JSON.stringify(updated));
    // Dispatch custom event to let other components know settings changed
    window.dispatchEvent(new Event("settingsChanged"));
  };

  if (!isOpen) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <div className="header-title">
            <span className="material-symbols-outlined header-icon">settings</span>
            <h2>Control Center Settings</h2>
          </div>
          <button className="close-btn" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="settings-body">
          {/* Section 1 */}
          <div className="settings-section">
            <h3 className="section-title">Webcam & Security</h3>
            <div className="setting-row">
              <div className="setting-info">
                <span className="setting-label">Multi-Person Detection</span>
                <span className="setting-desc">Flag when multiple faces are detected in the frame.</span>
              </div>
              <div className="toggle-group">
                <button 
                  className={`toggle-btn ${settings.monitoring === "strict" ? "active" : ""}`}
                  onClick={() => saveSetting("monitoring", "strict")}
                >
                  Strict
                </button>
                <button 
                  className={`toggle-btn ${settings.monitoring === "standard" ? "active" : ""}`}
                  onClick={() => saveSetting("monitoring", "standard")}
                >
                  Off
                </button>
              </div>
            </div>
          </div>

          {/* Section 2 */}
          <div className="settings-section">
            <h3 className="section-title">AI Mentor Options</h3>
            <div className="setting-row">
              <div className="setting-info">
                <span className="setting-label">Response Stance</span>
                <span className="setting-desc">Enable synthetic audio response from AI panel.</span>
              </div>
              <div className="toggle-group">
                <button 
                  className={`toggle-btn ${settings.audioMode === "audio" ? "active" : ""}`}
                  onClick={() => saveSetting("audioMode", "audio")}
                >
                  Voice & Text
                </button>
                <button 
                  className={`toggle-btn ${settings.audioMode === "text" ? "active" : ""}`}
                  onClick={() => saveSetting("audioMode", "text")}
                >
                  Text Only
                </button>
              </div>
            </div>

            <div className="setting-row">
              <div className="setting-info">
                <span className="setting-label">Feedback Verbosity</span>
                <span className="setting-desc">Depth of evaluation reports.</span>
              </div>
              <div className="toggle-group">
                <button 
                  className={`toggle-btn ${settings.verbosity === "detailed" ? "active" : ""}`}
                  onClick={() => saveSetting("verbosity", "detailed")}
                >
                  Detailed
                </button>
                <button 
                  className={`toggle-btn ${settings.verbosity === "concise" ? "active" : ""}`}
                  onClick={() => saveSetting("verbosity", "concise")}
                >
                  Concise
                </button>
              </div>
            </div>
          </div>

          {/* Section 3 */}
          <div className="settings-section">
            <h3 className="section-title">Aesthetics</h3>
            <div className="setting-row">
              <div className="setting-info">
                <span className="setting-label">Theme Stencil</span>
                <span className="setting-desc">Background styling and color palette.</span>
              </div>
              <div className="toggle-group">
                <button 
                  className={`toggle-btn ${settings.theme === "warm" ? "active" : ""}`}
                  onClick={() => saveSetting("theme", "warm")}
                >
                  Warm Editorial
                </button>
                <button 
                  className={`toggle-btn ${settings.theme === "dark" ? "active" : ""}`}
                  onClick={() => saveSetting("theme", "dark")}
                >
                  Glass Dark
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="settings-footer">
          <button className="save-btn" onClick={onClose}>Save & Apply</button>
        </div>

        <style jsx>{`
          .settings-overlay {
            position: fixed;
            inset: 0;
            background: rgba(14, 38, 30, 0.4);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            z-index: 100;
            display: flex;
            align-items: center;
            justify-content: center;
          }

          .settings-modal {
            background: var(--surface);
            border: 1px solid rgba(21, 69, 57, 0.15);
            border-radius: 24px;
            width: 100%;
            max-width: 580px;
            box-shadow: 0 24px 60px rgba(21, 69, 57, 0.15);
            overflow: hidden;
            display: flex;
            flex-direction: column;
            animation: modalFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          }

          @keyframes modalFadeIn {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
          }

          .settings-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 1.5rem 2rem;
            border-bottom: 1px solid rgba(21, 69, 57, 0.08);
          }

          .header-title {
            display: flex;
            align-items: center;
            gap: 0.75rem;
          }

          .header-icon {
            color: var(--primary);
            font-size: 24px;
          }

          .header-title h2 {
            font-family: var(--font-display);
            font-size: 1.5rem;
            font-weight: 600;
            color: var(--primary);
            margin: 0;
          }

          .close-btn {
            background: none;
            border: none;
            cursor: pointer;
            color: var(--outline);
            display: flex;
            align-items: center;
            padding: 4px;
            border-radius: 50%;
            transition: all 0.2s;
          }

          .close-btn:hover {
            background: rgba(21, 69, 57, 0.05);
            color: var(--on-surface);
          }

          .settings-body {
            padding: 2rem;
            display: flex;
            flex-direction: column;
            gap: 2rem;
            max-height: 60vh;
            overflow-y: auto;
          }

          .settings-section {
            display: flex;
            flex-direction: column;
            gap: 1.25rem;
          }

          .section-title {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: var(--outline);
            margin: 0;
            border-bottom: 1px solid rgba(21, 69, 57, 0.05);
            padding-bottom: 0.5rem;
          }

          .setting-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 2rem;
          }

          .setting-info {
            display: flex;
            flex-direction: column;
            gap: 2px;
          }

          .setting-label {
            font-size: 0.95rem;
            font-weight: 600;
            color: var(--on-surface);
          }

          .setting-desc {
            font-size: 0.8rem;
            color: var(--outline);
            line-height: 1.4;
          }

          .toggle-group {
            display: flex;
            background: rgba(21, 69, 57, 0.04);
            padding: 4px;
            border-radius: 12px;
            border: 1px solid rgba(21, 69, 57, 0.05);
          }

          .toggle-btn {
            background: none;
            border: none;
            padding: 6px 14px;
            font-size: 0.8rem;
            font-weight: 600;
            color: var(--outline);
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s;
          }

          .toggle-btn.active {
            background: white;
            color: var(--primary);
            box-shadow: 0 2px 8px rgba(21, 69, 57, 0.08);
          }

          .settings-footer {
            padding: 1.25rem 2rem;
            border-top: 1px solid rgba(21, 69, 57, 0.08);
            display: flex;
            justify-content: flex-end;
          }

          .save-btn {
            background: var(--primary);
            color: white;
            border: none;
            padding: 0.75rem 1.5rem;
            border-radius: 12px;
            font-weight: 600;
            font-size: 0.9rem;
            cursor: pointer;
            transition: all 0.2s;
            box-shadow: 0 4px 12px rgba(21, 69, 57, 0.15);
          }

          .save-btn:hover {
            background: var(--primary-container);
            transform: translateY(-1px);
          }
        `}</style>
      </div>
    </div>
  );
}
