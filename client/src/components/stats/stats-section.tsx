import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { getUserStats, getUserSessionsWithQuestions } from "@/lib/api";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface StatsSectionProps {
  userId?: string;
}

export default function StatsSection({ userId }: StatsSectionProps) {
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());

  const { data: stats } = useQuery({
    queryKey: ['/api/users', userId, 'stats'],
    queryFn: () => userId ? getUserStats(userId) : null,
    enabled: !!userId,
  });

  const { data: sessionsWithQuestions } = useQuery({
    queryKey: ['/api/users', userId, 'sessions-with-questions'],
    queryFn: () => userId ? getUserSessionsWithQuestions(userId) : null,
    enabled: !!userId,
  });

  const toggleSessionExpansion = (sessionId: string) => {
    const newExpanded = new Set(expandedSessions);
    if (newExpanded.has(sessionId)) {
      newExpanded.delete(sessionId);
    } else {
      newExpanded.add(sessionId);
    }
    setExpandedSessions(newExpanded);
  };

  const createQuizSummary = (questions: Array<{ questionText: string }>) => {
    if (!questions || questions.length === 0) return '';
    
    // Extract key topics from all questions
    const allText = questions.map(q => q.questionText).join(' ');
    const keywords = [];
    
    // Common Japanese topic patterns
    const patterns = [
      /([^、。？！\s]{2,8})(県|市|都|府|国|地域)/g,
      /([^、。？！\s]{2,6})(文化|伝統|祭り|踊り)/g,
      /([^、。？！\s]{2,6})(政治|経済|社会|歴史)/g,
      /([^、。？！\s]{2,6})(技術|科学|建築|交通)/g,
      /([^、。？！\s]{2,6})(料理|食べ物|特産品)/g,
      /([^、。？！\s]{2,6})(観光|名所|景観|自然)/g,
    ];
    
    patterns.forEach(pattern => {
      const matches = allText.match(pattern);
      if (matches) {
        keywords.push(...matches.slice(0, 2));
      }
    });
    
    // If no patterns match, extract the first few words from first question
    if (keywords.length === 0) {
      const firstQuestion = questions[0].questionText;
      const words = firstQuestion.replace(/[？！。、]/g, '').split(/\s+/);
      keywords.push(words.slice(0, 3).join(''));
    }
    
    // Create summary with question count
    const summary = keywords.slice(0, 2).join('・');
    return `${questions.length}問: ${summary.substring(0, 20)}`;
  };

  // Calculate real statistics from sessions
  const calculateStats = (sessions: any[]) => {
    if (!sessions || sessions.length === 0) {
      return {
        totalScore: 0,
        completedQuizzes: 0,
        averageAccuracy: 0,
        beginnerAccuracy: 0,
        intermediateAccuracy: 0,
        advancedAccuracy: 0,
      };
    }

    const totalScore = sessions.reduce((sum, session) => sum + session.score, 0);
    const completedQuizzes = sessions.length;
    
    const difficultyGroups = {
      beginner: sessions.filter(s => s.difficulty === 'beginner'),
      intermediate: sessions.filter(s => s.difficulty === 'intermediate'),
      advanced: sessions.filter(s => s.difficulty === 'advanced'),
    };

    const calculateAccuracy = (sessionsGroup: any[]) => {
      if (sessionsGroup.length === 0) return 0;
      const totalAccuracy = sessionsGroup.reduce((sum, session) => 
        sum + (session.score / session.totalQuestions * 100), 0);
      return Math.round(totalAccuracy / sessionsGroup.length);
    };

    const beginnerAccuracy = calculateAccuracy(difficultyGroups.beginner);
    const intermediateAccuracy = calculateAccuracy(difficultyGroups.intermediate);
    const advancedAccuracy = calculateAccuracy(difficultyGroups.advanced);
    
    const overallAccuracy = sessions.reduce((sum, session) => 
      sum + (session.score / session.totalQuestions * 100), 0) / sessions.length;

    return {
      totalScore,
      completedQuizzes,
      averageAccuracy: Math.round(overallAccuracy),
      beginnerAccuracy,
      intermediateAccuracy,
      advancedAccuracy,
    };
  };

  // Prepare chart data
  const prepareChartData = (sessions: any[]) => {
    if (!sessions || sessions.length === 0) return [];
    
    return sessions
      .slice(-10) // Last 10 sessions
      .map((session, index) => ({
        session: `#${index + 1}`,
        accuracy: Math.round((session.score / session.totalQuestions) * 100),
        score: session.score,
        date: new Date(session.completedAt).toLocaleDateString('ja-JP'),
      }));
  };

  const displayStats = sessionsWithQuestions ? calculateStats(sessionsWithQuestions) : stats || {
    totalScore: 0,
    completedQuizzes: 0,
    averageAccuracy: 0,
    beginnerAccuracy: 0,
    intermediateAccuracy: 0,
    advancedAccuracy: 0,
  };
  
  const displaySessions = sessionsWithQuestions || [];
  const chartData = prepareChartData(displaySessions);

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
        {/* Performance Chart */}
        <Card className="bg-white/30 border border-gray-200/40 shadow-md backdrop-blur-sm">
          <CardContent className="p-6">
            <h4 className="text-lg font-semibold text-gray-800 mb-4">成績の推移</h4>
            <div className="h-64">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis 
                      dataKey="session" 
                      stroke="#6b7280"
                      fontSize={12}
                    />
                    <YAxis 
                      domain={[0, 100]}
                      stroke="#6b7280"
                      fontSize={12}
                    />
                    <Tooltip 
                      contentStyle={{
                        backgroundColor: '#f9fafb',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px'
                      }}
                      labelFormatter={(label) => `セッション ${label}`}
                      formatter={(value: any, name: string) => [
                        name === 'accuracy' ? `${value}%` : value,
                        name === 'accuracy' ? '正答率' : 'スコア'
                      ]}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="accuracy" 
                      stroke="#3b82f6" 
                      strokeWidth={3}
                      dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 6, stroke: '#3b82f6', strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full bg-gray-50 rounded-xl flex items-center justify-center">
                  <div className="text-center text-gray-500">
                    <i className="fas fa-chart-line text-4xl mb-2"></i>
                    <p>クイズを完了すると</p>
                    <p className="text-sm">成績の推移が表示されます</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Statistics Summary */}
        <Card className="bg-white/30 border border-gray-200/40 shadow-md backdrop-blur-sm">
          <CardContent className="p-6">
            <h4 className="text-lg font-semibold text-gray-800 mb-4">学習サマリー</h4>
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">総合スコア</span>
                <span className="text-2xl font-bold text-blue-600" data-testid="total-score">
                  {displayStats.totalScore}
                </span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-gray-600">完了したクイズ</span>
                <span className="text-lg font-semibold text-gray-800" data-testid="completed-quizzes">
                  {displayStats.completedQuizzes}
                </span>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-gray-600">平均正答率</span>
                <span className="text-lg font-semibold text-purple-600" data-testid="average-accuracy">
                  {displayStats.averageAccuracy}%
                </span>
              </div>

              <div className="pt-4 border-t border-gray-300">
                <h5 className="font-medium text-gray-800 mb-3">難易度別成績</h5>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 bg-green-500 rounded-full shadow-sm"></div>
                      <span className="text-sm text-gray-600">初級</span>
                    </div>
                    <span className="text-sm font-medium text-gray-800" data-testid="beginner-accuracy">
                      {displayStats.beginnerAccuracy}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 bg-orange-500 rounded-full shadow-sm"></div>
                      <span className="text-sm text-gray-600">中級</span>
                    </div>
                    <span className="text-sm font-medium text-gray-800" data-testid="intermediate-accuracy">
                      {displayStats.intermediateAccuracy}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 bg-purple-500 rounded-full shadow-sm"></div>
                      <span className="text-sm text-gray-600">上級</span>
                    </div>
                    <span className="text-sm font-medium text-gray-800" data-testid="advanced-accuracy">
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
      <Card className="mt-8 bg-white/30 border border-gray-200/40 shadow-md backdrop-blur-sm">
        <CardContent className="p-6">
          <h4 className="text-lg font-semibold text-gray-800 mb-4">最近のクイズ履歴</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-300">
                <tr className="text-left text-gray-600">
                  <th className="pb-3">日時</th>
                  <th className="pb-3">問題内容</th>
                  <th className="pb-3">難易度</th>
                  <th className="pb-3">正答率</th>
                  <th className="pb-3">所要時間</th>
                  <th className="pb-3">スコア</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {displaySessions.length > 0 ? (
                  displaySessions.slice(0, 10).map((session) => (
                    <tr key={session.id} className="hover:bg-gray-50 text-gray-800">
                      <td className="py-3" data-testid={`session-date-${session.id}`}>
                        {new Date(session.completedAt).toLocaleDateString('ja-JP')} {new Date(session.completedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3 max-w-xs" data-testid={`session-title-${session.id}`}>
                        {session.questions && session.questions.length > 0 ? (
                          <div className="space-y-2">
                            <button
                              onClick={() => toggleSessionExpansion(session.id)}
                              className="flex items-center space-x-2 text-left hover:text-blue-600 transition-colors"
                            >
                              {expandedSessions.has(session.id) ? (
                                <ChevronDown className="w-4 h-4" />
                              ) : (
                                <ChevronRight className="w-4 h-4" />
                              )}
                              <div>
                                <div className="text-sm font-medium text-gray-800">
                                  {createQuizSummary(session.questions)}
                                </div>
                              </div>
                            </button>
                            
                            {expandedSessions.has(session.id) && (
                              <div className="ml-6 space-y-1 border-l-2 border-gray-200 pl-3">
                                {session.questions.map((question, index) => (
                                  <div key={index} className="text-xs text-gray-700">
                                    <span className="font-medium">Q{index + 1}:</span> {question.questionText}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          session.title
                        )}
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
                      <td className="py-3 font-medium text-blue-600" data-testid={`session-score-${session.id}`}>
                        {session.score}/{session.totalQuestions}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-500">
                      <div className="flex flex-col items-center">
                        <i className="fas fa-history text-2xl mb-2"></i>
                        <p>まだクイズを完了していません</p>
                        <p className="text-sm">ホーム画面でクイズを開始してください</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
