"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isAuthenticated } from "@/lib/api";

export default function LandingPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (isAuthenticated()) {
      router.push("/dashboard");
    }
  }, [router]);

  if (!mounted) return null;

  return (
    <div className="landing">
      {/* Header */}
      <header className="landing-header">
        <div className="container" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: "var(--header-height)" }}>
          <div className="logo">
            <span className="text-gradient" style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.3rem" }}>
              IIM Simulator
            </span>
          </div>
          <nav style={{ display: "flex", gap: "var(--space-md)", alignItems: "center" }}>
            <button className="btn btn-ghost" onClick={() => router.push("/login")}>
              Log In
            </button>
            <button className="btn btn-primary" onClick={() => router.push("/register")}>
              Start Practicing
            </button>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-bg-grid" />
        <div className="container hero-content">
          <div className="animate-fade-in">
            <span className="badge badge-accent" style={{ marginBottom: "var(--space-lg)" }}>
              ● AI-Powered Interview Simulation
            </span>
          </div>

          <h1 className="text-display animate-slide-up" style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)", maxWidth: "800px", marginBottom: "var(--space-lg)" }}>
            Prepare for IIM interviews{" "}
            <span className="text-gradient">like never before</span>
          </h1>

          <p className="text-muted animate-slide-up stagger-1" style={{ fontSize: "1.15rem", maxWidth: "600px", marginBottom: "var(--space-2xl)", lineHeight: 1.7 }}>
            AI interviewers that simulate real IIM panels — skeptical, adaptive,
            and relentless. Upload your profile, face the pressure, get scored.
          </p>

          <div className="animate-slide-up stagger-2" style={{ display: "flex", gap: "var(--space-md)", flexWrap: "wrap" }}>
            <button className="btn btn-primary btn-lg" onClick={() => router.push("/register")}>
              Begin Mock Interview →
            </button>
            <button className="btn btn-secondary btn-lg" onClick={() => {
              document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
            }}>
              How It Works
            </button>
          </div>

          {/* Stats */}
          <div className="hero-stats animate-slide-up stagger-3">
            <div className="stat">
              <div className="stat-value">12</div>
              <div className="stat-label">Scoring Dimensions</div>
            </div>
            <div className="stat-divider" />
            <div className="stat">
              <div className="stat-value">4</div>
              <div className="stat-label">Interviewer Personas</div>
            </div>
            <div className="stat-divider" />
            <div className="stat">
              <div className="stat-value">AI</div>
              <div className="stat-label">Contradiction Tracking</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="features-section">
        <div className="container">
          <h2 className="text-display" style={{ fontSize: "2rem", textAlign: "center", marginBottom: "var(--space-3xl)" }}>
            Not a chatbot.{" "}
            <span className="text-gradient">A panel simulation.</span>
          </h2>

          <div className="features-grid">
            {[
              { icon: "🎯", title: "Profile-Aware Questioning", desc: "AI reads your resume and targets your weakest points — just like a real panel." },
              { icon: "⚡", title: "Adaptive Pressure", desc: "Vague answers increase pressure. Strong answers shift the topic. The AI adapts in real-time." },
              { icon: "🔍", title: "Contradiction Detection", desc: "Claims you made earlier get tracked. Contradictions are called out aggressively." },
              { icon: "🧠", title: "Memory-Aware Interviews", desc: "The AI remembers everything you said. Weak answers get revisited later with harder framing." },
              { icon: "📊", title: "12-Dimension Scoring", desc: "Communication, confidence, composure, logical structure — scored across 12 real interview dimensions." },
              { icon: "🎭", title: "Realistic Personas", desc: "Skeptic. Academic. Friendly Trap. Mixed Panel. Each persona behaves differently." },
            ].map((f, i) => (
              <div key={i} className="card feature-card animate-fade-in" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="feature-icon">{f.icon}</div>
                <h3 style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "var(--space-sm)" }}>{f.title}</h3>
                <p className="text-muted" style={{ fontSize: "0.9rem", lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="how-section">
        <div className="container">
          <h2 className="text-display" style={{ fontSize: "2rem", textAlign: "center", marginBottom: "var(--space-3xl)" }}>
            Three steps to{" "}
            <span className="text-gradient">interview readiness</span>
          </h2>

          <div className="steps-grid">
            {[
              { step: "01", title: "Upload Your Profile", desc: "Upload your resume. The AI extracts your background, identifies pressure points, and generates likely panel questions." },
              { step: "02", title: "Face the Panel", desc: "Enter a live text-based interview with an AI panel. Get cross-questioned, challenged, and pushed — exactly like the real thing." },
              { step: "03", title: "Get Your Score", desc: "Receive a 12-dimension evaluation with weak answer rewrites, improvement plans, and honest panel perception analysis." },
            ].map((s, i) => (
              <div key={i} className="step-card">
                <div className="step-number text-gradient">{s.step}</div>
                <h3 style={{ fontSize: "1.15rem", fontWeight: 600, marginBottom: "var(--space-sm)" }}>{s.title}</h3>
                <p className="text-muted" style={{ fontSize: "0.9rem", lineHeight: 1.6 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="cta-section">
        <div className="container" style={{ textAlign: "center" }}>
          <div className="cta-card glass-strong">
            <h2 className="text-display" style={{ fontSize: "2rem", marginBottom: "var(--space-md)" }}>
              Ready to face the panel?
            </h2>
            <p className="text-muted" style={{ marginBottom: "var(--space-xl)", fontSize: "1.05rem" }}>
              Stop guessing. Start practicing with AI that thinks like an IIM professor.
            </p>
            <button className="btn btn-primary btn-lg" onClick={() => router.push("/register")}>
              Start Your Mock Interview →
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="container" style={{ textAlign: "center" }}>
          <p className="text-dim" style={{ fontSize: "0.85rem" }}>
            IIM Interview Simulator — AI-powered mock interview platform. Not affiliated with any IIM.
          </p>
        </div>
      </footer>

      <style jsx>{`
        .landing-header {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 100;
          background: rgba(10, 10, 15, 0.8);
          backdrop-filter: blur(20px);
          border-bottom: var(--border-subtle);
        }

        .hero {
          min-height: 100vh;
          display: flex;
          align-items: center;
          position: relative;
          padding-top: var(--header-height);
          overflow: hidden;
        }

        .hero-bg-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(99, 102, 241, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(99, 102, 241, 0.03) 1px, transparent 1px);
          background-size: 60px 60px;
          mask-image: radial-gradient(ellipse at center, black 30%, transparent 70%);
        }

        .hero-content {
          position: relative;
          z-index: 1;
        }

        .hero-stats {
          display: flex;
          align-items: center;
          gap: var(--space-xl);
          margin-top: var(--space-3xl);
          padding: var(--space-lg) var(--space-xl);
          background: var(--bg-glass);
          border: var(--border-subtle);
          border-radius: var(--radius-lg);
          width: fit-content;
        }

        .stat-value {
          font-family: var(--font-mono);
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--accent-primary);
        }

        .stat-label {
          font-size: 0.8rem;
          color: var(--text-tertiary);
          margin-top: 2px;
        }

        .stat-divider {
          width: 1px;
          height: 40px;
          background: rgba(255, 255, 255, 0.08);
        }

        .features-section {
          padding: var(--space-3xl) 0;
          padding-top: 6rem;
        }

        .features-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: var(--space-lg);
        }

        .feature-card {
          padding: var(--space-xl);
        }

        .feature-icon {
          font-size: 2rem;
          margin-bottom: var(--space-md);
        }

        .how-section {
          padding: 6rem 0;
        }

        .steps-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: var(--space-xl);
        }

        .step-card {
          padding: var(--space-xl);
        }

        .step-number {
          font-family: var(--font-display);
          font-size: 3rem;
          font-weight: 800;
          margin-bottom: var(--space-md);
          opacity: 0.8;
        }

        .cta-section {
          padding: 4rem 0 6rem;
        }

        .cta-card {
          padding: var(--space-3xl);
          border-radius: var(--radius-xl);
          max-width: 600px;
          margin: 0 auto;
        }

        .landing-footer {
          padding: var(--space-xl) 0;
          border-top: var(--border-subtle);
        }

        @media (max-width: 768px) {
          .hero-stats {
            flex-direction: column;
            gap: var(--space-md);
          }
          .stat-divider {
            width: 40px;
            height: 1px;
          }
        }
      `}</style>
    </div>
  );
}
