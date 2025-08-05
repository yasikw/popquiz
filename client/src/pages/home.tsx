import { useState } from "react";
import Header from "@/components/layout/header";
import UploadSection from "@/components/quiz/upload-section";
import DifficultySelection from "@/components/quiz/difficulty-selection";
import QuizInterface from "@/components/quiz/quiz-interface";
import ResultsSection from "@/components/quiz/results-section";
import StatsSection from "@/components/stats/stats-section";
import SettingsSection from "@/components/settings/settings-section";
import LoadingOverlay from "@/components/ui/loading-overlay";
import { type GeneratedQuiz, type User } from "@shared/schema";

export default function Home() {
  const [activeSection, setActiveSection] = useState<string>("home");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>("intermediate");
  const [currentQuiz, setCurrentQuiz] = useState<GeneratedQuiz | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");

  const handleQuizGenerated = (quiz: GeneratedQuiz) => {
    setCurrentQuiz(quiz);
    setActiveSection("quiz");
  };

  const handleQuizCompleted = () => {
    setActiveSection("results");
  };

  const handleNewQuiz = () => {
    setCurrentQuiz(null);
    setActiveSection("home");
  };

  return (
    <div className="min-h-screen gradient-bg">
      <Header 
        user={currentUser} 
        activeSection={activeSection}
        onSectionChange={setActiveSection}
      />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeSection === "home" && (
          <>
            {/* Welcome Section */}
            <section className="mb-12">
              <div className="bg-white rounded-3xl p-8 text-gray-800 shadow-md border border-gray-200">
                <div className="max-w-3xl">
                  <h2 className="text-3xl font-bold mb-4">AIで作る、あなた専用のクイズ学習</h2>
                  <p className="text-gray-600 text-lg mb-6">
                    PDFや動画からGemini AIが自動でクイズを生成。難易度選択で効率的な学習を実現します。
                  </p>
                  <div className="flex flex-wrap gap-4">
                    <div className="flex items-center space-x-2 bg-gray-100 rounded-full px-3 py-1">
                      <i className="fas fa-file-pdf text-red-500"></i>
                      <span className="text-sm text-gray-700">PDF対応</span>
                    </div>
                    <div className="flex items-center space-x-2 bg-gray-100 rounded-full px-3 py-1">
                      <i className="fas fa-video text-red-600"></i>
                      <span className="text-sm text-gray-700">YouTube字幕</span>
                    </div>
                    <div className="flex items-center space-x-2 bg-gray-100 rounded-full px-3 py-1">
                      <i className="fas fa-brain text-blue-500"></i>
                      <span className="text-sm text-gray-700">AI自動生成</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <UploadSection 
              onQuizGenerated={handleQuizGenerated}
              selectedDifficulty={selectedDifficulty}
              setIsLoading={setIsLoading}
              setLoadingMessage={setLoadingMessage}
            />
            
            <DifficultySelection 
              selectedDifficulty={selectedDifficulty}
              onDifficultyChange={setSelectedDifficulty}
            />

            <StatsSection userId={currentUser?.id} />
          </>
        )}

        {activeSection === "quiz" && currentQuiz && (
          <QuizInterface 
            quiz={currentQuiz}
            userId={currentUser?.id || "anonymous"}
            onQuizCompleted={handleQuizCompleted}
          />
        )}

        {activeSection === "results" && currentQuiz && (
          <ResultsSection 
            quiz={currentQuiz}
            onNewQuiz={handleNewQuiz}
            onRetryQuiz={() => setActiveSection("quiz")}
            onViewStats={() => setActiveSection("stats")}
          />
        )}

        {activeSection === "stats" && (
          <StatsSection userId={currentUser?.id} />
        )}

        {activeSection === "settings" && (
          <SettingsSection 
            user={currentUser}
            onUserUpdate={setCurrentUser}
          />
        )}
      </main>

      <LoadingOverlay 
        isLoading={isLoading}
        message={loadingMessage}
      />

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <div className="bg-primary rounded-lg p-2">
                  <i className="fas fa-brain text-white"></i>
                </div>
                <span className="font-bold text-gray-900">AI クイズアプリ</span>
              </div>
              <p className="text-sm text-gray-600">AIを活用したスマートな学習プラットフォーム</p>
            </div>
            
            <div>
              <h5 className="font-semibold text-gray-900 mb-3">機能</h5>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>PDF解析</li>
                <li>動画字幕処理</li>
                <li>AI クイズ生成</li>
                <li>成績分析</li>
              </ul>
            </div>
            
            <div>
              <h5 className="font-semibold text-gray-900 mb-3">サポート</h5>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>使い方ガイド</li>
                <li>FAQ</li>
                <li>お問い合わせ</li>
                <li>プライバシーポリシー</li>
              </ul>
            </div>
            
            <div>
              <h5 className="font-semibold text-gray-900 mb-3">技術仕様</h5>
              <ul className="space-y-2 text-sm text-gray-600">
                <li>Powered by Gemini AI</li>
                <li>React + TypeScript</li>
                <li>SQLite Database</li>
                <li>Responsive Design</li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-gray-200 pt-6 mt-8 text-center text-sm text-gray-600">
            <p>&copy; 2024 AI クイズアプリ. Powered by Google Gemini API.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
