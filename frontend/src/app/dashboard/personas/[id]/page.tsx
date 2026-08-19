"use client";

import SettingsModal from "@/app/components/SettingsModal";
import ThemeToggle from "@/app/components/ThemeToggle";
import Logo from "@/app/components/Logo";

import { useEffect, useState, useCallback, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  isAuthenticated, getUser, logout,
  getProfile, updateProfile, deleteProfile,
  getProfileHistory, getPersonaAnalytics,
  getActivePersonaId, setActivePersonaId, clearActivePersonaId,
} from "@/lib/api";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Dot,
} from "recharts";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Education {
  degree?: string; field?: string; institution?: string; year?: string; score?: string;
}
interface WorkExp {
  company?: string; role?: string; duration?: string; responsibilities?: string[];
}
interface ParsedProfile {
  name?: string; education?: Education[]; work_experience?: WorkExp[];
  internships?: WorkExp[]; skills?: string[]; hobbies?: string[];
  extracurriculars?: string[]; achievements?: string[]; cat_score?: string;
  hometown?: string; state?: string; interests?: string[];
}
interface ProfileData {
  id: string; persona_name?: string; candidate_type?: string;
  parsed_profile?: ParsedProfile; strengths?: string[]; weaknesses?: string[];
  pressure_points?: string[]; created_at?: string;
}
interface HistoryItem {
  id: string; status: string; interview_type?: string; target_iim?: string;
  started_at?: string; ended_at?: string; persona?: string;
  overall_score?: number; evaluation_id?: string;
}
interface Analytics {
  score_history: { interview_id: string; date?: string; score?: number; panel?: string }[];
  median_score?: number; best_score?: number; latest_score?: number;
  dimension_averages: Record<string, number>;
  swot: { strengths: string[]; weaknesses: string[]; opportunities: string[]; threats: string[] };
  interview_count: number;
}

const INDIAN_STATES = [
  "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat",
  "Haryana","Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh",
  "Maharashtra","Manipur","Meghalaya","Mizoram","Nagaland","Odisha","Punjab","Rajasthan",
  "Sikkim","Tamil Nadu","Telangana","Tripura","Uttar Pradesh","Uttarakhand","West Bengal",
  "Andaman and Nicobar Islands","Chandigarh","Dadra and Nagar Haveli and Daman and Diu",
  "Delhi","Jammu and Kashmir","Ladakh","Lakshadweep","Puducherry","International",
];

const CATEGORIES = [
  { id: "Geopolitics", icon: "public" },
  { id: "Finance", icon: "account_balance" },
  { id: "Consulting", icon: "cases" },
  { id: "Marketing", icon: "campaign" },
  { id: "Operations", icon: "conveyor_belt" },
  { id: "Product Management", icon: "inventory_2" },
  { id: "Data Analytics", icon: "query_stats" },
  { id: "Startups", icon: "rocket_launch" },
  { id: "Economics", icon: "trending_up" },
  { id: "Technology", icon: "computer" },
  { id: "Social Impact", icon: "volunteer_activism" },
  { id: "Public Policy", icon: "gavel" },
  { id: "Sports", icon: "sports_cricket" },
];

const PANEL_NAMES: Record<string, string> = {
  iim_a: "IIM Ahmedabad", iim_b: "IIM Bangalore", iim_c: "IIM Calcutta",
  iim_l: "IIM Lucknow", iim_general: "General IIM", skeptic: "Skeptic",
  academic: "Academic", friendly_trap: "Friendly Trap", mixed: "Mixed",
};

function fmtScore(s?: number) {
  return s != null ? s.toFixed(1) : "—";
}
function scoreColor(s?: number) {
  if (s == null) return "var(--outline)";
  if (s >= 8) return "#22c55e";
  if (s >= 6) return "#f59e0b";
  return "#ef4444";
}

