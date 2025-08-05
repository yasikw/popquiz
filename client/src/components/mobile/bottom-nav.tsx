interface BottomNavProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
}

export default function BottomNav({ activeSection, onSectionChange }: BottomNavProps) {
  const navItems = [
    { id: "home", label: "ホーム", icon: "fas fa-home" },
    { id: "stats", label: "統計", icon: "fas fa-chart-bar" },
    { id: "settings", label: "設定", icon: "fas fa-cog" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50">
      <div className="max-w-md mx-auto">
        <div className="flex justify-around py-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onSectionChange(item.id)}
              className={`flex flex-col items-center space-y-1 px-4 py-2 rounded-lg transition-colors ${
                activeSection === item.id
                  ? "text-blue-600 bg-blue-50"
                  : "text-gray-500 hover:text-gray-700"
              }`}
              data-testid={`nav-${item.id}`}
            >
              <i className={`${item.icon} text-lg`}></i>
              <span className="text-xs font-medium">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}