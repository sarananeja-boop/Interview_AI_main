"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState("warm");

  useEffect(() => {
    const updateTheme = () => {
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem("app_settings");
        if (saved) {
          try {
            const settings = JSON.parse(saved);
            setTheme(settings.theme || "warm");
          } catch (e) {
            console.error(e);
          }
        }
      }
    };
    
    updateTheme();
    window.addEventListener("settingsChanged", updateTheme);
    return () => window.removeEventListener("settingsChanged", updateTheme);
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "warm" : "dark";
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("app_settings");
      let settings = { theme: newTheme };
      if (saved) {
        try {
          settings = { ...JSON.parse(saved), theme: newTheme };
        } catch (e) {
          console.error(e);
        }
      }
      localStorage.setItem("app_settings", JSON.stringify(settings));
      window.dispatchEvent(new Event("settingsChanged"));
    }
  };

  return (
    <>
      <button 
        className={`theme-switch ${theme === "dark" ? "is-dark" : "is-light"}`}
        onClick={toggleTheme}
        title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
        type="button"
      >
        <div className="switch-handle" />
        <span className="material-symbols-outlined icon-sun">circle</span>
        <span className="material-symbols-outlined icon-moon">dark_mode</span>
      </button>

      <style jsx>{`
        .theme-switch {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 64px;
          height: 32px;
          background-color: #333333;
          border-radius: 20px;
          border: none;
          padding: 0 4px;
          cursor: pointer;
          transition: background-color 0.3s ease;
          flex-shrink: 0;
        }
        
        .switch-handle {
          position: absolute;
          top: 3px;
          left: 4px;
          width: 26px;
          height: 26px;
          background-color: #F5F5F5;
          border-radius: 50%;
          transition: transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1);
          z-index: 1;
        }
        
        .is-dark .switch-handle {
          transform: translateX(30px);
        }
        
        .icon-sun, .icon-moon {
          font-size: 16px;
          z-index: 2;
          position: relative;
          width: 28px;
          display: flex;
          justify-content: center;
          align-items: center;
          transition: color 0.3s ease;
        }
        
        .icon-sun {
          font-variation-settings: 'FILL' 1;
        }
        
        .is-light .icon-sun {
          color: #333333;
        }
        .is-light .icon-moon {
          color: #A0A0A0;
        }
        
        .is-dark .icon-sun {
          color: #A0A0A0;
        }
        .is-dark .icon-moon {
          color: #333333;
          font-variation-settings: 'FILL' 1;
        }
      `}</style>
    </>
  );
}
