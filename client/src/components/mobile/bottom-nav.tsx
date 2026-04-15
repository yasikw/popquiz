interface BottomNavProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
}

const navItems = [
  { id: "home", label: "Play", icon: "videogame_asset" },
  { id: "stats", label: "Stats", icon: "bar_chart" },
  { id: "ranking", label: "Rank", icon: "leaderboard" },
  { id: "results", label: "Store", icon: "local_mall" },
  { id: "settings", label: "Me", icon: "face" },
];

export default function BottomNav({ activeSection, onSectionChange }: BottomNavProps) {
  return (
    <nav
      className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 pb-6 pt-3"
      style={{
        backgroundColor: 'rgba(253, 246, 227, 0.8)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderTopLeftRadius: '3rem',
        borderTopRightRadius: '3rem',
        boxShadow: '0 -8px 24px rgba(50, 47, 34, 0.08)',
      }}
    >
      {navItems.map((item) => {
        const isActive = activeSection === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onSectionChange(item.id)}
            className="flex flex-col items-center justify-center px-4 py-2 transition-all duration-200 active:scale-95"
            style={{
              borderRadius: '9999px',
              backgroundColor: isActive ? '#ffd709' : 'transparent',
              color: isActive ? '#322f22' : 'rgba(50, 47, 34, 0.5)',
            }}
            data-testid={`nav-${item.id}`}
          >
            <span
              className="material-symbols-outlined text-2xl"
              style={{
                fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0",
              }}
            >
              {item.icon}
            </span>
            <span
              className="text-xs font-semibold"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
