import { type GeneratedQuiz } from "@shared/schema";
import { useState } from "react";
import type { ContentQuizRequest, PDFQuizRequest, YouTubeQuizRequest, TextQuizRequest } from "@shared/types";

interface ResultsSectionProps {
  quiz: GeneratedQuiz;
  onNewQuiz: () => void;
  onRetryQuiz: () => void;
  onViewStats: () => void;
  onQuizGenerated: (quiz: GeneratedQuiz) => void;
}

export default function ResultsSection({ quiz, onNewQuiz, onRetryQuiz, onViewStats, onQuizGenerated }: ResultsSectionProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const storedResults = localStorage.getItem('quizResults');
  const quizResults = storedResults ? JSON.parse(storedResults) : null;

  const handleNewQuiz = () => {
    localStorage.removeItem('lastPdfFile');
    localStorage.removeItem('lastContentType');
    localStorage.removeItem('quizResults');
    onNewQuiz();
  };

  const handleRetryQuiz = () => {
    localStorage.removeItem('quizResults');
    onRetryQuiz();
  };

  const handleDifferentQuiz = async () => {
    setIsGenerating(true);
    try {
      const savedSettings = localStorage.getItem('quizSettings');
      const settings = savedSettings ? JSON.parse(savedSettings) : { difficulty: 'intermediate', questionCount: 5 };
      const lastContentType = localStorage.getItem('lastContentType');

      let requestBody: Partial<ContentQuizRequest> = {
        difficulty: settings.difficulty || settings.defaultDifficulty || 'intermediate',
        questionCount: settings.questionCount || 5,
      };

      if (lastContentType === 'pdf') {
        const savedPdfFile = localStorage.getItem('lastPdfFile');
        if (!savedPdfFile) throw new Error('PDF file info not found');
        (requestBody as PDFQuizRequest).pdfInfo = JSON.parse(savedPdfFile);
      } else if (lastContentType === 'youtube') {
        const savedYouTubeInfo = localStorage.getItem('savedYouTubeInfo');
        if (!savedYouTubeInfo) throw new Error('YouTube info not found');
        (requestBody as YouTubeQuizRequest).youtubeVideoId = JSON.parse(savedYouTubeInfo).videoId;
      } else if (lastContentType === 'text') {
        const savedTextContent = localStorage.getItem('lastTextContent');
        if (!savedTextContent) throw new Error('Text content not found');
        (requestBody as TextQuizRequest).textContent = savedTextContent;
      } else {
        throw new Error(`Unsupported content type: ${lastContentType}`);
      }

      localStorage.removeItem('quizResults');

      const response = await fetch('/api/generate-quiz-from-cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        try {
          const errorJson = JSON.parse(errorText);
          throw new Error(errorJson.message || `HTTP ${response.status}: Failed to generate quiz`);
        } catch {
          throw new Error(`HTTP ${response.status}: ${errorText || 'Failed to generate quiz'}`);
        }
      }

      const responseText = await response.text();
      const newQuiz = JSON.parse(responseText);
      onQuizGenerated(newQuiz);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to generate new quiz: ${errorMessage}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const results = quizResults || {
    score: 0,
    totalQuestions: quiz.questions.length,
    percentage: 0,
    totalTimeSpent: 0,
    detailedResults: quiz.questions.map((question) => ({
      question: question.question,
      userAnswer: null,
      correctAnswer: question.correctAnswer,
      isCorrect: false,
      timeSpent: 0,
      explanation: question.explanation,
    })),
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const getGrade = (pct: number) => {
    if (pct >= 90) return "A+";
    if (pct >= 80) return "A";
    if (pct >= 70) return "B+";
    if (pct >= 60) return "B";
    if (pct >= 50) return "C";
    return "D";
  };

  const getGradeColor = (pct: number) => {
    if (pct >= 70) return '#006764';
    if (pct >= 50) return '#6c5a00';
    return '#b41340';
  };

  const getMessage = (pct: number) => {
    if (pct >= 90) return "Outstanding! You're a quiz master!";
    if (pct >= 70) return "Great job! Keep it up!";
    if (pct >= 50) return "Not bad! Room for improvement.";
    return "Ouch! That was a tough one. Keep practicing!";
  };

  const grade = getGrade(results.percentage);
  const gradeColor = getGradeColor(results.percentage);

  return (
    <div className="space-y-12 pb-32">
      {/* Hero Section */}
      <section className="text-center">
        <div
          className="inline-flex items-center justify-center w-28 h-28 mb-6 relative"
          style={{ backgroundColor: '#ffd709', borderRadius: '1.5rem' }}
        >
          <span
            className="material-symbols-outlined"
            style={{
              fontSize: 64,
              color: '#6c5a00',
              fontVariationSettings: "'FILL' 1",
              animation: 'bounce 2s infinite ease-in-out',
            }}
          >
            trophy
          </span>
          <div className="absolute -top-4 -right-4 w-12 h-12 rounded-full blur-xl" style={{ backgroundColor: '#74f7f1', opacity: 0.5 }} />
          <div className="absolute -bottom-2 -left-4 w-16 h-16 rounded-full blur-xl" style={{ backgroundColor: '#ff709f', opacity: 0.3 }} />
        </div>
        <h2
          className="text-4xl tracking-tight mb-2"
          style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 900, color: '#a8275a' }}
        >
          Quiz Completed!
        </h2>
        <p className="font-semibold" style={{ color: '#5f5b4d' }}>
          {getMessage(results.percentage)}
        </p>
      </section>

      {/* Stats Grid */}
      <section className="grid grid-cols-2 gap-4">
        <div
          className="p-6 flex flex-col items-center justify-center text-center"
          style={{ backgroundColor: '#f8f0dc', borderRadius: '0.75rem' }}
        >
          <span className="text-xs uppercase tracking-widest font-bold mb-1" style={{ color: '#5f5b4d' }}>Accuracy</span>
          <span className="text-3xl" style={{ fontWeight: 900, color: results.percentage >= 50 ? '#006764' : '#b41340' }} data-testid="score-percentage">
            {results.percentage}%
          </span>
        </div>
        <div
          className="p-6 flex flex-col items-center justify-center text-center"
          style={{ backgroundColor: '#f8f0dc', borderRadius: '0.75rem' }}
        >
          <span className="text-xs uppercase tracking-widest font-bold mb-1" style={{ color: '#5f5b4d' }}>Grade</span>
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-2xl text-white"
            style={{ fontWeight: 900, backgroundColor: gradeColor }}
            data-testid="score-ranking"
          >
            {grade}
          </div>
        </div>
        <div
          className="p-6 flex flex-col items-center justify-center text-center"
          style={{ backgroundColor: '#f8f0dc', borderRadius: '0.75rem' }}
        >
          <span className="text-xs uppercase tracking-widest font-bold mb-1" style={{ color: '#5f5b4d' }}>Correct</span>
          <span className="text-3xl" style={{ fontWeight: 900, color: '#322f22' }} data-testid="score-correct">
            {results.score}/{results.totalQuestions}
          </span>
        </div>
        <div
          className="p-6 flex flex-col items-center justify-center text-center"
          style={{ backgroundColor: '#f8f0dc', borderRadius: '0.75rem' }}
        >
          <span className="text-xs uppercase tracking-widest font-bold mb-1" style={{ color: '#5f5b4d' }}>Time</span>
          <span className="text-3xl" style={{ fontWeight: 900, color: '#322f22' }} data-testid="score-time">
            {formatTime(results.totalTimeSpent)}
          </span>
        </div>
      </section>

      {/* Detailed Results */}
      <section className="space-y-6">
        <h3
          className="text-xl px-2"
          style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, color: '#322f22' }}
        >
          Detailed Results
        </h3>

        {results.detailedResults.map((result: any, index: number) => {
          const isCorrect = result.isCorrect;
          const borderColor = isCorrect ? '#006764' : '#b41340';
          const userAnswerText =
            result.userAnswer !== null && result.userAnswer !== undefined
              ? quiz.questions[index]?.options?.[result.userAnswer] || 'Unknown'
              : 'No answer';
          const correctAnswerText = quiz.questions[index]?.options?.[result.correctAnswer] || 'Unknown';

          return (
            <div
              key={index}
              className="p-6 relative overflow-hidden"
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '0.75rem',
                borderLeft: `8px solid ${borderColor}`,
                boxShadow: '0 2px 8px rgba(50, 47, 34, 0.06)',
              }}
            >
              <div className="flex justify-between items-start mb-3">
                <span className="text-sm font-bold" style={{ color: '#5f5b4d' }}>
                  Question {index + 1}
                </span>
                <span
                  className="material-symbols-outlined"
                  style={{
                    color: isCorrect ? '#006764' : '#b41340',
                    fontVariationSettings: "'FILL' 1",
                  }}
                >
                  {isCorrect ? 'check_circle' : 'cancel'}
                </span>
              </div>

              <p
                className="text-lg leading-snug mb-4"
                style={{ fontWeight: 700, color: '#322f22' }}
              >
                {result.question}
              </p>

              <div className="space-y-2">
                {!isCorrect && (
                  <div
                    className="p-3 flex items-center gap-2 text-sm font-medium"
                    style={{
                      borderRadius: '9999px',
                      backgroundColor: 'rgba(247, 75, 109, 0.15)',
                      color: '#510017',
                    }}
                  >
                    <span className="material-symbols-outlined text-base">close</span>
                    Your answer: {userAnswerText}
                  </div>
                )}
                <div
                  className="p-3 flex items-center gap-2 text-sm font-bold"
                  style={{
                    borderRadius: '9999px',
                    backgroundColor: 'rgba(116, 247, 241, 0.25)',
                    color: '#005c59',
                  }}
                >
                  <span className="material-symbols-outlined text-base">check_circle</span>
                  Correct answer: {correctAnswerText}
                </div>
              </div>

              {result.explanation && (
                <p className="mt-4 text-sm italic" style={{ color: '#5f5b4d' }}>
                  Explanation: {result.explanation}
                </p>
              )}
            </div>
          );
        })}
      </section>

      {/* Action Buttons */}
      <section className="grid grid-cols-2 gap-4">
        <button
          onClick={handleRetryQuiz}
          className="col-span-2 py-5 text-white text-lg active:scale-95 transition-all"
          style={{
            background: 'linear-gradient(135deg, #a8275a, #ff709f)',
            borderRadius: '1rem',
            fontWeight: 900,
            boxShadow: '0 8px 24px rgba(168, 39, 90, 0.25)',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
          data-testid="button-retry-quiz"
        >
          Try Again
        </button>
        <button
          onClick={handleNewQuiz}
          className="py-4 font-bold active:scale-95 transition-all"
          style={{
            backgroundColor: '#ffd709',
            color: '#5b4b00',
            borderRadius: '1rem',
            boxShadow: '0 2px 8px rgba(255, 215, 9, 0.3)',
          }}
          data-testid="button-new-quiz"
        >
          New Quiz
        </button>
        <button
          onClick={onViewStats}
          className="py-4 font-bold active:scale-95 transition-all"
          style={{
            backgroundColor: '#eae2cb',
            color: '#322f22',
            borderRadius: '1rem',
          }}
          data-testid="button-view-stats"
        >
          View Stats
        </button>
        <button
          onClick={handleDifferentQuiz}
          disabled={isGenerating}
          className="col-span-2 py-4 font-bold active:scale-95 transition-all disabled:opacity-50"
          style={{
            backgroundColor: 'rgba(116, 247, 241, 0.4)',
            color: '#005c59',
            borderRadius: '1rem',
          }}
          data-testid="button-different-quiz"
        >
          {isGenerating ? 'Generating...' : 'Different Quiz'}
        </button>
      </section>

      <style>{`
        @keyframes bounce {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-10px) rotate(5deg); }
        }
      `}</style>
    </div>
  );
}
