import { GoogleGenAI } from "@google/genai";
import { type GeneratedQuiz } from "@shared/schema";
import crypto from "crypto";

// Initialize with timeout and retry options
const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "",
  fetchOptions: {
    timeout: 45000, // Reduced to 45 second timeout
  }
});

// Cache for extracted text to avoid re-processing
const textCache = new Map<string, string>();

export async function extractTextFromPDF(pdfBuffer: Buffer): Promise<string> {
  try {
    console.log('PDF extraction started, buffer size:', pdfBuffer.length);
    
    // Create cache key from buffer hash
    const cacheKey = crypto.createHash('md5').update(pdfBuffer).digest('hex');
    
    // Check cache first
    if (textCache.has(cacheKey)) {
      console.log('Using cached PDF text extraction');
      return textCache.get(cacheKey)!;
    }
    
    // Check if API key is available
    if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
      throw new Error('Gemini API key not found in environment variables');
    }

    // Check file size (Gemini has limits on file size)
    const maxSize = 15 * 1024 * 1024; // Reduced to 15MB limit for faster processing
    if (pdfBuffer.length > maxSize) {
      throw new Error(`PDFファイルが大きすぎます。${Math.round(maxSize/1024/1024)}MB以下のファイルを選択してください。`);
    }

    const contents = [
      {
        inlineData: {
          data: pdfBuffer.toString("base64"),
          mimeType: "application/pdf",
        },
      },
      "このPDFファイルからテキストを抽出してください。内容をそのまま日本語で返してください。",
    ];

    console.log('Sending PDF to Gemini API for text extraction...');
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: contents,
      config: {
        temperature: 0.1, // Lower temperature for more consistent extraction
      }
    });

    console.log('PDF text extraction completed successfully');
    const extractedText = response.text || "";
    
    // Cache the result
    textCache.set(cacheKey, extractedText);
    
    return extractedText;
  } catch (error) {
    console.error('PDF extraction error details:', error);
    
    // More specific error handling
    if (error instanceof Error) {
      if (error.message.includes('fetch failed')) {
        throw new Error(`ネットワークエラー: Gemini APIに接続できません。インターネット接続を確認してください。`);
      } else if (error.message.includes('API key')) {
        throw new Error(`API認証エラー: Gemini APIキーが正しく設定されていません。`);
      } else if (error.message.includes('quota') || error.message.includes('limit')) {
        throw new Error(`API制限エラー: Gemini APIの利用制限に達しました。しばらく待ってから再試行してください。`);
      }
    }
    
    throw new Error(`PDFテキスト抽出に失敗しました: ${error}`);
  }
}

export async function generateQuizFromText(
  text: string, 
  difficulty: string, 
  title: string,
  questionCount: number = 5
): Promise<GeneratedQuiz> {
  try {
    console.log('Gemini generateQuizFromText called with questionCount:', questionCount);
    console.log('Text length:', text.length, 'characters');
    
    // Check if API key is available
    if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
      throw new Error('Gemini API key not found in environment variables');
    }
    
    const difficultyPrompts = {
      beginner: "基本的な事実や概念を中心とした初級レベル",
      intermediate: "理解と応用が必要な中級レベル", 
      advanced: "分析的思考や専門知識が必要な上級レベル"
    };

    // Use longer text for better questions but limit for API efficiency
    const textLimit = text.length > 4000 ? 4000 : text.length;
    
    const prompt = `以下のテキストから${difficultyPrompts[difficulty as keyof typeof difficultyPrompts]}の4択クイズを${questionCount}問作成してください。

テキスト: ${text.substring(0, textLimit)}

JSON形式で回答してください。correctAnswerは0-3の数字です。`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      config: {
        responseMimeType: "application/json",
        temperature: 0.7, // Add some variation for different quizzes
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
                    items: { type: "string" }
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
    console.log("Gemini raw response:", rawJson);
    
    if (!rawJson) {
      throw new Error("AIからの応答が空です");
    }

    // JSONパースを安全に実行
    let data;
    try {
      data = JSON.parse(rawJson);
    } catch (parseError) {
      console.error("JSON parse error:", parseError);
      console.error("Raw response that failed to parse:", rawJson);
      throw new Error(`JSONパースエラー: ${parseError}`);
    }
    
    // データ構造を検証
    if (!data || !data.questions || !Array.isArray(data.questions)) {
      console.error("Invalid data structure:", data);
      throw new Error("レスポンスの構造が無効です");
    }
    
    return {
      questions: data.questions,
      difficulty,
      title
    };
  } catch (error) {
    throw new Error(`クイズ生成に失敗しました: ${error}`);
  }
}