// ─── Custom Tooltip ──────────────────────────────────────────────────────────
function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border-subtle)",
      borderRadius: 10, padding: "0.6rem 1rem", boxShadow: "0 8px 30px rgba(0,0,0,0.15)",
    }}>
      <div style={{ fontSize: "0.75rem", color: "var(--outline)", marginBottom: 4 }}>
        {d?.date ? new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—"}
      </div>
      <div style={{ fontSize: "1.2rem", fontWeight: 700, color: scoreColor(d?.score) }}>
        {fmtScore(d?.score)} <span style={{ fontSize: "0.75rem", fontWeight: 400, color: "var(--outline)" }}>/ 10</span>
      </div>
      <div style={{ fontSize: "0.75rem", color: "var(--on-surface-variant)", marginTop: 2 }}>
        {PANEL_NAMES[d?.panel] || d?.panel || "General"}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function PersonaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: profileId } = use(params);
  const router = useRouter();

  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const [activeSection, setActiveSection] = useState<"overview" | "settings" | "history" | "analytics">("overview");

  // Settings form state
  const [hometown, setHometown] = useState("");
  const [userState, setUserState] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [customInterest, setCustomInterest] = useState("");
  const [personaName, setPersonaName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  // ── Load data ────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    try {
      const [prof, hist, anal] = await Promise.all([
        getProfile(profileId),
        getProfileHistory(profileId),
        getPersonaAnalytics(profileId),
      ]);
      setProfile(prof);
      setHistory(hist);
      setAnalytics(anal);

      // Pre-fill settings form
      const pp = prof.parsed_profile || {};
      setHometown(pp.hometown || "");
      setUserState(pp.state || "");
      setInterests(pp.interests || []);
      setPersonaName(prof.persona_name || pp.name || "");
    } catch {
      router.push("/dashboard/personas");
    }
  }, [profileId, router]);

  useEffect(() => {
    if (!isAuthenticated()) { router.push("/login"); return; }
    setUser(getUser());
    setIsActive(getActivePersonaId() === profileId);
    loadAll();
  }, [profileId, router, loadAll]);

  // ── Active persona toggle ─────────────────────────────────────────────────
  const handleSetActive = () => {
    setActivePersonaId(profileId);
    setIsActive(true);
  };

  // ── Save settings ─────────────────────────────────────────────────────────
  const handleSaveSettings = async () => {
    setSaving(true); setSaveMsg("");
    try {
      await updateProfile(profileId, { persona_name: personaName, hometown, state: userState, interests });
      await loadAll();
      setSaveMsg("✓ Settings saved");
      setTimeout(() => setSaveMsg(""), 3000);
    } catch (e: any) {
      setSaveMsg(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  // ── Delete persona ────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!confirm(`Delete "${personaName || "this persona"}"? This will also delete all associated interviews and evaluations.`)) return;
    await deleteProfile(profileId);
    if (getActivePersonaId() === profileId) clearActivePersonaId();
    router.push("/dashboard/personas");
  };

  // ── Interest helpers ──────────────────────────────────────────────────────
  const toggleInterest = (id: string) => {
    setInterests(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : prev.length < 3 ? [...prev, id] : prev
    );
  };
  const addCustom = () => {
    const v = customInterest.trim();
    if (v && interests.length < 3 && !interests.includes(v)) {
      setInterests(prev => [...prev, v]);
      setCustomInterest("");
    }
  };

  if (!user || !profile) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--background)" }}>
      <div style={{ width: 40, height: 40, border: "3px solid var(--primary)", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
    </div>
  );

  const pp = profile.parsed_profile || {};
  const scoreData = analytics?.score_history.filter(s => s.score != null) || [];
  const medianScore = analytics?.median_score;

  return (
    <div className="dashboard-layout">
      <style jsx>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }

        .dashboard-layout {
          display: flex; min-height: 100vh;
          background: var(--background); color: var(--on-background);
          width: 100vw; overflow-x: hidden;
        }

        /* ── Sidebar ── */
        .sidebar {
          width: 260px; height: 100vh; position: fixed; left: 0; top: 0;
          z-index: 40; display: flex; flex-direction: column;
          padding: 1.25rem 1rem; background: var(--surface);
          border-right: 1px solid var(--border-subtle);
        }
        .sidebar-header { display: flex; align-items: center; gap: 1rem; padding-left: 0.5rem; margin-bottom: 1.5rem; }
        .sidebar-cta {
          display: flex; align-items: center; justify-content: center; gap: 0.5rem;
          padding: 0.875rem 1rem; margin: 0 0.5rem 1.5rem;
          background: var(--primary); color: var(--on-primary);
          font-family: var(--font-sans); font-size: 0.875rem; font-weight: 600;
          border: none; border-radius: 12px; cursor: pointer; transition: all 0.2s ease;
        }
        .sidebar-cta:hover { background: var(--primary-container); color: var(--on-primary-container); transform: translateY(-1px); }
        .sidebar-nav { display: flex; flex-direction: column; gap: 0.75rem; flex: 1; padding: 0 0.5rem; }
        .sidebar-nav-label { font-size: 0.65rem; font-weight: 600; color: var(--outline); text-transform: uppercase; letter-spacing: 0.08em; padding: 0 0.75rem; margin-bottom: 0.5rem; }
        .nav-item {
          display: flex; align-items: center; gap: 0.75rem; padding: 0.75rem 1rem;
          border-radius: 8px; font-size: 0.85rem; font-weight: 500;
          color: var(--on-surface-variant); cursor: pointer; transition: all 0.15s ease;
          border: none; text-decoration: none; background: none;
          font-family: var(--font-sans); width: 100%; text-align: left;
        }
        .nav-item:hover { background: var(--surface-variant); color: var(--on-surface); }
        .nav-item.active { background: var(--primary-container); color: var(--on-primary-container); font-weight: 600; }
        .sidebar-footer { margin-top: auto; padding: 1rem 0.5rem; border-top: 1px solid var(--border-subtle); }
        .user-row { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.5rem; }
        .user-avatar { width: 36px; height: 36px; border-radius: 50%; background: var(--gradient-hero); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.85rem; }
        .user-name { font-size: 0.85rem; font-weight: 600; color: var(--on-surface); }
        .user-email { font-size: 0.75rem; color: var(--outline); }
        .logout-btn:hover { color: var(--error); }

        /* ── Main ── */
        .main-content { flex: 1; min-width: 0; margin-left: 260px; padding: 2.5rem 3.5rem 6rem; min-height: 100vh; animation: fadeIn 0.3s ease; }

        /* ── Page header ── */
        .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2rem; }
        .breadcrumb { display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; color: var(--outline); margin-bottom: 0.5rem; }
        .breadcrumb a { color: var(--outline); text-decoration: none; transition: color 0.2s; }
        .breadcrumb a:hover { color: var(--on-surface); }
        .page-title { font-family: var(--font-display); font-size: 1.75rem; font-weight: 600; color: var(--on-surface); letter-spacing: -0.02em; }
        .page-subtitle { font-size: 0.875rem; color: var(--outline); margin-top: 0.25rem; }
        .header-actions { display: flex; gap: 0.5rem; align-items: center; }
        .settings-top-btn {
          display: flex; align-items: center; justify-content: center;
          width: 40px; height: 40px; border-radius: 50%;
          border: 1px solid var(--border-subtle); background: var(--surface);
          color: var(--on-surface-variant); cursor: pointer; transition: all 0.2s;
        }
        .settings-top-btn:hover { background: var(--surface-variant); color: var(--on-surface); }

        /* ── Hero card ── */
        .hero-card {
          background: var(--surface); border: 1px solid var(--border-subtle);
          border-radius: 20px; padding: 2rem; margin-bottom: 2rem;
          position: relative; overflow: hidden;
        }
        .hero-card::before {
          content: ''; position: absolute; top: 0; left: 0; right: 0; height: 4px;
          background: var(--gradient-hero);
        }
        .hero-card-inner { display: flex; align-items: flex-start; gap: 2rem; }
        .persona-avatar {
          width: 80px; height: 80px; border-radius: 20px; flex-shrink: 0;
          background: var(--gradient-hero); display: flex; align-items: center;
          justify-content: center; font-size: 2rem; font-weight: 700; color: white;
        }
        .hero-info { flex: 1; }
        .persona-name-display { font-family: var(--font-display); font-size: 1.5rem; font-weight: 700; color: var(--on-surface); margin-bottom: 0.25rem; }
        .persona-meta { display: flex; align-items: center; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
        .meta-badge {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 4px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: 600;
        }
        .badge-type { background: var(--primary-fixed); color: var(--on-primary-fixed); }
        .badge-date { background: var(--surface-variant); color: var(--on-surface-variant); }

        .hero-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; }
        .btn { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.65rem 1.25rem; border-radius: 10px; font-family: var(--font-sans); font-size: 0.875rem; font-weight: 600; cursor: pointer; transition: all 0.2s; border: none; }
        .btn-primary { background: var(--primary); color: var(--on-primary); }
        .btn-primary:hover { background: var(--primary-container); color: var(--on-primary-container); transform: translateY(-1px); }
        .btn-ghost { background: var(--surface-variant); color: var(--on-surface-variant); }
        .btn-ghost:hover { background: var(--border-subtle); color: var(--on-surface); }
        .btn-success { background: rgba(34, 197, 94, 0.12); color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.3); }
        .btn-success:hover { background: rgba(34, 197, 94, 0.2); }
        .btn-danger { background: var(--error-container); color: var(--error); }
        .btn-danger:hover { background: var(--error); color: white; }

        /* ── Section tabs ── */
        .section-tabs { display: flex; gap: 0.25rem; background: var(--surface-variant); border-radius: 12px; padding: 0.25rem; margin-bottom: 2rem; width: fit-content; }
        .tab-btn {
          padding: 0.6rem 1.25rem; border-radius: 10px; font-family: var(--font-sans);
          font-size: 0.85rem; font-weight: 500; border: none; cursor: pointer;
          transition: all 0.2s; color: var(--on-surface-variant); background: transparent;
          display: flex; align-items: center; gap: 0.4rem;
        }
        .tab-btn:hover { color: var(--on-surface); }
        .tab-btn.tab-active { background: var(--surface); color: var(--on-surface); font-weight: 600; box-shadow: 0 1px 4px rgba(0,0,0,0.1); }

        /* ── Cards ── */
        .card {
          background: var(--surface); border: 1px solid var(--border-subtle);
          border-radius: 16px; padding: 1.75rem; margin-bottom: 1.5rem;
          animation: fadeIn 0.3s ease;
        }
        .card-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1.5rem; }
        .card-icon { font-size: 22px; color: var(--on-primary-fixed); background: var(--primary-fixed); padding: 8px; border-radius: 10px; }
        .card-title { font-family: var(--font-display); font-size: 1rem; font-weight: 600; color: var(--on-surface); }
        .card-subtitle { font-size: 0.8rem; color: var(--outline); margin-top: 2px; }

        /* ── Profile info grid ── */
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
        .info-field { display: flex; flex-direction: column; gap: 0.35rem; }
        .info-label { font-size: 0.7rem; font-weight: 700; color: var(--outline); text-transform: uppercase; letter-spacing: 0.08em; }
        .info-value { font-size: 0.9rem; font-weight: 500; color: var(--on-surface); line-height: 1.5; }
        .edu-item { padding: 0.75rem 1rem; background: var(--surface-variant); border-radius: 10px; margin-bottom: 0.5rem; }
        .edu-degree { font-size: 0.9rem; font-weight: 600; color: var(--on-surface); }
        .edu-inst { font-size: 0.8rem; color: var(--outline); margin-top: 2px; }
        .skills-grid { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.5rem; }
        .skill-pill { padding: 4px 12px; background: var(--primary-fixed); color: var(--on-primary-fixed); border-radius: 20px; font-size: 0.75rem; font-weight: 500; }

        /* Pressure points */
        .pressure-list { list-style: none; padding: 0; margin: 0; }
        .pressure-item { display: flex; gap: 0.75rem; padding: 0.6rem 0; border-bottom: 1px solid var(--border-subtle); font-size: 0.85rem; color: var(--on-surface-variant); line-height: 1.5; }
        .pressure-item:last-child { border-bottom: none; }
        .pressure-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--primary); flex-shrink: 0; margin-top: 0.45rem; }

        /* ── Settings ── */
        .settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; margin-bottom: 1.5rem; }
        .field { display: flex; flex-direction: column; gap: 0.5rem; }
        .field-label { font-size: 0.75rem; font-weight: 700; color: var(--on-surface-variant); text-transform: uppercase; letter-spacing: 0.06em; display: flex; align-items: center; gap: 6px; }
        .field-input {
          padding: 0.75rem 1rem; border: 1px solid var(--border-subtle);
          border-radius: 10px; background: var(--background); color: var(--on-surface);
          font-family: var(--font-sans); font-size: 0.9rem; transition: border-color 0.2s;
        }
        .field-input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(21,69,57,0.08); }
        .field-select { cursor: pointer; -webkit-appearance: none; appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23666' d='M6 8L1 3h10z'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 12px center; padding-right: 2rem;
        }
        .interests-grid { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem; }
        .interest-chip {
          display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px;
          border: 1px solid var(--border-subtle); border-radius: 20px;
          background: var(--background); color: var(--on-surface-variant);
          font-family: var(--font-sans); font-size: 0.8rem; font-weight: 500;
          cursor: pointer; transition: all 0.2s;
        }
        .interest-chip:hover:not(:disabled) { border-color: var(--primary); color: var(--on-surface); background: var(--primary-fixed); }
        .interest-chip:disabled { opacity: 0.4; cursor: not-allowed; }
        .interest-selected { border-color: var(--primary) !important; background: var(--primary-fixed) !important; color: var(--on-primary-fixed) !important; font-weight: 600; }
        .custom-row { display: flex; gap: 0.5rem; }
        .custom-tag { display: inline-flex; align-items: center; gap: 4px; padding: 4px 12px; background: var(--primary-fixed); color: var(--on-primary-fixed); border-radius: 20px; font-size: 0.8rem; font-weight: 500; margin-right: 0.4rem; margin-top: 0.4rem; }
        .remove-tag { background: none; border: none; color: var(--on-primary-fixed); cursor: pointer; display: flex; align-items: center; padding: 0; margin-left: 2px; }
        .save-row { display: flex; align-items: center; gap: 1rem; margin-top: 1.5rem; }
        .save-msg { font-size: 0.85rem; color: #22c55e; }
        .save-msg.error { color: var(--error); }
        .spinner-sm { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 0.7s linear infinite; display: inline-block; }

        /* ── History ── */
        .history-list { display: flex; flex-direction: column; gap: 0.75rem; }
        .history-card {
          display: flex; align-items: center; gap: 1.25rem;
          padding: 1rem 1.25rem; background: var(--surface-variant);
          border: 1px solid var(--border-subtle); border-radius: 12px;
          transition: all 0.2s;
        }
        .history-card:hover { border-color: var(--primary); background: var(--primary-fixed); transform: translateX(4px); }
        .score-circle {
          width: 52px; height: 52px; border-radius: 50%; flex-shrink: 0;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          border: 2px solid; font-weight: 700;
        }
        .score-num { font-size: 1.1rem; }
        .score-denom { font-size: 0.6rem; opacity: 0.7; }
        .history-info { flex: 1; }
        .history-panel { font-size: 0.9rem; font-weight: 600; color: var(--on-surface); }
        .history-meta { font-size: 0.78rem; color: var(--outline); margin-top: 2px; }
        .history-status {
          padding: 4px 10px; border-radius: 20px; font-size: 0.72rem; font-weight: 600;
          text-transform: uppercase; letter-spacing: 0.05em;
        }
        .status-completed { background: rgba(34,197,94,0.12); color: #22c55e; }
        .status-active { background: rgba(245,158,11,0.12); color: #f59e0b; }
        .status-other { background: var(--surface-variant); color: var(--outline); }
        .empty-state { text-align: center; padding: 3rem 1rem; color: var(--outline); }
        .empty-icon { font-size: 3rem; margin-bottom: 0.75rem; }

        /* ── Chart ── */
        .stats-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1.5rem; }
        .stat-card { background: var(--surface-variant); border-radius: 12px; padding: 1rem 1.25rem; text-align: center; }
        .stat-value { font-size: 1.5rem; font-weight: 700; }
        .stat-label { font-size: 0.72rem; color: var(--outline); margin-top: 2px; text-transform: uppercase; letter-spacing: 0.05em; }

        /* ── SWOT ── */
        .swot-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        .swot-quad { border-radius: 12px; padding: 1.25rem; }
        .swot-s { background: rgba(34,197,94,0.07); border: 1px solid rgba(34,197,94,0.2); }
        .swot-w { background: rgba(239,68,68,0.07); border: 1px solid rgba(239,68,68,0.2); }
        .swot-o { background: rgba(99,102,241,0.07); border: 1px solid rgba(99,102,241,0.2); }
        .swot-t { background: rgba(245,158,11,0.07); border: 1px solid rgba(245,158,11,0.2); }
        .swot-heading { font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.75rem; display: flex; align-items: center; gap: 0.5rem; }
        .swot-s .swot-heading { color: #22c55e; }
        .swot-w .swot-heading { color: #ef4444; }
        .swot-o .swot-heading { color: #6366f1; }
        .swot-t .swot-heading { color: #f59e0b; }
        .swot-item { font-size: 0.82rem; color: var(--on-surface-variant); line-height: 1.5; padding: 0.35rem 0; border-bottom: 1px solid rgba(255,255,255,0.04); }
        .swot-item:last-child { border-bottom: none; }
        .swot-empty { font-size: 0.8rem; color: var(--outline); font-style: italic; }

        /* ── Dimension bars ── */
        .dim-row { display: flex; align-items: center; gap: 1rem; margin-bottom: 0.6rem; }
        .dim-label { font-size: 0.78rem; color: var(--on-surface-variant); width: 180px; flex-shrink: 0; text-transform: capitalize; }
        .dim-bar-bg { flex: 1; height: 6px; background: var(--surface-variant); border-radius: 3px; overflow: hidden; }
        .dim-bar-fill { height: 100%; border-radius: 3px; transition: width 1s ease; }
        .dim-score { font-size: 0.78rem; font-weight: 600; width: 30px; text-align: right; flex-shrink: 0; }

        @media (max-width: 768px) {
          .sidebar { display: none; }
          .main-content { margin-left: 0; padding: 1.5rem 1.25rem 4rem; }
          .info-grid, .settings-grid, .swot-grid, .stats-row { grid-template-columns: 1fr; }
          .hero-card-inner { flex-direction: column; }
        }
      `}</style>

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />

      {/* ── Sidebar ── */}
      <nav className="sidebar">
        <div className="sidebar-header">
          <Logo width={36} height={36} showText={true} />
        </div>
        <button className="sidebar-cta" onClick={() => router.push(`/interview/setup?profile=${profileId}`)}>
          <span className="material-symbols-outlined filled" style={{ fontSize: 18 }}>add</span>
          Start Interview
        </button>
        <div className="sidebar-nav">
          <div className="sidebar-nav-label">Menu</div>
          <Link className="nav-item" href="/dashboard">
            <span className="material-symbols-outlined filled" style={{ fontSize: 20 }}>space_dashboard</span>Dashboard
          </Link>
          <Link className="nav-item" href="/dashboard/news">
            <span className="material-symbols-outlined filled" style={{ fontSize: 20 }}>article</span>Daily News
          </Link>
          <Link className="nav-item active" href="/dashboard/personas">
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
          <div className="user-row">
            <div className="user-avatar">{user.name?.[0] || "U"}</div>
            <div>
              <div className="user-name">{user.name}</div>
              <div className="user-email">{user.email}</div>
            </div>
          </div>
          <button className="nav-item logout-btn" onClick={logout}>
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>logout</span>Log Out
          </button>
        </div>
      </nav>

      {/* ── Main ── */}
      <main className="main-content">
        {/* Header */}
        <div className="page-header">
          <div>
            <div className="breadcrumb">
              <Link href="/dashboard/personas">Personas</Link>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_right</span>
              <span>{personaName || pp.name || "Profile"}</span>
            </div>
            <h1 className="page-title">{personaName || pp.name || "Persona"}</h1>
            <p className="page-subtitle">{profile.candidate_type || "Candidate"} • Created {profile.created_at ? new Date(profile.created_at).toLocaleDateString("en-IN") : "—"}</p>
          </div>
          <div className="header-actions">
            <ThemeToggle />
            <button className="settings-top-btn" onClick={() => setIsSettingsOpen(true)}>
              <span className="material-symbols-outlined" style={{ fontSize: 22 }}>settings</span>
            </button>
          </div>
        </div>

        {/* ── Hero Card ── */}
        <div className="hero-card">
          <div className="hero-card-inner">
            <div className="persona-avatar">{(personaName || pp.name || "P")[0]?.toUpperCase()}</div>
            <div className="hero-info">
              <div className="persona-name-display">{personaName || pp.name || "Unnamed Persona"}</div>
              <div className="persona-meta">
                <span className="meta-badge badge-type">
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>person</span>
                  {profile.candidate_type || "Candidate"}
                </span>

                {analytics && analytics.interview_count > 0 && (
                  <span className="meta-badge badge-date">
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>bar_chart</span>
                    {analytics.interview_count} interview{analytics.interview_count !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <div className="hero-actions">
                <button className="btn btn-primary" onClick={() => router.push(`/interview/setup?profile=${profileId}`)}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>play_arrow</span>
                  Start Interview
                </button>
                {!isActive && (
                  <button className="btn btn-success" onClick={handleSetActive}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>check_circle</span>
                    Set as Active
                  </button>
                )}
                <button className="btn btn-ghost" onClick={() => setActiveSection("settings")}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>edit</span>
                  Edit Settings
                </button>
                <button className="btn btn-danger" onClick={handleDelete}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Section Tabs ── */}
        <div className="section-tabs">
          {[
            { key: "overview", label: "Profile Overview", icon: "person" },
            { key: "settings", label: "Settings", icon: "tune" },
            { key: "history", label: "Eval History", icon: "history_edu" },
            { key: "analytics", label: "Analytics", icon: "analytics" },
          ].map(t => (
            <button key={t.key} className={`tab-btn ${activeSection === t.key ? "tab-active" : ""}`} onClick={() => setActiveSection(t.key as any)}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* ════════════ OVERVIEW ════════════ */}
        {activeSection === "overview" && (
          <>
            {/* Candidate Profile Info */}
            <div className="card">
              <div className="card-header">
                <span className="material-symbols-outlined card-icon">badge</span>
                <div>
                  <div className="card-title">Candidate Profile</div>
                  <div className="card-subtitle">Extracted from your resume by AI</div>
                </div>
              </div>
              <div className="info-grid" style={{ marginBottom: "1.5rem" }}>
                <div className="info-field">
                  <div className="info-label">Full Name</div>
                  <div className="info-value">{pp.name || "—"}</div>
                </div>
                <div className="info-field">
                  <div className="info-label">Profile Type</div>
                  <div className="info-value">{profile.candidate_type || "—"}</div>
                </div>
                {pp.cat_score && (
                  <div className="info-field">
                    <div className="info-label">CAT Score</div>
                    <div className="info-value">{pp.cat_score}</div>
                  </div>
                )}
              </div>

              {/* Education */}
              {pp.education && pp.education.length > 0 && (
                <div style={{ marginBottom: "1.5rem" }}>
                  <div className="info-label" style={{ marginBottom: "0.75rem" }}>Education</div>
                  {pp.education.map((e, i) => (
                    <div key={i} className="edu-item">
                      <div className="edu-degree">{e.degree}{e.field ? ` in ${e.field}` : ""}{e.score ? ` (${e.score})` : ""}</div>
                      <div className="edu-inst">{e.institution}{e.year ? ` · ${e.year}` : ""}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Work Experience */}
              {pp.work_experience && pp.work_experience.length > 0 && (
                <div style={{ marginBottom: "1.5rem" }}>
                  <div className="info-label" style={{ marginBottom: "0.75rem" }}>Work Experience</div>
                  {pp.work_experience.map((w, i) => (
                    <div key={i} className="edu-item">
                      <div className="edu-degree">{w.role} {w.company ? `@ ${w.company}` : ""}</div>
                      {w.duration && <div className="edu-inst">{w.duration}</div>}
                    </div>
                  ))}
                </div>
              )}

              {/* Skills */}
              {pp.skills && pp.skills.length > 0 && (
                <div style={{ marginBottom: "1.5rem" }}>
                  <div className="info-label" style={{ marginBottom: "0.5rem" }}>Skills</div>
                  <div className="skills-grid">
                    {pp.skills.map((s, i) => <span key={i} className="skill-pill">{s}</span>)}
                  </div>
                </div>
              )}

              {/* Achievements */}
              {pp.achievements && pp.achievements.length > 0 && (
                <div>
                  <div className="info-label" style={{ marginBottom: "0.5rem" }}>Achievements</div>
                  {pp.achievements.map((a, i) => (
                    <div key={i} style={{ fontSize: "0.85rem", color: "var(--on-surface-variant)", padding: "0.25rem 0", borderBottom: "1px solid var(--border-subtle)" }}>{a}</div>
                  ))}
                </div>
              )}
            </div>

            {/* Panel Likely Questions */}
            {profile.pressure_points && profile.pressure_points.length > 0 && (
              <div className="card">
                <div className="card-header">
                  <span className="material-symbols-outlined card-icon">psychology</span>
                  <div>
                    <div className="card-title">Panel Will Likely Target</div>
                    <div className="card-subtitle">AI-identified pressure points from your profile</div>
                  </div>
                </div>
                <ul className="pressure-list">
                  {profile.pressure_points.map((pt, i) => (
                    <li key={i} className="pressure-item">
                      <div className="pressure-dot" />
                      <span>{pt}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {/* ════════════ SETTINGS ════════════ */}
        {activeSection === "settings" && (
          <div className="card">
            <div className="card-header">
              <span className="material-symbols-outlined card-icon">tune</span>
              <div>
                <div className="card-title">Your Details & Interests</div>
                <div className="card-subtitle">These settings auto-fill every interview you start with this persona</div>
              </div>
            </div>

            {/* Persona label */}
            <div className="field" style={{ marginBottom: "1.5rem" }}>
              <label className="field-label">
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>label</span>
                Persona Name
              </label>
              <input className="field-input" value={personaName} onChange={e => setPersonaName(e.target.value)} placeholder="e.g. Sarandeep — Finance 2026" />
            </div>

            <div className="settings-grid">
              <div className="field">
                <label className="field-label">
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>location_city</span>
                  Hometown
                </label>
                <input className="field-input" value={hometown} onChange={e => setHometown(e.target.value)} placeholder="e.g. Amritsar" />
              </div>
              <div className="field">
                <label className="field-label">
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>map</span>
                  State
                </label>
                <select className="field-input field-select" value={userState} onChange={e => setUserState(e.target.value)}>
                  <option value="">Select State...</option>
                  {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            {/* Interests */}
            <div className="field">
              <label className="field-label">
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>interests</span>
                Areas of Interest (max 3)
              </label>
              <div className="interests-grid" style={{ marginTop: "0.5rem" }}>
                {CATEGORIES.map(cat => {
                  const sel = interests.includes(cat.id);
                  const maxed = !sel && interests.length >= 3;
                  return (
                    <button
                      key={cat.id}
                      className={`interest-chip ${sel ? "interest-selected" : ""}`}
                      disabled={maxed}
                      onClick={() => toggleInterest(cat.id)}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{cat.icon}</span>
                      {cat.id}
                      {sel && <span className="material-symbols-outlined" style={{ fontSize: 14, color: "var(--primary)" }}>check</span>}
                    </button>
                  );
                })}
              </div>
              {/* Custom interests */}
              <div className="custom-row">
                <input
                  className="field-input" style={{ flex: 1 }}
                  placeholder="Add custom interest..."
                  value={customInterest}
                  onChange={e => setCustomInterest(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addCustom()}
                  disabled={interests.length >= 3}
                />
                <button className="btn btn-ghost" onClick={addCustom} disabled={interests.length >= 3 || !customInterest.trim()}>Add</button>
              </div>
              {/* Custom tags (interests not in predefined list) */}
              <div>
                {interests.filter(i => !CATEGORIES.find(c => c.id === i)).map(i => (
                  <span key={i} className="custom-tag">
                    {i}
                    <button className="remove-tag" onClick={() => setInterests(prev => prev.filter(x => x !== i))}>
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
                    </button>
                  </span>
                ))}
              </div>
            </div>

            <div className="save-row">
              <button className="btn btn-primary" onClick={handleSaveSettings} disabled={saving}>
                {saving ? <span className="spinner-sm" /> : <span className="material-symbols-outlined" style={{ fontSize: 18 }}>save</span>}
                {saving ? "Saving..." : "Save Settings"}
              </button>
              {saveMsg && <span className={`save-msg ${saveMsg.startsWith("✓") ? "" : "error"}`}>{saveMsg}</span>}
            </div>
          </div>
        )}

        {/* ════════════ EVALUATION HISTORY ════════════ */}
        {activeSection === "history" && (
          <div className="card">
            <div className="card-header">
              <span className="material-symbols-outlined card-icon">history_edu</span>
              <div>
                <div className="card-title">Evaluation History</div>
                <div className="card-subtitle">{history.length} interview{history.length !== 1 ? "s" : ""} for this persona</div>
              </div>
            </div>
            {history.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">📝</div>
                <div style={{ fontWeight: 600, color: "var(--on-surface)", marginBottom: "0.5rem" }}>No interviews yet</div>
                <div style={{ fontSize: "0.85rem", marginBottom: "1.5rem" }}>Start your first interview with this persona to see your evaluation history here.</div>
                <button className="btn btn-primary" onClick={() => router.push(`/interview/setup?profile=${profileId}`)}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>play_arrow</span>
                  Start First Interview
                </button>
              </div>
            ) : (
              <div className="history-list">
                {history.map(item => {
                  const score = item.overall_score;
                  const color = scoreColor(score);
                  const panelName = PANEL_NAMES[item.target_iim || ""] || PANEL_NAMES[item.persona || ""] || item.persona || "General";
                  const date = item.started_at ? new Date(item.started_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";
                  return (
                    <Link
                      key={item.id}
                      href={`/interview/review?id=${item.id}`}
                      style={{ textDecoration: "none" }}
                    >
                      <div className="history-card">
                        <div className="score-circle" style={{ borderColor: color, color }}>
                          <span className="score-num">{score != null ? score.toFixed(1) : "—"}</span>
                          {score != null && <span className="score-denom">/10</span>}
                        </div>
                        <div className="history-info">
                          <div className="history-panel">{panelName}</div>
                          <div className="history-meta">{date}{item.target_iim ? ` · ${item.target_iim.replace("iim_", "IIM ").toUpperCase()}` : ""}</div>
                        </div>
                        <span className={`history-status ${item.status === "completed" ? "status-completed" : item.status === "active" ? "status-active" : "status-other"}`}>
                          {item.status}
                        </span>
                        <span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--outline)" }}>chevron_right</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ════════════ ANALYTICS ════════════ */}
        {activeSection === "analytics" && (
          <>
            {(!analytics || analytics.interview_count === 0) ? (
              <div className="card">
                <div className="empty-state">
                  <div className="empty-icon">📊</div>
                  <div style={{ fontWeight: 600, color: "var(--on-surface)", marginBottom: "0.5rem" }}>No data yet</div>
                  <div style={{ fontSize: "0.85rem", marginBottom: "1.5rem" }}>Complete at least one interview to see your analytics, performance trends, and SWOT analysis.</div>
                  <button className="btn btn-primary" onClick={() => router.push(`/interview/setup?profile=${profileId}`)}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>play_arrow</span>
                    Start Interview
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Stats Row */}
                <div className="stats-row">
                  <div className="stat-card">
                    <div className="stat-value" style={{ color: scoreColor(analytics.latest_score) }}>{fmtScore(analytics.latest_score)}<span style={{ fontSize: "0.9rem", fontWeight: 400, color: "var(--outline)" }}>/10</span></div>
                    <div className="stat-label">Latest Score</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value" style={{ color: scoreColor(analytics.median_score) }}>{fmtScore(analytics.median_score)}<span style={{ fontSize: "0.9rem", fontWeight: 400, color: "var(--outline)" }}>/10</span></div>
                    <div className="stat-label">Median Score</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value" style={{ color: scoreColor(analytics.best_score) }}>{fmtScore(analytics.best_score)}<span style={{ fontSize: "0.9rem", fontWeight: 400, color: "var(--outline)" }}>/10</span></div>
                    <div className="stat-label">Best Score</div>
                  </div>
                </div>

                {/* Performance Trend */}
                {scoreData.length >= 1 && (
                  <div className="card">
                    <div className="card-header">
                      <span className="material-symbols-outlined card-icon">show_chart</span>
                      <div>
                        <div className="card-title">Performance Trend</div>
                        <div className="card-subtitle">Your interview scores over time</div>
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={scoreData} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
                        <XAxis
                          dataKey="date"
                          tickFormatter={v => v ? new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : ""}
                          tick={{ fontSize: 11, fill: "var(--outline)" }}
                          axisLine={false} tickLine={false}
                        />
                        <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={{ fontSize: 11, fill: "var(--outline)" }} axisLine={false} tickLine={false} />
                        <Tooltip content={<ChartTooltip />} />
                        {medianScore != null && (
                          <ReferenceLine y={medianScore} stroke="rgba(245,158,11,0.5)" strokeDasharray="6 3" label={{ value: `Median ${medianScore}`, fill: "#f59e0b", fontSize: 11, position: "right" }} />
                        )}
                        <Line
                          type="monotone" dataKey="score" stroke="var(--primary)" strokeWidth={2.5}
                          dot={<Dot r={5} fill="var(--primary)" stroke="var(--surface)" strokeWidth={2} />}
                          activeDot={{ r: 7, fill: "var(--primary)", stroke: "var(--surface)", strokeWidth: 2 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Dimension Averages */}
                {Object.keys(analytics.dimension_averages).length > 0 && (
                  <div className="card">
                    <div className="card-header">
                      <span className="material-symbols-outlined card-icon">radar</span>
                      <div>
                        <div className="card-title">Dimension Averages</div>
                        <div className="card-subtitle">Average scores across all your interviews</div>
                      </div>
                    </div>
                    {Object.entries(analytics.dimension_averages)
                      .sort(([, a], [, b]) => b - a)
                      .map(([dim, score]) => (
                        <div key={dim} className="dim-row">
                          <div className="dim-label">{dim.replace(/_/g, " ")}</div>
                          <div className="dim-bar-bg">
                            <div className="dim-bar-fill" style={{ width: `${(score / 10) * 100}%`, background: scoreColor(score) }} />
                          </div>
                          <div className="dim-score" style={{ color: scoreColor(score) }}>{score}</div>
                        </div>
                      ))}
                  </div>
                )}

                {/* SWOT Analysis */}
                <div className="card">
                  <div className="card-header">
                    <span className="material-symbols-outlined card-icon">grid_view</span>
                    <div>
                      <div className="card-title">SWOT Analysis</div>
                      <div className="card-subtitle">Aggregated insights from all your evaluations</div>
                    </div>
                  </div>
                  <div className="swot-grid">
                    {/* Strengths */}
                    <div className="swot-quad swot-s">
                      <div className="swot-heading">
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>thumb_up</span>
                        Strengths
                      </div>
                      {analytics.swot.strengths.length > 0
                        ? analytics.swot.strengths.map((s, i) => <div key={i} className="swot-item">{s}</div>)
                        : <div className="swot-empty">No strengths identified yet</div>}
                    </div>
                    {/* Weaknesses */}
                    <div className="swot-quad swot-w">
                      <div className="swot-heading">
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>thumb_down</span>
                        Weaknesses
                      </div>
                      {analytics.swot.weaknesses.length > 0
                        ? analytics.swot.weaknesses.map((w, i) => <div key={i} className="swot-item">{w}</div>)
                        : <div className="swot-empty">No weaknesses identified yet</div>}
                    </div>
                    {/* Opportunities */}
                    <div className="swot-quad swot-o">
                      <div className="swot-heading">
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>trending_up</span>
                        Opportunities
                      </div>
                      {analytics.swot.opportunities.length > 0
                        ? analytics.swot.opportunities.map((o, i) => <div key={i} className="swot-item">{o}</div>)
                        : <div className="swot-empty">Complete more interviews to see opportunities</div>}
                    </div>
                    {/* Threats */}
                    <div className="swot-quad swot-t">
                      <div className="swot-heading">
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>warning</span>
                        Threats / Risks
                      </div>
                      {analytics.swot.threats.length > 0
                        ? analytics.swot.threats.map((t, i) => <div key={i} className="swot-item">{t}</div>)
                        : <div className="swot-empty">No high-risk areas identified yet</div>}
                    </div>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}