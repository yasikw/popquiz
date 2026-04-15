import { useState, useEffect, useRef } from "react";
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

const uploadTabs = [
  { id: "pdf", label: "PDF", icon: "picture_as_pdf" },
  { id: "text", label: "Text", icon: "notes" },
  { id: "youtube", label: "YouTube", icon: "smart_display" },
];

const difficultyLevels = [
  { id: "beginner", label: "Novice", icon: "sentiment_satisfied" },
  { id: "intermediate", label: "Intermediate", icon: "stars" },
  { id: "advanced", label: "Advanced", icon: "bolt" },
];

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
  userId,
}: CardStackProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [difficultyIndex, setDifficultyIndex] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [textContent, setTextContent] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    onDifficultyChange(difficultyLevels[difficultyIndex].id);
  }, [difficultyIndex, onDifficultyChange]);

  const { data: userSettings } = useQuery({
    queryKey: [`/api/users/${userId}/settings`],
    enabled: !!userId,
  });

  const { data: userStats } = useQuery({
    queryKey: ['/api/users', userId, 'stats'],
    queryFn: () => userId ? getUserStats(userId) : null,
    enabled: !!userId,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: sessionsWithQuestions } = useQuery({
    queryKey: ['/api/users', userId, 'sessions-with-questions'],
    queryFn: () => userId ? getUserSessionsWithQuestions(userId) : null,
    enabled: !!userId,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const totalLearningTime = sessionsWithQuestions
    ? sessionsWithQuestions.reduce((total: number, session: any) => total + (session.timeSpent || 0), 0)
    : 0;

  const handleFileChange = (selectedFile: File) => {
    const currentType = uploadTabs[activeTab];
    let allowedTypes: string[] = [];
    let maxSize = 10 * 1024 * 1024;

    if (currentType.id === 'pdf') {
      allowedTypes = ['application/pdf'];
      maxSize = 25 * 1024 * 1024;
    } else if (currentType.id === 'text') {
      allowedTypes = ['text/plain', 'text/markdown'];
      maxSize = 1 * 1024 * 1024;
    }

    const validation = validateFile(selectedFile, allowedTypes, maxSize);
    if (!validation.isValid) {
      toast({ title: "File Error", description: validation.error, variant: "destructive" });
      return;
    }

    setFile(selectedFile);
    localStorage.setItem('lastPdfFile', JSON.stringify({
      name: selectedFile.name,
      size: selectedFile.size,
      type: selectedFile.type,
    }));
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileChange(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleQuizGeneration = async () => {
    const questionCount = (userSettings as UserSettings)?.questionCount || 5;
    const currentType = uploadTabs[activeTab].id;

    if (currentType === 'youtube') {
      const sanitizedUrl = sanitizeURL(youtubeUrl);
      if (!sanitizedUrl) {
        toast({ title: "Invalid URL", description: "Please enter a valid YouTube URL.", variant: "destructive" });
        return;
      }
    }
    if (currentType === 'text') {
      const sanitizedText = sanitizeUserInput(textContent);
      if (!sanitizedText || sanitizedText.length < 10) {
        toast({ title: "Not enough text", description: "Please enter at least 10 characters.", variant: "destructive" });
        return;
      }
    }
    if (currentType === 'pdf' && !file) {
      toast({ title: "No file selected", description: "Please select a PDF file.", variant: "destructive" });
      return;
    }
    if (currentType === 'youtube' && !youtubeUrl) {
      toast({ title: "No URL", description: "Please enter a YouTube URL.", variant: "destructive" });
      return;
    }
    if (currentType === 'text' && !textContent) {
      toast({ title: "No text", description: "Please enter text content.", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    setLoadingMessage("AI is generating your quiz...");

    try {
      const formData = new FormData();
      if (currentType === 'pdf' && file) {
        formData.append('file', file);
        formData.append('contentType', 'pdf');
      } else if (currentType === 'youtube' && youtubeUrl) {
        formData.append('youtubeUrl', youtubeUrl);
        formData.append('contentType', 'youtube');
      } else if (currentType === 'text' && textContent) {
        formData.append('textContent', textContent);
        formData.append('contentType', 'text');
      }
      formData.append('difficulty', selectedDifficulty);
      formData.append('questionCount', questionCount.toString());

      const headers = await addCSRFHeaders();
      const response = await fetch('/api/generate-quiz', {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP ${response.status}: Quiz generation failed`);
      }

      const quiz = await response.json();
      localStorage.setItem('lastContentType', currentType);

      if (currentType === 'pdf' && file) {
        localStorage.setItem('lastPdfFile', JSON.stringify({ name: file.name, size: file.size, type: file.type }));
      } else if (currentType === 'youtube' && youtubeUrl) {
        const videoId = extractVideoId(youtubeUrl);
        localStorage.setItem('savedYouTubeInfo', JSON.stringify({ videoId, url: youtubeUrl }));
      } else if (currentType === 'text' && textContent) {
        localStorage.setItem('lastTextContent', textContent);
      }

      onQuizGenerated(quiz);
    } catch (error) {
      toast({
        title: "Generation Failed",
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
      setLoadingMessage("");
    }
  };

  const avgScore = userStats ? Math.round((userStats.averageAccuracy || 0) * 100) : 0;
  const completedQuizzes = userStats?.completedQuizzes || 0;
  const dailyGoal = 5;
  const dailyProgress = Math.min(completedQuizzes, dailyGoal);
  const dailyPercent = Math.round((dailyProgress / dailyGoal) * 100);

  return (
    <div className="space-y-10 pb-32">
      {/* Hero Banner */}
      <section className="relative w-full h-48 overflow-hidden shadow-xl" style={{ borderRadius: '1rem' }}>
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(135deg, #a8275a 0%, #ff709f 40%, #ffd709 70%, #74f7f1 100%)',
          }}
        />
        <div
          className="absolute inset-0 flex flex-col justify-end p-6"
          style={{ background: 'linear-gradient(to top, rgba(168,39,90,0.65), transparent 70%)' }}
        >
          <h2
            className="text-white text-2xl leading-tight"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800 }}
          >
            Turn anything into a challenge.
          </h2>
          <p className="text-white/80 text-sm font-medium">Upload PDF, text, or YouTube links.</p>
        </div>
      </section>

      {/* Upload Content */}
      <section className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <h3
            className="text-lg tracking-tight"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, color: '#322f22' }}
          >
            Upload Content
          </h3>
          <span
            className="text-xs font-semibold uppercase tracking-widest px-3 py-1"
            style={{
              color: '#a8275a',
              backgroundColor: 'rgba(255, 112, 159, 0.2)',
              borderRadius: '9999px',
            }}
          >
            AI Powered
          </span>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 p-2" style={{ backgroundColor: '#f8f0dc', borderRadius: '1rem' }}>
          {uploadTabs.map((tab, i) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(i)}
              className="flex-1 py-3 px-4 flex items-center justify-center gap-2 text-sm font-bold transition-all"
              style={{
                borderRadius: '0.75rem',
                backgroundColor: activeTab === i ? '#ffffff' : 'transparent',
                boxShadow: activeTab === i ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                color: activeTab === i ? '#a8275a' : '#5f5b4d',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Upload Area */}
        {uploadTabs[activeTab].id === 'pdf' && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx"
              onChange={handleInputChange}
              className="hidden"
              data-testid="input-file"
            />
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              className="flex flex-col items-center justify-center text-center cursor-pointer transition-all p-10 gap-3"
              style={{
                border: '2px dashed #b2ad9c',
                borderRadius: '1rem',
                backgroundColor: isDragOver ? '#efe8d2' : '#ffffff',
              }}
            >
              <div
                className="w-16 h-16 flex items-center justify-center mb-2"
                style={{ backgroundColor: '#74f7f1', borderRadius: '9999px' }}
              >
                <span className="material-symbols-outlined text-3xl" style={{ color: '#006764' }}>upload_file</span>
              </div>
              {file ? (
                <>
                  <p className="font-bold" style={{ color: '#322f22' }}>{file.name}</p>
                  <p className="text-xs font-medium" style={{ color: '#5f5b4d' }}>
                    {(file.size / 1024 / 1024).toFixed(1)} MB
                  </p>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                      localStorage.removeItem('lastPdfFile');
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="text-xs font-semibold mt-1"
                    style={{ color: '#b41340' }}
                    type="button"
                  >
                    Remove file
                  </button>
                </>
              ) : (
                <>
                  <p className="font-bold" style={{ color: '#322f22' }}>Drag & Drop your file here</p>
                  <p className="text-xs font-medium" style={{ color: '#5f5b4d' }}>Supports PDF, DOCX (Max 25MB)</p>
                </>
              )}
            </div>
          </>
        )}

        {uploadTabs[activeTab].id === 'text' && (
          <div className="space-y-2">
            <textarea
              value={textContent}
              onChange={(e) => {
                const sanitized = sanitizeUserInput(e.target.value, {
                  KEEP_CONTENT: true,
                  MAX_LENGTH: 10000,
                });
                setTextContent(sanitized);
              }}
              placeholder="Paste or type your study content here..."
              className="w-full p-4 resize-none h-36 text-sm focus:outline-none transition-all"
              style={{
                backgroundColor: '#eae2cb',
                borderRadius: '1rem',
                border: 'none',
                color: '#322f22',
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
              data-testid="textarea-content"
              maxLength={10000}
            />
            <p className="text-xs text-right pr-1" style={{ color: '#7b7767' }}>
              {textContent.length} / 10,000
            </p>
          </div>
        )}

        {uploadTabs[activeTab].id === 'youtube' && (
          <div className="space-y-3">
            <div
              className="flex items-center gap-3 p-4"
              style={{ backgroundColor: '#eae2cb', borderRadius: '1rem' }}
            >
              <span className="material-symbols-outlined" style={{ color: '#a8275a' }}>link</span>
              <input
                type="url"
                value={youtubeUrl}
                onChange={(e) => setYoutubeUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                className="flex-1 bg-transparent text-sm focus:outline-none"
                style={{ color: '#322f22', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                data-testid="input-youtube"
              />
            </div>
            <div
              className="flex items-start gap-2 p-3 text-xs"
              style={{
                backgroundColor: 'rgba(116, 247, 241, 0.15)',
                borderRadius: '0.75rem',
                color: '#006764',
              }}
            >
              <span className="material-symbols-outlined text-base mt-0.5">info</span>
              <span className="font-medium">AI will analyze the video content to generate quiz questions. Educational videos work best.</span>
            </div>
          </div>
        )}
      </section>

      {/* Difficulty Level */}
      <section className="space-y-4">
        <h3
          className="text-lg tracking-tight px-1"
          style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, color: '#322f22' }}
        >
          Difficulty Level
        </h3>
        <div className="grid grid-cols-3 gap-4">
          {difficultyLevels.map((level, i) => {
            const isActive = difficultyIndex === i;
            return (
              <button
                key={level.id}
                onClick={() => setDifficultyIndex(i)}
                className="p-4 flex flex-col items-center gap-2 cursor-pointer transition-all"
                style={{
                  borderRadius: '1rem',
                  backgroundColor: isActive ? '#ffd709' : '#f8f0dc',
                  border: isActive ? '2px solid #ffd709' : '2px solid transparent',
                  boxShadow: isActive ? '0 4px 12px rgba(255, 215, 9, 0.3)' : 'none',
                  transform: isActive ? 'scale(1.05)' : 'scale(1)',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0",
                    color: i === 0 ? '#64e8e3' : i === 1 ? '#5b4b00' : '#f74b6d',
                  }}
                >
                  {level.icon}
                </span>
                <span
                  className="text-sm font-bold"
                  style={{ color: isActive ? '#5b4b00' : '#322f22' }}
                >
                  {level.label}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Generate Button */}
      <section>
        <button
          onClick={handleQuizGeneration}
          className="w-full text-white py-6 font-extrabold text-xl flex items-center justify-center gap-3 active:scale-95 transition-transform"
          style={{
            background: 'linear-gradient(135deg, #a8275a, #ff709f)',
            borderRadius: '1rem',
            boxShadow: '0 8px 24px rgba(168, 39, 90, 0.25)',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
          }}
          data-testid="button-generate-quiz"
        >
          <span className="material-symbols-outlined text-3xl">auto_awesome</span>
          Generate AI Quiz
        </button>
      </section>

      {/* Your Progress */}
      <section
        className="p-6 space-y-4 relative overflow-hidden"
        style={{ backgroundColor: '#e4ddc5', borderRadius: '1rem' }}
      >
        <div className="flex items-center justify-between">
          <h3
            className="text-lg"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, color: '#322f22' }}
          >
            Your Progress
          </h3>
          <span className="material-symbols-outlined" style={{ color: '#5f5b4d' }}>trending_up</span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div
            className="p-4"
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '0.75rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <p className="text-[10px] uppercase tracking-wider font-bold" style={{ color: '#7b7767', opacity: 0.7 }}>
              Quizzes Taken
            </p>
            <p className="text-2xl" style={{ fontWeight: 900, color: '#a8275a' }}>
              {completedQuizzes}
            </p>
          </div>
          <div
            className="p-4"
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '0.75rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <p className="text-[10px] uppercase tracking-wider font-bold" style={{ color: '#7b7767', opacity: 0.7 }}>
              Avg. Score
            </p>
            <p className="text-2xl" style={{ fontWeight: 900, color: '#006764' }}>
              {avgScore}%
            </p>
          </div>
        </div>

        {/* Daily Goal Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-[11px] font-bold">
            <span style={{ color: '#5f5b4d' }}>Daily Goal ({dailyProgress}/{dailyGoal})</span>
            <span style={{ color: '#6c5a00' }}>{dailyPercent}%</span>
          </div>
          <div
            className="h-3 w-full overflow-hidden"
            style={{ backgroundColor: '#efe8d2', borderRadius: '9999px' }}
          >
            <div
              className="h-full transition-all duration-500"
              style={{
                width: `${dailyPercent}%`,
                backgroundColor: '#ffd709',
                borderRadius: '9999px',
                boxShadow: '0 0 12px rgba(255, 215, 9, 0.4)',
              }}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
