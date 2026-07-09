"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Logo from "@/app/components/Logo";
import { apiFetch } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    
    try {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Login failed");
      }
      
      const data = await res.json();
      localStorage.setItem("user", JSON.stringify(data.user));
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      {/* Decorative gradient blob */}
      <div className="decorative-blob" aria-hidden="true" />

      <div className="auth-card glass-panel-elevated">
        {/* Branding */}
        <div className="auth-header">
          <div style={{ display: "flex", justifyContent: "center", marginBottom: "var(--space-md)" }}>
            <Logo width={64} height={64} showText={true} />
          </div>
          <h1 className="auth-headline text-display">Welcome Back</h1>
          <p className="auth-subtitle">Enter your credentials to access your simulator.</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="auth-form">
          {error && (
            <div className="auth-error-box">
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>error</span>
              {error}
            </div>
          )}

          <div className="field-group">
            <label className="field-label">Email Address</label>
            <input
              type="email"
              required
              className="field-input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="field-group">
            <label className="field-label">Password</label>
            <input
              type="password"
              required
              className="field-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="auth-submit"
          >
            {loading ? (
              <>
                <span className="spinner" />
                Authenticating...
              </>
            ) : (
              "Sign In"
            )}
          </button>

          <div className="auth-footer">
            <span className="auth-footer-text">Don&apos;t have an account?</span>
            {' '}
            <Link href="/register" className="auth-link">Register</Link>
          </div>
        </form>
      </div>

      <style jsx>{`
        .auth-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: var(--space-md);
          background: var(--background);
          position: relative;
          overflow: hidden;
        }

        .decorative-blob {
          position: absolute;
          width: 480px;
          height: 480px;
          border-radius: 50%;
          background: var(--primary-fixed);
          opacity: 0.35;
          filter: blur(100px);
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          pointer-events: none;
          z-index: 0;
        }

        .auth-card {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 560px;
          border-radius: var(--radius-2xl);
          padding: 3rem 2.5rem;
          animation: slideUp 0.6s ease-out both;
        }

        .auth-header {
          text-align: center;
          margin-bottom: var(--space-xl);
        }

        .brand-icon {
          width: 52px;
          height: 52px;
          margin: 0 auto var(--space-sm);
          background: var(--primary);
          border-radius: var(--radius-lg);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: var(--shadow-button);
          animation: float 3s ease-in-out infinite;
        }

        .brand-label {
          font-family: var(--font-display);
          font-size: var(--text-label-md);
          font-weight: 500;
          color: var(--primary);
          letter-spacing: 0.04em;
          margin-bottom: var(--space-md);
        }

        .auth-headline {
          font-family: var(--font-display);
          font-size: 2.25rem;
          font-weight: 700;
          color: var(--on-surface);
          margin-bottom: 0.5rem;
          line-height: 1.2;
        }

        .auth-subtitle {
          font-family: var(--font-sans);
          font-size: 1.1rem;
          color: var(--on-surface-variant);
          line-height: 1.5;
        }

        .auth-form {
          display: flex;
          flex-direction: column;
          gap: var(--space-md);
        }

        .auth-error-box {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-sm);
          background: var(--error-container);
          color: var(--error);
          padding: var(--space-sm) var(--space-md);
          border-radius: var(--radius-md);
          font-size: 0.85rem;
          font-family: var(--font-sans);
          animation: fadeIn 0.3s ease-out;
        }

        .field-group {
          display: flex;
          flex-direction: column;
        }

        .field-label {
          display: block;
          font-family: var(--font-sans);
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--on-surface-variant);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-bottom: 0.5rem;
        }

        .field-input {
          width: 100%;
          padding: 1rem 1.25rem;
          background: var(--surface-container-lowest);
          border: 1px solid var(--outline-variant);
          border-radius: var(--radius-lg);
          color: var(--on-surface);
          font-family: var(--font-sans);
          font-size: 1.1rem;
          outline: none;
          transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
        }

        .field-input:focus {
          border-color: var(--primary);
          box-shadow: 0 0 0 3px rgba(21, 69, 57, 0.12);
        }

        .field-input::placeholder {
          color: var(--outline);
        }

        .auth-submit {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-sm);
          width: 100%;
          padding: 1.1rem 2rem;
          margin-top: 1rem;
          background: var(--primary);
          color: var(--on-primary);
          border: none;
          border-radius: var(--radius-xl);
          font-family: var(--font-sans);
          font-size: 1.15rem;
          font-weight: 600;
          cursor: pointer;
          box-shadow: var(--shadow-button);
          transition: all var(--transition-smooth);
        }

        .auth-submit:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: var(--shadow-button-hover);
          background: var(--primary-container);
        }

        .auth-submit:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          transform: none;
        }

        .spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: var(--on-primary);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        .auth-footer {
          text-align: center;
          margin-top: var(--space-sm);
        }

        .auth-footer-text {
          font-family: var(--font-sans);
          font-size: 1rem;
          color: var(--on-surface-variant);
        }

        .auth-footer :global(.auth-link) {
          font-family: var(--font-sans);
          font-size: 1rem;
          font-weight: 600;
          color: var(--primary);
          text-decoration: none;
          transition: color var(--transition-fast);
        }

        .auth-footer :global(.auth-link:hover) {
          color: var(--primary-container);
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 480px) {
          .auth-card {
            padding: var(--space-xl) var(--space-md);
          }

          .decorative-blob {
            width: 320px;
            height: 320px;
          }
        }
      `}</style>
    </div>
  );
}
