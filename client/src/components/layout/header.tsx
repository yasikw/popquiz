import { type User } from "@shared/schema";

interface HeaderProps {
  user: User | null;
  activeSection: string;
  onSectionChange: (section: string) => void;
}

export default function Header({ user, activeSection, onSectionChange }: HeaderProps) {
  const navItems = [
    { id: "home", label: "ホーム", icon: "fas fa-home" },
    { id: "quiz", label: "クイズ", icon: "fas fa-question-circle" },
    { id: "stats", label: "統計", icon: "fas fa-chart-bar" },
    { id: "settings", label: "設定", icon: "fas fa-cog" },
  ];

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-3">
            <div className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl p-2 shadow-lg">
              <i className="fas fa-brain text-white text-xl"></i>
            </div>
            <h1 className="text-xl font-bold text-gray-800">AI クイズアプリ</h1>
          </div>
          
          <nav className="hidden md:flex space-x-8">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => onSectionChange(item.id)}
                className={`transition-colors ${
                  activeSection === item.id
                    ? "text-blue-600 font-medium border-b-2 border-blue-500 pb-1"
                    : "text-gray-600 hover:text-gray-800"
                }`}
                data-testid={`nav-${item.id}`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center space-x-4">
            {user ? (
              <div className="hidden sm:block text-right">
                <div className="text-sm font-medium text-gray-800" data-testid="user-name">
                  {user.username}
                </div>
                <div className="text-xs text-gray-500">
                  登録日: {user.createdAt.toLocaleDateString('ja-JP')}
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-500">
                ゲストユーザー
              </div>
            )}
            
            <button 
              className="md:hidden text-gray-600"
              data-testid="mobile-menu-toggle"
            >
              <i className="fas fa-bars text-xl"></i>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
