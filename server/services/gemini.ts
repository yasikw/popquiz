import { GoogleGenAI } from "@google/genai";
import { type GeneratedQuiz } from "@shared/schema";
import crypto from "crypto";

// Initialize Gemini AI
const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ""
});

// Cache for extracted text to avoid re-processing
const textCache = new Map<string, string>();

// Generate cache key for YouTube videos
function generateYouTubeCacheKey(videoId: string): string {
  return crypto.createHash('md5').update(`youtube-${videoId}`).digest('hex');
}

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
    console.log('Starting YouTube content extraction for video:', videoId);
    
    // Check cache first
    const cacheKey = generateYouTubeCacheKey(videoId);
    if (textCache.has(cacheKey)) {
      console.log('Using cached YouTube content for video:', videoId);
      return textCache.get(cacheKey)!;
    }
    
    // Try to extract actual video content using multiple methods
    let extractedText = '';
    
    // Method 1: Try to extract from video thumbnails/frames
    try {
      console.log('Attempting to extract content from video frames...');
      const frameAnalysisPrompt = `この YouTube 動画 (${originalUrl}) から重要な情報を抽出してください。
      
動画内で表示されるテキスト、字幕、スライド、図表、重要な情報を可能な限り詳細に読み取り、
動画の具体的な内容を正確に抽出してください。
      
動画で実際に説明されている内容、事実、データ、概念を忠実に再現し、
推測や一般論ではなく、この動画固有の情報を提供してください。`;

      // For now, skip frame analysis and go directly to URL-based analysis
      throw new Error("Frame analysis not yet implemented");
      
    } catch (frameError) {
      console.log('Frame analysis failed, trying URL-based analysis:', frameError);
      
      // Method 2: Fallback to URL-based content generation with stricter guidelines
      const urlAnalysisPrompt = `YouTube動画URL: ${originalUrl}

このURLから動画のタイトルと推定される内容を基に、その動画で実際に扱われていそうな具体的な学習内容を生成してください。
一般論ではなく、このURLが示す具体的なトピックに焦点を当ててください。

重要：URLから推定される動画の具体的な内容に基づいて、以下を含む詳細な情報を提供してください：
- 具体的な事実、数値、日付、人名
- 詳細な説明と解説
- 関連する専門知識
- 実際の事例や応用`;

      console.log('Generating URL-based content analysis...');
      const result = await ai.models.generateContent({
        model: "gemini-2.5-pro",
        contents: [{ role: "user", parts: [{ text: urlAnalysisPrompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4000,
        }
      });

      extractedText = result.response.text();
    }
    
    // If the content is insufficient, try to get more specific information
    if (!extractedText || extractedText.length < 200) {
      console.log('Initial content insufficient, generating specific topic content...');
      
      const specificPrompt = `YouTube動画のURL: ${originalUrl}

この動画で扱われていると推測される主題について、クイズ作成に適した詳細で具体的な学習コンテンツを生成してください。

重要な指示：
- 抽象的な説明ではなく、具体的な事実、数値、名前、日付を多く含む
- クイズの問題として出題できる明確な情報を提供
- 「〜について」「〜に関して」のような曖昧な表現を避ける
- 検証可能で正確な情報に基づく内容

例：「この人物は○○年に△△を発明した」「この出来事は××年××月に起こった」など

詳細で具体的な学習コンテンツを日本語で提供してください。`;

      const specificResult = await ai.models.generateContent({
        model: "gemini-2.5-pro",
        contents: [{ role: "user", parts: [{ text: specificPrompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 4000,
        }
      });

      const specificContent = specificResult.response.text();
      if (specificContent && specificContent.length > extractedText.length) {
        extractedText = specificContent;
      }
      console.log('Generated specific content length:', specificContent.length);
    }
    
    if (!extractedText || extractedText.trim().length < 100) {
      throw new Error("動画の内容から十分な学習コンテンツを生成できませんでした");
    }
    
    // Clean and format the extracted content
    const cleanedContent = extractedText
      .replace(/\n\s*\n\s*\n/g, '\n\n') // Remove excessive newlines
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    // Cache the result
    textCache.set(cacheKey, cleanedContent);
    
    console.log('Final processed content length:', cleanedContent.length);
    return cleanedContent;
    
  } catch (error) {
    console.error('YouTube content analysis error:', error);
    throw new Error(`動画内容の分析に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

export async function generateQuizFromCachedYouTube(videoId: string, difficulty: string = "intermediate", questionCount: number = 5): Promise<GeneratedQuiz | null> {
  try {
    console.log('Attempting to generate quiz from cached YouTube content for video:', videoId);
    
    // Generate cache key
    const cacheKey = generateYouTubeCacheKey(videoId);
    console.log('Generated YouTube cache key:', cacheKey);
    
    // Debug: Show all cached keys
    console.log('Available cache keys:', Array.from(textCache.keys()));
    
    // Check if we have cached text
    if (!textCache.has(cacheKey)) {
      console.log('No cached text found for YouTube video:', videoId);
      console.log('Cache key not found:', cacheKey);
      return null;
    }
    
    const cachedText = textCache.get(cacheKey)!;
    console.log('Found cached YouTube text, length:', cachedText.length);
    
    // Try multiple times to get different questions
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      attempts++;
      console.log(`Generating YouTube quiz attempt ${attempts}/${maxAttempts}`);
      
      const quiz = await generateQuizFromText(cachedText, difficulty, "YouTube動画クイズ", questionCount);
      
      // Check if questions are different from previous ones
      const currentQuestionTexts = quiz.questions.map(q => q.question);
      const previousKey = `${cacheKey}-${difficulty}`;
      const prevQuestions = previousQuestions.get(previousKey) || [];
      
      // If this is the first generation or questions are sufficiently different
      if (prevQuestions.length === 0 || !areQuestionsSimilar(currentQuestionTexts, prevQuestions)) {
        // Store current questions for future comparison
        previousQuestions.set(previousKey, currentQuestionTexts);
        console.log('Generated sufficiently different YouTube questions');
        return quiz;
      }
      
      console.log('YouTube questions too similar to previous ones, retrying...');
    }
    
    // If all attempts failed, still return the last quiz (better than nothing)
    const finalQuiz = await generateQuizFromText(cachedText, difficulty, "YouTube動画クイズ", questionCount);
    return finalQuiz;
    
  } catch (error) {
    console.error('Cached YouTube quiz generation error:', error);
    return null;
  }
}

export async function generateQuizFromCachedText(textContent: string, difficulty: string = "intermediate", questionCount: number = 5): Promise<GeneratedQuiz | null> {
  try {
    console.log('Attempting to generate quiz from cached text content');
    
    // Generate cache key for text content
    const cacheKey = `text-${textContent.substring(0, 100)}-${textContent.length}`;
    console.log('Generated text cache key:', cacheKey);
    
    // Cache the text content if not already cached
    if (!textCache.has(cacheKey)) {
      textCache.set(cacheKey, textContent);
      console.log('Cached text content, length:', textContent.length);
    }
    
    const cachedText = textCache.get(cacheKey)!;
    console.log('Found cached text content, length:', cachedText.length);
    
    // Try multiple times to get different questions
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      attempts++;
      console.log(`Generating text quiz attempt ${attempts}/${maxAttempts}`);
      
      const quiz = await generateQuizFromText(cachedText, difficulty, "テキストクイズ", questionCount);
      
      // Check if questions are different from previous ones
      const currentQuestionTexts = quiz.questions.map(q => q.question);
      const previousKey = `${cacheKey}-${difficulty}`;
      const prevQuestions = previousQuestions.get(previousKey) || [];
      
      // If this is the first generation or questions are sufficiently different
      if (prevQuestions.length === 0 || !areQuestionsSimilar(currentQuestionTexts, prevQuestions)) {
        // Store current questions for future comparison
        previousQuestions.set(previousKey, currentQuestionTexts);
        console.log('Generated sufficiently different text questions');
        return quiz;
      }
      
      console.log('Text questions too similar to previous ones, retrying...');
    }
    
    // If all attempts failed, still return the last quiz (better than nothing)
    const finalQuiz = await generateQuizFromText(cachedText, difficulty, "テキストクイズ", questionCount);
    return finalQuiz;
    
  } catch (error) {
    console.error('Cached text quiz generation error:', error);
    return null;
  }
}


