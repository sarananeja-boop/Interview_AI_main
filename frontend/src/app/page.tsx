"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isAuthenticated } from "@/lib/api";
import Logo from "@/app/components/Logo";
export default function LandingPage() {
  const router = useRouter();
  const [status, setStatus] = useState("Initializing...");

  useEffect(() => {
    async function init() {
      if (isAuthenticated()) {
        router.push("/dashboard");
      } else {
        router.push("/login");
      }
    }
    init();
  }, [router]);

  return (
    <div className="landing">
      <div className="landing-content">
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "var(--space-md)" }}>
          <Logo width={64} height={64} showText={true} />
        </div>
        <p className="brand-subtitle">{status}</p>
      </div>

      <style jsx>{`
        .landing {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--background);
          position: relative;
          overflow: hidden;
        }
        .landing::before {
          content: '';
          position: absolute;
          top: 30%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 400px;
          height: 400px;
          background: radial-gradient(circle, var(--primary-fixed) 0%, transparent 70%);
          opacity: 0.3;
          filter: blur(80px);
          pointer-events: none;
        }
        .landing-content {
          text-align: center;
          position: relative;
          z-index: 1;
        }
        .spinner {
          width: 40px;
          height: 40px;
          margin: 0 auto var(--space-lg);
          border: 3px solid var(--outline-variant);
          border-top-color: var(--primary);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        .brand-title {
          font-family: var(--font-display);
          font-size: 2rem;
          font-weight: 500;
          color: var(--primary);
          margin-bottom: var(--space-sm);
          letter-spacing: -0.02em;
        }
        .brand-subtitle {
          font-size: 0.9rem;
          color: var(--on-surface-variant);
        }
      `}</style>
    </div>
  );
}
