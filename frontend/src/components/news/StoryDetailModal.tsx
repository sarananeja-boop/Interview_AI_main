"use client";

import React, { useState, useEffect } from "react";
import { analyzeStory } from "@/lib/api";
import "./news-modals.css";

interface StoryDetailModalProps {
  story: any; // The full headline object containing ai_analysis
  onClose: () => void;
}

export default function StoryDetailModal({ story, onClose }: StoryDetailModalProps) {
  const [analysis, setAnalysis] = useState<any>(story?.ai_analysis || null);
  const [loading, setLoading] = useState<boolean>(!story?.ai_analysis);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (story && !story.ai_analysis) {
      setLoading(true);
      analyzeStory(story.title, story.summary, story.category)
        .then((res) => {
          setAnalysis(res.ai_analysis);
          story.ai_analysis = res.ai_analysis; // Mutate so it's cached for this session
        })
        .catch(() => setError("Failed to generate AI analysis. Please try again."))
        .finally(() => setLoading(false));
    }
  }, [story]);

  if (!story) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>
          <span className="material-symbols-outlined">close</span>
        </button>

        <div className="modal-header">
          <div className="modal-meta">
            <span className="modal-category">{story.category.toUpperCase()}</span>
            <span className={`modal-relevance ${story.relevance_level.replace(" ", "-").toLowerCase()}`}>
              {story.relevance_level}
            </span>
          </div>
          <h2>{story.title}</h2>
          <div className="modal-source">
            <span>{story.source}</span>
            <span>&bull;</span>
            <span>{new Date(story.date).toLocaleDateString()}</span>
            {story.url && (
              <a href={story.url} target="_blank" rel="noopener noreferrer" className="read-original">
                Read Original <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>open_in_new</span>
              </a>
            )}
          </div>
        </div>

        <div className="modal-body">
          {loading ? (
            <div className="loading-state">
              <div className="spinner" />
              <p className="loading-text">Generating AI intelligence brief...</p>
            </div>
          ) : error ? (
            <div className="no-analysis">
              <p>{error}</p>
              <p className="summary-fallback">{story.summary}</p>
            </div>
          ) : analysis ? (
            <>
              {analysis.factualSummary?.length > 0 && (
                <section className="analysis-section">
                  <h3>What Happened?</h3>
                  <ul className="factual-bullets">
                    {analysis.factualSummary.map((bullet: string, idx: number) => (
                      <li key={idx}>{bullet}</li>
                    ))}
                  </ul>
                </section>
              )}

              {analysis.whyItMatters && (
                <section className="analysis-section">
                  <h3>Why Does It Matter?</h3>
                  <p>{analysis.whyItMatters}</p>
                </section>
              )}

              {(analysis.interviewAngle || analysis.modelAnswer30Sec) && (
                <section className="analysis-section answers-section">
                  <h3>Interview Preparation</h3>
                  {analysis.interviewAngle && (
                    <div className="interview-angle">
                      <strong>Likely Question:</strong> {analysis.interviewAngle}
                    </div>
                  )}
                  
                  {analysis.modelAnswer30Sec && (
                    <div className="model-answers">
                      <div className="answer-card">
                        <h4>30-Second Answer</h4>
                        <p>{analysis.modelAnswer30Sec}</p>
                      </div>
                    </div>
                  )}
                </section>
              )}
            </>
          ) : (
            <div className="no-analysis">
              <p>Detailed AI analysis is not available for this story.</p>
              <p className="summary-fallback">{story.summary}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
