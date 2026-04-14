import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Eye, EyeOff } from "lucide-react";

interface LoginPageProps {
  onLogin: (username: string, userId: string) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");
  const { toast } = useToast();

  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const [registerUsername, setRegisterUsername] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await apiRequest('POST', '/api/auth/login', {
        username: loginUsername,
        password: loginPassword,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Login failed');
      }

      const userData = await response.json();
      
      if (userData.accessToken) {
        localStorage.setItem('accessToken', userData.accessToken);
      }
      if (userData.refreshToken) {
        localStorage.setItem('refreshToken', userData.refreshToken);
      }
      
      onLogin(userData.user.username, userData.user.id);
      
      toast({
        title: "Welcome back!",
        description: `Hey ${userData.user.username}, good to see you!`,
      });
    } catch (error) {
      toast({
        title: "Login Error",
        description: error instanceof Error ? error.message : "Login failed",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (registerPassword !== confirmPassword) {
      toast({
        title: "Error",
        description: "Passwords do not match",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    if (registerPassword.length < 6) {
      toast({
        title: "Error",
        description: "Password must be at least 6 characters",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    try {
      const response = await apiRequest('POST', '/api/auth/register', {
        username: registerUsername,
        email: registerEmail,
        password: registerPassword,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Registration failed');
      }

      const userData = await response.json();
      
      if (userData.accessToken) {
        localStorage.setItem('accessToken', userData.accessToken);
      }
      if (userData.refreshToken) {
        localStorage.setItem('refreshToken', userData.refreshToken);
      }
      
      onLogin(userData.user.username, userData.user.id);

      toast({
        title: "Welcome!",
        description: `Hey ${userData.user.username}, welcome to QuizPop!`,
      });
    } catch (error) {
      toast({
        title: "Registration Error",
        description: error instanceof Error ? error.message : "Registration failed",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden"
      style={{
        backgroundColor: '#fdf6e3',
        backgroundImage: `
          radial-gradient(at 0% 0%, rgba(255, 112, 159, 0.15) 0px, transparent 50%),
          radial-gradient(at 100% 0%, rgba(116, 247, 241, 0.15) 0px, transparent 50%),
          radial-gradient(at 100% 100%, rgba(255, 215, 9, 0.15) 0px, transparent 50%),
          radial-gradient(at 0% 100%, rgba(168, 39, 90, 0.1) 0px, transparent 50%)
        `,
        fontFamily: "'Plus Jakarta Sans', 'Noto Sans JP', sans-serif",
        color: '#322f22',
      }}
    >
      <div className="fixed top-1/4 -left-12 w-32 h-32 rounded-full opacity-30 blur-3xl -z-10" style={{ backgroundColor: '#ffd709' }} />
      <div className="fixed bottom-1/4 -right-12 w-48 h-48 rounded-full opacity-30 blur-3xl -z-10" style={{ backgroundColor: '#74f7f1' }} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full opacity-10 blur-3xl -z-10" style={{ backgroundColor: '#ff709f' }} />

      <header className="fixed top-0 w-full z-50 flex items-center justify-center px-6 h-20">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-3xl" style={{ color: '#a8275a' }}>bubble_chart</span>
          <span className="text-2xl font-black tracking-tight" style={{ color: '#a8275a', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            QuizPop
          </span>
        </div>
      </header>

      <main className="w-full max-w-md mt-8 flex flex-col gap-8">
        <section className="text-center space-y-3">
          <h1 className="text-5xl font-extrabold tracking-tight" style={{ color: '#322f22' }}>
            Ready to <span className="italic" style={{ color: '#a8275a' }}>Pop?</span>
          </h1>
          <p className="font-medium text-lg" style={{ color: '#5f5b4d' }}>
            Your daily dose of brain-boggling trivia starts here.
          </p>
        </section>

        <div
          className="backdrop-blur-2xl p-8 space-y-6"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.8)',
            borderRadius: '2rem',
            boxShadow: '0 32px 64px rgba(50, 47, 34, 0.06)',
          }}
        >
          <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl" style={{ backgroundColor: '#eae2cb' }}>
            <button
              onClick={() => setActiveTab("login")}
              className="py-3 px-4 font-bold text-sm transition-all duration-300"
              style={{
                borderRadius: '1.25rem',
                backgroundColor: activeTab === "login" ? '#ffffff' : 'transparent',
                color: activeTab === "login" ? '#a8275a' : '#5f5b4d',
                boxShadow: activeTab === "login" ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
              }}
            >
              Sign In
            </button>
            <button
              onClick={() => setActiveTab("register")}
              className="py-3 px-4 font-bold text-sm transition-all duration-300"
              style={{
                borderRadius: '1.25rem',
                backgroundColor: activeTab === "register" ? '#ffffff' : 'transparent',
                color: activeTab === "register" ? '#a8275a' : '#5f5b4d',
                boxShadow: activeTab === "register" ? '0 2px 8px rgba(0,0,0,0.06)' : 'none',
              }}
            >
              Sign Up
            </button>
          </div>

          {activeTab === "login" && (
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-2">
                <label className="block text-sm font-bold ml-4" style={{ color: '#5f5b4d' }}>
                  Username
                </label>
                <input
                  type="text"
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  placeholder="Enter your username"
                  required
                  data-testid="input-login-username"
                  className="w-full border-none focus:ring-4 rounded-2xl p-4 font-semibold transition-all outline-none"
                  style={{
                    backgroundColor: '#eae2cb',
                    color: '#322f22',
                    focusRingColor: 'rgba(168, 39, 90, 0.1)',
                  }}
                  onFocus={(e) => e.target.style.boxShadow = '0 0 0 4px rgba(168, 39, 90, 0.1)'}
                  onBlur={(e) => e.target.style.boxShadow = 'none'}
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-bold ml-4" style={{ color: '#5f5b4d' }}>
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    data-testid="input-login-password"
                    className="w-full border-none focus:ring-4 rounded-2xl p-4 pr-12 font-semibold transition-all outline-none"
                    style={{ backgroundColor: '#eae2cb', color: '#322f22' }}
                    onFocus={(e) => e.target.style.boxShadow = '0 0 0 4px rgba(168, 39, 90, 0.1)'}
                    onBlur={(e) => e.target.style.boxShadow = 'none'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors"
                    style={{ color: '#7b7767' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#a8275a')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#7b7767')}
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                data-testid="button-login"
                className="w-full py-5 font-extrabold text-xl transition-all duration-300 active:scale-[0.98] disabled:opacity-60"
                style={{
                  borderRadius: '1rem',
                  background: 'linear-gradient(135deg, #a8275a, #ff709f)',
                  color: '#ffeff1',
                  boxShadow: '0 8px 20px rgba(168, 39, 90, 0.25)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 12px 24px rgba(168, 39, 90, 0.35)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 8px 20px rgba(168, 39, 90, 0.25)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                {isLoading ? "Signing in..." : "Let's Play!"}
              </button>
            </form>
          )}

          {activeTab === "register" && (
            <form onSubmit={handleRegister} className="space-y-5">
              <div className="space-y-2">
                <label className="block text-sm font-bold ml-4" style={{ color: '#5f5b4d' }}>
                  Username
                </label>
                <input
                  type="text"
                  value={registerUsername}
                  onChange={(e) => setRegisterUsername(e.target.value)}
                  placeholder="Choose a username"
                  required
                  data-testid="input-register-username"
                  className="w-full border-none rounded-2xl p-4 font-semibold transition-all outline-none"
                  style={{ backgroundColor: '#eae2cb', color: '#322f22' }}
                  onFocus={(e) => e.target.style.boxShadow = '0 0 0 4px rgba(168, 39, 90, 0.1)'}
                  onBlur={(e) => e.target.style.boxShadow = 'none'}
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-bold ml-4" style={{ color: '#5f5b4d' }}>
                  Email Address (optional)
                </label>
                <input
                  type="email"
                  value={registerEmail}
                  onChange={(e) => setRegisterEmail(e.target.value)}
                  placeholder="you@example.com"
                  data-testid="input-register-email"
                  className="w-full border-none rounded-2xl p-4 font-semibold transition-all outline-none"
                  style={{ backgroundColor: '#eae2cb', color: '#322f22' }}
                  onFocus={(e) => e.target.style.boxShadow = '0 0 0 4px rgba(168, 39, 90, 0.1)'}
                  onBlur={(e) => e.target.style.boxShadow = 'none'}
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-bold ml-4" style={{ color: '#5f5b4d' }}>
                  Password (min. 6 characters)
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={registerPassword}
                    onChange={(e) => setRegisterPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    data-testid="input-register-password"
                    className="w-full border-none rounded-2xl p-4 pr-12 font-semibold transition-all outline-none"
                    style={{ backgroundColor: '#eae2cb', color: '#322f22' }}
                    onFocus={(e) => e.target.style.boxShadow = '0 0 0 4px rgba(168, 39, 90, 0.1)'}
                    onBlur={(e) => e.target.style.boxShadow = 'none'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 transition-colors"
                    style={{ color: '#7b7767' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#a8275a')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#7b7767')}
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-bold ml-4" style={{ color: '#5f5b4d' }}>
                  Confirm Password
                </label>
                <input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  data-testid="input-confirm-password"
                  className="w-full border-none rounded-2xl p-4 font-semibold transition-all outline-none"
                  style={{ backgroundColor: '#eae2cb', color: '#322f22' }}
                  onFocus={(e) => e.target.style.boxShadow = '0 0 0 4px rgba(168, 39, 90, 0.1)'}
                  onBlur={(e) => e.target.style.boxShadow = 'none'}
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                data-testid="button-register"
                className="w-full py-5 font-extrabold text-xl transition-all duration-300 active:scale-[0.98] disabled:opacity-60"
                style={{
                  borderRadius: '1rem',
                  background: 'linear-gradient(135deg, #a8275a, #ff709f)',
                  color: '#ffeff1',
                  boxShadow: '0 8px 20px rgba(168, 39, 90, 0.25)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 12px 24px rgba(168, 39, 90, 0.35)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 8px 20px rgba(168, 39, 90, 0.25)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                {isLoading ? "Creating account..." : "Let's Go!"}
              </button>
            </form>
          )}
        </div>

        <p className="text-center font-semibold" style={{ color: '#5f5b4d' }}>
          {activeTab === "login" ? (
            <>
              New to QuizPop?
              <button
                onClick={() => setActiveTab("register")}
                className="font-extrabold ml-1 hover:underline transition-all decoration-2 underline-offset-4"
                style={{ color: '#a8275a' }}
              >
                Create Account
              </button>
            </>
          ) : (
            <>
              Already have an account?
              <button
                onClick={() => setActiveTab("login")}
                className="font-extrabold ml-1 hover:underline transition-all decoration-2 underline-offset-4"
                style={{ color: '#a8275a' }}
              >
                Sign In
              </button>
            </>
          )}
        </p>
      </main>
    </div>
  );
}
