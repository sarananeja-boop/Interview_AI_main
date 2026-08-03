"use client";
import SettingsModal from "@/app/components/SettingsModal";
import ThemeToggle from "../../components/ThemeToggle";
import Logo from "@/app/components/Logo";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ensureAuth, logout, getDailyNews } from "@/lib/api";
import StoryDetailModal from "@/components/news/StoryDetailModal";
import QuizModal from "@/components/news/QuizModal";

const CATEGORIES = [
  { key: "economy", label: "Economy", icon: "trending_up" },
  { key: "finance", label: "Finance", icon: "account_balance" },
  { key: "geopolitics", label: "Geopolitics", icon: "public" },
  { key: "technology", label: "Technology", icon: "memory" },
  { key: "social_policy", label: "Social Policy", icon: "groups" },
  { key: "environment", label: "Environment", icon: "eco" },
  { key: "sports", label: "Sports", icon: "sports_cricket" },
];

interface Headline {
  title: string;
  category: string;
  source: string;
  date: string;
  url: string;
  summary: string;
  base_score?: number;
  relevance_level?: string;
  ai_analysis?: any;
}

export default function NewsPage() {
  const router = useRouter();
  const [headlines, setHeadlines] = useState<Headline[]>([]);
  const [bigPicture, setBigPicture] = useState<any>(null);
  const [priorityTopics, setPriorityTopics] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  
  // UI State
  const [activeMode, setActiveMode] = useState<"must_know" | "all">("must_know");
  const [activeStoryDetail, setActiveStoryDetail] = useState<Headline | null>(null);
  const [activeQuizStory, setActiveQuizStory] = useState<Headline | null>(null);

  const fetchNews = async (categories: string[]) => {
    setLoading(true);
    try {
      const data = await getDailyNews(categories);
      setHeadlines(data.headlines || []);
      setBigPicture(data.big_picture || null);
      setPriorityTopics(data.priority_topics || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    async function init() {
      await ensureAuth();
      fetchNews(selectedCategories);
    }
    init();
  }, [router]);

  const toggleCategory = (key: string) => {
    const newCategories = selectedCategories.includes(key)
      ? selectedCategories.filter((c) => c !== key)
      : [...selectedCategories, key];
    setSelectedCategories(newCategories);
    fetchNews(newCategories);
  };
  
  const mustKnowStories = headlines.filter(h => h.ai_analysis);
  const otherStories = headlines.filter(h => !mustKnowStories.includes(h));
  
  const displayStories = activeMode === "must_know" ? mustKnowStories : otherStories;

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
          <Link className="nav-item nav-item-active" href="/dashboard/news">
            <span className="material-symbols-outlined filled" style={{ fontSize: 20 }}>article</span>
            Daily News
          </Link>
          <Link className="nav-item" href="/interview/setup">
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>psychology</span>
            New Interview
          </Link>
          <Link className="nav-item" href="/dashboard/history">
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
            <h1 className="page-title">Daily Interview Brief</h1>
            <p className="page-subtitle">Your AI-curated intelligence for IIM interview preparation.</p>
          </div>
          <div className="header-actions" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div className="header-stat">
              <span className="stat-number">{mustKnowStories.length}</span>
              <span className="stat-label">Must Know</span>
            </div>
            <div className="header-stat">
              <span className="stat-number">{headlines.length}</span>
              <span className="stat-label">Headlines</span>
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
        
        {/* ── Mode Bar ── */}
        <div className="mode-bar">
          <button 
            className={`mode-btn ${activeMode === 'must_know' ? 'active' : ''}`}
            onClick={() => setActiveMode('must_know')}
          >
            <span className="material-symbols-outlined">star</span>
            Must Know
          </button>
          <button 
            className={`mode-btn ${activeMode === 'all' ? 'active' : ''}`}
            onClick={() => setActiveMode('all')}
          >
            <span className="material-symbols-outlined">list</span>
            All Headlines
          </button>
        </div>

        {loading ? (
          <div className="loading-state">
            <div className="spinner" />
            <p className="loading-text">Analyzing today's intelligence…</p>
          </div>
        ) : (
          <div className={`dashboard-grid ${(!priorityTopics.length && activeMode !== "must_know") ? 'full-width' : ''}`}>
            {/* ── Left Column (Main Content) ── */}
            <div className="left-column">
              {activeMode === "must_know" && bigPicture && (
                <div className="big-picture-panel">
                  <div className="panel-header">
                    <span className="material-symbols-outlined" style={{ color: '#8b5cf6' }}>psychology</span>
                    <h3>Today's Big Picture</h3>
                  </div>
                  <p>{bigPicture.synthesis}</p>
                  {bigPicture.themes && (
                    <div className="theme-tags">
                      {bigPicture.themes.map((theme: string, idx: number) => (
                        <span key={idx} className="theme-chip">{theme}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── Filter Bar ── */}
              <div className="filter-bar">
                <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--outline)", alignSelf: "center", marginRight: "0.5rem" }}>
                  Filter by Topic:
                </span>
                {CATEGORIES.map(({ key, label, icon }) => {
                  const isActive = selectedCategories.includes(key);
                  return (
                    <button
                      key={key}
                      className={`filter-btn ${isActive ? "filter-active" : ""}`}
                      onClick={() => toggleCategory(key)}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{icon}</span>
                      {label}
                    </button>
                  );
                })}
                {selectedCategories.length > 0 && (
                  <button
                    className="filter-btn clear-btn"
                    onClick={() => {
                      setSelectedCategories([]);
                      fetchNews([]);
                    }}
                  >
                    Clear Filters
                  </button>
                )}
              </div>

              {displayStories.length === 0 ? (
                <div className="empty-state">
                  <span className="material-symbols-outlined" style={{ fontSize: 40, color: "var(--outline)", marginBottom: "0.75rem" }}>
                    newspaper
                  </span>
                  <h3 className="empty-title">No News Found</h3>
                  <p className="empty-sub">Try selecting different topics or check back later.</p>
                </div>
              ) : (
                <div className="news-grid">
                  {displayStories.map((headline, idx) => (
                    <div key={idx} className={`news-card ${headline.relevance_level === "High Relevance" ? 'priority-card' : ''}`}>
                      <div className="news-header">
                        <span className="news-category">
                          {CATEGORIES.find(c => c.key === headline.category)?.label || "General"}
                        </span>
                        {headline.relevance_level && (
                          <span className={`news-relevance ${headline.relevance_level.replace(" ", "-").toLowerCase()}`}>
                            {headline.relevance_level}
                          </span>
                        )}
                        <span className="news-date">
                          {new Date(headline.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </span>
                      </div>
                      <h3 className="news-title">{headline.title}</h3>
                      
                      {headline.ai_analysis && activeMode === "must_know" && (headline.ai_analysis.factualSummary?.length > 0 || headline.ai_analysis.whyItMatters) ? (
                        <div className="ai-preview">
                          {headline.ai_analysis.factualSummary?.[0] && (
                            <p><strong>What Happened:</strong> {headline.ai_analysis.factualSummary[0]}</p>
                          )}
                          {headline.ai_analysis.whyItMatters && (
                            <p><strong>Why It Matters:</strong> {headline.ai_analysis.whyItMatters}</p>
                          )}
                          {headline.ai_analysis.interviewAngle && (
                            <div className="interview-angle-preview">
                              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>psychology</span>
                              {headline.ai_analysis.interviewAngle}
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="news-summary">{headline.summary}</p>
                      )}

                      <div className="news-footer">
                        <span className="news-source">{headline.source.replace(/_/g, " ").toUpperCase()}</span>
                      </div>
                      
                      {activeMode === "must_know" ? (
                        <div className="card-actions">
                          <button className="action-btn" onClick={() => headline.url && window.open(headline.url, "_blank")}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>open_in_new</span> Read
                          </button>
                          {headline.ai_analysis && (
                            <>
                              <button className="action-btn outline" onClick={() => setActiveStoryDetail(headline)}>
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>info</span> Understand
                              </button>
                              <button className="action-btn outline" onClick={() => setActiveQuizStory(headline)}>
                                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>quiz</span> Quiz Me
                              </button>
                            </>
                          )}
                        </div>
                      ) : (
                        <div className="card-actions" style={{ marginTop: 'auto' }}>
                          <button className="action-btn" onClick={() => headline.url && window.open(headline.url, "_blank")}>
                            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>open_in_new</span> Read Full Story
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Right Column (Sidebar panels) ── */}
            <div className="right-column">
              {priorityTopics.length > 0 && (
                <div className="side-panel">
                  <h3>Your Priority Topics</h3>
                  <p className="panel-sub">Based on your candidate profile</p>
                  <div className="tags-container">
                    {priorityTopics.map((topic, i) => (
                      <span key={i} className="priority-tag">{topic}</span>
                    ))}
                  </div>
                </div>
              )}

              {activeMode === "must_know" && otherStories.length > 0 && (
                <div className="side-panel more-headlines-panel">
                  <h3>More Headlines</h3>
                  <div className="compact-list">
                    {otherStories.slice(0, 10).map((hl, i) => (
                      <div key={i} className="compact-item" onClick={() => hl.url && window.open(hl.url, "_blank")}>
                        <div className="compact-meta">
                          <span className="compact-cat">{hl.category.toUpperCase()}</span>
                          <span className="compact-source">{hl.source.replace(/_/g, " ")}</span>
                        </div>
                        <h4 className="compact-title">{hl.title}</h4>
                      </div>
                    ))}
                  </div>
                  {otherStories.length > 10 && (
                    <button className="view-all-btn" onClick={() => setActiveMode('all')}>
                      View all {otherStories.length} more
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ── Modals ── */}
      {isSettingsOpen && <SettingsModal onClose={() => setIsSettingsOpen(false)} />}
      {activeStoryDetail && <StoryDetailModal story={activeStoryDetail} onClose={() => setActiveStoryDetail(null)} />}
      {activeQuizStory && <QuizModal story={activeQuizStory} onClose={() => setActiveQuizStory(null)} />}

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
          padding: 1.75rem;
          margin-bottom: 1.5rem;
          animation: slideUp 0.6s ease-out both;
          box-shadow: var(--shadow-md);
          background: var(--surface);
          border: 1px solid var(--border-subtle);
          border-radius: 16px;
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
          background: var(--surface-variant);
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

        /* ── Mode Bar ── */
        .mode-bar {
          display: flex;
          gap: 12px;
          margin-bottom: 1.5rem;
          border-bottom: 1px solid var(--border-subtle);
          padding-bottom: 12px;
        }

        .mode-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          background: none;
          border: none;
          padding: 8px 16px;
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--text-secondary);
          cursor: pointer;
          border-radius: 8px;
          transition: all 0.2s;
        }

        .mode-btn .material-symbols-outlined {
          font-size: 18px;
        }

        .mode-btn:hover {
          background: rgba(0,0,0,0.05);
          color: var(--text-primary);
        }

        .mode-btn.active {
          background: rgba(21, 69, 57, 0.1);
          color: var(--primary);
        }

        /* ── Dashboard Grid ── */
        .dashboard-grid {
          display: grid;
          grid-template-columns: 1fr 320px;
          gap: 2rem;
        }

        .dashboard-grid.full-width {
          grid-template-columns: 1fr;
        }

        /* ── Left Column ── */
        .left-column {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .big-picture-panel {
          background: linear-gradient(135deg, rgba(139, 92, 246, 0.1), rgba(139, 92, 246, 0.05));
          border: 1px solid rgba(139, 92, 246, 0.2);
          border-radius: 12px;
          padding: 20px;
          animation: slideUp 0.4s ease-out;
        }

        .panel-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
        }

        .panel-header h3 {
          margin: 0;
          color: #8b5cf6;
          font-size: 1.1rem;
        }

        .big-picture-panel p {
          margin: 0 0 16px 0;
          line-height: 1.6;
          color: var(--text-primary);
          font-size: 0.95rem;
        }

        .theme-tags {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .theme-chip {
          background: rgba(139, 92, 246, 0.15);
          color: #8b5cf6;
          padding: 4px 10px;
          border-radius: 12px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        /* ── Filter Bar ── */
        .filter-bar {
          display: flex;
          gap: 0.75rem;
          flex-wrap: wrap;
          background: var(--surface);
          padding: 1rem;
          border-radius: 12px;
          border: 1px solid var(--border-subtle);
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

        .clear-btn {
          margin-left: auto;
          border: none;
          background: none;
          color: var(--primary);
          font-weight: 600;
        }
        .clear-btn:hover {
          background: rgba(21, 69, 57, 0.1);
        }

        /* ── News Grid ── */
        .news-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 1.25rem;
        }

        .news-card {
          display: flex;
          flex-direction: column;
          padding: 1.25rem;
          background: var(--surface);
          border: 1px solid var(--border-subtle);
          border-radius: 16px;
          transition: all 0.2s ease;
          box-shadow: var(--shadow-sm);
        }

        .priority-card {
          border-color: rgba(239, 68, 68, 0.3);
          background: linear-gradient(180deg, rgba(239, 68, 68, 0.02) 0%, var(--surface) 20%);
        }

        .news-card:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow-md);
        }

        .news-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 1rem;
          flex-wrap: wrap;
        }

        .news-category {
          font-size: 0.65rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          background: rgba(21, 69, 57, 0.08);
          color: var(--primary);
          padding: 0.25rem 0.6rem;
          border-radius: 4px;
        }

        .news-relevance {
          font-size: 0.65rem;
          font-weight: 600;
          padding: 0.25rem 0.6rem;
          border-radius: 4px;
        }
        .news-relevance.high-relevance {
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
        }
        .news-relevance.medium-relevance {
          background: rgba(245, 158, 11, 0.1);
          color: #f59e0b;
        }
        .news-relevance.low-relevance {
          background: rgba(59, 130, 246, 0.1);
          color: #3b82f6;
        }

        .news-date {
          font-size: 0.75rem;
          color: var(--outline);
          font-weight: 500;
          margin-left: auto;
        }

        .news-title {
          font-family: var(--font-display);
          font-size: 1.05rem;
          font-weight: 600;
          color: var(--on-surface);
          margin-bottom: 0.75rem;
          line-height: 1.35;
        }
        
        .ai-preview {
          font-size: 0.85rem;
          color: var(--text-secondary);
          line-height: 1.5;
          margin-bottom: 1rem;
          display: flex;
          flex-direction: column;
          gap: 8px;
          flex: 1;
        }

        .ai-preview p {
          margin: 0;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        
        .interview-angle-preview {
          background: rgba(139, 92, 246, 0.08);
          color: #8b5cf6;
          padding: 6px 10px;
          border-radius: 6px;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.8rem;
          margin-top: 4px;
        }

        .news-summary {
          font-size: 0.85rem;
          color: var(--on-surface-variant);
          line-height: 1.5;
          margin: 0 0 1rem 0;
          flex: 1;
          display: -webkit-box;
          -webkit-line-clamp: 4;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .news-footer {
          display: flex;
          align-items: center;
          border-top: 1px solid rgba(0, 0, 0, 0.06);
          padding-top: 12px;
          margin-bottom: 12px;
        }

        .news-source {
          font-size: 0.7rem;
          font-weight: 600;
          color: var(--outline);
          letter-spacing: 0.05em;
        }

        .card-actions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        
        .action-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
          padding: 6px 12px;
          border: none;
          background: rgba(0,0,0,0.05);
          color: var(--text-primary);
          border-radius: 6px;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .action-btn.outline {
          background: transparent;
          border: 1px solid var(--border);
        }

        .action-btn:hover {
          background: var(--primary);
          color: white;
          border-color: var(--primary);
        }
        
        .action-btn .material-icons {
          font-size: 14px;
        }

        /* ── Right Column ── */
        .right-column {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .side-panel {
          background: var(--surface);
          border: 1px solid var(--border-subtle);
          border-radius: 12px;
          padding: 20px;
        }

        .side-panel h3 {
          margin: 0 0 4px 0;
          font-size: 1.1rem;
          color: var(--text-primary);
        }

        .panel-sub {
          margin: 0 0 16px 0;
          font-size: 0.8rem;
          color: var(--text-secondary);
        }

        .tags-container {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .priority-tag {
          background: rgba(59, 130, 246, 0.1);
          color: #3b82f6;
          padding: 4px 10px;
          border-radius: 16px;
          font-size: 0.8rem;
          font-weight: 500;
          text-transform: capitalize;
        }

        .compact-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .compact-item {
          padding: 10px;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.2s;
          border: 1px solid transparent;
        }

        .compact-item:hover {
          background: var(--surface-light);
          border-color: var(--border);
        }

        .compact-meta {
          display: flex;
          justify-content: space-between;
          margin-bottom: 4px;
        }

        .compact-cat {
          font-size: 0.65rem;
          font-weight: 700;
          color: var(--primary);
        }
        
        .compact-source {
          font-size: 0.65rem;
          color: var(--text-secondary);
          font-weight: 600;
        }

        .compact-title {
          margin: 0;
          font-size: 0.9rem;
          line-height: 1.3;
          color: var(--text-primary);
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .view-all-btn {
          width: 100%;
          margin-top: 16px;
          padding: 10px;
          background: rgba(0,0,0,0.05);
          border: none;
          border-radius: 8px;
          color: var(--text-primary);
          font-weight: 600;
          cursor: pointer;
        }

        .view-all-btn:hover {
          background: rgba(0,0,0,0.1);
        }

        /* ── Loading / Empty States ── */
        .loading-state,
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 4rem 2rem;
          text-align: center;
        }

        .spinner {
          width: 32px;
          height: 32px;
          border: 3px solid rgba(21, 69, 57, 0.1);
          border-top-color: var(--primary);
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-bottom: 1rem;
        }

        .loading-text {
          color: var(--on-surface-variant);
          font-weight: 500;
        }

        .empty-title {
          font-size: 1.25rem;
          font-weight: 600;
          color: var(--on-surface);
          margin: 0.5rem 0;
        }

        .empty-sub {
          color: var(--on-surface-variant);
          max-width: 300px;
          font-size: 0.9rem;
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        @media (max-width: 1200px) {
          .dashboard-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
