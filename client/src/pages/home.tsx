import { useState, useEffect } from "react";
import Header from "@/components/layout/header";
import QuizInterface from "@/components/quiz/quiz-interface";
import ResultsSection from "@/components/quiz/results-section";
import StatsSection from "@/components/stats/stats-section";
import SettingsSection from "@/components/settings/settings-section";
import LoadingOverlay from "@/components/ui/loading-overlay";
import CardStack from "@/components/mobile/card-stack";
import BottomNav from "@/components/mobile/bottom-nav";
import { type GeneratedQuiz, type User } from "@shared/schema";
import bgImage from "@assets/BG_1754455391940.png";

interface HomeProps {
  user: User;
  onLogout: () => void;
}

export default function Home({ user, onLogout }: HomeProps) {
  const [activeSection, setActiveSection] = useState<string>("home");
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>("intermediate");
  const [currentQuiz, setCurrentQuiz] = useState<GeneratedQuiz | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");

  // Debug loading state changes
  useEffect(() => {
    console.log("HOME: Loading state changed:", { isLoading, loadingMessage });
  }, [isLoading, loadingMessage]);

  const handleQuizGenerated = (quiz: GeneratedQuiz) => {
    setCurrentQuiz(quiz);
    setActiveSection("quiz");
  };

  const handleQuizCompleted = () => {
    console.log("handleQuizCompleted called, switching to results section");
    setActiveSection("results");
  };

  const handleNewQuiz = () => {
    setCurrentQuiz(null);
    setActiveSection("home");
  };

  return (
    <div 
      className="min-h-screen pb-20 relative max-w-md mx-auto"
      style={{
        backgroundImage: `url(${bgImage})`,
        backgroundSize: '100% auto',
        backgroundPosition: 'center top',
        backgroundRepeat: 'no-repeat',
        position: 'relative',
        zIndex: 0
      }}
    >

      <div className="relative z-10 min-h-screen pb-20">
      <Header 
        user={user} 
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        onLogout={onLogout}
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
              userId={user.id}
            />
          </>
        )}

        {activeSection === "quiz" && currentQuiz && (
          <QuizInterface 
            quiz={currentQuiz}
            userId={user.id}
            onQuizCompleted={handleQuizCompleted}
          />
        )}

        {activeSection === "results" && currentQuiz && (
          <ResultsSection 
            quiz={currentQuiz}
            onNewQuiz={handleNewQuiz}
            onRetryQuiz={() => setActiveSection("quiz")}
            onViewStats={() => setActiveSection("stats")}
            onQuizGenerated={handleQuizGenerated}
          />
        )}

        {activeSection === "stats" && (
          <StatsSection userId={user.id} />
        )}

        {activeSection === "settings" && (
          <SettingsSection 
            user={user}
            onUserUpdate={() => {}}
          />
        )}
      </main>

      <BottomNav 
        activeSection={activeSection}
        onSectionChange={setActiveSection}
      />

      {/* Loading Overlay */}
      <LoadingOverlay 
        message={loadingMessage}
        isVisible={isLoading}
      />
      </div>
    </div>
  );
}