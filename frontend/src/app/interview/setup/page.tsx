"use client";
import SettingsModal from "@/app/components/SettingsModal";
import { getUser, logout } from "@/lib/api";

import ThemeToggle from "../../components/ThemeToggle";
import Logo from "@/app/components/Logo";

import { useEffect, useState, Suspense, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getProfile, updateProfile, startInterview, ensureAuth } from "@/lib/api";

function SetupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const profileId = searchParams.get("profile");

  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [persona, setPersona] = useState("iim_general");
  const [loading, setLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [error, setError] = useState("");
  const gridRef = useRef<HTMLDivElement>(null);

  const [hometown, setHometown] = useState("");
  const [userState, setUserState] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [customInterest, setCustomInterest] = useState("");
  const INDIAN_STATES = [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
    "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
    "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
    "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
    "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
    "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu",
    "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry"
  ];
  
  const CATEGORIES = [
    { id: "Geopolitics", label: "Geopolitics", icon: "public" },
    { id: "Finance", label: "Finance", icon: "account_balance" },
    { id: "Consulting", label: "Consulting", icon: "cases" },
    { id: "Marketing", label: "Marketing", icon: "campaign" },
    { id: "Operations", label: "Operations", icon: "conveyor_belt" },
    { id: "Product Management", label: "Product Management", icon: "inventory_2" },
    { id: "Data Analytics", label: "Data Analytics", icon: "query_stats" },
    { id: "Startups", label: "Startups", icon: "rocket_launch" },
    { id: "Economics", label: "Economics", icon: "trending_up" },
    { id: "Technology", label: "Technology", icon: "computer" },
    { id: "Social Impact", label: "Social Impact", icon: "volunteer_activism" },
    { id: "Public Policy", label: "Public Policy", icon: "gavel" },
    { id: "Sports", label: "Sports", icon: "sports_cricket" }
  ];

  useEffect(() => {
    async function init() {
      await ensureAuth();
      if (profileId) {
        getProfile(profileId).then(p => {
          setProfile(p);
          if (p.hometown) setHometown(p.hometown as string);
          if (p.state) setUserState(p.state as string);
          if (p.interests) setInterests(p.interests as string[]);
        }).catch(() => setError("Failed to load profile"));
      }
    }
    init();
  }, [profileId, router]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!gridRef.current) return;
      const cards = gridRef.current.querySelectorAll('.institute-card');
      cards.forEach((card) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        (card as HTMLElement).style.setProperty("--mouse-x", `${x}px`);
        (card as HTMLElement).style.setProperty("--mouse-y", `${y}px`);
      });
    };
    const grid = gridRef.current;
    if (grid) grid.addEventListener('mousemove', handleMouseMove as any);
    return () => {
      if (grid) grid.removeEventListener('mousemove', handleMouseMove as any);
    };
  }, []);

  const personas = [
    { key: "iim_a", name: "IIM Ahmedabad", role: "The Pinnacle", desc: "Focuses deeply on academics, career goals, current affairs, and budget impact. High pressure.", pressure: 0.90, icon: "🏛️", image: "/institutes/iim_a.jpg", tag1: "ACADEMICS", tag2: "STRESS INTERVIEW", symbol: "architecture", stance: "Uncompromising academic rigor and case-study mastery." },
    { key: "iim_b", name: "IIM Bangalore", role: "The Pragmatist", desc: "Focuses heavily on work experience, ethics vs morals, and situational leadership.", pressure: 0.85, icon: "🏢", image: "/institutes/iim_b.png", tag1: "WORK EX", tag2: "LEADERSHIP", symbol: "psychiatry", stance: "Emphasis on diverse experiences and collaborative leadership." },
    { key: "iim_c", name: "IIM Calcutta", role: "The Analyst", desc: "Probes cost-benefit analysis, mathematics, events organized, and market launches.", pressure: 0.85, icon: "📈", image: "/institutes/iim_c.png", tag1: "MATH", tag2: "MARKET TRENDS", symbol: "query_stats", stance: "Analytical excellence and financial acumen in complex markets." },
    { key: "iim_l", name: "IIM Lucknow", role: "The Strategist", desc: "Focuses on long-term career motivations, specific academic choices, and industry rationale.", pressure: 0.80, icon: "🎯", image: "/institutes/iim_l.png", tag1: "INDUSTRY RATIONALE", tag2: "CAREER GOALS", symbol: "history_edu", stance: "Focus on long-term career trajectory and solid industry rationale." },
    { key: "iim_general", name: "General IIM Panel", role: "The All-Rounder", desc: "A mixed panel taking all standard IIM questions into account. Most balanced.", pressure: 0.75, icon: "🎓", image: "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?q=80&w=2940&auto=format&fit=crop", tag1: "BALANCED", tag2: "ADAPTIVE", symbol: "groups", stance: "Holistic evaluation across all standard management dimensions." },
  ];

    const handleStart = async () => {
    if (!profileId) return;
    setError("");
    setLoading(true);
    try {
      await updateProfile(profileId, { hometown, state: userState, interests });
      const data = await startInterview(profileId, persona, "iim_general");
      router.push(`/interview/prepare?id=${data.interview_id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to start interview");
      setLoading(false);
    }
  };

  const parsed = profile?.parsed_profile as Record<string, unknown> | undefined;

  return (
    <div className="dashboard-layout">
      {/* Texture Overlay */}
      <div className="texture-overlay" />

      {/* ── Glass Sidebar (Desktop) ── */}
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
          <span className="material-symbols-outlined filled" style={{ fontSize: 20 }}>add_circle</span>
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
          <Link className="nav-item nav-item-active" href="/interview/setup">
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>psychology</span>
            New Interview
          </Link>
          <Link className="nav-item" href="/dashboard/history">
            <span className="material-symbols-outlined filled" style={{ fontSize: 20 }}>history_edu</span>
            Interview History
          </Link>
        </div>

        {/* Footer */}
        <div className="sidebar-footer">
          <button className="nav-item logout-btn" onClick={() => {
            localStorage.removeItem("user");
            localStorage.removeItem("token");
            router.push("/login");
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>logout</span>
            Logout
          </button>
        </div>
      </nav>

      {/* ── Main Content Area ── */}
      <main className="main-content">
        <header className="page-header">
          <div className="header-text-center">
            <h1 className="page-title">Select Your Arena</h1>
            <p className="page-subtitle">
              Each institute demands a distinct intellectual posture. Choose your target to <br />
              calibrate the AI mentor's interview rigor and thematic focus.
            </p>
          </div>
          <div style={{ position: "absolute", top: 0, right: 0, display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <ThemeToggle />
            <button 
              className="settings-top-btn" 
              onClick={() => setIsSettingsOpen(true)}
              title="Control Center Settings"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 24 }}>settings</span>
            </button>
          </div>
        </header>

        {/* Profile Summary Card */}
        {profile && parsed && (
          <div className="profile-summary glass-panel animate-fade-in">
            <div className="profile-header">
              <span className="material-symbols-outlined profile-icon">person</span>
              <h2 className="profile-title">Candidate Profile</h2>
            </div>
            <div className="profile-grid">
              <div className="profile-field">
                <span className="field-label">Name</span>
                <div className="field-value">{(parsed.name as string) || "Not extracted"}</div>
              </div>
              <div className="profile-field">
                <span className="field-label">Profile Type</span>
                <div className="field-value">
                  {(profile.candidate_type as Record<string, unknown>)?.type === "experienced"
                    ? "Experienced Professional"
                    : "Fresher"}
                </div>
              </div>
            </div>

            {/* Education entries */}
            {Array.isArray(parsed.education) && (parsed.education as Record<string, unknown>[]).length > 0 && (
              <div className="profile-section">
                <span className="field-label">
                  <span className="material-symbols-outlined label-icon">school</span>
                  Education
                </span>
                <div className="education-list">
                  {(parsed.education as Record<string, unknown>[]).map((edu, i) => (
                    <div key={i} className="education-item">
                      {[edu.degree, edu.field].filter(Boolean).join(" in ") || "—"}
                      {edu.institution ? ` — ${edu.institution}` : ""}
                      {edu.score ? ` (${edu.score})` : ""}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pressure Points */}
            {Array.isArray(profile.pressure_points) && profile.pressure_points.length > 0 && (
              <div className="profile-section">
                <span className="field-label">
                  <span className="material-symbols-outlined label-icon warning-icon">warning</span>
                  Panel will likely target
                </span>
                <ul className="pressure-points-list">
                  {(profile.pressure_points as string[]).slice(0, 3).map((p, i) => (
                    <li key={i} className="pressure-point-item">{p}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Your Details (Hometown, State, Interests) */}
        {profile && parsed && (
          <div className="interests-section glass-panel animate-fade-in" style={{ marginTop: '2rem', marginBottom: '3rem', padding: 'var(--space-xl)', borderRadius: 'var(--radius-xl)' }}>
            <h2 className="profile-title" style={{ marginBottom: '1.5rem' }}>Your Details & Interests</h2>
            <p className="desc-text" style={{ marginBottom: '2rem' }}>Provide this information to allow the AI to ask targeted current affairs and regional questions.</p>
            
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
              <div className="field-group" style={{ flex: 1 }}>
                <label className="field-label">Hometown</label>
                <input 
                  type="text" 
                  className="custom-interest-input" 
                  value={hometown} 
                  onChange={(e) => setHometown(e.target.value)} 
                  placeholder="E.g., Pune" 
                  style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--outline-variant)', background: 'transparent', color: 'var(--on-surface)' }}
                />
              </div>
              <div className="field-group" style={{ flex: 1 }}>
                <label className="field-label">State</label>
                <select 
                  className="custom-interest-input" 
                  value={userState} 
                  onChange={(e) => setUserState(e.target.value)} 
                  style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--outline-variant)', background: 'transparent', color: 'var(--on-surface)', appearance: 'none' }}
                >
                  <option value="" disabled style={{ color: 'black' }}>Select State...</option>
                  {INDIAN_STATES.map(state => (
                    <option key={state} value={state} style={{ color: 'black' }}>{state}</option>
                  ))}
                </select>
              </div>
            </div>

            <label className="field-label" style={{ marginBottom: '1rem' }}>Select Areas of Interest (Max 3)</label>
            <div className="interests-grid" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
              {CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  className={`interest-chip ${interests.includes(cat.id) ? 'interest-selected' : ''}`}
                  onClick={() => {
                    if (interests.includes(cat.id)) {
                      setInterests(interests.filter(i => i !== cat.id));
                    } else if (interests.length < 3) {
                      setInterests([...interests, cat.id]);
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '8px 16px',
                    borderRadius: '20px',
                    border: interests.includes(cat.id) ? '2px solid var(--primary)' : '1px solid var(--outline-variant)',
                    background: interests.includes(cat.id) ? 'var(--primary-container)' : 'transparent',
                    color: interests.includes(cat.id) ? 'var(--on-primary-container)' : 'var(--on-surface)',
                    cursor: interests.length >= 3 && !interests.includes(cat.id) ? 'not-allowed' : 'pointer',
                    opacity: interests.length >= 3 && !interests.includes(cat.id) ? 0.5 : 1
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>{cat.icon}</span>
                  {cat.label}
                </button>
              ))}
            </div>

            <div className="custom-interest-row" style={{ display: 'flex', gap: '0.5rem' }}>
              <input 
                type="text" 
                className="custom-interest-input" 
                value={customInterest} 
                onChange={e => setCustomInterest(e.target.value)} 
                placeholder="Other interest..." 
                style={{ flex: 1, padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--outline-variant)', background: 'transparent', color: 'var(--on-surface)' }}
              />
              <button 
                className="add-interest-btn"
                onClick={() => {
                  if (customInterest && interests.length < 3 && !interests.includes(customInterest)) {
                    setInterests([...interests, customInterest]);
                    setCustomInterest("");
                  }
                }}
                disabled={!customInterest || interests.length >= 3}
                style={{ padding: '0.75rem 1.5rem', borderRadius: 'var(--radius-md)', background: 'var(--primary)', color: 'var(--background)', border: 'none', cursor: 'pointer' }}
              >
                Add
              </button>
            </div>
            
            {/* Display Selected Interests */}
            {interests.length > 0 && (
              <div style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {interests.map(i => (
                  <span key={i} style={{ padding: '4px 12px', background: 'color-mix(in srgb, var(--primary) 20%, transparent)', color: 'var(--primary)', borderRadius: '12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {i}
                    <button onClick={() => setInterests(interests.filter(item => item !== i))} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>close</span>
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Persona Selection Grid */}
        <div className="persona-grid" ref={gridRef}>
          {personas.map((p) => (
            <button
              key={p.key}
              className={`institute-card ${persona === p.key ? "institute-selected" : ""}`}
              onClick={() => setPersona(p.key)}
            >
              {/* Card Header Area */}
              <div className="card-image-area">
                <div className="card-gradient-bg" style={{ backgroundImage: `url(${p.image})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
                </div>
                <div className="card-overlay" />
                <div className="card-header-content">
                  <span className="card-badge">
                    <span className="badge-dot" />
                    {p.role}
                  </span>
                  <h2 className="card-name">{p.name}</h2>
                  {persona === p.key && (
                    <span className="selected-badge">
                      <span className="material-symbols-outlined selected-check">check_circle</span>
                      Selected
                    </span>
                  )}
                </div>
              </div>

              {/* Card Body */}
              <div className="card-body">
                <div className="card-desc-row">
                  <span className="material-symbols-outlined desc-icon">{p.symbol}</span>
                  <div>
                    <h3 className="desc-label">Pedagogical Stance</h3>
                    <p className="desc-text">{p.desc}</p>
                  </div>
                </div>

                {/* Pressure Bar */}
                <div className="card-pressure">
                  <div className="pressure-label-row">
                    <span className="pressure-label-text">Pressure Level</span>
                    <span className="pressure-pct">{Math.round(p.pressure * 100)}%</span>
                  </div>
                  <div className="pressure-bar">
                    <div className="pressure-bar-fill" style={{ width: `${p.pressure * 100}%` }} />
                  </div>
                </div>

                <div className="card-divider" />

                {/* Tags */}
                <div className="card-footer">
                  <div className="card-tags">
                    {p.tag1 && <span className="tag-pill tag-blue">{p.tag1}</span>}
                    {p.tag2 && <span className="tag-pill tag-teal">{p.tag2}</span>}
                  </div>
                  <span className="material-symbols-outlined card-arrow">arrow_forward</span>
                </div>
              </div>
            </button>
          ))}
        </div>

        

        {error && <div className="auth-error">{error}</div>}

        {/* CTA Button */}
        <button
          className="cta-button"
          onClick={handleStart}
          disabled={loading || !profileId}
        >
          {loading ? (
            <>
              <span className="material-symbols-outlined animate-spin">progress_activity</span>
              Preparing interview...
            </>
          ) : (
            <>
              Enter Interview Room
              <span className="material-symbols-outlined cta-arrow">arrow_forward</span>
            </>
          )}
        </button>
      </main>

      <style jsx>{`
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
          padding: 2.5rem 2rem;
          border-radius: var(--radius-xl);
          background: color-mix(in srgb, var(--on-surface) 3%, transparent);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border: var(--border-subtle);
          box-shadow: var(--shadow-md);
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
          font-size: 3.5rem;
          font-weight: 600;
          color: var(--on-background);
          letter-spacing: -0.02em;
          line-height: 1.1;
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
          background: color-mix(in srgb, var(--on-surface) 5%, transparent);
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          border-radius: 12px;
          overflow: hidden;
          border: var(--border-subtle);
          box-shadow: var(--shadow-md);
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .institute-card:hover {
          transform: translateY(-4px);
          border-color: rgba(255, 255, 255, 0.3);
          box-shadow: var(--shadow-lg);
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
          font-size: 2.75rem;
          font-weight: 700;
          color: #ffffff;
          line-height: 1.1;
          text-shadow: 0 2px 12px rgba(0,0,0,0.4);
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
          background: transparent;
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
          font-size: 20px;
          font-weight: 700;
          color: var(--on-surface);
          margin-bottom: 6px;
        }

        .desc-text {
          font-size: 16px;
          color: color-mix(in srgb, var(--on-surface) 85%, transparent);
          line-height: 1.6;
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
          font-size: 14px;
          font-weight: 700;
          color: color-mix(in srgb, var(--on-surface) 70%, transparent);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .pressure-pct {
          font-size: 16px;
          font-weight: 800;
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
          padding: 6px 14px;
          border-radius: var(--radius-full);
          font-size: 11px;
          font-weight: 700;
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
          background: color-mix(in srgb, var(--on-surface) 5%, transparent);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid color-mix(in srgb, var(--on-surface) 10%, transparent);
          border-radius: 16px;
          padding: 2rem;
          margin-bottom: 2rem;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
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
            font-size: 4.5rem;
            line-height: 1.1;
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
    </div>
  );
}

export default function SetupPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "var(--background)" }} />}>
      <SetupContent />
    </Suspense>
  );
}
