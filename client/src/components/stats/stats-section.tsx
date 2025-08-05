import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { getUserStats, getUserSessions } from "@/lib/api";

interface StatsSectionProps {
  userId?: string;
}

export default function StatsSection({ userId }: StatsSectionProps) {
  const { data: stats } = useQuery({
    queryKey: ['/api/users', userId, 'stats'],
    queryFn: () => userId ? getUserStats(userId) : null,
    enabled: !!userId,
  });

  const { data: sessions } = useQuery({
    queryKey: ['/api/users', userId, 'sessions'],
    queryFn: () => userId ? getUserSessions(userId) : null,
    enabled: !!userId,
  });

  // Mock data for demonstration
  const mockStats = {
    totalScore: 850,
    completedQuizzes: 12,
    averageAccuracy: 78,
    beginnerAccuracy: 85,
    intermediateAccuracy: 72,
    advancedAccuracy: 65,
  };

  const mockSessions = [
    {
      id: "1",
      title: "JavaScript基礎.pdf",
      difficulty: "intermediate",
      score: 8,
      totalQuestions: 10,
      timeSpent: 272, // in seconds
      completedAt: new Date("2024-01-15T14:30:00"),
      contentType: "pdf"
    },
    {
      id: "2", 
      title: "React入門動画",
      difficulty: "beginner",
      score: 9,
      totalQuestions: 10,
      timeSpent: 195,
      completedAt: new Date("2024-01-14T16:45:00"),
      contentType: "youtube"
    },
    {
      id: "3",
      title: "設計パターン.txt", 
      difficulty: "advanced",
      score: 6,
      totalQuestions: 10,
      timeSpent: 400,
      completedAt: new Date("2024-01-13T10:20:00"),
      contentType: "text"
    }
  ];

  const displayStats = stats || mockStats;
  const displaySessions = sessions || mockSessions;

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "beginner": return "bg-green-100 text-green-800";
      case "intermediate": return "bg-orange-100 text-orange-800"; 
      case "advanced": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getDifficultyLabel = (difficulty: string) => {
    switch (difficulty) {
      case "beginner": return "初級";
      case "intermediate": return "中級";
      case "advanced": return "上級";
      default: return difficulty;
    }
  };

  return (
    <section className="mb-12">
      <h3 className="text-2xl font-bold text-gray-800 mb-6 text-center">学習統計</h3>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Performance Chart Placeholder */}
        <Card className="bg-white border border-gray-200 shadow-md">
          <CardContent className="p-6">
            <h4 className="text-lg font-semibold text-gray-800 mb-4">成績の推移</h4>
            <div className="h-64 bg-gray-50 rounded-xl flex items-center justify-center">
              <div className="text-center text-gray-500">
                <i className="fas fa-chart-line text-4xl mb-2"></i>
                <p>成績推移チャート</p>
                <p className="text-sm">(Chart.js実装予定)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Statistics Summary */}
        <Card className="bg-white border border-gray-200 shadow-md">
          <CardContent className="p-6">
            <h4 className="text-lg font-semibold text-gray-800 mb-4">学習サマリー</h4>
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <span className="text-white/80">総合スコア</span>
                <span className="text-2xl font-bold gradient-text" data-testid="total-score">
                  {displayStats.totalScore}
                </span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-white/80">完了したクイズ</span>
                <span className="text-lg font-semibold text-white" data-testid="completed-quizzes">
                  {displayStats.completedQuizzes}
                </span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-white/80">平均正答率</span>
                <span className="text-lg font-semibold text-cyan-400" data-testid="average-accuracy">
                  {displayStats.averageAccuracy}%
                </span>
              </div>

              <div className="pt-4 border-t border-white/20">
                <h5 className="font-medium text-white mb-3">難易度別成績</h5>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 bg-green-400 rounded-full shadow-sm"></div>
                      <span className="text-sm text-white/80">初級</span>
                    </div>
                    <span className="text-sm font-medium text-white" data-testid="beginner-accuracy">
                      {displayStats.beginnerAccuracy}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 bg-orange-400 rounded-full shadow-sm"></div>
                      <span className="text-sm text-white/80">中級</span>
                    </div>
                    <span className="text-sm font-medium text-white" data-testid="intermediate-accuracy">
                      {displayStats.intermediateAccuracy}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 bg-purple-400 rounded-full shadow-sm"></div>
                      <span className="text-sm text-white/80">上級</span>
                    </div>
                    <span className="text-sm font-medium text-white" data-testid="advanced-accuracy">
                      {displayStats.advancedAccuracy}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Quiz History */}
      <Card className="mt-8 glass-effect border-white/20 shadow-xl">
        <CardContent className="p-6">
          <h4 className="text-lg font-semibold text-white mb-4">最近のクイズ履歴</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-white/20">
                <tr className="text-left text-white/80">
                  <th className="pb-3">日時</th>
                  <th className="pb-3">コンテンツ</th>
                  <th className="pb-3">難易度</th>
                  <th className="pb-3">正答率</th>
                  <th className="pb-3">所要時間</th>
                  <th className="pb-3">スコア</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {displaySessions.map((session) => (
                  <tr key={session.id} className="hover:bg-white/5 text-white/90">
                    <td className="py-3" data-testid={`session-date-${session.id}`}>
                      {session.completedAt.toLocaleDateString('ja-JP')} {session.completedAt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-3" data-testid={`session-title-${session.id}`}>
                      {session.title}
                    </td>
                    <td className="py-3">
                      <span className={`px-2 py-1 rounded-full text-xs ${getDifficultyColor(session.difficulty)}`}>
                        {getDifficultyLabel(session.difficulty)}
                      </span>
                    </td>
                    <td className="py-3" data-testid={`session-accuracy-${session.id}`}>
                      {Math.round((session.score / session.totalQuestions) * 100)}%
                    </td>
                    <td className="py-3" data-testid={`session-time-${session.id}`}>
                      {formatTime(session.timeSpent)}
                    </td>
                    <td className="py-3 font-medium text-cyan-400" data-testid={`session-score-${session.id}`}>
                      {Math.round((session.score / session.totalQuestions) * 100)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
