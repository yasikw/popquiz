import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface DifficultySectionProps {
  selectedDifficulty: string;
  onDifficultyChange: (difficulty: string) => void;
}

export default function DifficultySelection({ selectedDifficulty, onDifficultyChange }: DifficultySectionProps) {
  const difficulties = [
    {
      id: "beginner",
      title: "初級",
      description: "基本的な事実や概念を中心とした問題",
      icon: "fas fa-seedling",
      color: "green",
      dots: 1,
      avgTime: "30秒",
    },
    {
      id: "intermediate", 
      title: "中級",
      description: "理解と応用が必要な問題",
      icon: "fas fa-chart-line",
      color: "orange",
      dots: 2,
      avgTime: "45秒",
    },
    {
      id: "advanced",
      title: "上級", 
      description: "分析的思考や専門知識が必要",
      icon: "fas fa-graduation-cap",
      color: "red",
      dots: 3,
      avgTime: "60秒",
    }
  ];

  return (
    <section className="mb-12">
      <h3 className="text-2xl font-bold text-gray-800 mb-6 text-center">難易度を選択</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {difficulties.map((difficulty) => (
          <Card 
            key={difficulty.id}
            className={`bg-white/30 border cursor-pointer transition-shadow duration-200 ${
              selectedDifficulty === difficulty.id 
                ? "border-blue-500 shadow-lg bg-blue-50/30" 
                : "border-gray-200/40 shadow-md hover:shadow-lg hover:bg-gray-50/30"
            }`}
            onClick={() => onDifficultyChange(difficulty.id)}
            data-testid={`difficulty-${difficulty.id}`}
          >
            <CardContent className="p-6 text-center">
              <div className={`bg-gradient-to-br ${
                difficulty.color === 'green' ? 'from-green-400 to-emerald-500' :
                difficulty.color === 'orange' ? 'from-orange-400 to-amber-500' :
                'from-purple-400 to-pink-500'
              } rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-4 shadow-lg`}>
                <i className={`${difficulty.icon} text-white text-xl`}></i>
              </div>
              <h4 className="text-lg font-semibold text-gray-800 mb-2">{difficulty.title}</h4>
              <p className="text-sm text-gray-600 mb-4">{difficulty.description}</p>
              
              <div className="space-y-2 text-xs text-gray-500">
                <div className="flex justify-between">
                  <span>難易度</span>
                  <div className="flex space-x-1">
                    {[1, 2, 3].map((dot) => (
                      <div 
                        key={dot}
                        className={`w-2 h-2 rounded-full ${
                          dot <= difficulty.dots 
                            ? "bg-blue-500" 
                            : "bg-gray-300"
                        }`}
                      />
                    ))}
                  </div>
                </div>
                <div>平均回答時間: {difficulty.avgTime}</div>
              </div>
              
              {selectedDifficulty === difficulty.id && (
                <div className="mt-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white text-xs py-1 px-3 rounded-full inline-block shadow-md">
                  選択中
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
