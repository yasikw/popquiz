import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { getUserStats, getUserSessionsWithQuestions } from "@/lib/api";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';


interface StatsSectionProps {
  userId?: string;
}

export default function StatsSection({ userId }: StatsSectionProps) {

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



  // Create content title based on content type
  const getContentTitle = (session: any, questions: Array<{ questionText: string }>) => {
    // For text content - extract topic from questions since user input wasn't saved
    if (session.contentType === 'text') {
      if (questions && questions.length > 0) {
        const allText = questions.map(q => q.questionText).join(' ');
        
        // Look for topic patterns in Japanese from questions
        const topicPatterns = [
          /日本の?([^、。？！\s]{2,6})(について|に関して|とは|が|の)/g,
          /([^、。？！\s]{2,8})(の歴史|歴史|文化|政治|経済)/g,
          /([^、。？！\s]{2,6})(県|市|都|府|国|地域)/g,
        ];
        
        for (const pattern of topicPatterns) {
          const matches = allText.match(pattern);
          if (matches && matches.length > 0) {
            let topic = matches[0];
            // Clean up the extracted topic
            topic = topic.replace(/(について|に関して|とは|が|の)$/, '');
            topic = topic.replace(/^日本の?/, '');
            if (topic.includes('歴史')) {
              topic = topic.replace(/の?歴史/, '') + 'の歴史';
            }
            return topic || 'テキストクイズ';
          }
        }
        
        // Fallback to extracting key terms
        const firstWords = questions[0].questionText.substring(0, 15);
        return `${firstWords.replace(/[？！。、]/g, '')}...`;
      }
      return 'テキストクイズ';
    }
    
    // For PDF content - extract filename or key topics
    if (session.contentType === 'pdf') {
      if (questions && questions.length > 0) {
        const allText = questions.map(q => q.questionText).join(' ');
        
        const topicPatterns = [
          /([^、。？！\s]{3,10})(について|に関して|とは)/g,
          /([^、。？！\s]{3,8})(県|市|都|府|国)/g,
          /([^、。？！\s]{3,8})(文化|歴史|伝統)/g,
        ];
        
        for (const pattern of topicPatterns) {
          const matches = allText.match(pattern);
          if (matches && matches.length > 0) {
            const topic = matches[0].replace(/(について|に関して|とは)/, '');
            return `PDFクイズ: ${topic}`;
          }
        }
        
        const firstWords = questions[0].questionText.substring(0, 15);
        return `PDFクイズ: ${firstWords}...`;
      }
      return 'PDFクイズ';
    }
    
    // For YouTube content - use video title or URL
    if (session.contentType === 'youtube') {
      return session.title && session.title !== 'AIクイズ' ? 
        `YouTube: ${session.title}` : 'YouTubeクイズ';
    }
    
    return session.title || 'クイズ';
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
  
  // Group sessions by unique combinations to avoid duplicates
  const uniqueSessions = sessionsWithQuestions ? 
    sessionsWithQuestions.reduce((acc: any[], session: any) => {
      // Check if we already have a similar session (same content, difficulty, score)
      const existing = acc.find(s => 
        s.contentType === session.contentType &&
        s.difficulty === session.difficulty &&
        s.score === session.score &&
        Math.abs(new Date(s.completedAt).getTime() - new Date(session.completedAt).getTime()) < 60000 // within 1 minute
      );
      
      if (!existing) {
        acc.push(session);
      }
      return acc;
    }, []) : [];
    
  const displaySessions = uniqueSessions;
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
            <div className="min-w-full">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-300">
                  <tr className="text-left text-gray-600">
                    <th className="pb-3 pr-4 min-w-[120px]">日時</th>
                    <th className="pb-3 pr-4 min-w-[200px]">コンテンツ</th>
                    <th className="pb-3 pr-4 min-w-[80px]">難易度</th>
                    <th className="pb-3 pr-4 min-w-[80px]">正答率</th>
                    <th className="pb-3 pr-4 min-w-[80px]">所要時間</th>
                    <th className="pb-3 min-w-[80px]">スコア</th>
                  </tr>
                </thead>
              <tbody className="divide-y divide-gray-200">
                {displaySessions.length > 0 ? (
                  displaySessions.slice(0, 10).map((session) => (
                    <tr key={session.id} className="hover:bg-gray-50/50 text-gray-800">
                      <td className="py-3 pr-4" data-testid={`session-date-${session.id}`}>
                        <div className="whitespace-nowrap">
                          {new Date(session.completedAt).toLocaleDateString('ja-JP', { 
                            month: 'short', 
                            day: 'numeric' 
                          })}
                        </div>
                        <div className="text-xs text-gray-500 whitespace-nowrap">
                          {new Date(session.completedAt).toLocaleTimeString('ja-JP', { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          })}
                        </div>
                      </td>
                      <td className="py-3 pr-4" data-testid={`session-title-${session.id}`}>
                        <div className="max-w-[200px]">
                          <div className="font-medium text-gray-800 truncate">
                            {getContentTitle(session, session.questions || [])}
                          </div>
                          <div className="text-xs text-gray-500">
                            {session.questions?.length || 0}問のクイズ
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${getDifficultyColor(session.difficulty)}`}>
                          {getDifficultyLabel(session.difficulty)}
                        </span>
                      </td>
                      <td className="py-3 pr-4" data-testid={`session-accuracy-${session.id}`}>
                        <div className="text-center">
                          <div className="font-semibold">
                            {Math.round((session.score / session.totalQuestions) * 100)}%
                          </div>
                        </div>
                      </td>
                      <td className="py-3 pr-4" data-testid={`session-time-${session.id}`}>
                        <div className="text-center whitespace-nowrap">
                          {formatTime(session.timeSpent)}
                        </div>
                      </td>
                      <td className="py-3" data-testid={`session-score-${session.id}`}>
                        <div className="text-center font-semibold">
                          {session.score}/{session.totalQuestions}
                        </div>
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
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
