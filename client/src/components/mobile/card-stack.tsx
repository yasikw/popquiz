import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type GeneratedQuiz } from "@shared/schema";

interface CardStackProps {
  onQuizGenerated: (quiz: GeneratedQuiz) => void;
  selectedDifficulty: string;
  onDifficultyChange: (difficulty: string) => void;
  setIsLoading: (loading: boolean) => void;
  setLoadingMessage: (message: string) => void;
  userId?: string;
}

const cards = [
  {
    id: "upload",
    title: "コンテンツをアップロード",
    icon: "fas fa-upload",
    color: "from-blue-500 to-cyan-500"
  },
  {
    id: "difficulty",
    title: "難易度を選択",
    icon: "fas fa-graduation-cap",
    color: "from-purple-500 to-pink-500"
  },
  {
    id: "stats",
    title: "学習統計",
    icon: "fas fa-chart-bar",
    color: "from-green-500 to-emerald-500"
  }
];

export default function CardStack({ 
  onQuizGenerated, 
  selectedDifficulty, 
  onDifficultyChange,
  setIsLoading,
  setLoadingMessage,
  userId 
}: CardStackProps) {
  const [currentCard, setCurrentCard] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [textContent, setTextContent] = useState("");

  // Auto-rotate cards every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentCard((prev) => (prev + 1) % cards.length);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleQuizGeneration = async () => {
    if (!file && !youtubeUrl && !textContent) {
      alert("コンテンツを選択してください");
      return;
    }

    setIsLoading(true);
    setLoadingMessage("AIがクイズを生成中...");

    try {
      const formData = new FormData();
      
      if (file) {
        formData.append('file', file);
        formData.append('contentType', 'pdf');
      } else if (youtubeUrl) {
        formData.append('youtubeUrl', youtubeUrl);
        formData.append('contentType', 'youtube');
      } else if (textContent) {
        formData.append('textContent', textContent);
        formData.append('contentType', 'text');
      }
      
      formData.append('difficulty', selectedDifficulty);

      const response = await fetch('/api/generate-quiz', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('クイズ生成に失敗しました');
      }

      const quiz = await response.json();
      onQuizGenerated(quiz);
    } catch (error) {
      console.error('Quiz generation error:', error);
      alert('クイズ生成に失敗しました。もう一度お試しください。');
    } finally {
      setIsLoading(false);
      setLoadingMessage("");
    }
  };

  const difficulties = [
    { id: "beginner", title: "初級", description: "基本的な内容", color: "green" },
    { id: "intermediate", title: "中級", description: "標準的な内容", color: "orange" },
    { id: "advanced", title: "上級", description: "高度な内容", color: "red" }
  ];

  const renderCardContent = (cardId: string) => {
    switch (cardId) {
      case "upload":
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="fas fa-upload text-white text-xl"></i>
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">コンテンツをアップロード</h3>
              <p className="text-gray-600 text-sm">PDFファイルやテキストからクイズを生成</p>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium text-gray-700">PDFファイル</Label>
                <Input
                  type="file"
                  accept=".pdf"
                  onChange={handleFileChange}
                  className="mt-1"
                  data-testid="input-file"
                />
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-gray-300" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-gray-500">または</span>
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium text-gray-700">YouTube URL</Label>
                <Input
                  type="url"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=..."
                  className="mt-1"
                  data-testid="input-youtube"
                />
              </div>

              <div>
                <Label className="text-sm font-medium text-gray-700">テキスト内容</Label>
                <textarea
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  placeholder="学習内容を直接入力..."
                  className="w-full mt-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none h-20"
                  data-testid="textarea-content"
                />
              </div>

              <Button
                onClick={handleQuizGeneration}
                className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white"
                data-testid="button-generate-quiz"
              >
                クイズを生成
              </Button>
            </div>
          </div>
        );

      case "difficulty":
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="fas fa-graduation-cap text-white text-xl"></i>
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">難易度を選択</h3>
              <p className="text-gray-600 text-sm">あなたのレベルに合った難易度を選択</p>
            </div>

            <div className="space-y-3">
              {difficulties.map((difficulty) => (
                <Card
                  key={difficulty.id}
                  className={`cursor-pointer transition-all duration-200 ${
                    selectedDifficulty === difficulty.id 
                      ? "border-blue-500 bg-blue-50 shadow-md" 
                      : "border-gray-200 hover:border-gray-300 hover:shadow-sm"
                  }`}
                  onClick={() => onDifficultyChange(difficulty.id)}
                  data-testid={`difficulty-${difficulty.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-3">
                      <div className={`w-3 h-3 rounded-full ${
                        difficulty.color === 'green' ? 'bg-green-500' :
                        difficulty.color === 'orange' ? 'bg-orange-500' :
                        'bg-red-500'
                      }`}></div>
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-800">{difficulty.title}</h4>
                        <p className="text-sm text-gray-600">{difficulty.description}</p>
                      </div>
                      {selectedDifficulty === difficulty.id && (
                        <i className="fas fa-check text-blue-500"></i>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );

      case "stats":
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="fas fa-chart-bar text-white text-xl"></i>
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">学習統計</h3>
              <p className="text-gray-600 text-sm">あなたの学習進捗を確認</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 p-4 rounded-xl">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">0</div>
                  <div className="text-xs text-gray-600">完了クイズ</div>
                </div>
              </div>
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-4 rounded-xl">
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">0%</div>
                  <div className="text-xs text-gray-600">平均正答率</div>
                </div>
              </div>
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-4 rounded-xl">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">0</div>
                  <div className="text-xs text-gray-600">総スコア</div>
                </div>
              </div>
              <div className="bg-gradient-to-br from-orange-50 to-yellow-50 p-4 rounded-xl">
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">0</div>
                  <div className="text-xs text-gray-600">学習時間</div>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="relative">
      {/* Card Stack Container */}
      <div className="relative h-96">
        {cards.map((card, index) => {
          const isActive = index === currentCard;
          const isNext = index === (currentCard + 1) % cards.length;
          const isPrev = index === (currentCard - 1 + cards.length) % cards.length;
          
          let transform = "";
          let zIndex = 0;
          let opacity = 0.3;
          
          if (isActive) {
            transform = "translateX(0) scale(1)";
            zIndex = 3;
            opacity = 1;
          } else if (isNext) {
            transform = "translateX(20px) scale(0.95)";
            zIndex = 2;
            opacity = 0.7;
          } else if (isPrev) {
            transform = "translateX(-20px) scale(0.95)";
            zIndex = 2;
            opacity = 0.7;
          } else {
            transform = "translateX(0) scale(0.9)";
            zIndex = 1;
            opacity = 0.3;
          }

          return (
            <Card
              key={card.id}
              className="absolute inset-0 bg-white shadow-xl border-0 transition-all duration-500 ease-out"
              style={{
                transform,
                zIndex,
                opacity,
              }}
            >
              <CardContent className="p-6 h-full overflow-y-auto">
                {renderCardContent(card.id)}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Card Navigation Dots */}
      <div className="flex justify-center space-x-2 mt-6">
        {cards.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentCard(index)}
            className={`w-2 h-2 rounded-full transition-all duration-300 ${
              index === currentCard
                ? "bg-blue-500 w-6"
                : "bg-gray-300 hover:bg-gray-400"
            }`}
          />
        ))}
      </div>

      {/* Swipe Indicators */}
      <div className="flex justify-between mt-4">
        <button
          onClick={() => setCurrentCard((prev) => (prev - 1 + cards.length) % cards.length)}
          className="flex items-center space-x-2 text-gray-500 hover:text-gray-700 transition-colors"
        >
          <i className="fas fa-chevron-left"></i>
          <span className="text-sm">前へ</span>
        </button>
        
        <button
          onClick={() => setCurrentCard((prev) => (prev + 1) % cards.length)}
          className="flex items-center space-x-2 text-gray-500 hover:text-gray-700 transition-colors"
        >
          <span className="text-sm">次へ</span>
          <i className="fas fa-chevron-right"></i>
        </button>
      </div>
    </div>
  );
}