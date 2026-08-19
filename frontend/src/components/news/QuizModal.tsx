"use client";

import React, { useState, useEffect, useRef } from "react";
import { analyzeStory } from "@/lib/api";
import "./news-modals.css";

interface QuizModalProps {
  story: any; // The full headline object
  onClose: () => void;
}

export default function QuizModal({ story, onClose }: QuizModalProps) {
  const [analysis, setAnalysis] = useState<any>(story?.ai_analysis || null);
  const [loading, setLoading] = useState<boolean>(!story?.ai_analysis);
  const [error, setError] = useState<string | null>(null);

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [userAnswers, setUserAnswers] = useState<string[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [interimAnswer, setInterimAnswer] = useState("");
  
  const recognitionRef = useRef<any>(null);
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    if (story && !story.ai_analysis) {
      setLoading(true);
      analyzeStory(story.title, story.summary, story.category)
        .then((res) => {
          setAnalysis(res.ai_analysis);
          story.ai_analysis = res.ai_analysis; // Mutate so it's cached for this session
        })
        .catch(() => setError("Failed to generate quiz questions. Please try again."))
        .finally(() => setLoading(false));
    }
  }, [story]);

  if (!story) return null;

  if (loading) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content quiz-modal" onClick={(e) => e.stopPropagation()}>
          <button className="close-btn" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
          <div className="loading-state">
            <div className="spinner" />
            <p className="loading-text">Generating customized quiz questions...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !analysis || !analysis.practiceQuestions) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content quiz-modal" onClick={(e) => e.stopPropagation()}>
          <button className="close-btn" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
          <div className="no-analysis">
            <p>{error || "Quiz is not available for this story."}</p>
          </div>
        </div>
      </div>
    );
  }

  const questions = analysis.practiceQuestions;
  const question = questions[currentQuestionIndex];

  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setUserAnswers([...userAnswers, currentAnswer]);
      setCurrentAnswer("");
      setShowAnswer(false);
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    } else {
      onClose(); // Finish quiz
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsRecording(false);
      setInterimAnswer("");
      return;
    }

    // @ts-ignore
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true; // Enable real-time transcriptions
    
    recognition.onstart = () => {
      setIsRecording(true);
      setInterimAnswer("");
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let currentInterim = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          currentInterim += event.results[i][0].transcript;
        }
      }
      
      if (finalTranscript) {
        setCurrentAnswer((prev) => (prev ? prev + " " : "") + finalTranscript.trim());
      }
      setInterimAnswer(currentInterim);
    };

    recognition.onerror = (event: any) => {
      if (event.error !== 'aborted') {
        console.warn("Speech recognition error", event.error);
      }
      setIsRecording(false);
      setInterimAnswer("");
    };

    recognition.onend = () => {
      setIsRecording(false);
      setInterimAnswer("");
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  // Combine finalized answer and any ongoing speech for display
  const displayAnswer = currentAnswer + (interimAnswer ? (currentAnswer ? " " : "") + interimAnswer : "");

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content quiz-modal" onClick={(e) => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose}>
          <span className="material-symbols-outlined">close</span>
        </button>

        <div className="modal-header">
          <div className="quiz-progress">
            Question {currentQuestionIndex + 1} of {questions.length}
          </div>
          <h2>Lightweight Practice</h2>
          <p className="quiz-story-title">Based on: {story.title}</p>
        </div>

        <div className="modal-body">
          <div className="quiz-question">
            <span className="question-type">{question.type.toUpperCase()}</span>
            <h3>{question.question}</h3>
          </div>

          {!showAnswer ? (
            <div className="quiz-input-section">
              <div style={{ position: 'relative', width: '100%', marginBottom: '16px' }}>
                <textarea
                  value={displayAnswer}
                  onChange={(e) => {
                    // If user manually types, clear interim to prevent weird appending
                    setCurrentAnswer(e.target.value);
                    if (isRecording) {
                       setInterimAnswer(""); 
                    }
                  }}
                  placeholder="Draft your answer here... or use the mic to speak."
                  rows={4}
                  style={{ width: '100%', paddingRight: '44px', display: 'block', padding: '12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '15px' }}
                />
                <button 
                  onClick={toggleRecording}
                  style={{
                    position: 'absolute',
                    bottom: '12px',
                    right: '12px',
                    background: isRecording ? '#ff4d4f' : '#f0f0f0',
                    color: isRecording ? 'white' : '#555',
                    border: 'none',
                    borderRadius: '50%',
                    width: '36px',
                    height: '36px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: isRecording ? '0 0 8px rgba(255, 77, 79, 0.6)' : 'none'
                  }}
                  title={isRecording ? "Stop Recording" : "Start Recording"}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                    {isRecording ? "mic_off" : "mic"}
                  </span>
                </button>
              </div>
              <button 
                className="btn btn-primary" 
                onClick={() => setShowAnswer(true)}
                disabled={displayAnswer.trim().length === 0}
                style={{ width: '100%' }}
              >
                Reveal Model Answer
              </button>
            </div>
          ) : (
            <div className="quiz-answer-section">
              <div className="user-answer-display">
                <h4>Your Answer:</h4>
                <p>{currentAnswer}</p>
              </div>
              <div className="model-answer-display">
                <h4>Model Answer to compare against:</h4>
                <p>{analysis.modelAnswer30Sec}</p>
                <div className="quiz-tip">
                  <span className="material-symbols-outlined">lightbulb</span>
                  <p>Remember to structure your answer logically like the model answer!</p>
                </div>
              </div>
              <button className="btn btn-primary" onClick={handleNext}>
                {currentQuestionIndex < questions.length - 1 ? "Next Question" : "Finish Quiz"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
