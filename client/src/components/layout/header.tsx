import { type User } from "@shared/schema";

interface HeaderProps {
  user: User | null;
  activeSection: string;
  onSectionChange: (section: string) => void;
  onLogout?: () => void;
}

export default function Header({ user, activeSection, onSectionChange, onLogout }: HeaderProps) {
  const navItems = [
    { id: "home", label: "ホーム", icon: "fas fa-home" },
    { id: "quiz", label: "クイズ", icon: "fas fa-question-circle" },
    { id: "stats", label: "統計", icon: "fas fa-chart-bar" },
    { id: "settings", label: "設定", icon: "fas fa-cog" },
  ];

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-md mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <i className="fas fa-brain text-white text-sm"></i>
            </div>
            <span className="text-lg font-bold text-gray-800">AI Quiz</span>
          </div>
          
          <div className="flex items-center space-x-4">
            {user ? (
              <>
                <div className="hidden sm:block text-right">
                  <div className="text-sm font-medium text-gray-800" data-testid="user-name">
                    {user.username}
                  </div>
                  <div className="text-xs text-gray-500">
                    登録日: {new Date(user.createdAt).toLocaleDateString('ja-JP')}
                  </div>
                </div>
                {onLogout && (
                  <button 
                    onClick={onLogout}
                    className="text-red-600 hover:text-red-700 text-sm font-medium"
                    data-testid="button-logout"
                  >
                    <i className="fas fa-sign-out-alt mr-1"></i>
                    ログアウト
                  </button>
                )}
              </>
            ) : (
              <div className="text-sm text-gray-500">
                ゲストユーザー
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
