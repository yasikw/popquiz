import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import CircularProgress from "@/components/ui/circular-progress";
import { type GeneratedQuiz } from "@shared/schema";
import { submitQuizResults } from "@/lib/api";
import { CheckCircle, XCircle, ChevronRight, ChevronLeft, ArrowRight } from "lucide-react";

interface QuizInterfaceProps {
  quiz: GeneratedQuiz;
  userId: string;
  onQuizCompleted: () => void;
}

type QuizPhase = "answering" | "result" | "explanation";

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

  useEffect(() => {
    const savedSettings = localStorage.getItem('quizSettings');
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

  const handleGoToExplanation = () => {
    setPhase("explanation");
  };

  const handleBackToResult = () => {
    setPhase("result");
  };

  const handleNextQuestion = () => {
    const timeSpent = Math.floor((Date.now() - questionStartTime) / 1000);
    const newTimes = [...questionTimes];
    newTimes[currentQuestionIndex] = timeSpent;
    setQuestionTimes(newTimes);

    if (currentQuestionIndex < quiz.questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setPhase("answering");
      setSelectedAnswer(null);
    } else {
      handleQuizCompleteWithData(userAnswers, newTimes);
    }
  };

  const handleQuizCompleteWithData = async (finalAnswers: (number | null)[], currentTimes: number[]) => {
    const finalTimeSpent = Math.floor((Date.now() - questionStartTime) / 1000);
    const finalTimes = [...currentTimes];
    finalTimes[currentQuestionIndex] = finalTimeSpent;

    const score = finalAnswers.reduce((total: number, answer, index) => {
      if (answer !== null && answer === quiz.questions[index].correctAnswer) {
        return total + 1;
      }
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
      totalQuestions: quiz.questions.length,
      percentage: Math.round((score / quiz.questions.length) * 100),
      totalTimeSpent: totalTime,
      detailedResults
    };

    try {
      const contentType = localStorage.getItem('lastContentType') || 'text';
      await submitQuizResults(userId, {
        ...quiz,
        contentType: contentType
      }, quizResults);
    } catch (error) {
      console.error("Failed to submit quiz results:", error);
    }

    localStorage.setItem('quizResults', JSON.stringify(quizResults));
    onQuizCompleted();
  };

  if (phase === "result") {
    const correct = isCurrentAnswerCorrect();
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-cyan-50 pb-20">
        <div className="max-w-md mx-auto px-4 py-6">
          <div className="text-center mb-6">
            <div className="bg-blue-100 rounded-full px-4 py-2 text-blue-800 inline-block">
              <span className="text-sm font-medium">
                問題 {currentQuestionIndex + 1} / {quiz.questions.length}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center min-h-[60vh]">
            <div
              className={`flex flex-col items-center transition-all duration-500 ${
                resultAnimating ? "scale-50 opacity-0" : "scale-100 opacity-100"
              }`}
            >
              {correct ? (
                <>
                  <CheckCircle className="w-28 h-28 text-green-500 mb-6" strokeWidth={2.5} />
                  <h1 className="text-6xl font-black text-green-500 mb-4 tracking-wider">
                    正解
                  </h1>
                  <p className="text-green-600 text-lg font-medium">すばらしい！</p>
                </>
              ) : (
                <>
                  <XCircle className="w-28 h-28 text-red-500 mb-6" strokeWidth={2.5} />
                  <h1 className="text-6xl font-black text-red-500 mb-4 tracking-wider">
                    不正解
                  </h1>
                  <p className="text-red-600 text-lg font-medium">
                    正解は {String.fromCharCode(65 + currentQuestion.correctAnswer)}: {currentQuestion.options[currentQuestion.correctAnswer]}
                  </p>
                </>
              )}
            </div>

            <Button
              onClick={handleGoToExplanation}
              className="mt-12 bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-500 hover:to-blue-600 text-white border-0 shadow-lg px-10 py-4 rounded-2xl font-bold text-lg"
            >
              次へ
              <ChevronRight className="w-5 h-5 ml-2" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "explanation") {
    const correct = isCurrentAnswerCorrect();
    const userAnswer = userAnswers[currentQuestionIndex];
    const isLastQuestion = currentQuestionIndex === quiz.questions.length - 1;

    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-cyan-50 pb-20">
        <div className="max-w-md mx-auto px-4 py-6">
          <div className="text-center mb-6">
            <div className="bg-blue-100 rounded-full px-4 py-2 text-blue-800 inline-block">
              <span className="text-sm font-medium">
                問題 {currentQuestionIndex + 1} / {quiz.questions.length} — 解説
              </span>
            </div>
          </div>

          <Card className="bg-white shadow-lg border border-gray-200">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-6 leading-relaxed">
                {currentQuestion.question}
              </h3>

              <div className="space-y-3 mb-6">
                {currentQuestion.options.map((option, index) => {
                  const isCorrectOption = index === currentQuestion.correctAnswer;
                  const isUserChoice = index === userAnswer;
                  let borderColor = "border-gray-200 bg-gray-50";
                  let textColor = "text-gray-600";
                  let badgeColor = "bg-gray-200 text-gray-700";

                  if (isCorrectOption) {
                    borderColor = "border-green-400 bg-green-50";
                    textColor = "text-green-800";
                    badgeColor = "bg-green-500 text-white";
                  } else if (isUserChoice && !correct) {
                    borderColor = "border-red-400 bg-red-50";
                    textColor = "text-red-800";
                    badgeColor = "bg-red-500 text-white";
                  }

                  return (
                    <div
                      key={index}
                      className={`p-4 rounded-xl border-2 ${borderColor} transition-all`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${badgeColor}`}>
                          {String.fromCharCode(65 + index)}
                        </div>
                        <span className={`font-medium text-left flex-1 ${textColor}`}>
                          {option}
                        </span>
                        {isCorrectOption && (
                          <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                        )}
                        {isUserChoice && !isCorrectOption && (
                          <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
                <h4 className="text-blue-800 font-bold text-base mb-2 flex items-center">
                  <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  解説
                </h4>
                <p className="text-blue-900 leading-relaxed text-sm">
                  {currentQuestion.explanation}
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-4 mt-6">
            <Button
              variant="outline"
              onClick={handleBackToResult}
              className="flex-1 border-gray-300 text-gray-700 hover:bg-gray-50 py-4 rounded-xl font-semibold text-base"
            >
              <ChevronLeft className="w-5 h-5 mr-1" />
              戻る
            </Button>
            <Button
              onClick={handleNextQuestion}
              className="flex-1 bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-500 hover:to-blue-600 text-white border-0 shadow-lg py-4 rounded-xl font-bold text-base"
            >
              {isLastQuestion ? "結果を見る" : "次へ進む"}
              <ArrowRight className="w-5 h-5 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-cyan-50 pb-20">
      <div className="max-w-md mx-auto px-4 py-6">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <CircularProgress
              value={currentQuestionIndex + 1}
              max={quiz.questions.length}
              size={140}
              className="mb-4"
            >
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600 mb-1">
                  {Math.round(((currentQuestionIndex + 1) / quiz.questions.length) * 100)}
                </div>
                <div className="text-xs text-gray-500 font-medium">
                  完了
                </div>
              </div>
            </CircularProgress>
          </div>

          <div className="flex justify-center items-center space-x-4 mb-4">
            <div className="bg-blue-100 rounded-full px-4 py-2 text-blue-800">
              <span className="text-sm font-medium">
                問題 {currentQuestionIndex + 1} / {quiz.questions.length}
              </span>
            </div>
            <div className="bg-green-100 rounded-full px-4 py-2 text-green-800 flex items-center space-x-2">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
              <span className="text-sm font-medium" data-testid="time-remaining">
                {String(Math.floor(timeLeft / 60)).padStart(2, '0')}:{String(timeLeft % 60).padStart(2, '0')}
              </span>
            </div>
          </div>
        </div>

        <Card className="bg-white shadow-lg border border-gray-200">
          <CardContent className="p-8">
            <div className="mb-8 text-center">
              <h3 className="text-2xl font-semibold text-gray-800 mb-8" data-testid="question-text">
                {currentQuestion.question}
              </h3>

              <div className="space-y-4">
                {currentQuestion.options.map((option, index) => (
                  <button
                    key={index}
                    onClick={() => handleAnswerSelect(index)}
                    className={`w-full p-6 rounded-2xl border transition-all duration-300 ${
                      selectedAnswer === index
                        ? "bg-blue-50 border-blue-300 shadow-lg"
                        : "bg-gray-50 border-gray-200 hover:bg-gray-100 hover:border-gray-300"
                    }`}
                    data-testid={`answer-option-${index}`}
                  >
                    <div className="flex items-center space-x-4">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                          selectedAnswer === index
                            ? "bg-gradient-to-r from-cyan-400 to-blue-500 text-white shadow-lg"
                            : "bg-gray-200 text-gray-700 border border-gray-300"
                        }`}
                      >
                        {String.fromCharCode(65 + index)}
                      </div>
                      <span className="text-gray-800 font-medium text-left flex-1">{option}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
