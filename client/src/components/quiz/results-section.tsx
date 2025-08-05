import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { type GeneratedQuiz } from "@shared/schema";

interface ResultsSectionProps {
  quiz: GeneratedQuiz;
  onNewQuiz: () => void;
  onRetryQuiz: () => void;
  onViewStats: () => void;
}

export default function ResultsSection({ quiz, onNewQuiz, onRetryQuiz, onViewStats }: ResultsSectionProps) {
  // Mock results data - in real app this would come from completed quiz
  const mockResults = {
    score: 8,
    totalQuestions: quiz.questions.length,
    percentage: 80,
    timeSpent: "4:32",
    ranking: "B+",
  };

  const mockDetailedResults = quiz.questions.map((question, index) => ({
    question: question.question,
    userAnswer: index % 4, // Mock user answers
    correctAnswer: question.correctAnswer,
    isCorrect: (index % 4) === question.correctAnswer,
    timeSpent: Math.floor(Math.random() * 40) + 20, // 20-60 seconds
    explanation: question.explanation,
  }));

  return (
    <section className="mb-12">
      <Card className="shadow-lg">
        <CardContent className="p-8">
          <div className="text-center mb-8">
            <div className="bg-success rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-trophy text-white text-3xl"></i>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">クイズ完了！</h3>
            <p className="text-gray-600">お疲れ様でした。結果をご確認ください。</p>
          </div>

          {/* Score Summary */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="text-center">
              <div className="text-3xl font-bold text-primary" data-testid="score-correct">
                {mockResults.score}
              </div>
              <div className="text-sm text-gray-600">正解数 / {mockResults.totalQuestions}問</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-accent" data-testid="score-percentage">
                {mockResults.percentage}
              </div>
              <div className="text-sm text-gray-600">正答率 (%)</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-success" data-testid="score-time">
                {mockResults.timeSpent}
              </div>
              <div className="text-sm text-gray-600">所要時間</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-600" data-testid="score-ranking">
                {mockResults.ranking}
              </div>
              <div className="text-sm text-gray-600">評価</div>
            </div>
          </div>

          {/* Detailed Results */}
          <div className="mb-8">
            <h4 className="text-lg font-semibold text-gray-900 mb-4">問題別詳細結果</h4>
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {mockDetailedResults.map((result, index) => (
                <Card key={index} className="border border-gray-200">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <div
                          className={`w-8 h-8 rounded-full text-white flex items-center justify-center text-sm font-medium ${
                            result.isCorrect ? "bg-success" : "bg-error"
                          }`}
                        >
                          <i className={`fas ${result.isCorrect ? "fa-check" : "fa-times"}`}></i>
                        </div>
                        <span className="font-medium">問題 {index + 1}</span>
                      </div>
                      <span className="text-sm text-gray-500">回答時間: {result.timeSpent}秒</span>
                    </div>
                    
                    <p className="text-sm text-gray-700 mb-2">{result.question}</p>
                    
                    <div className="text-xs text-gray-600 mb-2">
                      <span className="text-success">
                        正解: {String.fromCharCode(65 + result.correctAnswer)} ({quiz.questions[index].options[result.correctAnswer]})
                      </span>
                      {!result.isCorrect && (
                        <>
                          {" ・ "}
                          <span className="text-error">
                            あなたの回答: {String.fromCharCode(65 + result.userAnswer)} ({quiz.questions[index].options[result.userAnswer]})
                          </span>
                        </>
                      )}
                    </div>
                    
                    {result.explanation && (
                      <div className="mt-2 p-3 bg-blue-50 rounded text-xs text-gray-700">
                        <strong>解説:</strong> {result.explanation}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-4 justify-center">
            <Button 
              onClick={onRetryQuiz}
              className="bg-primary hover:bg-blue-700"
              data-testid="button-retry-quiz"
            >
              <i className="fas fa-redo mr-2"></i>
              もう一度挑戦
            </Button>
            <Button 
              variant="outline"
              onClick={onViewStats}
              data-testid="button-view-stats"
            >
              <i className="fas fa-chart-bar mr-2"></i>
              統計を見る
            </Button>
            <Button 
              variant="outline"
              onClick={onNewQuiz}
              data-testid="button-new-quiz"
            >
              <i className="fas fa-plus mr-2"></i>
              新しいクイズ
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
