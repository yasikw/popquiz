import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { type GeneratedQuiz, type UserSettings, type UserStats } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { getUserStats, getUserSessionsWithQuestions } from "@/lib/api";
import { sanitizeUserInput, sanitizeURL, validateFile } from '@/lib/security';
import { addCSRFHeaders } from '@/lib/csrf';

interface CardStackProps {
  onQuizGenerated: (quiz: GeneratedQuiz) => void;
  selectedDifficulty: string;
  onDifficultyChange: (difficulty: string) => void;
  setIsLoading: (loading: boolean) => void;
  setLoadingMessage: (message: string) => void;
  userId?: string;
}

const uploadTypes = [
  {
    id: "pdf",
    title: "PDF",
    icon: "fas fa-file-pdf",
    color: "from-red-500 to-red-600",
    description: "PDFファイルをアップロード"
  },
  {
    id: "text",
    title: "テキスト",
    icon: "fas fa-file-text", 
    color: "from-blue-500 to-blue-600",
    description: "テキスト内容を直接入力"
  },
  {
    id: "youtube",
    title: "YouTube",
    icon: "fas fa-video",
    color: "from-red-600 to-red-700",
    description: "YouTube URLから字幕を抽出"
  }
];

const difficulties = [
  { 
    id: "beginner", 
    title: "初級", 
    description: "基本的な内容から学習", 
    color: "from-green-500 to-green-600",
    icon: "fas fa-seedling"
  },
  { 
    id: "intermediate", 
    title: "中級", 
    description: "標準的な内容で挑戦", 
    color: "from-orange-500 to-orange-600",
    icon: "fas fa-fire"
  },
  { 
    id: "advanced", 
    title: "上級", 
    description: "高度な内容でスキルアップ", 
    color: "from-red-500 to-red-600",
    icon: "fas fa-crown"
  }
];

// Helper function to extract video ID from YouTube URL
const extractVideoId = (url: string): string => {
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = url.match(regex);
  return match ? match[1] : '';
};

