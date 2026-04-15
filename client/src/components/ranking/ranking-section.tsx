import { useQuery } from "@tanstack/react-query";
import { getUserStats, getUserSessionsWithQuestions } from "@/lib/api";

interface RankingSectionProps {
  userId?: string;
  username?: string;
}

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

  const completedQuizzes = sessionsWithQuestions
    ? sessionsWithQuestions.length
    : stats?.completedQuizzes || 0;

  const avgAccuracy = sessionsWithQuestions && sessionsWithQuestions.length > 0
    ? Math.round(
        sessionsWithQuestions.reduce(
          (s: number, se: any) => s + (se.score / se.totalQuestions) * 100,
          0
        ) / sessionsWithQuestions.length
      )
    : 0;

  const getRank = (score: number) => {
    if (score >= 500) return { title: "Quiz Master", icon: "military_tech", color: "#ffd709" };
    if (score >= 200) return { title: "Scholar", icon: "school", color: "#74f7f1" };
    if (score >= 50) return { title: "Learner", icon: "local_fire_department", color: "#ff709f" };
    return { title: "Rookie", icon: "emoji_events", color: "#eae2cb" };
  };

  const rank = getRank(totalScore);
  const initial = username?.charAt(0).toUpperCase() || "?";

  const leaderboard = [
    { name: "You", score: totalScore, isUser: true },
  ];

  return (
    <div className="space-y-8 pb-32">
      {/* Title */}
      <section>
        <h2
          className="text-3xl tracking-tight mb-2"
          style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, color: "#322f22" }}
        >
          Ranking
        </h2>
        <p className="font-medium" style={{ color: "#5f5b4d" }}>
          See how you stack up!
        </p>
      </section>

      {/* Your Rank Card */}
      <section
        className="relative overflow-hidden p-6"
        style={{
          background: "linear-gradient(135deg, #a8275a, #ff709f)",
          borderRadius: "1rem",
        }}
      >
        <div className="flex items-center gap-5 relative z-10">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center"
            style={{ backgroundColor: "#ffd709", border: "3px solid rgba(255,255,255,0.5)" }}
          >
            <span className="text-2xl" style={{ fontWeight: 900, color: "#5b4b00" }}>{initial}</span>
          </div>
          <div className="flex-1">
            <p className="text-white/70 text-xs font-bold uppercase tracking-widest">Your Rank</p>
            <p className="text-3xl text-white" style={{ fontWeight: 900 }}>{rank.title}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="material-symbols-outlined text-base" style={{ color: rank.color, fontVariationSettings: "'FILL' 1" }}>
                {rank.icon}
              </span>
              <span className="text-white/80 text-sm font-bold">{totalScore.toLocaleString()} pts</span>
            </div>
          </div>
        </div>
        <div className="absolute -right-6 -bottom-6 opacity-15">
          <span className="material-symbols-outlined" style={{ fontSize: 140, fontVariationSettings: "'FILL' 1" }}>
            emoji_events
          </span>
        </div>
      </section>

      {/* Quick Stats */}
      <section className="grid grid-cols-3 gap-3">
        <div
          className="p-4 flex flex-col items-center text-center"
          style={{ backgroundColor: "#ffd709", borderRadius: "1rem" }}
        >
          <span className="material-symbols-outlined mb-1" style={{ color: "#5b4b00", fontVariationSettings: "'FILL' 1" }}>
            workspace_premium
          </span>
          <p className="text-2xl" style={{ fontWeight: 900, color: "#5b4b00" }}>{completedQuizzes}</p>
          <p className="text-[10px] font-bold uppercase" style={{ color: "rgba(91,75,0,0.6)" }}>Quizzes</p>
        </div>
        <div
          className="p-4 flex flex-col items-center text-center"
          style={{ backgroundColor: "#74f7f1", borderRadius: "1rem" }}
        >
          <span className="material-symbols-outlined mb-1" style={{ color: "#005c59", fontVariationSettings: "'FILL' 1" }}>
            target
          </span>
          <p className="text-2xl" style={{ fontWeight: 900, color: "#005c59" }}>{avgAccuracy}%</p>
          <p className="text-[10px] font-bold uppercase" style={{ color: "rgba(0,92,89,0.6)" }}>Accuracy</p>
        </div>
        <div
          className="p-4 flex flex-col items-center text-center"
          style={{ backgroundColor: "#f8f0dc", borderRadius: "1rem" }}
        >
          <span className="material-symbols-outlined mb-1" style={{ color: "#a8275a", fontVariationSettings: "'FILL' 1" }}>
            star
          </span>
          <p className="text-2xl" style={{ fontWeight: 900, color: "#a8275a" }}>{totalScore}</p>
          <p className="text-[10px] font-bold uppercase" style={{ color: "rgba(95,91,77,0.6)" }}>Points</p>
        </div>
      </section>

      {/* Rank Progression */}
      <section className="space-y-4">
        <h3 className="font-bold text-lg" style={{ color: "#322f22" }}>Rank Progression</h3>
        <div className="p-6 space-y-5" style={{ backgroundColor: "#e4ddc5", borderRadius: "1rem" }}>
          {[
            { title: "Rookie", minScore: 0, icon: "emoji_events", color: "#eae2cb" },
            { title: "Learner", minScore: 50, icon: "local_fire_department", color: "#ff709f" },
            { title: "Scholar", minScore: 200, icon: "school", color: "#74f7f1" },
            { title: "Quiz Master", minScore: 500, icon: "military_tech", color: "#ffd709" },
          ].map((tier) => {
            const isAchieved = totalScore >= tier.minScore;
            const nextTier = tier.minScore;
            const progress = nextTier === 0 ? 100 : Math.min(100, Math.round((totalScore / nextTier) * 100));

            return (
              <div key={tier.title} className="flex items-center gap-4">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{
                    backgroundColor: isAchieved ? tier.color : "#efe8d2",
                    opacity: isAchieved ? 1 : 0.5,
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{
                      color: isAchieved ? "#322f22" : "#b2ad9c",
                      fontVariationSettings: isAchieved ? "'FILL' 1" : "'FILL' 0",
                    }}
                  >
                    {tier.icon}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-sm" style={{ color: isAchieved ? "#322f22" : "#b2ad9c" }}>
                      {tier.title}
                    </span>
                    <span className="text-xs font-bold" style={{ color: "#5f5b4d" }}>
                      {tier.minScore} pts
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden" style={{ backgroundColor: "#efe8d2", borderRadius: "9999px" }}>
                    <div
                      className="h-full transition-all duration-500"
                      style={{
                        width: `${isAchieved ? 100 : progress}%`,
                        backgroundColor: tier.color,
                        borderRadius: "9999px",
                      }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Leaderboard Placeholder */}
      <section className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-lg" style={{ color: "#322f22" }}>Leaderboard</h3>
        </div>
        <div
          className="p-8 flex flex-col items-center justify-center text-center"
          style={{ backgroundColor: "#f8f0dc", borderRadius: "1rem" }}
        >
          <span className="material-symbols-outlined text-5xl mb-3" style={{ color: "#b2ad9c" }}>
            group
          </span>
          <p className="font-bold mb-1" style={{ color: "#5f5b4d" }}>Coming Soon!</p>
          <p className="text-xs" style={{ color: "#7b7767" }}>
            Compete with other players and climb the leaderboard.
          </p>
        </div>
      </section>
    </div>
  );
}
