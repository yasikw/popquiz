import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import CircularProgress from "@/components/ui/circular-progress";
import { type GeneratedQuiz } from "@shared/schema";

interface QuizInterfaceProps {
  quiz: GeneratedQuiz;
  userId: string;
  onQuizCompleted: () => void;
}

export default function QuizInterface({ quiz, userId, onQuizCompleted }: QuizInterfaceProps) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [userAnswers, setUserAnswers] = useState<(number | null)[]>(
    new Array(quiz.questions.length).fill(null)
  );
  const [timeLeft, setTimeLeft] = useState(60); // 60 seconds per question
  const [questionStartTime, setQuestionStartTime] = useState(Date.now());

  const currentQuestion = quiz.questions[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / quiz.questions.length) * 100;

  // Timer effect
  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      // Auto-advance when time runs out
      handleNextQuestion();
    }
  }, [timeLeft]);

  // Reset timer and start time when question changes
  useEffect(() => {
    setTimeLeft(60);
    setQuestionStartTime(Date.now());
    setSelectedAnswer(userAnswers[currentQuestionIndex]);
  }, [currentQuestionIndex]);

  const handleAnswerSelect = (answerIndex: number) => {
    setSelectedAnswer(answerIndex);
    const newAnswers = [...userAnswers];
    newAnswers[currentQuestionIndex] = answerIndex;
    setUserAnswers(newAnswers);
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex < quiz.questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    } else {
      handleQuizComplete();
    }
  };

  const handlePreviousQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const handleSkipQuestion = () => {
    const newAnswers = [...userAnswers];
    newAnswers[currentQuestionIndex] = null;
    setUserAnswers(newAnswers);
    handleNextQuestion();
  };

  const handleQuizComplete = () => {
    // Calculate score
    const score = userAnswers.reduce((total: number, answer, index) => {
      if (answer !== null && answer === quiz.questions[index].correctAnswer) {
        return total + 1;
      }
      return total;
    }, 0);

    console.log("Quiz completed with score:", score);
    onQuizCompleted();
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        {/* Progress Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <CircularProgress 
              value={currentQuestionIndex + 1} 
              max={quiz.questions.length}
              size={140}
              className="mb-4"
            >
              <div className="text-center">
                <div className="text-3xl font-bold gradient-text mb-1">
                  {Math.round(((currentQuestionIndex + 1) / quiz.questions.length) * 100)}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                  完了
                </div>
              </div>
            </CircularProgress>
          </div>
          
          <div className="flex justify-center items-center space-x-4 mb-4">
            <div className="bg-white/20 backdrop-blur-sm rounded-full px-4 py-2 text-white">
              <span className="text-sm font-medium">
                問題 {currentQuestionIndex + 1} / {quiz.questions.length}
              </span>
            </div>
            <div className="bg-white/20 backdrop-blur-sm rounded-full px-4 py-2 text-white flex items-center space-x-2">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
              <span className="text-sm font-medium" data-testid="time-remaining">
                {String(Math.floor(timeLeft / 60)).padStart(2, '0')}:{String(timeLeft % 60).padStart(2, '0')}
              </span>
            </div>
          </div>
        </div>

        {/* Quiz Card */}
        <Card className="glass-effect border-white/20 shadow-2xl animate-slide-in">
          <CardContent className="p-8">

            {/* Question */}
            <div className="mb-8 text-center">
              <h3 className="text-2xl font-semibold text-white mb-8" data-testid="question-text">
                {currentQuestion.question}
              </h3>

              {/* Answer Options */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {currentQuestion.options.map((option, index) => (
                  <div
                    key={index}
                    className={`relative group cursor-pointer transition-all duration-300 transform hover:scale-105 ${
                      selectedAnswer === index ? 'scale-105' : ''
                    }`}
                    onClick={() => handleAnswerSelect(index)}
                    data-testid={`answer-option-${index}`}
                  >
                    <div
                      className={`p-6 rounded-2xl backdrop-blur-sm border transition-all duration-300 ${
                        selectedAnswer === index
                          ? "bg-white/30 border-white/50 shadow-lg"
                          : "bg-white/10 border-white/20 hover:bg-white/20 hover:border-white/40"
                      }`}
                    >
                      <div className="flex items-center space-x-4">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                            selectedAnswer === index
                              ? "bg-gradient-to-r from-cyan-400 to-blue-500 text-white shadow-lg"
                              : "bg-white/20 text-white border border-white/30"
                          }`}
                        >
                          {String.fromCharCode(65 + index)}
                        </div>
                        <span className="text-white font-medium text-left flex-1">{option}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quiz Controls */}
            <div className="flex justify-between items-center pt-6 border-t border-white/20">
              <Button
                variant="outline"
                onClick={handlePreviousQuestion}
                disabled={currentQuestionIndex === 0}
                className="bg-white/10 border-white/30 text-white hover:bg-white/20 hover:border-white/50 disabled:opacity-50"
                data-testid="button-previous"
              >
                <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                前の問題
              </Button>
              
              <div className="flex space-x-4">
                <Button
                  variant="outline"
                  onClick={handleSkipQuestion}
                  className="bg-white/10 border-white/30 text-white hover:bg-white/20 hover:border-white/50"
                  data-testid="button-skip"
                >
                  スキップ
                </Button>
                <Button
                  onClick={handleNextQuestion}
                  className="bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-500 hover:to-blue-600 text-white border-0 shadow-lg px-8 py-3 rounded-xl font-semibold"
                  data-testid="button-next"
                >
                  {currentQuestionIndex === quiz.questions.length - 1 ? "完了" : "次の問題"}
                  <svg className="w-4 h-4 ml-2" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
