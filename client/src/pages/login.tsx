import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Eye, EyeOff, BookOpen, Sparkles, Trophy, Users } from "lucide-react";
import bgImage from "@assets/BG_1754455391940.png";
import logoImage from "@assets/AIquiz logo_1754457435636.png";

interface LoginPageProps {
  onLogin: (username: string, userId: string) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Login form state
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register form state
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
        throw new Error(errorData.message || 'ログインに失敗しました');
      }

      const userData = await response.json();
      
      // Store JWT tokens
      if (userData.accessToken) {
        localStorage.setItem('accessToken', userData.accessToken);
      }
      if (userData.refreshToken) {
        localStorage.setItem('refreshToken', userData.refreshToken);
      }
      
      onLogin(userData.user.username, userData.user.id, userData.user.email);
      
      toast({
        title: "ログイン成功",
        description: `${userData.user.username}さん、おかえりなさい！`,
      });
    } catch (error) {
      toast({
        title: "ログインエラー",
        description: error instanceof Error ? error.message : "ログインに失敗しました",
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
        title: "エラー",
        description: "パスワードが一致しません",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    if (registerPassword.length < 6) {
      toast({
        title: "エラー",
        description: "パスワードは6文字以上で入力してください",
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
        throw new Error(errorData.message || 'ユーザー登録に失敗しました');
      }

      const userData = await response.json();
      
      // Store JWT tokens
      if (userData.accessToken) {
        localStorage.setItem('accessToken', userData.accessToken);
      }
      if (userData.refreshToken) {
        localStorage.setItem('refreshToken', userData.refreshToken);
      }
      
      onLogin(userData.user.username, userData.user.id, userData.user.email);

      toast({
        title: "登録成功",
        description: `${userData.user.username}さん、ようこそ！`,
      });
    } catch (error) {
      toast({
        title: "登録エラー",
        description: error instanceof Error ? error.message : "ユーザー登録に失敗しました",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen flex flex-col relative"
      style={{
        backgroundImage: `url(${bgImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      {/* Overlay for better text readability */}
      <div className="absolute inset-0 bg-white/10 backdrop-blur-[1px]"></div>
      <div className="relative z-10 min-h-screen flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 text-center py-12">
        <div className="flex items-center justify-center mb-6">
          <img 
            src={logoImage} 
            alt="AI Quiz Logo" 
            className="w-40 h-24 object-contain drop-shadow-lg"
          />
        </div>
        <p className="text-gray-700 text-lg font-medium">
          AIが作る、あなただけの学習体験
        </p>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center px-4 pb-12">
        <div className="w-full max-w-md">
          <Card className="bg-white/90 backdrop-blur-md border-0 shadow-2xl">
            <CardHeader className="text-center pb-4">
              <CardTitle className="text-2xl font-bold text-gray-800">
                始めましょう
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="login" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="login" className="text-sm">
                    ログイン
                  </TabsTrigger>
                  <TabsTrigger value="register" className="text-sm">
                    新規登録
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="login" className="space-y-4">
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="login-username" className="text-sm font-medium text-gray-700">
                        ユーザー名
                      </Label>
                      <Input
                        id="login-username"
                        type="text"
                        value={loginUsername}
                        onChange={(e) => setLoginUsername(e.target.value)}
                        placeholder="ユーザー名を入力"
                        className="bg-white/70 border-gray-200"
                        required
                        data-testid="input-login-username"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="login-password" className="text-sm font-medium text-gray-700">
                        パスワード
                      </Label>
                      <div className="relative">
                        <Input
                          id="login-password"
                          type={showPassword ? "text" : "password"}
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          placeholder="パスワードを入力"
                          className="bg-white/70 border-gray-200 pr-10"
                          required
                          data-testid="input-login-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                        >
                          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>

                    <Button
                      type="submit"
                      className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-2.5 shadow-lg transition-all duration-200"
                      disabled={isLoading}
                      data-testid="button-login"
                    >
                      {isLoading ? "ログイン中..." : "ログイン"}
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="register" className="space-y-4">
                  <form onSubmit={handleRegister} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="register-username" className="text-sm font-medium text-gray-700">
                        ユーザー名
                      </Label>
                      <Input
                        id="register-username"
                        type="text"
                        value={registerUsername}
                        onChange={(e) => setRegisterUsername(e.target.value)}
                        placeholder="ユーザー名を入力"
                        className="bg-white/70 border-gray-200"
                        required
                        data-testid="input-register-username"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="register-email" className="text-sm font-medium text-gray-700">
                        メールアドレス（オプション）
                      </Label>
                      <Input
                        id="register-email"
                        type="email"
                        value={registerEmail}
                        onChange={(e) => setRegisterEmail(e.target.value)}
                        placeholder="email@example.com"
                        className="bg-white/70 border-gray-200"
                        data-testid="input-register-email"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="register-password" className="text-sm font-medium text-gray-700">
                        パスワード（6文字以上）
                      </Label>
                      <div className="relative">
                        <Input
                          id="register-password"
                          type={showPassword ? "text" : "password"}
                          value={registerPassword}
                          onChange={(e) => setRegisterPassword(e.target.value)}
                          placeholder="パスワードを入力"
                          className="bg-white/70 border-gray-200 pr-10"
                          required
                          data-testid="input-register-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                        >
                          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="confirm-password" className="text-sm font-medium text-gray-700">
                        パスワード確認
                      </Label>
                      <Input
                        id="confirm-password"
                        type={showPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="パスワードを再入力"
                        className="bg-white/70 border-gray-200"
                        required
                        data-testid="input-confirm-password"
                      />
                    </div>

                    <Button
                      type="submit"
                      className="w-full bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white font-semibold py-2.5 shadow-lg transition-all duration-200"
                      disabled={isLoading}
                      data-testid="button-register"
                    >
                      {isLoading ? "登録中..." : "新規登録"}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Features */}
          <div className="mt-8 grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="bg-white/60 backdrop-blur-sm p-4 rounded-xl shadow-lg mb-2">
                <Sparkles className="h-8 w-8 mx-auto text-blue-600" />
              </div>
              <p className="text-sm text-gray-600 font-medium">AI生成</p>
            </div>
            <div className="text-center">
              <div className="bg-white/60 backdrop-blur-sm p-4 rounded-xl shadow-lg mb-2">
                <Trophy className="h-8 w-8 mx-auto text-purple-600" />
              </div>
              <p className="text-sm text-gray-600 font-medium">進捗追跡</p>
            </div>
            <div className="text-center">
              <div className="bg-white/60 backdrop-blur-sm p-4 rounded-xl shadow-lg mb-2">
                <Users className="h-8 w-8 mx-auto text-green-600" />
              </div>
              <p className="text-sm text-gray-600 font-medium">個別対応</p>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}