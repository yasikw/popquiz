import { useQuery } from "@tanstack/react-query";
import { getUserStats, getUserSessionsWithQuestions } from "@/lib/api";

interface StatsSectionProps {
  userId?: string;
}

const QUIZ_ICONS = ["biotech", "architecture", "rocket_launch", "psychology", "menu_book", "science", "calculate", "language", "public", "history_edu"];
const ICON_BG_COLORS = ["#ffd709", "#74f7f1", "rgba(255, 112, 159, 0.2)", "#eae2cb", "#ffd709", "#74f7f1"];

export default function StatsSection({ userId }: StatsSectionProps) {
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

  const getContentTitle = (session: any, questions: Array<{ questionText: string }>) => {
    if (questions && questions.length > 0) {
      const firstQ = questions[0].questionText;
      const words = firstQ.split(/[\s,?.!]+/).filter((w: string) => w.length > 2).slice(0, 3);
      if (words.length > 0) return words.join(" ");
    }
    if (session.contentType === "pdf") return "PDF Quiz";
    if (session.contentType === "youtube") return "YouTube Quiz";
    return "Text Quiz";
  };

  const getDifficultyLabel = (d: string) => {
    if (d === "beginner") return "Novice";
    if (d === "intermediate") return "Intermediate";
    if (d === "advanced") return "Advanced";
    return d;
  };

  const getTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return "Yesterday";
    return `${days} days ago`;
  };

  const calculateStats = (sessions: any[]) => {
    if (!sessions || sessions.length === 0) {
      return { totalScore: 0, completedQuizzes: 0, averageAccuracy: 0, beginnerAccuracy: 0, intermediateAccuracy: 0, advancedAccuracy: 0 };
    }
    const totalScore = sessions.reduce((s, se) => s + se.score, 0);
    const calcAcc = (arr: any[]) => arr.length === 0 ? 0 : Math.round(arr.reduce((s, se) => s + (se.score / se.totalQuestions) * 100, 0) / arr.length);
    return {
      totalScore,
      completedQuizzes: sessions.length,
      averageAccuracy: calcAcc(sessions),
      beginnerAccuracy: calcAcc(sessions.filter((s) => s.difficulty === "beginner")),
      intermediateAccuracy: calcAcc(sessions.filter((s) => s.difficulty === "intermediate")),
      advancedAccuracy: calcAcc(sessions.filter((s) => s.difficulty === "advanced")),
    };
  };

  const uniqueSessions = sessionsWithQuestions
    ? sessionsWithQuestions.reduce((acc: any[], session: any) => {
        const existing = acc.find(
          (s: any) =>
            s.contentType === session.contentType &&
            s.difficulty === session.difficulty &&
            s.score === session.score &&
            Math.abs(new Date(s.completedAt).getTime() - new Date(session.completedAt).getTime()) < 60000
        );
        if (!existing) acc.push(session);
        return acc;
      }, [])
    : [];

  const displayStats = sessionsWithQuestions ? calculateStats(sessionsWithQuestions) : stats || { totalScore: 0, completedQuizzes: 0, averageAccuracy: 0, beginnerAccuracy: 0, intermediateAccuracy: 0, advancedAccuracy: 0 };

  const masteryLevels = [
    { label: "Novice", value: displayStats.beginnerAccuracy, color: "#74f7f1" },
    { label: "Intermediate", value: displayStats.intermediateAccuracy, color: "#ffd709" },
    { label: "Advanced", value: displayStats.advancedAccuracy, color: "#ff709f" },
  ];

  return (
    <div className="space-y-8 pb-32">
      {/* Title */}
      <section>
        <h2
          className="text-3xl tracking-tight mb-2"
          style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, color: "#322f22" }}
        >
          Learning Stats
        </h2>
        <p className="font-medium" style={{ color: "#5f5b4d" }}>
          Keep pushing your boundaries!
        </p>
      </section>

      {/* Bento Grid */}
      <section className="grid grid-cols-2 gap-4">
        {/* Total Score - full width */}
        <div
          className="col-span-2 p-6 flex flex-col justify-between min-h-[160px] relative overflow-hidden"
          style={{ backgroundColor: "#ff709f", borderRadius: "1rem" }}
        >
          <div className="relative z-10">
            <span className="font-bold text-sm uppercase tracking-wider" style={{ color: "#4c0022" }}>
              Total Score
            </span>
            <p className="text-5xl mt-2" style={{ fontWeight: 900, color: "#4c0022" }} data-testid="total-score">
              {displayStats.totalScore.toLocaleString()}
            </p>
          </div>
          <div className="relative z-10 flex items-center gap-2 font-bold" style={{ color: "rgba(76, 0, 34, 0.7)" }}>
            <span className="material-symbols-outlined">trending_up</span>
            <span>{displayStats.completedQuizzes > 0 ? `${displayStats.completedQuizzes} quizzes completed` : "Start your first quiz!"}</span>
          </div>
          <div className="absolute -right-4 -bottom-4 opacity-20">
            <span className="material-symbols-outlined" style={{ fontSize: 120, fontVariationSettings: "'FILL' 1" }}>
              stars
            </span>
          </div>
        </div>

        {/* Completed */}
        <div className="p-6 flex flex-col justify-between" style={{ backgroundColor: "#ffd709", borderRadius: "1rem" }}>
          <span className="font-bold text-sm uppercase" style={{ color: "#5b4b00" }}>Completed</span>
          <div>
            <p className="text-4xl" style={{ fontWeight: 900, color: "#5b4b00" }} data-testid="completed-quizzes">
              {displayStats.completedQuizzes}
            </p>
            <p className="text-xs font-bold" style={{ color: "rgba(91, 75, 0, 0.6)" }}>Quizzes</p>
          </div>
        </div>

        {/* Accuracy */}
        <div className="p-6 flex flex-col justify-between" style={{ backgroundColor: "#74f7f1", borderRadius: "1rem" }}>
          <span className="font-bold text-sm uppercase" style={{ color: "#005c59" }}>Accuracy</span>
          <div>
            <p className="text-4xl" style={{ fontWeight: 900, color: "#005c59" }} data-testid="average-accuracy">
              {displayStats.averageAccuracy}%
            </p>
            <p className="text-xs font-bold" style={{ color: "rgba(0, 92, 89, 0.6)" }}>Average</p>
          </div>
        </div>
      </section>

      {/* Performance Trend */}
      <section className="p-6" style={{ backgroundColor: "#f8f0dc", borderRadius: "1rem" }}>
        <div className="flex justify-between items-center mb-6">
          <h3 className="font-bold text-lg" style={{ color: "#322f22" }}>Performance Trend</h3>
          <span className="material-symbols-outlined" style={{ color: "#7b7767" }}>query_stats</span>
        </div>
        <div
          className="h-48 w-full flex flex-col items-center justify-center space-y-2"
          style={{
            border: "2px dashed #b2ad9c",
            borderRadius: "0.75rem",
            backgroundColor: "rgba(255,255,255,0.5)",
          }}
        >
          <span className="material-symbols-outlined text-4xl" style={{ color: "#b2ad9c" }}>bar_chart</span>
          <p className="text-sm font-semibold" style={{ color: "#5f5b4d" }}>
            {uniqueSessions.length > 0 ? `${uniqueSessions.length} sessions recorded` : "No trends to show yet"}
          </p>
          <p className="text-xs" style={{ color: "#7b7767" }}>Keep playing to unlock weekly insights</p>
        </div>
      </section>

      {/* Mastery Levels */}
      <section className="space-y-4">
        <h3 className="font-bold text-lg" style={{ color: "#322f22" }}>Mastery Levels</h3>
        <div className="p-6 space-y-6" style={{ backgroundColor: "#e4ddc5", borderRadius: "1rem" }}>
          {masteryLevels.map((level) => (
            <div key={level.label} className="space-y-2">
              <div className="flex justify-between items-end">
                <span className="font-bold" style={{ color: "#322f22" }}>{level.label}</span>
                <span className="text-xs" style={{ fontWeight: 900, color: "#5f5b4d" }}>{level.value}%</span>
              </div>
              <div className="h-3 w-full overflow-hidden" style={{ backgroundColor: "#efe8d2", borderRadius: "9999px" }}>
                <div
                  className="h-full transition-all duration-500"
                  style={{
                    width: `${Math.max(level.value, 2)}%`,
                    backgroundColor: level.color,
                    borderRadius: "9999px",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Recent Quizzes */}
      <section className="space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-lg" style={{ color: "#322f22" }}>Recent Quizzes</h3>
          {uniqueSessions.length > 5 && (
            <button className="text-sm font-bold" style={{ color: "#a8275a" }}>View All</button>
          )}
        </div>

        <div className="space-y-3">
          {uniqueSessions.length > 0 ? (
            uniqueSessions.slice(0, 5).map((session: any, index: number) => (
              <div
                key={session.id || index}
                className="p-4 flex items-center justify-between transition-transform active:scale-[0.98]"
                style={{
                  backgroundColor: "#ffffff",
                  borderRadius: "0.75rem",
                  boxShadow: "0 2px 6px rgba(50, 47, 34, 0.05)",
                }}
              >
                <div className="flex items-center gap-4">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: ICON_BG_COLORS[index % ICON_BG_COLORS.length] }}
                  >
                    <span
                      className="material-symbols-outlined"
                      style={{ color: index % 2 === 0 ? "#5b4b00" : "#005c59" }}
                    >
                      {QUIZ_ICONS[index % QUIZ_ICONS.length]}
                    </span>
                  </div>
                  <div>
                    <p className="font-bold" style={{ color: "#322f22" }}>
                      {getContentTitle(session, session.questions || [])}
                    </p>
                    <p className="text-xs font-medium" style={{ color: "#5f5b4d" }}>
                      {getDifficultyLabel(session.difficulty)} &bull; {getTimeAgo(session.completedAt)}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p style={{ fontWeight: 900, color: "#a8275a" }}>
                    {session.score}/{session.totalQuestions}
                  </p>
                  <p className="text-[10px] uppercase font-bold" style={{ color: "#7b7767" }}>Score</p>
                </div>
              </div>
            ))
          ) : (
            <div
              className="p-8 flex flex-col items-center justify-center text-center"
              style={{ backgroundColor: "#f8f0dc", borderRadius: "0.75rem" }}
            >
              <span className="material-symbols-outlined text-4xl mb-2" style={{ color: "#b2ad9c" }}>quiz</span>
              <p className="font-semibold" style={{ color: "#5f5b4d" }}>No quizzes yet</p>
              <p className="text-xs" style={{ color: "#7b7767" }}>Complete a quiz to see your history here</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
