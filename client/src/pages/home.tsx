import { useState } from "react";
import Header from "@/components/layout/header";
import QuizInterface from "@/components/quiz/quiz-interface";
import ResultsSection from "@/components/quiz/results-section";
import StatsSection from "@/components/stats/stats-section";
import SettingsSection from "@/components/settings/settings-section";
import LoadingOverlay from "@/components/ui/loading-overlay";
import CardStack from "@/components/mobile/card-stack";
import BottomNav from "@/components/mobile/bottom-nav";
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
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-cyan-50 pb-20">
      <Header 
        user={currentUser} 
        activeSection={activeSection}
        onSectionChange={setActiveSection}
      />
      
      <main className="max-w-md mx-auto px-4 py-6">
        {activeSection === "home" && (
          <>
            {/* Mobile Card Stack */}
            <CardStack 
              onQuizGenerated={handleQuizGenerated}
              selectedDifficulty={selectedDifficulty}
              onDifficultyChange={setSelectedDifficulty}
              setIsLoading={setIsLoading}
              setLoadingMessage={setLoadingMessage}
              userId={currentUser?.id}
            />
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

      <BottomNav 
        activeSection={activeSection}
        onSectionChange={setActiveSection}
      />
    </div>
  );
}