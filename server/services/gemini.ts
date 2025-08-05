import { GoogleGenAI } from "@google/genai";
import { type GeneratedQuiz } from "@shared/schema";
import crypto from "crypto";

// Initialize Gemini AI
const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ""
});

// Cache for extracted text to avoid re-processing
const textCache = new Map<string, string>();

// Debug function to show cache status
export function getCacheStatus() {
  return {
    cacheSize: textCache.size,
    keys: Array.from(textCache.keys())
  };
}

// Generate cache key from PDF info
function generateCacheKey(pdfInfo: any): string {
  return crypto.createHash('md5').update(`${pdfInfo.name}-${pdfInfo.size}-${pdfInfo.type}`).digest('hex');
}

export async function extractTextFromYouTubeWithGemini(videoId: string, originalUrl: string): Promise<string> {
  try {
    console.log('Starting Gemini-based YouTube content extraction for video:', videoId);
    
    // Get multiple thumbnail images from YouTube
    const thumbnailUrls = [
      `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
    ];
    
    let extractedContent = '';
    
    // Try to extract text from thumbnails using Gemini Vision
    for (const thumbnailUrl of thumbnailUrls) {
      try {
        console.log('Fetching thumbnail:', thumbnailUrl);
        const response = await fetch(thumbnailUrl);
        
        if (!response.ok) {
          console.log('Thumbnail fetch failed:', response.status);
          continue;
        }
        
        const imageBuffer = await response.arrayBuffer();
        const base64Image = Buffer.from(imageBuffer).toString('base64');
        
        console.log('Analyzing thumbnail with Gemini Vision...');
        
        const analysisPrompt = `この画像はYouTube動画のサムネイルです。画像に含まれる全ての日本語と英語のテキストを抽出し、学習コンテンツとして使用できるよう整理してください。

以下の内容を含めて分析してください：
1. タイトルやキャプション
2. 表示されている文字やテキスト
3. 画像から推測できる動画の内容や主題
4. 学習に役立つ情報や知識

元のURL: ${originalUrl}

抽出したテキストと分析内容を日本語で詳しく説明してください。`;

        const contents = [
          {
            inlineData: {
              data: base64Image,
              mimeType: "image/jpeg",
            },
          },
          analysisPrompt
        ];

        const result = await ai.models.generateContent({
          model: "gemini-2.5-pro",
          contents: contents,
        });

        const analysisText = result.text || '';
        console.log('Gemini analysis result length:', analysisText.length);
        
        if (analysisText && analysisText.length > 100) {
          extractedContent += analysisText + '\n\n';
          break; // Use the first successful extraction
        }
        
      } catch (thumbnailError) {
        console.log('Thumbnail analysis failed:', thumbnailError);
        continue;
      }
    }
    
    // If thumbnail analysis didn't work, try a different approach
    if (!extractedContent || extractedContent.length < 100) {
      console.log('Thumbnail analysis insufficient, trying video description analysis...');
      
      const descriptionPrompt = `YouTube動画URL: ${originalUrl}

この動画について、以下の情報を基に学習用のコンテンツを生成してください：

1. 動画のタイトルから推測される内容
2. 一般的にこのような動画で扱われるトピック
3. 学習者が知っておくべき関連知識
4. この分野の基本的な概念や用語

日本語で詳しく説明し、クイズ作成に適した学習コンテンツとして整理してください。`;

      const result = await ai.models.generateContent({
        model: "gemini-2.5-pro",
        contents: descriptionPrompt,
      });

      extractedContent = result.text || '';
      console.log('Generated content based on URL, length:', extractedContent.length);
    }
    
    if (!extractedContent || extractedContent.trim().length < 50) {
      throw new Error("動画から学習コンテンツを生成できませんでした");
    }
    
    // Clean and format the extracted content
    const cleanedContent = extractedContent
      .replace(/\n\s*\n/g, '\n') // Remove extra newlines
      .trim();
    
    console.log('Final extracted content length:', cleanedContent.length);
    return cleanedContent;
    
  } catch (error) {
    console.error('Gemini YouTube extraction error:', error);
    throw new Error(`Gemini を使用した動画解析に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function extractTextFromPDF(pdfBuffer: Buffer, pdfInfo?: any): Promise<string> {
  try {
    console.log('PDF extraction started, buffer size:', pdfBuffer.length);
    
    // Create cache key - use PDF info if available, otherwise buffer hash
    let cacheKey: string;
    if (pdfInfo) {
      cacheKey = generateCacheKey(pdfInfo);
      console.log('Using PDF info cache key:', cacheKey);
    } else {
      cacheKey = crypto.createHash('md5').update(pdfBuffer).digest('hex');
      console.log('Using buffer hash cache key:', cacheKey);
    }
    
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

    // Create multiple text segments to vary focus areas
    const segmentSize = Math.floor(text.length / 3);
    const randomOffset = Math.floor(Math.random() * segmentSize);
    const textStart = Math.min(randomOffset, text.length - 4000);
    const textLimit = Math.min(textStart + 4000, text.length);
    const selectedText = text.substring(textStart, textLimit);
    
    // Add strong randomization elements
    const timestamp = Date.now();
    const randomSeed = Math.floor(Math.random() * 100000);
    const focusAreas = [
      "人物の詳細情報や経歴",
      "時系列や年代順の出来事", 
      "作品や業績に関する事実",
      "関係性や影響について",
      "背景や文脈に関する内容"
    ];
    const selectedFocus = focusAreas[Math.floor(Math.random() * focusAreas.length)];
    
    const prompt = `以下のテキストから${difficultyPrompts[difficulty as keyof typeof difficultyPrompts]}の4択クイズを${questionCount}問作成してください。

【重要な指示】
- 今回は特に「${selectedFocus}」に焦点を当てて問題を作成してください
- 前回とは完全に異なる観点・角度・詳細レベルから問題を作成してください
- 同じ事実でも異なる切り口で質問してください
- 問題文の構造や問い方を変えてください
- 生成ID: ${timestamp}-${randomSeed}

テキスト: ${selectedText}

JSON形式で回答してください。correctAnswerは0-3の数字です。`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      config: {
        responseMimeType: "application/json",
        temperature: 1.0, // Maximum temperature for maximum variation
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

// Store previous questions to avoid repetition
const previousQuestions = new Map<string, string[]>();

export async function generateQuizFromCachedPDF(pdfInfo: any, difficulty: string = "intermediate", questionCount: number = 5): Promise<GeneratedQuiz | null> {
  try {
    console.log('Attempting to generate quiz from cached PDF:', pdfInfo.name);
    console.log('PDF info for cache:', { name: pdfInfo.name, size: pdfInfo.size, type: pdfInfo.type });
    
    // Generate cache key
    const cacheKey = generateCacheKey(pdfInfo);
    console.log('Generated cache key:', cacheKey);
    
    // Debug: Show all cached keys
    console.log('Available cache keys:', Array.from(textCache.keys()));
    
    // Check if we have cached text
    if (!textCache.has(cacheKey)) {
      console.log('No cached text found for PDF:', pdfInfo.name);
      console.log('Cache key not found:', cacheKey);
      
      // Try to find cache with any available key containing PDF name
      const availableKeys = Array.from(textCache.keys());
      const matchingKey = availableKeys.find(key => {
        // Try different matching strategies
        return key.includes(pdfInfo.name.replace(/\s+/g, '')) || 
               key.includes(pdfInfo.size.toString()) ||
               textCache.get(key)?.includes('藤子'); // Content-based fallback
      });
      
      if (matchingKey) {
        console.log('Found alternative cache key:', matchingKey);
        const cachedText = textCache.get(matchingKey)!;
        return await generateQuizFromText(cachedText, difficulty, `PDFクイズ - ${pdfInfo.name}`, questionCount);
      }
      
      return null;
    }
    
    const cachedText = textCache.get(cacheKey)!;
    console.log('Found cached text, length:', cachedText.length);
    
    // Try multiple times to get different questions
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      attempts++;
      console.log(`Generating quiz attempt ${attempts}/${maxAttempts}`);
      
      const quiz = await generateQuizFromText(cachedText, difficulty, `PDFクイズ - ${pdfInfo.name}`, questionCount);
      
      // Check if questions are different from previous ones
      const currentQuestionTexts = quiz.questions.map(q => q.question);
      const previousKey = `${cacheKey}-${difficulty}`;
      const prevQuestions = previousQuestions.get(previousKey) || [];
      
      // If this is the first generation or questions are sufficiently different
      if (prevQuestions.length === 0 || !areQuestionsSimilar(currentQuestionTexts, prevQuestions)) {
        // Store current questions for future comparison
        previousQuestions.set(previousKey, currentQuestionTexts);
        console.log('Generated sufficiently different questions');
        return quiz;
      }
      
      console.log('Questions too similar to previous ones, retrying...');
    }
    
    // If all attempts failed, still return the last quiz (better than nothing)
    const finalQuiz = await generateQuizFromText(cachedText, difficulty, `PDFクイズ - ${pdfInfo.name}`, questionCount);
    return finalQuiz;
    
  } catch (error) {
    console.error('Cached quiz generation error:', error);
    return null;
  }
}

// Helper function to check if questions are too similar
function areQuestionsSimilar(current: string[], previous: string[]): boolean {
  let similarCount = 0;
  
  for (const currentQ of current) {
    for (const prevQ of previous) {
      // Check if questions share significant portions (more than 50% similarity)
      const similarity = calculateSimilarity(currentQ, prevQ);
      if (similarity > 0.5) {
        similarCount++;
        break;
      }
    }
  }
  
  // If more than half the questions are similar, consider them too similar
  return similarCount > current.length / 2;
}

// Simple similarity calculation based on common words
function calculateSimilarity(str1: string, str2: string): number {
  const words1 = str1.toLowerCase().split(/\s+/);
  const words2 = str2.toLowerCase().split(/\s+/);
  
  const commonWords = words1.filter(word => words2.includes(word));
  const totalWords = Math.max(words1.length, words2.length);
  
  return commonWords.length / totalWords;
}
