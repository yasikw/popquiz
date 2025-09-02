import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { extractTextFromPDF, generateQuizFromText, generateQuizFromCachedPDF, generateQuizFromCachedYouTube, generateQuizFromCachedText, getCacheStatus } from "./services/gemini";
import { extractYouTubeSubtitles } from "./services/youtube";
import { insertUserSchema, insertQuizSessionSchema, insertQuestionSchema, insertUserStatsSchema, insertUserSettingsSchema } from "@shared/schema";
import multer from "multer";
import { 
  apiRateLimit, 
  uploadRateLimit, 
  validateQuizInput, 
  validateFileUpload,
  sanitizeInput,
  validateYouTubeURL 
} from "./middleware/security";
import { z } from "zod";
import bcrypt from "bcryptjs";

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB for PDFs
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Apply security middleware to all API routes
  app.use('/api/', apiRateLimit);

  // Authentication endpoints (with input sanitization)
  app.post("/api/auth/register", async (req, res) => {
    try {
      let { username, email, password } = req.body;

      // Sanitize inputs
      username = sanitizeInput(username);
      email = email ? sanitizeInput(email) : null;

      if (!username || !password) {
        return res.status(400).json({ message: "ユーザー名とパスワードが必要です" });
      }

      if (password.length < 6) {
        return res.status(400).json({ message: "パスワードは6文字以上である必要があります" });
      }

      // Check if username already exists
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ message: "このユーザー名は既に使用されています" });
      }

      // Hash password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      const userData = {
        username,
        email: email || null,
        password: hashedPassword,
      };

      const user = await storage.createUser(userData);
      
      // Return user without password
      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "ユーザー登録に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      let { username, password } = req.body;

      // Sanitize username input
      username = sanitizeInput(username);

      if (!username || !password) {
        return res.status(400).json({ message: "ユーザー名とパスワードが必要です" });
      }

      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ message: "ユーザー名またはパスワードが正しくありません" });
      }

      if (!user.password) {
        return res.status(401).json({ message: "パスワードが設定されていません" });
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ message: "ユーザー名またはパスワードが正しくありません" });
      }

      // Return user without password
      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "ログインに失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

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
      // Sanitize user inputs before validation
      const sanitizedBody = { ...req.body };
      if (sanitizedBody.username) {
        sanitizedBody.username = sanitizeInput(sanitizedBody.username);
      }
      if (sanitizedBody.email) {
        sanitizedBody.email = sanitizeInput(sanitizedBody.email);
      }
      
      const updateData = insertUserSchema.partial().parse(sanitizedBody);
      const user = await storage.updateUser(req.params.id, updateData);
      if (!user) {
        return res.status(404).json({ message: "ユーザーが見つかりません" });
      }
      res.json(user);
    } catch (error) {
      res.status(400).json({ message: "ユーザー更新に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // パスワード変更エンドポイント
  app.post("/api/users/change-password", async (req, res) => {
    try {
      const { userId, currentPassword, newPassword } = req.body;

      if (!userId || !newPassword) {
        return res.status(400).json({ message: "ユーザーIDと新しいパスワードが必要です" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ message: "新しいパスワードは6文字以上である必要があります" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "ユーザーが見つかりません" });
      }

      // 現在のパスワードが設定されている場合の検証
      if (user.password && currentPassword) {
        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isCurrentPasswordValid) {
          return res.status(400).json({ message: "現在のパスワードが正しくありません" });
        }
      }

      // 新しいパスワードをハッシュ化
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      // パスワードを更新
      const updatedUser = await storage.updateUserPassword(userId, hashedPassword);
      if (!updatedUser) {
        return res.status(500).json({ message: "パスワード更新に失敗しました" });
      }

      res.json({ message: "パスワードが正常に変更されました" });
    } catch (error) {
      console.error("Password change error:", error);
      res.status(500).json({ message: "パスワード変更に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Quiz generation from cached content (PDF, YouTube, or Text)
  app.post("/api/generate-quiz-from-cache", async (req, res) => {
    try {
      let { pdfInfo, youtubeVideoId, textContent, difficulty = "intermediate", questionCount = 5 } = req.body;
      
      // Sanitize inputs
      if (textContent) {
        textContent = sanitizeInput(textContent);
      }
      if (youtubeVideoId) {
        youtubeVideoId = sanitizeInput(youtubeVideoId);
      }
      difficulty = sanitizeInput(difficulty) || "intermediate";
      
      if (!pdfInfo && !youtubeVideoId && !textContent) {
        return res.status(400).json({ message: "PDF情報、YouTube動画ID、またはテキスト内容が必要です" });
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
        console.log('Requested difficulty:', difficulty, 'Question count:', questionCount);
        quiz = await generateQuizFromCachedYouTube(youtubeVideoId, difficulty, parseInt(questionCount));
      } else if (textContent) {
        console.log('Generating quiz from cached text content, length:', textContent.length);
        console.log('Requested difficulty:', difficulty, 'Question count:', questionCount);
        quiz = await generateQuizFromCachedText(textContent, difficulty, parseInt(questionCount));
      }
      
      if (!quiz) {
        console.log('Quiz generation returned null');
        return res.status(404).json({ 
          message: "キャッシュされたコンテンツが見つかりません",
          cacheStatus: cacheStatus
        });
      }
      
      console.log('Quiz generated successfully from cache');
      res.json(quiz);
    } catch (error) {
      console.error('Cached quiz generation error details:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      res.status(500).json({ 
        message: "キャッシュからのクイズ生成に失敗しました", 
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined
      });
    }
  });

  // Unified quiz generation endpoint with security middleware
  app.post("/api/generate-quiz", uploadRateLimit, upload.single('file'), validateQuizInput, validateFileUpload, async (req, res) => {
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
        // textContent is already sanitized by middleware
        title = "テキストクイズ";
        extractedText = textContent;
      } else if (contentType === 'youtube') {
        if (!youtubeUrl) {
          return res.status(400).json({ message: "YouTube URLが必要です" });
        }
        // Sanitization already done by middleware, but double-check URL format
        if (!validateYouTubeURL(youtubeUrl)) {
          return res.status(400).json({ message: "無効なYouTube URLです" });
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

      let { difficulty = "intermediate", title = "PDFクイズ", questionCount = "5" } = req.body;
      
      // Sanitize inputs
      difficulty = sanitizeInput(difficulty) || "intermediate";
      title = sanitizeInput(title) || "PDFクイズ";
      
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

      let { difficulty = "intermediate", title = "テキストクイズ", questionCount = "5" } = req.body;
      
      // Sanitize inputs
      difficulty = sanitizeInput(difficulty) || "intermediate";
      title = sanitizeInput(title) || "テキストクイズ";
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
      let { url, difficulty = "intermediate", title = "YouTube動画クイズ", questionCount = "5" } = req.body;
      
      // Sanitize inputs
      url = sanitizeInput(url);
      difficulty = sanitizeInput(difficulty) || "intermediate";
      title = sanitizeInput(title) || "YouTube動画クイズ";
      
      // Validate YouTube URL
      if (!validateYouTubeURL(url)) {
        return res.status(400).json({ message: "無効なYouTube URLです" });
      }
      
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

  // User statistics
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

  app.get("/api/users/:userId/sessions", async (req, res) => {
    try {
      const sessions = await storage.getUserQuizSessions(req.params.userId);
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ message: "セッション履歴取得に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Submit quiz results and update statistics
  app.post("/api/quiz-results", async (req, res) => {
    try {
      const { userId, quizData, results } = req.body;
      
      if (!userId || !quizData || !results) {
        return res.status(400).json({ message: "必要なデータが不足しています" });
      }

      // Create quiz session
      const sessionData = {
        userId,
        title: quizData.title || "AIクイズ",
        difficulty: quizData.difficulty || "intermediate",
        contentType: quizData.contentType || "text",
        score: results.score || 0,
        totalQuestions: results.totalQuestions || quizData.questions?.length || 0,
        timeSpent: results.totalTimeSpent || 0,
      };
      
      const session = await storage.createQuizSession(sessionData);
      
      // Create questions with user answers if available
      if (quizData.questions && results.detailedResults) {
        const questionsData = results.detailedResults.map((result: any, index: number) => ({
          sessionId: session.id,
          questionText: result.question || quizData.questions[index]?.question || "",
          options: quizData.questions[index]?.options || [],
          correctAnswer: result.correctAnswer ?? quizData.questions[index]?.correctAnswer ?? 0,
          explanation: result.explanation || quizData.questions[index]?.explanation || "",
          userAnswer: result.userAnswer,
          timeSpent: result.timeSpent || 0,
        }));
        
        await storage.createQuestions(questionsData);
      }

      // Update user statistics
      const currentStats = await storage.getUserStats(userId);
      if (currentStats) {
        const accuracy = sessionData.totalQuestions > 0 ? (sessionData.score / sessionData.totalQuestions) : 0;
        const newCompletedQuizzes = currentStats.completedQuizzes + 1;
        const newTotalScore = currentStats.totalScore + sessionData.score;
        const newAverageAccuracy = newCompletedQuizzes > 0 ? 
          ((currentStats.averageAccuracy * currentStats.completedQuizzes) + accuracy) / newCompletedQuizzes : 0;

        // Update difficulty-specific accuracy
        const difficultyAccuracyUpdates: any = {};
        if (sessionData.difficulty === "beginner") {
          difficultyAccuracyUpdates.beginnerAccuracy = accuracy;
        } else if (sessionData.difficulty === "intermediate") {
          difficultyAccuracyUpdates.intermediateAccuracy = accuracy;
        } else if (sessionData.difficulty === "advanced") {
          difficultyAccuracyUpdates.advancedAccuracy = accuracy;
        }

        await storage.updateUserStats(userId, {
          totalScore: newTotalScore,
          completedQuizzes: newCompletedQuizzes,
          averageAccuracy: newAverageAccuracy,
          ...difficultyAccuracyUpdates
        });
      }
      
      res.json({ 
        sessionId: session.id, 
        message: "結果を保存し、統計を更新しました",
        accuracy: sessionData.totalQuestions > 0 ? (sessionData.score / sessionData.totalQuestions) : 0
      });
    } catch (error) {
      console.error("Quiz results submission error:", error);
      res.status(500).json({ 
        message: "結果保存に失敗しました", 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
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

  // User sessions with questions for detailed view
  app.get("/api/users/:userId/sessions-with-questions", async (req, res) => {
    try {
      const sessionsWithQuestions = await storage.getUserQuizSessionsWithQuestions(req.params.userId);
      res.json(sessionsWithQuestions);
    } catch (error) {
      res.status(500).json({ message: "詳細セッション取得に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.get("/api/users/:userId/stats", async (req, res) => {
    try {
      console.log(`Getting stats for user: ${req.params.userId}`);
      let stats = await storage.getUserStats(req.params.userId);
      console.log(`Found existing stats:`, stats);
      
      // If no stats exist, calculate them from existing sessions
      if (!stats) {
        console.log(`No stats found, calculating from sessions...`);
        stats = await storage.calculateAndUpdateUserStats(req.params.userId);
        console.log(`Calculated stats:`, stats);
      }
      
      if (!stats) {
        return res.status(404).json({ message: "統計が見つかりません" });
      }
      
      res.json(stats);
    } catch (error) {
      console.error(`Stats error for user ${req.params.userId}:`, error);
      res.status(500).json({ message: "統計取得に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Manual stats calculation endpoint for debugging
  app.post("/api/users/:userId/calculate-stats", async (req, res) => {
    try {
      console.log(`Manual stats calculation for user: ${req.params.userId}`);
      const stats = await storage.calculateAndUpdateUserStats(req.params.userId);
      console.log(`Manual calculation result:`, stats);
      res.json(stats);
    } catch (error) {
      console.error(`Manual stats calculation error:`, error);
      res.status(500).json({ message: "統計計算に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Submit quiz results (with input sanitization)
  app.post("/api/quiz-results", async (req, res) => {
    try {
      const { userId, quizData, results } = req.body;
      
      // Sanitize quiz data inputs
      const sanitizedQuizData = {
        ...quizData,
        title: sanitizeInput(quizData.title || "クイズ"),
        difficulty: sanitizeInput(quizData.difficulty || "intermediate"),
        contentType: sanitizeInput(quizData.contentType || "text")
      };
      
      // Create quiz session with sanitized data
      const sessionData = {
        userId,
        title: sanitizedQuizData.title,
        difficulty: sanitizedQuizData.difficulty,
        contentType: sanitizedQuizData.contentType,
        score: results.score,
        totalQuestions: results.totalQuestions,
        timeSpent: results.totalTimeSpent,
      };
      
      const session = await storage.createQuizSession(sessionData);
      
      // Create questions with user answers (sanitized)
      const questionsData = results.detailedResults.map((result: any) => ({
        sessionId: session.id,
        questionText: sanitizeInput(result.question || ""),
        options: (quizData.questions.find((q: any) => q.question === result.question)?.options || [])
          .map((option: string) => sanitizeInput(option)),
        correctAnswer: sanitizeInput(result.correctAnswer || ""),
        explanation: sanitizeInput(result.explanation || ""),
        userAnswer: sanitizeInput(result.userAnswer || ""),
        timeSpent: result.timeSpent,
      }));
      
      await storage.createQuestions(questionsData);
      
      // Update user statistics automatically
      console.log(`Updating stats for user: ${userId}`);
      const updatedStats = await storage.calculateAndUpdateUserStats(userId);
      console.log(`Updated stats:`, updatedStats);
      
      res.json({ sessionId: session.id, message: "結果を保存しました" });
    } catch (error) {
      res.status(400).json({ message: "結果保存に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // User settings endpoints
  app.get("/api/users/:userId/settings", async (req, res) => {
    try {
      const settings = await storage.getUserSettings(req.params.userId);
      if (!settings) {
        // Check if user exists before creating settings
        const user = await storage.getUser(req.params.userId);
        if (!user) {
          return res.status(404).json({ message: "ユーザーが見つかりません" });
        }
        // Create default settings if none exist
        const defaultSettings = await storage.createUserSettings({
          userId: req.params.userId,
          defaultDifficulty: "intermediate",
          questionCount: 5,
          timeLimit: 60,
        });
        return res.json(defaultSettings);
      }
      res.json(settings);
    } catch (error) {
      console.error("Settings get error:", error);
      res.status(500).json({ message: "設定取得に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.put("/api/users/:userId/settings", async (req, res) => {
    try {
      const settingsData = insertUserSettingsSchema.partial().parse(req.body);
      const settings = await storage.updateUserSettings(req.params.userId, settingsData);
      res.json(settings);
    } catch (error) {
      console.error("Settings update error:", error);
      res.status(400).json({ message: "設定更新に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
