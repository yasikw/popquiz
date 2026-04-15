import { useQuery } from "@tanstack/react-query";
import { getUserStats, getUserSessionsWithQuestions } from "@/lib/api";

interface RankingSectionProps {
  userId?: string;
  username?: string;
}

const MOCK_LEADERBOARD = [
  { rank: 1, name: "Leo Pop", subtitle: "Quiz Master", points: 15800, borderColor: "#ffd709", badgeBg: "#ffd709", badgeText: "#5b4b00" },
  { rank: 2, name: "Sarah", subtitle: "Knowledge Seeker", points: 12450, borderColor: "#c0c0c0", badgeBg: "#c0c0c0", badgeText: "#444" },
  { rank: 3, name: "Mia", subtitle: "Rising Star", points: 10120, borderColor: "#e8a040", badgeBg: "#e8a040", badgeText: "#5a3800" },
  { rank: 4, name: "Alex River", subtitle: "Quiz Master Level 12", points: 9840 },
  { rank: 5, name: "Zoe Chen", subtitle: "Science Pro", points: 9210 },
  { rank: 6, name: "Kai Parker", subtitle: "Logic Ninja", points: 8890 },
  { rank: 7, name: "Emma Watson", subtitle: "Daily Streaker", points: 8450 },
];

export default function RankingSection({ userId, username }: RankingSectionProps) {
  const { data: stats } = useQuery({
    queryKey: ["/api/users", userId, "stats"],
    queryFn: () => (userId ? getUserStats(userId) : null),
    enabled: !!userId,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: sessionsWithQuestions } = useQuery({
    queryKey: ["/api/users", userId, "sessions-with-questions"],
    queryFn: () => (userId ? getUserSessionsWithQuestions(userId) : null),
    enabled: !!userId,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const totalScore = sessionsWithQuestions
    ? sessionsWithQuestions.reduce((s: number, se: any) => s + se.score, 0)
    : stats?.totalScore || 0;

  const userInitial = username?.charAt(0).toUpperCase() || "?";
  const displayName = username || "You";

  const userRank = (() => {
    const sorted = [...MOCK_LEADERBOARD].sort((a, b) => b.points - a.points);
    let rank = sorted.length + 1;
    for (let i = 0; i < sorted.length; i++) {
      if (totalScore >= sorted[i].points) { rank = sorted[i].rank; break; }
    }
    return Math.max(rank, sorted.length + 1);
  })();

  const top3 = MOCK_LEADERBOARD.filter(p => p.rank <= 3);
  const restList = MOCK_LEADERBOARD.filter(p => p.rank > 3);
  const first = top3.find(p => p.rank === 1)!;
  const second = top3.find(p => p.rank === 2)!;
  const third = top3.find(p => p.rank === 3)!;

  return (
    <div className="space-y-8 pb-32">
      {/* Toggle */}
      <div className="flex justify-center">
        <div className="flex items-center w-full max-w-xs p-1.5" style={{ backgroundColor: "#f8f0dc", borderRadius: "1rem" }}>
          <button
            className="flex-1 py-3 px-6 font-bold text-sm transition-all"
            style={{ backgroundColor: "#ffd709", color: "#5b4b00", borderRadius: "0.75rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}
          >
            Global
          </button>
          <button
            className="flex-1 py-3 px-6 font-bold text-sm transition-all"
            style={{ color: "#5f5b4d", borderRadius: "0.75rem" }}
          >
            Friends
          </button>
        </div>
      </div>

      {/* Podium */}
      <div className="flex items-end justify-center gap-4 h-64 mb-4">
        {/* 2nd Place */}
        <div className="flex flex-col items-center flex-1" style={{ maxWidth: 100 }}>
          <div className="relative mb-4">
            <div
              className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center"
              style={{ border: "4px solid #c0c0c0", backgroundColor: "#eae2cb" }}
            >
              <span className="text-xl" style={{ fontWeight: 900, color: "#5f5b4d" }}>
                {second.name.charAt(0)}
              </span>
            </div>
            <div
              className="absolute -bottom-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-[10px]"
              style={{ fontWeight: 900, backgroundColor: "#c0c0c0", color: "#444", border: "2px solid #fdf6e3" }}
            >
              2
            </div>
          </div>
          <div
            className="w-full flex flex-col items-center justify-end pb-4 shadow-sm"
            style={{ backgroundColor: "#eae2cb", borderTopLeftRadius: "0.75rem", borderTopRightRadius: "0.75rem", height: 96 }}
          >
            <span className="text-sm" style={{ fontWeight: 900, color: "#322f22" }}>{second.name}</span>
            <span className="text-[10px] font-bold" style={{ color: "#a8275a" }}>{second.points.toLocaleString()} pts</span>
          </div>
        </div>

        {/* 1st Place */}
        <div className="flex flex-col items-center flex-1" style={{ maxWidth: 120 }}>
          <div className="relative mb-4">
            <span
              className="material-symbols-outlined absolute -top-8 left-1/2 text-4xl"
              style={{ transform: "translateX(-50%)", color: "#ffd709", fontVariationSettings: "'FILL' 1" }}
            >
              workspace_premium
            </span>
            <div
              className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center"
              style={{ border: "4px solid #ffd709", backgroundColor: "#eae2cb", boxShadow: "0 4px 16px rgba(255, 215, 9, 0.3)" }}
            >
              <span className="text-2xl" style={{ fontWeight: 900, color: "#5b4b00" }}>
                {first.name.charAt(0)}
              </span>
            </div>
            <div
              className="absolute -bottom-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center text-xs"
              style={{ fontWeight: 900, backgroundColor: "#ffd709", color: "#5b4b00", border: "2px solid #fdf6e3", boxShadow: "0 2px 6px rgba(0,0,0,0.1)" }}
            >
              1
            </div>
          </div>
          <div
            className="w-full flex flex-col items-center justify-end pb-6"
            style={{
              backgroundColor: "#a8275a",
              borderTopLeftRadius: "1rem",
              borderTopRightRadius: "1rem",
              height: 144,
              boxShadow: "0 10px 20px rgba(168,39,90,0.2)",
            }}
          >
            <span className="text-base" style={{ fontWeight: 900, color: "#ffeff1" }}>{first.name}</span>
            <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "rgba(255,239,241,0.85)" }}>
              {first.points.toLocaleString()} PTS
            </span>
          </div>
        </div>

        {/* 3rd Place */}
        <div className="flex flex-col items-center flex-1" style={{ maxWidth: 100 }}>
          <div className="relative mb-4">
            <div
              className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center"
              style={{ border: "4px solid #e8a040", backgroundColor: "#eae2cb" }}
            >
              <span className="text-xl" style={{ fontWeight: 900, color: "#5f5b4d" }}>
                {third.name.charAt(0)}
              </span>
            </div>
            <div
              className="absolute -bottom-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-[10px]"
              style={{ fontWeight: 900, backgroundColor: "#e8a040", color: "#5a3800", border: "2px solid #fdf6e3" }}
            >
              3
            </div>
          </div>
          <div
            className="w-full flex flex-col items-center justify-end pb-4 shadow-sm"
            style={{ backgroundColor: "#eae2cb", borderTopLeftRadius: "0.75rem", borderTopRightRadius: "0.75rem", height: 80 }}
          >
            <span className="text-sm" style={{ fontWeight: 900, color: "#322f22" }}>{third.name}</span>
            <span className="text-[10px] font-bold" style={{ color: "#a8275a" }}>{third.points.toLocaleString()} pts</span>
          </div>
        </div>
      </div>

      {/* Ranking List */}
      <div className="space-y-3">
        {restList.map((player) => (
          <div
            key={player.rank}
            className="p-4 flex items-center gap-4 transition-colors"
            style={{ backgroundColor: "#f8f0dc", borderRadius: "0.75rem" }}
          >
            <span className="w-8 text-center" style={{ fontWeight: 900, color: "#5f5b4d" }}>{player.rank}</span>
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: "#e4ddc5" }}
            >
              <span style={{ fontWeight: 900, color: "#5f5b4d" }}>{player.name.charAt(0)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold truncate" style={{ color: "#322f22" }}>{player.name}</h3>
              <p className="text-xs" style={{ color: "#5f5b4d" }}>{player.subtitle}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <span className="block" style={{ fontWeight: 900, color: "#a8275a" }}>{player.points.toLocaleString()}</span>
              <span className="text-[10px] uppercase font-bold" style={{ color: "rgba(95,91,77,0.6)" }}>Points</span>
            </div>
          </div>
        ))}

        {/* Current User Row */}
        <div
          className="p-4 flex items-center gap-4 relative"
          style={{
            backgroundColor: "rgba(116, 247, 241, 0.25)",
            border: "2px solid #74f7f1",
            borderRadius: "0.75rem",
            boxShadow: "0 4px 12px rgba(0, 103, 100, 0.1)",
            transform: "scale(1.02)",
          }}
        >
          <span
            className="absolute -top-3 left-4 text-[10px] uppercase tracking-widest px-2 py-0.5"
            style={{
              fontWeight: 900,
              backgroundColor: "#74f7f1",
              color: "#005c59",
              borderRadius: "9999px",
            }}
          >
            Current Rank
          </span>
          <span className="w-8 text-center" style={{ fontWeight: 900, color: "#006764" }}>{userRank}</span>
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: "#74f7f1", border: "2px solid #006764" }}
          >
            <span style={{ fontWeight: 900, color: "#005c59" }}>{userInitial}</span>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold truncate" style={{ color: "#322f22" }}>{displayName} (You)</h3>
            <p className="text-xs" style={{ color: "#005c59" }}>Keep going! 🔥</p>
          </div>
          <div className="text-right flex-shrink-0">
            <span className="block" style={{ fontWeight: 900, color: "#006764" }}>{totalScore.toLocaleString()}</span>
            <span className="text-[10px] uppercase font-bold" style={{ color: "rgba(0,92,89,0.6)" }}>Points</span>
          </div>
        </div>

        {/* More players below user */}
        {MOCK_LEADERBOARD.filter(p => p.rank > 5).map((player) => (
          <div
            key={`below-${player.rank}`}
            className="p-4 flex items-center gap-4 transition-colors"
            style={{ backgroundColor: "#f8f0dc", borderRadius: "0.75rem" }}
          >
            <span className="w-8 text-center" style={{ fontWeight: 900, color: "#5f5b4d" }}>{player.rank}</span>
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: "#e4ddc5" }}
            >
              <span style={{ fontWeight: 900, color: "#5f5b4d" }}>{player.name.charAt(0)}</span>
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold truncate" style={{ color: "#322f22" }}>{player.name}</h3>
              <p className="text-xs" style={{ color: "#5f5b4d" }}>{player.subtitle}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <span className="block" style={{ fontWeight: 900, color: "#a8275a" }}>{player.points.toLocaleString()}</span>
              <span className="text-[10px] uppercase font-bold" style={{ color: "rgba(95,91,77,0.6)" }}>Points</span>
            </div>
          </div>
        ))}
      </div>

      {/* Share Button */}
      <div className="flex justify-end">
        <button
          className="w-14 h-14 rounded-full flex items-center justify-center active:scale-95 transition-transform"
          style={{
            background: "linear-gradient(135deg, #a8275a, #ff709f)",
            boxShadow: "0 6px 16px rgba(168, 39, 90, 0.3)",
          }}
        >
          <span className="material-symbols-outlined text-white text-2xl">share</span>
        </button>
      </div>
    </div>
  );
}
