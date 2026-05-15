"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/api";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container animate-fade-in">
        <div className="auth-header">
          <Link href="/" className="auth-logo text-gradient" style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "1.3rem" }}>
            IIM Simulator
          </Link>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginTop: "var(--space-xl)" }}>Welcome back</h1>
          <p className="text-muted" style={{ marginTop: "var(--space-sm)" }}>Log in to continue your preparation</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && (
            <div className="auth-error">{error}</div>
          )}

          <div className="form-group">
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              className="input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="input"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: "100%", marginTop: "var(--space-md)" }}>
            {loading ? "Logging in..." : "Log In"}
          </button>
        </form>

        <p className="auth-footer text-muted">
          Don&apos;t have an account?{" "}
          <Link href="/register">Create one</Link>
        </p>
      </div>

      <style jsx>{`
        .auth-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: var(--space-xl);
          background: var(--bg-primary);
        }

        .auth-container {
          width: 100%;
          max-width: 420px;
          padding: var(--space-2xl);
          background: var(--bg-secondary);
          border: var(--border-subtle);
          border-radius: var(--radius-xl);
        }

        .auth-header {
          text-align: center;
          margin-bottom: var(--space-xl);
        }

        .auth-form {
          display: flex;
          flex-direction: column;
          gap: var(--space-md);
        }

        .form-group {
          display: flex;
          flex-direction: column;
        }

        .auth-error {
          padding: var(--space-sm) var(--space-md);
          background: rgba(239, 68, 68, 0.1);
          border: 1px solid rgba(239, 68, 68, 0.3);
          border-radius: var(--radius-md);
          color: var(--accent-danger);
          font-size: 0.9rem;
        }

        .auth-footer {
          text-align: center;
          margin-top: var(--space-xl);
          font-size: 0.9rem;
        }
      `}</style>
    </div>
  );
}
