import { useState, useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useCSRF } from "@/hooks/useCSRF";
import Home from "@/pages/home";
import LoginPage from "@/pages/login";
import NotFound from "@/pages/not-found";
import { type User } from "@shared/schema";
import bgImage from "@assets/BG_1754455391940.png";

function Router() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { isTokenReady, error: csrfError } = useCSRF();

  useEffect(() => {
    // Check for saved user session
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      try {
        const user = JSON.parse(savedUser);
        setCurrentUser(user);
      } catch (error) {
        console.error('Error parsing saved user:', error);
        localStorage.removeItem('currentUser');
      }
    }
    setIsLoading(false);
  }, []);

  const handleLogin = (username: string, userId: string) => {
    const user: User = {
      id: userId,
      username,
      email: null,
      password: null,
      createdAt: new Date(),
    };
    setCurrentUser(user);
    localStorage.setItem('currentUser', JSON.stringify(user));
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('currentUser');
  };

  if (isLoading || !isTokenReady) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">
            {isLoading ? '読み込み中...' : 'セキュリティ設定を初期化中...'}
          </p>
          {csrfError && (
            <p className="text-red-600 mt-2 text-sm">
              セキュリティエラー: {csrfError}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <Switch>
      <Route path="/" component={() => <Home user={currentUser} onLogout={handleLogout} />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <div 
      className="min-h-screen"
      style={{
        backgroundImage: `url(${bgImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed'
      }}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </div>
  );
}

export default App;
