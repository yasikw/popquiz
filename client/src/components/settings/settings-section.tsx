import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { updateUser } from "@/lib/api";
import { type User, type UserSettings } from "@shared/schema";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface SettingsSectionProps {
  user: User | null;
  onUserUpdate: (user: User) => void;
}

export default function SettingsSection({ user, onUserUpdate }: SettingsSectionProps) {
  const [username, setUsername] = useState(user?.username || "");
  const [email, setEmail] = useState(user?.email || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [defaultDifficulty, setDefaultDifficulty] = useState("intermediate");
  const [timeLimit, setTimeLimit] = useState("60");
  const [questionCount, setQuestionCount] = useState("10");
  const [autoNext, setAutoNext] = useState(true);
  const { toast } = useToast();

  const queryClient = useQueryClient();

  // Load settings from database
  const { data: userSettings, isLoading: settingsLoading } = useQuery({
    queryKey: [`/api/users/${user?.id}/settings`],
    enabled: !!user?.id,
  });

  // Update state when settings are loaded
  useEffect(() => {
    if (userSettings) {
      setDefaultDifficulty(userSettings.defaultDifficulty || "intermediate");
      setTimeLimit(userSettings.timeLimit?.toString() || "60");
      setQuestionCount(userSettings.questionCount?.toString() || "5");
    }
  }, [userSettings]);

  const handleSaveUserSettings = async () => {
    if (!user) {
      toast({
        title: "エラー",
        description: "ユーザーが見つかりません",
        variant: "destructive",
      });
      return;
    }

    try {
      const updatedUser = await updateUser(user.id, { username, email });
      onUserUpdate(updatedUser);
      toast({
        title: "成功",
        description: "ユーザー設定を保存しました",
      });
    } catch (error) {
      toast({
        title: "エラー",
        description: "設定の保存に失敗しました",
        variant: "destructive",
      });
    }
  };

  const handleChangePassword = async () => {
    if (!user) {
      toast({
        title: "エラー",
        description: "ユーザーが見つかりません",
        variant: "destructive",
      });
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      toast({
        title: "エラー",
        description: "新しいパスワードは6文字以上で入力してください",
        variant: "destructive",
      });
      return;
    }

    if (newPassword !== confirmPassword) {
      toast({
        title: "エラー",
        description: "新しいパスワードと確認用パスワードが一致しません",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch('/api/users/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          currentPassword,
          newPassword,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'パスワード変更に失敗しました');
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      toast({
        title: "成功",
        description: "パスワードを変更しました",
      });
    } catch (error) {
      toast({
        title: "エラー",
        description: error instanceof Error ? error.message : "パスワード変更に失敗しました",
        variant: "destructive",
      });
    }
  };

  // Mutation for updating user settings
  const updateSettingsMutation = useMutation({
    mutationFn: async (settingsData: Partial<UserSettings>) => {
      return apiRequest("PUT", `/api/users/${user?.id}/settings`, settingsData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/users/${user?.id}/settings`] });
      toast({
        title: "成功",
        description: "クイズ設定を保存しました",
      });
    },
    onError: (error: any) => {
      toast({
        title: "エラー",
        description: "設定の保存に失敗しました",
        variant: "destructive",
      });
    },
  });

  const handleSaveQuizSettings = () => {
    if (!user?.id) {
      toast({
        title: "エラー",
        description: "ユーザーが見つかりません",
        variant: "destructive",
      });
      return;
    }

    const settingsData = {
      defaultDifficulty,
      timeLimit: parseInt(timeLimit),
      questionCount: parseInt(questionCount),
    };
    
    updateSettingsMutation.mutate(settingsData);
  };

  const handleExportData = () => {
    toast({
      title: "準備中",
      description: "データエクスポート機能は準備中です",
    });
  };

  const handleImportData = () => {
    toast({
      title: "準備中", 
      description: "データインポート機能は準備中です",
    });
  };

  const handleClearData = () => {
    toast({
      title: "確認",
      description: "データ削除機能は準備中です",
    });
  };

  return (
    <section className="mb-12">
      <h3 className="text-2xl font-bold text-gray-800 mb-6 text-center">設定</h3>
      
      <div className="grid grid-cols-1 gap-8 max-w-2xl mx-auto">
        {/* User Settings */}
        <Card className="bg-white/30 border border-gray-200/40 shadow-md backdrop-blur-sm">
          <CardContent className="p-6">
            <h4 className="text-lg font-semibold text-gray-800 mb-4">ユーザー設定</h4>
            <div className="space-y-4">
              <div>
                <Label htmlFor="username" className="text-sm font-medium text-gray-700">
                  ユーザー名
                </Label>
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="bg-gray-50/60 border-gray-300/60 text-gray-800 placeholder-gray-500"
                  data-testid="input-username"
                />
              </div>
              
              <div>
                <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                  メールアドレス
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-gray-50/60 border-gray-300/60 text-gray-800 placeholder-gray-500"
                  data-testid="input-email"
                />
              </div>

              <Button 
                onClick={handleSaveUserSettings}
                className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white border-0 shadow-md"
                data-testid="button-save-user-settings"
              >
                設定を保存
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* パスワード変更セクション */}
        <Card className="bg-white/30 border border-gray-200/40 shadow-md backdrop-blur-sm">
          <CardContent className="p-6">
            <h4 className="text-lg font-semibold text-gray-800 mb-4">パスワード変更</h4>
            <div className="space-y-4">
              <div>
                <Label htmlFor="currentPassword" className="text-sm font-medium text-gray-700">
                  現在のパスワード
                </Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="bg-gray-50/60 border-gray-300/60 text-gray-800 placeholder-gray-500"
                  data-testid="input-current-password"
                />
              </div>

              <div>
                <Label htmlFor="newPassword" className="text-sm font-medium text-gray-700">
                  新しいパスワード (6文字以上)
                </Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="bg-gray-50/60 border-gray-300/60 text-gray-800 placeholder-gray-500"
                  data-testid="input-new-password"
                />
              </div>

              <div>
                <Label htmlFor="confirmPassword" className="text-sm font-medium text-gray-700">
                  新しいパスワード（確認）
                </Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="bg-gray-50/60 border-gray-300/60 text-gray-800 placeholder-gray-500"
                  data-testid="input-confirm-password"
                />
              </div>

              <Button 
                onClick={handleChangePassword}
                className="w-full bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 text-white border-0 shadow-md"
                data-testid="button-change-password"
              >
                パスワードを変更
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Quiz Settings */}
        <Card className="bg-white/30 border border-gray-200/40 shadow-md backdrop-blur-sm">
          <CardContent className="p-6">
            <h4 className="text-lg font-semibold text-gray-800 mb-4">クイズ設定</h4>
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium text-gray-700">デフォルト難易度</Label>
                <Select value={defaultDifficulty} onValueChange={setDefaultDifficulty}>
                  <SelectTrigger className="bg-gray-50/60 border-gray-300/60 text-gray-800" data-testid="select-default-difficulty">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white/40 border-gray-200/60">
                    <SelectItem value="beginner" className="text-gray-800 hover:bg-gray-100">初級</SelectItem>
                    <SelectItem value="intermediate" className="text-gray-800 hover:bg-gray-100">中級</SelectItem>
                    <SelectItem value="advanced" className="text-gray-800 hover:bg-gray-100">上級</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="time-limit" className="text-sm font-medium text-gray-700">
                  1問あたりの制限時間（秒）
                </Label>
                <Input
                  id="time-limit"
                  type="number"
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(e.target.value)}
                  min="30"
                  max="120"
                  className="bg-gray-50/60 border-gray-300/60 text-gray-800 placeholder-gray-500"
                  data-testid="input-time-limit"
                />
              </div>

              <div>
                <Label className="text-sm font-medium text-gray-700">問題数</Label>
                <Select value={questionCount} onValueChange={setQuestionCount}>
                  <SelectTrigger className="bg-gray-50/60 border-gray-300/60 text-gray-800" data-testid="select-question-count">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white/40 border-gray-200/60">
                    <SelectItem value="5" className="text-gray-800 hover:bg-gray-100">5問</SelectItem>
                    <SelectItem value="10" className="text-gray-800 hover:bg-gray-100">10問</SelectItem>
                    <SelectItem value="15" className="text-gray-800 hover:bg-gray-100">15問</SelectItem>
                    <SelectItem value="20" className="text-gray-800 hover:bg-gray-100">20問</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center space-x-3">
                <Checkbox
                  id="auto-next"
                  checked={autoNext}
                  onCheckedChange={(checked) => setAutoNext(checked as boolean)}
                  className="border-gray-300 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
                  data-testid="checkbox-auto-next"
                />
                <Label htmlFor="auto-next" className="text-sm text-gray-700">
                  回答後自動で次の問題に進む
                </Label>
              </div>

              <Button 
                onClick={handleSaveQuizSettings}
                disabled={updateSettingsMutation.isPending || settingsLoading}
                className="w-full bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white border-0 shadow-md disabled:opacity-50"
                data-testid="button-save-quiz-settings"
              >
                {updateSettingsMutation.isPending ? "保存中..." : "設定を保存"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Data Management */}
      <Card className="mt-8 bg-white/30 border border-gray-200/40 shadow-md backdrop-blur-sm">
        <CardContent className="p-6">
          <h4 className="text-lg font-semibold text-gray-800 mb-4">データ管理</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button
              variant="outline"
              onClick={handleExportData}
              className="flex items-center justify-center space-x-2 bg-gray-50/60 border-gray-300/60 text-gray-700 hover:bg-gray-100/60 hover:border-gray-400/60"
              data-testid="button-export-data"
            >
              <i className="fas fa-download"></i>
              <span>データをエクスポート</span>
            </Button>
            
            <Button
              variant="outline" 
              onClick={handleImportData}
              className="flex items-center justify-center space-x-2 bg-gray-50/60 border-gray-300/60 text-gray-700 hover:bg-gray-100/60 hover:border-gray-400/60"
              data-testid="button-import-data"
            >
              <i className="fas fa-upload"></i>
              <span>データをインポート</span>
            </Button>
            
            <Button
              variant="outline"
              onClick={handleClearData}
              className="flex items-center justify-center space-x-2 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white border-0 shadow-md"
              data-testid="button-clear-data"
            >
              <i className="fas fa-trash"></i>
              <span>全データを削除</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
