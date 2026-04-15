import { type User } from "@shared/schema";

interface HeaderProps {
  user: User | null;
  activeSection: string;
  onSectionChange: (section: string) => void;
  onLogout?: () => void;
}

export default function Header({ user, activeSection, onSectionChange, onLogout }: HeaderProps) {
  return (
    <header
      className="fixed top-0 left-0 right-0 z-50"
      style={{
        backgroundColor: 'rgba(253, 246, 227, 0.8)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
      }}
    >
      <div className="max-w-xl mx-auto px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-2xl" style={{ color: '#a8275a' }}>bubble_chart</span>
          <span
            className="text-2xl font-black tracking-tight"
            style={{ color: '#a8275a', fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            PopQuiz!
          </span>
        </div>

        <div className="flex items-center gap-3">
          {user && onLogout && (
            <button
              onClick={onLogout}
              className="material-symbols-outlined text-xl transition-colors"
              style={{ color: '#7b7767' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#a8275a')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#7b7767')}
              data-testid="button-logout"
              title="Sign out"
            >
              logout
            </button>
          )}
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden"
            style={{
              backgroundColor: '#ffd709',
              border: '2px solid #ff709f',
            }}
          >
            {user ? (
              <span
                className="text-sm font-bold"
                style={{ color: '#5b4b00' }}
              >
                {user.username?.charAt(0).toUpperCase() || '?'}
              </span>
            ) : (
              <span className="material-symbols-outlined text-xl" style={{ color: '#5b4b00' }}>person</span>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
