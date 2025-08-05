import { GoogleGenAI } from "@google/genai";
import { type GeneratedQuiz } from "@shared/schema";

const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "" 
});

export async function extractTextFromPDF(pdfBuffer: Buffer): Promise<string> {
  try {
    const contents = [
      {
        inlineData: {
          data: pdfBuffer.toString("base64"),
          mimeType: "application/pdf",
        },
      },
      "このPDFファイルからテキストを抽出してください。内容をそのまま日本語で返してください。",
    ];

    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: contents,
    });

    return response.text || "";
  } catch (error) {
    throw new Error(`PDFテキスト抽出に失敗しました: ${error}`);
  }
}

export async function generateQuizFromText(
  text: string, 
  difficulty: string, 
  title: string
): Promise<GeneratedQuiz> {
  try {
    const difficultyPrompts = {
      beginner: "基本的な事実や概念を中心とした初級レベル",
      intermediate: "理解と応用が必要な中級レベル", 
      advanced: "分析的思考や専門知識が必要な上級レベル"
    };

    const prompt = `以下のコンテンツから${difficultyPrompts[difficulty as keyof typeof difficultyPrompts]}の4択クイズを10問作成してください。
各問題には正解とわかりやすい解説も含めてください。

コンテンツ:
${text}

以下のJSON形式で回答してください:
{
  "questions": [
    {
      "question": "問題文",
      "options": ["選択肢1", "選択肢2", "選択肢3", "選択肢4"],
      "correctAnswer": 0,
      "explanation": "詳細な解説"
    }
  ]
}`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            questions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  question: { type: "string" },
                  options: { 
                    type: "array",
                    items: { type: "string" },
                    minItems: 4,
                    maxItems: 4
                  },
                  correctAnswer: { type: "number" },
                  explanation: { type: "string" }
                },
                required: ["question", "options", "correctAnswer", "explanation"]
              }
            }
          },
          required: ["questions"]
        }
      },
      contents: prompt,
    });

    const rawJson = response.text;
    if (!rawJson) {
      throw new Error("AIからの応答が空です");
    }

    const data = JSON.parse(rawJson);
    
    return {
      questions: data.questions,
      difficulty,
      title
    };
  } catch (error) {
    throw new Error(`クイズ生成に失敗しました: ${error}`);
  }
}
