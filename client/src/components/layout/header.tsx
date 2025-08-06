import { type User } from "@shared/schema";
import logoImage from "@assets/AIquiz logo_1754457435636.png";

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
    <header className="fixed top-0 left-0 right-0 bg-white/90 border-b border-gray-200/40 shadow-sm backdrop-blur-sm z-50">
      <div className="max-w-md mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-2">
            <img 
              src={logoImage} 
              alt="AI Quiz Logo" 
              className="w-16 h-10 object-contain"
            />
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
