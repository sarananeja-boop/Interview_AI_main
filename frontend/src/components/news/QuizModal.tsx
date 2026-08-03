"use client";

import React, { useState } from "react";
import "./news-modals.css";

interface QuizModalProps {
  story: any; // The full headline object
  onClose: () => void;
}

export default function QuizModal({ story, onClose }: QuizModalProps) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [userAnswers, setUserAnswers] = useState<string[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState("");

  if (!story || !story.ai_analysis || !story.ai_analysis.practiceQuestions) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <button className="close-btn" onClick={onClose}>
            <span className="material-symbols-outlined">close</span>
          </button>
          <div className="no-analysis">
            <p>Quiz is not available for this story.</p>
          </div>
        </div>
      </div>
    );
  }

  const questions = story.ai_analysis.practiceQuestions;
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
              <textarea
                value={currentAnswer}
                onChange={(e) => setCurrentAnswer(e.target.value)}
                placeholder="Draft your answer here..."
                rows={4}
              />
              <button 
                className="btn btn-primary" 
                onClick={() => setShowAnswer(true)}
                disabled={currentAnswer.trim().length === 0}
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
                <p>{story.ai_analysis.modelAnswer30Sec}</p>
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
