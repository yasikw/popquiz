import { useState, useEffect } from "react";
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
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [defaultDifficulty, setDefaultDifficulty] = useState("intermediate");
  const [timeLimit, setTimeLimit] = useState(30);
  const [questionCount, setQuestionCount] = useState("10");
  const { toast } = useToast();

  const queryClient = useQueryClient();

  const { data: userSettings, isLoading: settingsLoading } = useQuery({
    queryKey: [`/api/users/${user?.id}/settings`],
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (user) {
      setUsername(user.username || "");
      setEmail(user.email || "");
    }
  }, [user]);

  useEffect(() => {
    if (userSettings && typeof userSettings === 'object' && 'defaultDifficulty' in userSettings) {
      const settings = userSettings as UserSettings;
      setDefaultDifficulty(settings.defaultDifficulty || "intermediate");
      setTimeLimit(settings.timeLimit || 30);
      setQuestionCount(settings.questionCount?.toString() || "10");
    }
  }, [userSettings]);

  const handleSaveUserSettings = async () => {
    if (!user) {
      toast({ title: "Error", description: "User not found", variant: "destructive" });
      return;
    }
    try {
      const updatedUser = await updateUser(user.id, { username, email });
      onUserUpdate(updatedUser);
      toast({ title: "Success", description: "User settings saved" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to save settings", variant: "destructive" });
    }
  };

  const handleChangePassword = async () => {
    if (!user) {
      toast({ title: "Error", description: "User not found", variant: "destructive" });
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      toast({ title: "Error", description: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Error", description: "Passwords do not match", variant: "destructive" });
      return;
    }
    try {
      const response = await fetch('/api/users/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, currentPassword, newPassword }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to change password');
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({ title: "Success", description: "Password changed successfully" });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to change password",
        variant: "destructive",
      });
    }
  };

  const updateSettingsMutation = useMutation({
    mutationFn: async (settingsData: Partial<UserSettings>) => {
      return apiRequest("PUT", `/api/users/${user?.id}/settings`, settingsData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/users/${user?.id}/settings`] });
      toast({ title: "Success", description: "Quiz settings saved" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save settings", variant: "destructive" });
    },
  });

  const handleSaveAll = () => {
    handleSaveUserSettings();
    if (user?.id) {
      const settingsData = {
        defaultDifficulty: defaultDifficulty as "beginner" | "intermediate" | "advanced",
        timeLimit,
        questionCount: parseInt(questionCount),
      };
      updateSettingsMutation.mutate(settingsData);
    }
  };

  const handleExportData = () => {
    toast({ title: "Coming Soon", description: "Export feature is under development" });
  };

  const handleImportData = () => {
    toast({ title: "Coming Soon", description: "Import feature is under development" });
  };

  const handleClearData = () => {
    toast({ title: "Confirm", description: "Delete feature is under development" });
  };

  const inputStyle: React.CSSProperties = {
    backgroundColor: '#e4ddc5',
    border: 'none',
    borderRadius: '0.75rem',
    padding: '0.75rem 1rem',
    width: '100%',
    fontSize: '0.95rem',
    fontWeight: 500,
    color: '#322f22',
    outline: 'none',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  };

  const sectionStyle: React.CSSProperties = {
    backgroundColor: '#f8f0dc',
    borderRadius: '1rem',
    padding: '2rem',
  };

  return (
    <div
      className="min-h-screen pb-32"
      style={{
        fontFamily: "'Plus Jakarta Sans', 'Noto Sans JP', sans-serif",
        color: '#322f22',
      }}
    >
      <div className="max-w-xl mx-auto px-6 py-8 space-y-10">
        <section>
          <h2 className="text-3xl font-bold tracking-tight" style={{ color: '#322f22' }}>Settings</h2>
          <p className="mt-1" style={{ color: '#5f5b4d' }}>Manage your profile and quiz preferences</p>
        </section>

        <div className="space-y-6">
          <section style={sectionStyle} className="space-y-6">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined" style={{ color: '#a8275a' }}>person</span>
              <h3 className="text-xl font-bold">User Settings</h3>
            </div>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="block text-sm font-semibold px-2">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  style={inputStyle}
                  data-testid="input-username"
                  onFocus={(e) => e.target.style.boxShadow = '0 0 0 3px rgba(168, 39, 90, 0.15)'}
                  onBlur={(e) => e.target.style.boxShadow = 'none'}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-semibold px-2">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  style={inputStyle}
                  data-testid="input-email"
                  onFocus={(e) => e.target.style.boxShadow = '0 0 0 3px rgba(168, 39, 90, 0.15)'}
                  onBlur={(e) => e.target.style.boxShadow = 'none'}
                />
              </div>
            </div>
          </section>

          <section style={sectionStyle} className="space-y-6">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined" style={{ color: '#006764' }}>settings_suggest</span>
              <h3 className="text-xl font-bold">Quiz Settings</h3>
            </div>
            <div className="space-y-5">
              <div className="space-y-2">
                <label className="block text-sm font-semibold px-2">Default Difficulty</label>
                <select
                  value={defaultDifficulty}
                  onChange={(e) => setDefaultDifficulty(e.target.value)}
                  style={inputStyle}
                  className="cursor-pointer"
                  data-testid="select-default-difficulty"
                >
                  <option value="beginner">Easy</option>
                  <option value="intermediate">Medium</option>
                  <option value="advanced">Hard</option>
                </select>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center px-2">
                  <label className="text-sm font-semibold">Time Limit</label>
                  <span className="text-xs font-bold" style={{ color: '#005957' }}>{timeLimit}s</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="60"
                  step="5"
                  value={timeLimit}
                  onChange={(e) => setTimeLimit(parseInt(e.target.value))}
                  className="w-full h-3 rounded-full appearance-none cursor-pointer"
                  style={{ backgroundColor: '#e4ddc5', accentColor: '#006764' }}
                  data-testid="input-time-limit"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-semibold px-2">Question Count</label>
                <div className="flex gap-2">
                  {["10", "20", "50"].map((count) => (
                    <button
                      key={count}
                      onClick={() => setQuestionCount(count)}
                      className="flex-1 py-2.5 rounded-lg font-bold text-sm transition-all duration-200"
                      style={{
                        backgroundColor: questionCount === count ? '#006764' : '#e4ddc5',
                        color: questionCount === count ? '#bcfffb' : '#322f22',
                      }}
                      data-testid={`button-question-count-${count}`}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section style={sectionStyle} className="space-y-6">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined" style={{ color: '#a8275a' }}>lock_reset</span>
              <h3 className="text-xl font-bold">Change Password</h3>
            </div>
            <div className="space-y-4">
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Current Password"
                style={inputStyle}
                data-testid="input-current-password"
                onFocus={(e) => e.target.style.boxShadow = '0 0 0 3px rgba(168, 39, 90, 0.15)'}
                onBlur={(e) => e.target.style.boxShadow = 'none'}
              />
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New Password"
                style={inputStyle}
                data-testid="input-new-password"
                onFocus={(e) => e.target.style.boxShadow = '0 0 0 3px rgba(168, 39, 90, 0.15)'}
                onBlur={(e) => e.target.style.boxShadow = 'none'}
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm New Password"
                style={inputStyle}
                data-testid="input-confirm-password"
                onFocus={(e) => e.target.style.boxShadow = '0 0 0 3px rgba(168, 39, 90, 0.15)'}
                onBlur={(e) => e.target.style.boxShadow = 'none'}
              />
              <button
                onClick={handleChangePassword}
                className="w-full py-3.5 rounded-lg font-bold text-white shadow-md transition-all duration-300 active:scale-[0.98]"
                style={{
                  background: 'linear-gradient(135deg, #a8275a, #ff709f)',
                  boxShadow: '0 4px 12px rgba(168, 39, 90, 0.25)',
                }}
                data-testid="button-change-password"
              >
                Update Password
              </button>
            </div>
          </section>

          <section style={sectionStyle} className="space-y-6">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined" style={{ color: '#b41340' }}>database</span>
              <h3 className="text-xl font-bold">Data Management</h3>
            </div>
            <p className="text-sm" style={{ color: '#5f5b4d' }}>
              Manage your quiz history, awards, and account data safely.
            </p>
            <div className="space-y-3">
              <button
                onClick={handleExportData}
                className="flex items-center justify-center gap-2 w-full py-4 rounded-lg font-bold transition-colors"
                style={{ backgroundColor: '#e4ddc5', color: '#322f22' }}
                data-testid="button-export-data"
              >
                <span className="material-symbols-outlined text-xl">download</span>
                Export Data
              </button>
              <button
                onClick={handleImportData}
                className="flex items-center justify-center gap-2 w-full py-4 rounded-lg font-bold transition-colors"
                style={{ backgroundColor: '#e4ddc5', color: '#322f22' }}
                data-testid="button-import-data"
              >
                <span className="material-symbols-outlined text-xl">upload</span>
                Import Data
              </button>
              <button
                onClick={handleClearData}
                className="flex items-center justify-center gap-2 w-full py-4 rounded-lg font-bold transition-all"
                style={{ backgroundColor: '#f74b6d', color: '#510017' }}
                data-testid="button-clear-data"
              >
                <span className="material-symbols-outlined text-xl">delete_forever</span>
                Delete All
              </button>
            </div>
          </section>
        </div>

        <div className="flex justify-center pt-4">
          <button
            onClick={handleSaveAll}
            disabled={updateSettingsMutation.isPending || settingsLoading}
            className="flex items-center gap-3 px-12 py-4 rounded-full font-extrabold text-lg shadow-xl transition-all duration-300 active:scale-95 disabled:opacity-60"
            style={{
              backgroundColor: '#ffd709',
              color: '#5b4b00',
              boxShadow: '0 8px 24px rgba(255, 215, 9, 0.3)',
            }}
            data-testid="button-save-all"
          >
            {updateSettingsMutation.isPending ? "Saving..." : "Save All Changes"}
            <span className="material-symbols-outlined">check_circle</span>
          </button>
        </div>
      </div>
    </div>
  );
}
