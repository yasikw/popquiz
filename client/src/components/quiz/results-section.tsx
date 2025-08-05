import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { type GeneratedQuiz } from "@shared/schema";
import { useState } from "react";

interface ResultsSectionProps {
  quiz: GeneratedQuiz;
  onNewQuiz: () => void;
  onRetryQuiz: () => void;
  onViewStats: () => void;
  onQuizGenerated: (quiz: GeneratedQuiz) => void;
}

export default function ResultsSection({ quiz, onNewQuiz, onRetryQuiz, onViewStats, onQuizGenerated }: ResultsSectionProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  // Get actual quiz results from localStorage
  const storedResults = localStorage.getItem('quizResults');
  console.log("ResultsSection: Retrieved stored results:", storedResults);
  const quizResults = storedResults ? JSON.parse(storedResults) : null;
  console.log("ResultsSection: Parsed quiz results:", quizResults);

  // Handle new quiz with PDF deletion
  const handleNewQuiz = () => {
    console.log('New quiz button clicked - will clear PDF file');
    // Clear PDF from localStorage when starting new quiz
    localStorage.removeItem('lastPdfFile');
    localStorage.removeItem('lastContentType');
    localStorage.removeItem('quizResults');
    onNewQuiz();
  };

  // Handle retry quiz with PDF retention
  const handleRetryQuiz = () => {
    console.log('Retry quiz button clicked - will keep PDF file');
    // Keep PDF file but clear quiz results
    localStorage.removeItem('quizResults');
    onRetryQuiz();
  };

  // Handle different quiz with same content
  const handleDifferentQuiz = async () => {
    console.log('Different quiz button clicked - generating new questions from same content');
    setIsGenerating(true);
    
    try {
      // Get quiz settings
      const savedSettings = localStorage.getItem('quizSettings');
      const settings = savedSettings ? JSON.parse(savedSettings) : { difficulty: 'intermediate', questionCount: 5 };
      
      // Check what type of content we're dealing with
      const lastContentType = localStorage.getItem('lastContentType');
      let requestBody: any = {
        difficulty: settings.defaultDifficulty || 'intermediate',
        questionCount: settings.questionCount || 5,
      };
      
      if (lastContentType === 'pdf') {
        // Get the stored PDF file info
        const savedPdfFile = localStorage.getItem('lastPdfFile');
        if (!savedPdfFile) {
          throw new Error('PDFファイル情報が見つかりません');
        }
        
        const pdfInfo = JSON.parse(savedPdfFile);
        requestBody.pdfInfo = pdfInfo;
      } else if (lastContentType === 'youtube') {
        // Get the stored YouTube video ID
        const savedYouTubeInfo = localStorage.getItem('savedYouTubeInfo');
        if (!savedYouTubeInfo) {
          throw new Error('YouTube動画情報が見つかりません');
        }
        
        const youtubeInfo = JSON.parse(savedYouTubeInfo);
        requestBody.youtubeVideoId = youtubeInfo.videoId;
      } else {
        throw new Error('サポートされていないコンテンツタイプです');
      }
      
      // Clear previous results
      localStorage.removeItem('quizResults');
      
      const response = await fetch('/api/generate-quiz-from-cache', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error('新しいクイズの生成に失敗しました');
      }

      const newQuiz = await response.json();
      console.log('New quiz generated successfully:', newQuiz);
      
      // Call the parent component's quiz generated handler
      onQuizGenerated(newQuiz);
      
    } catch (error) {
      console.error('Different quiz generation error:', error);
      alert(`新しいクイズの生成に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Fallback if no results found
  const results = quizResults || {
    score: 0,
    totalQuestions: quiz.questions.length,
    percentage: 0,
    totalTimeSpent: 0,
    detailedResults: quiz.questions.map((question, index) => ({
      question: question.question,
      userAnswer: null,
      correctAnswer: question.correctAnswer,
      isCorrect: false,
      timeSpent: 0,
      explanation: question.explanation,
    }))
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getRanking = (percentage: number) => {
    if (percentage >= 90) return "A+";
    if (percentage >= 80) return "A";
    if (percentage >= 70) return "B+";
    if (percentage >= 60) return "B";
    if (percentage >= 50) return "C";
    return "D";
  };

  return (
    <section className="mb-12">
      <Card className="shadow-lg">
        <CardContent className="p-8">
          <div className="text-center mb-8">
            <div className="bg-yellow-500 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-4">
              <span className="text-white text-3xl">🏆</span>
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">クイズ完了！</h3>
            <p className="text-gray-600">お疲れ様でした。結果をご確認ください。</p>
          </div>

          {/* Score Summary */}
          <div className="grid grid-cols-2 gap-6 mb-8">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600" data-testid="score-correct">
                {results.score}
              </div>
              <div className="text-sm text-gray-600">正解数 / {results.totalQuestions}問</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-600" data-testid="score-percentage">
                {results.percentage}%
              </div>
              <div className="text-sm text-gray-600">正答率</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-purple-600" data-testid="score-time">
                {formatTime(results.totalTimeSpent)}
              </div>
              <div className="text-sm text-gray-600">所要時間</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-orange-600" data-testid="score-ranking">
                {getRanking(results.percentage)}
              </div>
              <div className="text-sm text-gray-600">評価</div>
            </div>
          </div>

          {/* Detailed Results */}
          <div className="mb-8">
            <h4 className="text-lg font-semibold text-gray-900 mb-4">問題別詳細結果</h4>
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {results.detailedResults.map((result: any, index: number) => (
                <Card key={index} className="border border-gray-200">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        {result.isCorrect ? (
                          <div className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center text-sm font-medium">
                            ✓
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center text-sm font-medium">
                            ✗
                          </div>
                        )}
                        <span className="font-medium">問題 {index + 1}</span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          result.isCorrect 
                            ? "bg-green-100 text-green-800" 
                            : "bg-red-100 text-red-800"
                        }`}>
                          {result.isCorrect ? "正解" : "不正解"}
                        </span>
                      </div>
                      <span className="text-sm text-gray-500">回答時間: {result.timeSpent}秒</span>
                    </div>
                    
                    <p className="text-sm text-gray-700 mb-2">{result.question}</p>
                    
                    <div className="text-xs text-gray-600 mb-2">
                      <span className="text-green-600 font-medium">
                        正解: {String.fromCharCode(65 + result.correctAnswer)} - {quiz.questions[index].options[result.correctAnswer]}
                      </span>
                      {!result.isCorrect && result.userAnswer !== null && (
                        <>
                          <br />
                          <span className="text-red-600 font-medium">
                            あなたの回答: {String.fromCharCode(65 + result.userAnswer)} - {quiz.questions[index].options[result.userAnswer]}
                          </span>
                        </>
                      )}
                      {result.userAnswer === null && (
                        <>
                          <br />
                          <span className="text-gray-500 font-medium">
                            あなたの回答: 未回答
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
          <div className="flex flex-wrap gap-3 justify-center">
            <Button 
              onClick={handleRetryQuiz}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              data-testid="button-retry-quiz"
            >
              <span className="mr-2">🔄</span>
              もう一度挑戦
            </Button>
            <Button 
              onClick={handleDifferentQuiz}
              disabled={isGenerating}
              className="bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50"
              data-testid="button-different-quiz"
            >
              <span className="mr-2">{isGenerating ? '⏳' : '🎲'}</span>
              {isGenerating ? '新しい問題を生成中...' : '別のクイズを出題'}
            </Button>
            <Button 
              variant="outline"
              onClick={onViewStats}
              data-testid="button-view-stats"
            >
              <span className="mr-2">📊</span>
              統計を見る
            </Button>
            <Button 
              variant="outline"
              onClick={handleNewQuiz}
              data-testid="button-new-quiz"
            >
              <span className="mr-2">➕</span>
              新しいクイズ
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