export default function CardStack({ 
  onQuizGenerated, 
  selectedDifficulty, 
  onDifficultyChange,
  setIsLoading,
  setLoadingMessage,
  userId 
}: CardStackProps) {
  const [currentUploadType, setCurrentUploadType] = useState(0);
  const [currentDifficultyIndex, setCurrentDifficultyIndex] = useState(1); // Start with intermediate
  const [file, setFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [textContent, setTextContent] = useState("");
  const { toast } = useToast();

  // Check for existing PDF file on component mount
  useEffect(() => {
    const savedPdfFile = localStorage.getItem('lastPdfFile');
    if (savedPdfFile) {
      const pdfInfo = JSON.parse(savedPdfFile);
      console.log('Found saved PDF file info:', pdfInfo);
      // Note: We can't recreate the File object, but we can show the info
      // The actual file will be handled differently for retries
    }
  }, []);

  // Set initial difficulty
  useEffect(() => {
    onDifficultyChange(difficulties[currentDifficultyIndex].id);
  }, [currentDifficultyIndex, onDifficultyChange]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      
      // Validate file based on upload type
      const currentType = uploadTypes[currentUploadType];
      let allowedTypes: string[] = [];
      let maxSize = 10 * 1024 * 1024; // 10MB default

      if (currentType.id === 'pdf') {
        allowedTypes = ['application/pdf'];
        maxSize = 10 * 1024 * 1024; // 10MB for PDF
      } else if (currentType.id === 'text') {
        allowedTypes = ['text/plain', 'text/markdown'];
        maxSize = 1 * 1024 * 1024; // 1MB for text
      }

      const validation = validateFile(selectedFile, allowedTypes, maxSize);
      if (!validation.isValid) {
        toast({
          title: "ファイルエラー",
          description: validation.error,
          variant: "destructive",
        });
        return;
      }
      
      setFile(selectedFile);
      console.log('File selected:', selectedFile.name, selectedFile.size);
      
      // Store PDF file information for retention
      localStorage.setItem('lastPdfFile', JSON.stringify({
        name: selectedFile.name,
        size: selectedFile.size,
        type: selectedFile.type
      }));
    }
  };

  // Handle retry with previous PDF
  const handleRetryQuiz = async () => {
    console.log('Retry quiz with previous PDF');
    
    // Check if we have saved PDF info
    const savedPdfFile = localStorage.getItem('lastPdfFile');
    if (!savedPdfFile) {
      alert('前回のPDFファイル情報が見つかりません');
      return;
    }

    const pdfInfo = JSON.parse(savedPdfFile);
    
    // Clear previous results but keep the PDF info
    localStorage.removeItem('quizResults');
    
    // Get question count from user settings
    const questionCount = (userSettings as UserSettings)?.questionCount || 5;
    
    setIsLoading(true);
    setLoadingMessage("前回のPDFからクイズを生成中...");

    try {
      // Use cached PDF content for quiz generation
      const response = await fetch('/api/generate-quiz-from-cache', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pdfInfo: pdfInfo,
          difficulty: selectedDifficulty,
          questionCount: questionCount
        }),
      });

      if (!response.ok) {
        throw new Error('キャッシュからのクイズ生成に失敗しました。新しいPDFをアップロードしてください。');
      }

      const quiz = await response.json();
      console.log('Quiz generated successfully from cache:', quiz);
      onQuizGenerated(quiz);
    } catch (error) {
      console.error('Cache quiz generation error:', error);
      // Fallback: switch to PDF upload and ask for re-upload
      setCurrentUploadType(0);
      alert('前回のPDFファイルを再度アップロードしてください');
    } finally {
      setIsLoading(false);
      setLoadingMessage("");
    }
  };

  // Load user settings from database
  const { data: userSettings } = useQuery({
    queryKey: [`/api/users/${userId}/settings`],
    enabled: !!userId,
  });

  // Load user statistics from database for real-time display
  const { data: userStats } = useQuery({
    queryKey: ['/api/users', userId, 'stats'],
    queryFn: () => userId ? getUserStats(userId) : null,
    enabled: !!userId,
    staleTime: 0, // Always fetch fresh data
    refetchOnWindowFocus: true,
  });

  // Load user sessions to calculate total learning time
  const { data: sessionsWithQuestions } = useQuery({
    queryKey: ['/api/users', userId, 'sessions-with-questions'],
    queryFn: () => userId ? getUserSessionsWithQuestions(userId) : null,
    enabled: !!userId,
    staleTime: 0, // Always fetch fresh data
    refetchOnWindowFocus: true,
  });

  // Calculate total learning time from sessions
  const totalLearningTime = sessionsWithQuestions ? 
    sessionsWithQuestions.reduce((total: number, session: any) => total + (session.timeSpent || 0), 0) : 0;

  const handleQuizGeneration = async () => {
    // Get question count from user settings
    const questionCount = (userSettings as UserSettings)?.questionCount || 5;
    
    const currentType = uploadTypes[currentUploadType].id;
    
    console.log('Quiz generation started:', { currentType, selectedDifficulty, questionCount });
    console.log('Parsed question count:', questionCount);

    // Validate inputs based on type
    if (currentType === 'youtube') {
      const sanitizedUrl = sanitizeURL(youtubeUrl);
      if (!sanitizedUrl) {
        toast({
          title: "無効なURL",
          description: "有効なYouTube URLを入力してください",
          variant: "destructive",
        });
        return;
      }
    }

    if (currentType === 'text') {
      const sanitizedText = sanitizeUserInput(textContent);
      if (!sanitizedText || sanitizedText.length < 10) {
        toast({
          title: "テキストが不十分",
          description: "10文字以上のテキストを入力してください",
          variant: "destructive",
        });
        return;
      }
    }
    
    if (currentType === 'pdf' && !file) {
      alert("PDFファイルを選択してください");
      return;
    }
    if (currentType === 'youtube' && !youtubeUrl) {
      alert("YouTube URLを入力してください");
      return;
    }
    if (currentType === 'text' && !textContent) {
      alert("テキスト内容を入力してください");
      return;
    }

    console.log("Setting loading state to true");
    setIsLoading(true);
    setLoadingMessage("AIがクイズを生成中...");
    console.log("Loading state set, isLoading should be true");

    try {
      const formData = new FormData();
      
      if (currentType === 'pdf' && file) {
        formData.append('file', file);
        formData.append('contentType', 'pdf');
        console.log('PDF file added:', file.name, file.size);
      } else if (currentType === 'youtube' && youtubeUrl) {
        formData.append('youtubeUrl', youtubeUrl);
        formData.append('contentType', 'youtube');
        console.log('YouTube URL added:', youtubeUrl);
      } else if (currentType === 'text' && textContent) {
        formData.append('textContent', textContent);
        formData.append('contentType', 'text');
        console.log('Text content added, length:', textContent.length);
      }
      
      formData.append('difficulty', selectedDifficulty);
      formData.append('questionCount', questionCount.toString());

      console.log('Sending request to /api/generate-quiz');
      // Get CSRF headers for the request
      const headers = await addCSRFHeaders();
      
      const response = await fetch('/api/generate-quiz', {
        method: 'POST',
        headers: headers,
        body: formData,
      });

      console.log('Response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Server error:', errorData);
        throw new Error(errorData.message || `HTTP ${response.status}: クイズ生成に失敗しました`);
      }

      const quiz = await response.json();
      console.log('Quiz generated successfully:', quiz);
      
      // Store content type for later use in quiz results
      localStorage.setItem('lastContentType', currentType);
      
      // Store content-specific info for different quiz generation
      if (currentType === 'pdf' && file) {
        localStorage.setItem('lastPdfFile', JSON.stringify({
          name: file.name,
          size: file.size,
          type: file.type
        }));
      } else if (currentType === 'youtube' && youtubeUrl) {
        // Extract video ID from YouTube URL and store it
        const videoId = extractVideoId(youtubeUrl);
        localStorage.setItem('savedYouTubeInfo', JSON.stringify({
          videoId: videoId,
          url: youtubeUrl
        }));
      } else if (currentType === 'text' && textContent) {
        // Store text content for different quiz generation
        localStorage.setItem('lastTextContent', textContent);
      }
      
      onQuizGenerated(quiz);
    } catch (error) {
      console.error('Quiz generation error:', error);
      alert(`クイズ生成に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      console.log("Setting loading state to false");
      setIsLoading(false);
      setLoadingMessage("");
      console.log("Loading state cleared");
    }
  };



  const renderUploadTypeSelector = () => {
    const currentType = uploadTypes[currentUploadType];
    
    return (
      <div className="space-y-4">
        {/* Type Selector */}
        <div className="relative overflow-hidden rounded-xl bg-white/60 p-1">
          <div className="flex relative">
            {/* Background slider */}
            <div 
              className={`absolute top-1 bottom-1 w-1/3 bg-gradient-to-r ${currentType.color} rounded-lg transition-transform duration-300 ease-out`}
              style={{
                '--slider-position': `${currentUploadType * 100}%`,
                transform: 'translateX(var(--slider-position))'
              } as React.CSSProperties}
            />
            
            {uploadTypes.map((type, index) => (
              <button
                key={type.id}
                onClick={() => setCurrentUploadType(index)}
                className={`flex-1 relative z-10 py-3 px-2 text-center transition-colors duration-300 ${
                  currentUploadType === index 
                    ? 'text-white font-medium' 
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                <i className={`${type.icon} text-lg mb-1 block`}></i>
                <span className="text-xs">{type.title}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Type-specific content */}
        <div className="space-y-4">
          <div className="text-center">
            <h4 className="font-semibold text-gray-800">{currentType.title}</h4>
            <p className="text-sm text-gray-600">{currentType.description}</p>
          </div>

          {currentType.id === 'pdf' && (
            <div>
              <Label className="text-sm font-medium text-gray-700">PDFファイル</Label>
              <Input
                type="file"
                accept=".pdf"
                onChange={handleFileChange}
                className="mt-1"
                data-testid="input-file"
              />
              {file && (
                <div className="mt-2 p-2 bg-green-50/60 border border-green-200/60 rounded text-sm">
                  <i className="fas fa-check-circle text-green-600 mr-2"></i>
                  選択済み: {file.name} ({(file.size / 1024 / 1024).toFixed(1)}MB)
                  <button 
                    onClick={() => {
                      setFile(null);
                      localStorage.removeItem('lastPdfFile');
                      // Reset file input
                      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
                      if (fileInput) fileInput.value = '';
                    }}
                    className="ml-2 text-red-500 hover:text-red-700"
                    type="button"
                  >
                    <i className="fas fa-times"></i>
                  </button>
                </div>
              )}
              {!file && (() => {
                const savedPdfFile = localStorage.getItem('lastPdfFile');
                const pdfInfo = savedPdfFile ? JSON.parse(savedPdfFile) : null;
                return pdfInfo ? (
                  <div className="mt-2 p-2 bg-blue-50/60 border border-blue-200/60 rounded text-sm">
                    <i className="fas fa-info-circle text-blue-600 mr-2"></i>
                    前回のPDF: {pdfInfo.name} ({(pdfInfo.size / 1024 / 1024).toFixed(1)}MB)
                    <div className="text-xs text-blue-700 mt-1">
                      「もう一度挑戦」でこのPDFを使用します
                    </div>
                  </div>
                ) : null;
              })()}
            </div>
          )}

          {currentType.id === 'youtube' && (
            <div>
              <Label className="text-sm font-medium text-gray-700">YouTube URL</Label>
              <Input
                type="url"
                value={youtubeUrl}
                onChange={(e) => {
                  const value = e.target.value;
                  const sanitizedUrl = sanitizeURL(value);
                  // Keep original value for user experience but validate on submit
                  setYoutubeUrl(value);
                }}
                placeholder="https://youtube.com/watch?v=..."
                className="mt-1"
                data-testid="input-youtube"
              />
              <div className="mt-2 p-3 bg-blue-50/60 border border-blue-200/60 rounded-lg text-sm">
                <div className="flex items-start">
                  <i className="fas fa-info-circle text-blue-600 mr-2 mt-0.5"></i>
                  <div>
                    <div className="font-medium text-blue-800 mb-1">AIが動画内容を分析</div>
                    <div className="text-blue-700">
                      AIが動画の内容を分析して学習コンテンツを生成します。<br/>
                      教育的な内容の動画が最適です。
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentType.id === 'text' && (
            <div>
              <Label className="text-sm font-medium text-gray-700">テキスト内容</Label>
              <textarea
                value={textContent}
                onChange={(e) => {
                  const sanitized = sanitizeUserInput(e.target.value, { 
                    KEEP_CONTENT: true,
                    MAX_LENGTH: 10000 // 10,000 character limit
                  });
                  setTextContent(sanitized);
                }}
                placeholder="学習内容を直接入力..."
                className="w-full mt-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none h-24"
                data-testid="textarea-content"
                maxLength={10000}
              />
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderDifficultySelector = () => {
    const currentDiff = difficulties[currentDifficultyIndex];
    
    return (
      <div className="space-y-4">
        {/* Difficulty Selector */}
        <div className="relative overflow-hidden rounded-xl bg-white/60 p-1">
          <div className="flex relative">
            {/* Background slider */}
            <div 
              className={`absolute top-1 bottom-1 w-1/3 bg-gradient-to-r ${currentDiff.color} rounded-lg transition-transform duration-300 ease-out`}
              style={{
                '--slider-position': `${currentDifficultyIndex * 100}%`,
                transform: 'translateX(var(--slider-position))'
              } as React.CSSProperties}
            />
            
            {difficulties.map((diff, index) => (
              <button
                key={diff.id}
                onClick={() => setCurrentDifficultyIndex(index)}
                className={`flex-1 relative z-10 py-3 px-2 text-center transition-colors duration-300 ${
                  currentDifficultyIndex === index 
                    ? 'text-white font-medium' 
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                <i className={`${diff.icon} text-lg mb-1 block`}></i>
                <span className="text-xs">{diff.title}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Difficulty info */}
        <div className="text-center">
          <h4 className="font-semibold text-gray-800">{currentDiff.title}</h4>
          <p className="text-sm text-gray-600">{currentDiff.description}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Upload Card */}
      <Card className="bg-white/60 border border-gray-200/40 shadow-md backdrop-blur-sm">
        <CardContent className="p-6">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-upload text-white text-xl"></i>
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">コンテンツをアップロード</h3>
            <p className="text-gray-600 text-sm">学習したいコンテンツを選択してください</p>
          </div>
          
          {renderUploadTypeSelector()}
        </CardContent>
      </Card>

      {/* Difficulty Card */}
      <Card className="bg-white/30 border border-gray-200/40 shadow-md backdrop-blur-sm">
        <CardContent className="p-6">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-graduation-cap text-white text-xl"></i>
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">難易度を選択</h3>
            <p className="text-gray-600 text-sm">あなたのレベルに合った難易度を選択</p>
          </div>
          
          {renderDifficultySelector()}
        </CardContent>
      </Card>

      {/* Generate Button */}
      <div className="space-y-3">
        <Button
          onClick={handleQuizGeneration}
          className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white py-4 text-lg font-medium shadow-lg"
          data-testid="button-generate-quiz"
        >
          <i className="fas fa-magic mr-2"></i>
          AIクイズを生成
        </Button>
        

      </div>

      {/* Stats Preview Card */}
      <Card className="bg-white/30 border border-gray-200/40 shadow-md backdrop-blur-sm">
        <CardContent className="p-6">
          <div className="text-center mb-4">
            <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-chart-bar text-white text-xl"></i>
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">学習統計</h3>
            <p className="text-gray-600 text-sm">あなたの学習進捗を確認</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gradient-to-br from-blue-50/60 to-cyan-50/60 p-4 rounded-xl">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {userStats?.completedQuizzes || 0}
                </div>
                <div className="text-xs text-gray-600">完了クイズ</div>
              </div>
            </div>
            <div className="bg-gradient-to-br from-purple-50/60 to-pink-50/60 p-4 rounded-xl">
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {userStats ? Math.round((userStats.averageAccuracy || 0) * 100) : 0}%
                </div>
                <div className="text-xs text-gray-600">平均正答率</div>
              </div>
            </div>
            <div className="bg-gradient-to-br from-green-50/60 to-emerald-50/60 p-4 rounded-xl">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {userStats?.totalScore || 0}
                </div>
                <div className="text-xs text-gray-600">総スコア</div>
              </div>
            </div>
            <div className="bg-gradient-to-br from-orange-50/60 to-yellow-50/60 p-4 rounded-xl">
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">
                  {Math.round(totalLearningTime / 60)}分
                </div>
                <div className="text-xs text-gray-600">学習時間</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}