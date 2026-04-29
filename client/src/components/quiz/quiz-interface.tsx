import { useState, useEffect } from "react";
import { type GeneratedQuiz } from "@shared/schema";
import { submitQuizResults } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

interface QuizInterfaceProps {
  quiz: GeneratedQuiz;
  userId: string;
  onQuizCompleted: () => void;
}

type QuizPhase = "answering" | "result" | "explanation";

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];

export default function QuizInterface({ quiz, userId, onQuizCompleted }: QuizInterfaceProps) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [userAnswers, setUserAnswers] = useState<(number | null)[]>(
    new Array(quiz.questions.length).fill(null)
  );
  const [timeLeft, setTimeLeft] = useState(60);
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());
  const [questionTimes, setQuestionTimes] = useState<number[]>(
    new Array(quiz.questions.length).fill(0)
  );
  const [timeLimit, setTimeLimit] = useState(60);
  const [phase, setPhase] = useState<QuizPhase>("answering");
  const [resultAnimating, setResultAnimating] = useState(false);

  const currentQuestion = quiz.questions[currentQuestionIndex];
  const totalQuestions = quiz.questions.length;
  const answeredCount = userAnswers.filter((a) => a !== null).length;

  useEffect(() => {
    const savedSettings = localStorage.getItem("quizSettings");
    if (savedSettings) {
      const settings = JSON.parse(savedSettings);
      setTimeLimit(settings.timeLimit || 60);
      setTimeLeft(settings.timeLimit || 60);
    }
  }, []);

  useEffect(() => {
    if (phase !== "answering") return;
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      handleTimeUp();
    }
  }, [timeLeft, phase]);

  useEffect(() => {
    if (phase === "answering") {
      setTimeLeft(timeLimit);
      setQuestionStartTime(Date.now());
      setSelectedAnswer(userAnswers[currentQuestionIndex]);
    }
  }, [currentQuestionIndex, timeLimit]);

  const handleTimeUp = () => {
    const newAnswers = [...userAnswers];
    newAnswers[currentQuestionIndex] = null;
    setUserAnswers(newAnswers);
    setSelectedAnswer(null);
    showResult();
  };

  const handleAnswerSelect = (answerIndex: number) => {
    if (phase !== "answering") return;
    setSelectedAnswer(answerIndex);
    const newAnswers = [...userAnswers];
    newAnswers[currentQuestionIndex] = answerIndex;
    setUserAnswers(newAnswers);
    showResult();
  };

  const showResult = () => {
    setResultAnimating(true);
    setPhase("result");
    setTimeout(() => setResultAnimating(false), 100);
  };

  const isCurrentAnswerCorrect = () => {
    const answer = userAnswers[currentQuestionIndex];
    return answer !== null && answer !== undefined && answer === currentQuestion.correctAnswer;
  };

  const handleGoToExplanation = () => setPhase("explanation");
  const handleBackToResult = () => setPhase("result");

  const handleNextQuestion = () => {
    const timeSpent = Math.floor((Date.now() - questionStartTime) / 1000);
    const newTimes = [...questionTimes];
    newTimes[currentQuestionIndex] = timeSpent;
    setQuestionTimes(newTimes);

    if (currentQuestionIndex < totalQuestions - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setPhase("answering");
      setSelectedAnswer(null);
    } else {
      handleQuizCompleteWithData(userAnswers, newTimes);
    }
  };

  const handlePrevQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
      setPhase("answering");
    }
  };

  const handleSkipQuestion = () => {
    const timeSpent = Math.floor((Date.now() - questionStartTime) / 1000);
    const newTimes = [...questionTimes];
    newTimes[currentQuestionIndex] = timeSpent;
    setQuestionTimes(newTimes);

    if (currentQuestionIndex < totalQuestions - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setPhase("answering");
      setSelectedAnswer(null);
    }
  };

  const handleQuizCompleteWithData = async (
    finalAnswers: (number | null)[],
    currentTimes: number[]
  ) => {
    const finalTimeSpent = Math.floor((Date.now() - questionStartTime) / 1000);
    const finalTimes = [...currentTimes];
    finalTimes[currentQuestionIndex] = finalTimeSpent;

    const score = finalAnswers.reduce((total: number, answer, index) => {
      if (answer !== null && answer === quiz.questions[index].correctAnswer) return total + 1;
      return total;
    }, 0);

    const detailedResults = quiz.questions.map((question, index) => ({
      question: question.question,
      userAnswer: finalAnswers[index],
      correctAnswer: question.correctAnswer,
      isCorrect: finalAnswers[index] !== null && finalAnswers[index] === question.correctAnswer,
      timeSpent: finalTimes[index] || 0,
      explanation: question.explanation,
    }));

    const totalTime = finalTimes.reduce((sum, time) => sum + time, 0);
    const quizResults = {
      score,
      totalQuestions: totalQuestions,
      percentage: Math.round((score / totalQuestions) * 100),
      totalTimeSpent: totalTime,
      detailedResults,
    };

    try {
      const contentType = localStorage.getItem("lastContentType") || "text";
      await submitQuizResults(userId, { ...quiz, contentType }, quizResults);

      // Refresh stats, sessions, and leaderboard so the ranking reflects the new result immediately
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/users", userId, "stats"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/users", userId, "sessions-with-questions"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/leaderboard"] }),
      ]);
    } catch (error) {
      console.error("Failed to submit quiz results:", error);
    }

    localStorage.setItem("quizResults", JSON.stringify(quizResults));
    onQuizCompleted();
  };

  const progressPercent = ((currentQuestionIndex + 1) / totalQuestions) * 100;
  const circumference = 2 * Math.PI * 28;
  const strokeDashoffset = circumference - (progressPercent / 100) * circumference;
  const minutes = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const seconds = String(timeLeft % 60).padStart(2, "0");
  const isLastQuestion = currentQuestionIndex === totalQuestions - 1;

  const renderProgressRing = (score: number) => (
    <div className="relative w-16 h-16">
      <svg className="w-full h-full" viewBox="0 0 64 64">
        <circle
          cx="32" cy="32" r="28"
          fill="transparent"
          stroke="#e4ddc5"
          strokeWidth="6"
        />
        <circle
          cx="32" cy="32" r="28"
          fill="transparent"
          stroke="#a8275a"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{
            transform: "rotate(-90deg)",
            transformOrigin: "50% 50%",
            transition: "stroke-dashoffset 0.35s",
          }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm" style={{ fontWeight: 900, color: '#a8275a' }}>{score}</span>
      </div>
    </div>
  );

  if (phase === "explanation") {
    const correct = isCurrentAnswerCorrect();
    const userAnswer = userAnswers[currentQuestionIndex];

    return (
      <div className="space-y-8 pb-32">
        {/* Status Row */}
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-4">
            {renderProgressRing(answeredCount)}
            <div>
              <p className="text-xs font-bold tracking-wider" style={{ color: '#5f5b4d' }}>EXPLANATION</p>
              <p className="text-xl" style={{ fontWeight: 900, color: '#322f22' }}>
                {currentQuestionIndex + 1}/{totalQuestions}
              </p>
            </div>
          </div>
        </div>

        {/* Question + Options with Results */}
        <section className="relative">
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full blur-2xl" style={{ backgroundColor: 'rgba(0,103,100,0.1)' }} />
          <div
            className="relative overflow-hidden p-8"
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '1rem',
              boxShadow: '0 16px 32px rgba(50, 47, 34, 0.08)',
            }}
          >
            <div className="absolute top-0 left-0 w-full h-2" style={{ background: 'linear-gradient(to right, #a8275a, #ff709f)' }} />

            <h2
              className="text-xl leading-tight tracking-tight mb-6"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 900, color: '#322f22' }}
            >
              {currentQuestion.question}
            </h2>

            <div className="space-y-3 mb-6">
              {currentQuestion.options.map((option, index) => {
                const isCorrectOption = index === currentQuestion.correctAnswer;
                const isUserChoice = index === userAnswer;
                let bg = '#f8f0dc';
                let borderCol = 'transparent';
                let textCol = '#322f22';
                let badgeBg = '#e4ddc5';
                let badgeText = '#a8275a';

                if (isCorrectOption) {
                  bg = '#74f7f1';
                  borderCol = '#006764';
                  textCol = '#005c59';
                  badgeBg = '#006764';
                  badgeText = '#ffffff';
                } else if (isUserChoice && !correct) {
                  bg = '#ffeff1';
                  borderCol = '#b41340';
                  textCol = '#510017';
                  badgeBg = '#b41340';
                  badgeText = '#ffffff';
                }

                return (
                  <div
                    key={index}
                    className="flex items-center gap-4 p-5 transition-all"
                    style={{
                      borderRadius: '0.75rem',
                      backgroundColor: bg,
                      border: `2px solid ${borderCol}`,
                    }}
                  >
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-xl flex-shrink-0"
                      style={{ fontWeight: 900, backgroundColor: badgeBg, color: badgeText }}
                    >
                      {OPTION_LETTERS[index]}
                    </div>
                    <span className="flex-grow text-lg font-bold" style={{ color: textCol }}>
                      {option}
                    </span>
                    {isCorrectOption && (
                      <span className="material-symbols-outlined" style={{ color: '#006764', fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    )}
                    {isUserChoice && !isCorrectOption && (
                      <span className="material-symbols-outlined" style={{ color: '#b41340', fontVariationSettings: "'FILL' 1" }}>cancel</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Explanation Box */}
            <div
              className="p-5"
              style={{
                backgroundColor: 'rgba(116, 247, 241, 0.15)',
                borderRadius: '0.75rem',
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined" style={{ color: '#006764' }}>lightbulb</span>
                <h4 className="font-bold" style={{ color: '#006764' }}>Explanation</h4>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: '#005c59' }}>
                {currentQuestion.explanation}
              </p>
            </div>
          </div>
        </section>

        {/* Action Controls */}
        <div className="grid grid-cols-2 gap-4 pb-8">
          <button
            onClick={handleBackToResult}
            className="flex flex-col items-center justify-center gap-2 py-4 font-bold transition-colors active:scale-95"
            style={{ backgroundColor: '#efe8d2', color: '#5f5b4d', borderRadius: '0.75rem' }}
          >
            <span className="material-symbols-outlined">arrow_back</span>
            <span className="text-xs">Back</span>
          </button>
          <button
            onClick={handleNextQuestion}
            className="flex flex-col items-center justify-center gap-2 py-4 text-white font-bold transition-all active:scale-95"
            style={{
              background: 'linear-gradient(135deg, #a8275a, #ff709f)',
              borderRadius: '0.75rem',
              boxShadow: '0 4px 12px rgba(168, 39, 90, 0.25)',
            }}
          >
            <span className="material-symbols-outlined">arrow_forward</span>
            <span className="text-xs">{isLastQuestion ? "See Results" : "Next"}</span>
          </button>
        </div>
      </div>
    );
  }

  const correct = isCurrentAnswerCorrect();

  return (
    <div className="space-y-8 pb-32 relative">
      {/* Status Row */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-4">
          {renderProgressRing(answeredCount)}
          <div>
            <p className="text-xs font-bold tracking-wider" style={{ color: '#5f5b4d' }}>COMPLETED</p>
            <p className="text-xl" style={{ fontWeight: 900, color: '#322f22' }}>
              {currentQuestionIndex + 1}/{totalQuestions}
            </p>
          </div>
        </div>

        {/* Timer */}
        <div
          className="px-5 py-3 flex items-center gap-3"
          style={{
            backgroundColor: 'rgba(255, 215, 9, 0.3)',
            borderRadius: '1rem',
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ color: '#6c5a00', animation: timeLeft <= 10 ? 'pulse 1s infinite' : 'none' }}
          >
            schedule
          </span>
          <span
            className="text-2xl tabular-nums"
            style={{ fontWeight: 900, color: '#5b4b00' }}
            data-testid="time-remaining"
          >
            {minutes}:{seconds}
          </span>
        </div>
      </div>

      {/* Question Card */}
      <section className="relative">
        <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full blur-2xl" style={{ backgroundColor: 'rgba(0,103,100,0.1)' }} />
        <div className="absolute -bottom-10 -left-10 w-32 h-32 rounded-full blur-2xl" style={{ backgroundColor: 'rgba(168,39,90,0.1)' }} />

        <div
          className="relative overflow-hidden p-8"
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '1rem',
            boxShadow: '0 16px 32px rgba(50, 47, 34, 0.08)',
          }}
        >
          <div className="absolute top-0 left-0 w-full h-2" style={{ background: 'linear-gradient(to right, #a8275a, #ff709f)' }} />

          <span
            className="inline-block px-4 py-1 rounded-full text-xs font-bold mb-6"
            style={{ backgroundColor: '#74f7f1', color: '#005c59' }}
          >
            QUIZ
          </span>

          <h2
            className="text-2xl leading-tight tracking-tight"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 900, color: '#322f22' }}
            data-testid="question-text"
          >
            {currentQuestion.question}
          </h2>
        </div>
      </section>

      {/* Answer Options */}
      <div className="grid grid-cols-1 gap-4">
        {currentQuestion.options.map((option, index) => {
          const isSelected = selectedAnswer === index;
          return (
            <button
              key={index}
              onClick={() => handleAnswerSelect(index)}
              disabled={phase === "result"}
              className="group w-full flex items-center gap-4 p-5 transition-all active:scale-[0.98] duration-200 text-left"
              style={{
                borderRadius: '0.75rem',
                backgroundColor: isSelected ? '#74f7f1' : '#f8f0dc',
                border: isSelected ? '2px solid #006764' : '2px solid transparent',
                boxShadow: isSelected ? '0 4px 12px rgba(0, 103, 100, 0.1)' : 'none',
                pointerEvents: phase === "result" ? "none" : "auto",
              }}
              data-testid={`answer-option-${index}`}
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-xl flex-shrink-0 transition-colors"
                style={{
                  fontWeight: 900,
                  backgroundColor: isSelected ? '#006764' : '#e4ddc5',
                  color: isSelected ? '#bcfffb' : '#a8275a',
                }}
              >
                {OPTION_LETTERS[index]}
              </div>
              <span
                className="flex-grow text-lg font-bold"
                style={{ color: isSelected ? '#005c59' : '#322f22' }}
              >
                {option}
              </span>
              {isSelected && (
                <span
                  className="material-symbols-outlined"
                  style={{ color: '#006764', fontVariationSettings: "'FILL' 1" }}
                >
                  check_circle
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Action Controls */}
      <div className="grid grid-cols-3 gap-4 pb-8">
        <button
          onClick={handlePrevQuestion}
          disabled={currentQuestionIndex === 0}
          className="flex flex-col items-center justify-center gap-2 py-4 font-bold transition-colors active:scale-95"
          style={{
            backgroundColor: '#efe8d2',
            color: currentQuestionIndex === 0 ? '#b2ad9c' : '#5f5b4d',
            borderRadius: '0.75rem',
            opacity: currentQuestionIndex === 0 ? 0.5 : 1,
          }}
        >
          <span className="material-symbols-outlined">arrow_back</span>
          <span className="text-xs">Previous</span>
        </button>
        <button
          onClick={handleSkipQuestion}
          disabled={isLastQuestion}
          className="flex flex-col items-center justify-center gap-2 py-4 font-bold transition-colors active:scale-95"
          style={{
            backgroundColor: '#efe8d2',
            color: isLastQuestion ? '#b2ad9c' : '#5f5b4d',
            borderRadius: '0.75rem',
            opacity: isLastQuestion ? 0.5 : 1,
          }}
        >
          <span className="material-symbols-outlined">fast_forward</span>
          <span className="text-xs">Skip</span>
        </button>
        <button
          onClick={phase === "answering" ? undefined : handleGoToExplanation}
          className="flex flex-col items-center justify-center gap-2 py-4 text-white font-bold transition-all active:scale-95"
          style={{
            background: phase === "result" ? 'linear-gradient(135deg, #a8275a, #ff709f)' : '#efe8d2',
            color: phase === "result" ? '#ffffff' : '#b2ad9c',
            borderRadius: '0.75rem',
            boxShadow: phase === "result" ? '0 4px 12px rgba(168, 39, 90, 0.25)' : 'none',
            cursor: phase === "result" ? 'pointer' : 'default',
          }}
        >
          <span className="material-symbols-outlined">arrow_forward</span>
          <span className="text-xs">Next</span>
        </button>
      </div>

      {/* Result Overlay */}
      {phase === "result" && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          style={{ backgroundColor: 'rgba(50, 47, 34, 0.6)', backdropFilter: 'blur(8px)' }}
          onClick={handleGoToExplanation}
        >
          <div
            className={`flex flex-col items-center transition-all duration-500 ${
              resultAnimating ? "scale-50 opacity-0" : "scale-100 opacity-100"
            }`}
          >
            {correct ? (
              <>
                <span
                  className="material-symbols-outlined mb-6"
                  style={{ fontSize: 112, color: '#74f7f1', fontVariationSettings: "'FILL' 1", filter: 'drop-shadow(0 4px 12px rgba(0,103,100,0.3))' }}
                >
                  check_circle
                </span>
                <h1
                  className="text-6xl mb-4 tracking-wider"
                  style={{ fontWeight: 900, color: '#74f7f1', fontFamily: "'Plus Jakarta Sans', sans-serif", textShadow: '0 4px 12px rgba(0,103,100,0.3)' }}
                >
                  Correct!
                </h1>
                <p className="text-xl font-medium" style={{ color: 'rgba(188, 255, 251, 0.8)' }}>Great job!</p>
              </>
            ) : (
              <>
                <span
                  className="material-symbols-outlined mb-6"
                  style={{ fontSize: 112, color: '#f74b6d', fontVariationSettings: "'FILL' 1", filter: 'drop-shadow(0 4px 12px rgba(183,19,64,0.3))' }}
                >
                  cancel
                </span>
                <h1
                  className="text-6xl mb-4 tracking-wider"
                  style={{ fontWeight: 900, color: '#f74b6d', fontFamily: "'Plus Jakarta Sans', sans-serif", textShadow: '0 4px 12px rgba(183,19,64,0.3)' }}
                >
                  Incorrect
                </h1>
                <p className="text-xl font-medium text-center px-6" style={{ color: 'rgba(255, 239, 241, 0.8)' }}>
                  Answer: {OPTION_LETTERS[currentQuestion.correctAnswer]} — {currentQuestion.options[currentQuestion.correctAnswer]}
                </p>
              </>
            )}
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              handleGoToExplanation();
            }}
            className="mt-12 px-10 py-4 text-white font-bold text-lg flex items-center gap-2 active:scale-95 transition-transform"
            style={{
              background: 'linear-gradient(135deg, #a8275a, #ff709f)',
              borderRadius: '2rem',
              boxShadow: '0 8px 24px rgba(168, 39, 90, 0.3)',
            }}
          >
            Continue
            <span className="material-symbols-outlined">arrow_forward</span>
          </button>
        </div>
      )}
    </div>
  );
}
