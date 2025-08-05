import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { extractTextFromPDF, generateQuizFromText, generateQuizFromCachedPDF, generateQuizFromCachedYouTube, getCacheStatus } from "./services/gemini";
import { extractYouTubeSubtitles } from "./services/youtube";
import { insertUserSchema, insertQuizSessionSchema, insertQuestionSchema } from "@shared/schema";
import multer from "multer";
import { z } from "zod";

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB for PDFs
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  
  // User management
  app.post("/api/users", async (req, res) => {
    try {
      const userData = insertUserSchema.parse(req.body);
      const user = await storage.createUser(userData);
      res.json(user);
    } catch (error) {
      res.status(400).json({ message: "ユーザー作成に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.get("/api/users/:username", async (req, res) => {
    try {
      const user = await storage.getUserByUsername(req.params.username);
      if (!user) {
        return res.status(404).json({ message: "ユーザーが見つかりません" });
      }
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: "ユーザー取得に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.put("/api/users/:id", async (req, res) => {
    try {
      const updateData = insertUserSchema.partial().parse(req.body);
      const user = await storage.updateUser(req.params.id, updateData);
      if (!user) {
        return res.status(404).json({ message: "ユーザーが見つかりません" });
      }
      res.json(user);
    } catch (error) {
      res.status(400).json({ message: "ユーザー更新に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Quiz generation from cached content (PDF or YouTube)
  app.post("/api/generate-quiz-from-cache", async (req, res) => {
    try {
      const { pdfInfo, youtubeVideoId, difficulty = "intermediate", questionCount = 5 } = req.body;
      
      if (!pdfInfo && !youtubeVideoId) {
        return res.status(400).json({ message: "PDF情報またはYouTube動画IDが必要です" });
      }

      // Debug cache status
      const cacheStatus = getCacheStatus();
      console.log('Cache status:', cacheStatus);
      
      let quiz = null;
      
      if (pdfInfo) {
        console.log('Generating quiz from cached PDF:', pdfInfo.name);
        console.log('Received PDF info:', pdfInfo);
        quiz = await generateQuizFromCachedPDF(pdfInfo, difficulty, parseInt(questionCount));
      } else if (youtubeVideoId) {
        console.log('Generating quiz from cached YouTube video:', youtubeVideoId);
        quiz = await generateQuizFromCachedYouTube(youtubeVideoId, difficulty, parseInt(questionCount));
      }
      
      if (!quiz) {
        return res.status(404).json({ 
          message: "キャッシュされたコンテンツが見つかりません",
          cacheStatus: cacheStatus
        });
      }
      
      res.json(quiz);
    } catch (error) {
      console.error('Cached quiz generation error:', error);
      res.status(500).json({ 
        message: "キャッシュからのクイズ生成に失敗しました", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Unified quiz generation endpoint
  app.post("/api/generate-quiz", upload.single('file'), async (req, res) => {
    try {
      const { contentType, difficulty = "intermediate", youtubeUrl, textContent, questionCount = "5" } = req.body;
      console.log('Quiz generation request received with questionCount:', questionCount);
      
      let extractedText = "";
      let title = "AIクイズ";

      if (contentType === 'pdf') {
        if (!req.file) {
          return res.status(400).json({ message: "PDFファイルが必要です" });
        }
        title = "PDFクイズ";
        // Create PDF info for caching
        const pdfFileInfo = {
          name: req.file.originalname,
          size: req.file.size,
          type: req.file.mimetype
        };
        extractedText = await extractTextFromPDF(req.file.buffer, pdfFileInfo);
      } else if (contentType === 'text') {
        if (!textContent) {
          return res.status(400).json({ message: "テキスト内容が必要です" });
        }
        title = "テキストクイズ";
        extractedText = textContent;
      } else if (contentType === 'youtube') {
        if (!youtubeUrl) {
          return res.status(400).json({ message: "YouTube URLが必要です" });
        }
        title = "YouTube動画クイズ";
        extractedText = await extractYouTubeSubtitles(youtubeUrl);
      } else {
        return res.status(400).json({ message: "無効なコンテンツタイプです" });
      }
      
      if (!extractedText.trim()) {
        return res.status(400).json({ message: "コンテンツからテキストを抽出できませんでした" });
      }

      const quiz = await generateQuizFromText(extractedText, difficulty, title, parseInt(questionCount));
      res.json(quiz);
    } catch (error) {
      console.error('Quiz generation error:', error);
      res.status(500).json({ 
        message: "クイズ生成に失敗しました", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Content processing and quiz generation
  app.post("/api/process-pdf", upload.single('pdf'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "PDFファイルが必要です" });
      }

      const { difficulty = "intermediate", title = "PDFクイズ", questionCount = "5" } = req.body;
      
      // Create PDF info for caching
      const pdfFileInfo = {
        name: req.file.originalname,
        size: req.file.size,
        type: req.file.mimetype
      };
      
      // Extract text from PDF using Gemini Vision
      const extractedText = await extractTextFromPDF(req.file.buffer, pdfFileInfo);
      
      if (!extractedText.trim()) {
        return res.status(400).json({ message: "PDFからテキストを抽出できませんでした" });
      }

      // Generate quiz from extracted text
      const quiz = await generateQuizFromText(extractedText, difficulty, title, parseInt(questionCount));
      
      res.json(quiz);
    } catch (error) {
      res.status(500).json({ message: "PDF処理に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.post("/api/process-text", upload.single('text'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "テキストファイルが必要です" });
      }

      const { difficulty = "intermediate", title = "テキストクイズ", questionCount = "5" } = req.body;
      const text = req.file.buffer.toString('utf-8');
      
      if (!text.trim()) {
        return res.status(400).json({ message: "ファイルが空です" });
      }

      const quiz = await generateQuizFromText(text, difficulty, title, parseInt(questionCount));
      
      res.json(quiz);
    } catch (error) {
      res.status(500).json({ message: "テキスト処理に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.post("/api/process-youtube", async (req, res) => {
    try {
      const { url, difficulty = "intermediate", title = "YouTube動画クイズ", questionCount = "5" } = req.body;
      
      if (!url) {
        return res.status(400).json({ message: "YouTube URLが必要です" });
      }

      // Extract subtitles from YouTube video
      const subtitles = await extractYouTubeSubtitles(url);
      
      if (!subtitles.trim()) {
        return res.status(400).json({ message: "動画から字幕を取得できませんでした" });
      }

      // Generate quiz from subtitles
      const quiz = await generateQuizFromText(subtitles, difficulty, title, parseInt(questionCount));
      
      res.json(quiz);
    } catch (error) {
      res.status(500).json({ message: "YouTube処理に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Quiz session management
  app.post("/api/quiz-sessions", async (req, res) => {
    try {
      const sessionData = insertQuizSessionSchema.parse(req.body);
      const session = await storage.createQuizSession(sessionData);
      res.json(session);
    } catch (error) {
      res.status(400).json({ message: "クイズセッション作成に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.post("/api/quiz-sessions/:sessionId/questions", async (req, res) => {
    try {
      const { sessionId } = req.params;
      const questionsData = z.array(insertQuestionSchema).parse(req.body);
      
      const questionsWithSession = questionsData.map(q => ({
        ...q,
        sessionId
      }));
      
      const questions = await storage.createQuestions(questionsWithSession);
      res.json(questions);
    } catch (error) {
      res.status(400).json({ message: "問題作成に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.get("/api/quiz-sessions/:sessionId/questions", async (req, res) => {
    try {
      const questions = await storage.getSessionQuestions(req.params.sessionId);
      res.json(questions);
    } catch (error) {
      res.status(500).json({ message: "問題取得に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.put("/api/questions/:questionId/answer", async (req, res) => {
    try {
      const { userAnswer, timeSpent } = req.body;
      const question = await storage.updateQuestion(req.params.questionId, {
        userAnswer,
        timeSpent
      });
      
      if (!question) {
        return res.status(404).json({ message: "問題が見つかりません" });
      }
      
      res.json(question);
    } catch (error) {
      res.status(400).json({ message: "回答保存に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // User statistics
  app.get("/api/users/:userId/sessions", async (req, res) => {
    try {
      const sessions = await storage.getUserQuizSessions(req.params.userId);
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ message: "セッション履歴取得に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.get("/api/users/:userId/stats", async (req, res) => {
    try {
      const stats = await storage.getUserStats(req.params.userId);
      if (!stats) {
        return res.status(404).json({ message: "統計が見つかりません" });
      }
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "統計取得に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.put("/api/users/:userId/stats", async (req, res) => {
    try {
      const statsData = req.body;
      const stats = await storage.updateUserStats(req.params.userId, statsData);
      res.json(stats);
    } catch (error) {
      res.status(400).json({ message: "統計更新に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Quiz session endpoints
  app.post("/api/quiz-sessions", async (req, res) => {
    try {
      const sessionData = insertQuizSessionSchema.parse(req.body);
      const session = await storage.createQuizSession(sessionData);
      res.json(session);
    } catch (error) {
      res.status(400).json({ message: "クイズセッション作成に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.post("/api/quiz-sessions/:sessionId/questions", async (req, res) => {
    try {
      const questions = req.body.map((q: any) => insertQuestionSchema.parse({
        ...q,
        sessionId: req.params.sessionId
      }));
      const createdQuestions = await storage.createQuestions(questions);
      res.json(createdQuestions);
    } catch (error) {
      res.status(400).json({ message: "質問作成に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.get("/api/users/:userId/sessions", async (req, res) => {
    try {
      const sessions = await storage.getUserQuizSessions(req.params.userId);
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ message: "セッション取得に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.get("/api/users/:userId/stats", async (req, res) => {
    try {
      const stats = await storage.getUserStats(req.params.userId);
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "統計取得に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Submit quiz results
  app.post("/api/quiz-results", async (req, res) => {
    try {
      const { userId, quizData, results } = req.body;
      
      // Create quiz session
      const sessionData = {
        userId,
        title: quizData.title,
        difficulty: quizData.difficulty,
        contentType: quizData.contentType || "text",
        score: results.score,
        totalQuestions: results.totalQuestions,
        timeSpent: results.totalTimeSpent,
      };
      
      const session = await storage.createQuizSession(sessionData);
      
      // Create questions with user answers
      const questionsData = results.detailedResults.map((result: any) => ({
        sessionId: session.id,
        questionText: result.question,
        options: quizData.questions.find((q: any) => q.question === result.question)?.options || [],
        correctAnswer: result.correctAnswer,
        explanation: result.explanation,
        userAnswer: result.userAnswer,
        timeSpent: result.timeSpent,
      }));
      
      await storage.createQuestions(questionsData);
      
      res.json({ sessionId: session.id, message: "結果を保存しました" });
    } catch (error) {
      res.status(400).json({ message: "結果保存に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
