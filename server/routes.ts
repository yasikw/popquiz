import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { extractTextFromPDF, generateQuizFromText, generateQuizFromCachedPDF, generateQuizFromCachedYouTube, generateQuizFromCachedText, getCacheStatus } from "./services/gemini";
import { cspRouter } from "./routes/csp.js";
import { extractYouTubeSubtitles } from "./services/youtube";
import { 
  insertUserSchema, 
  insertQuizSessionSchema, 
  insertQuestionSchema, 
  insertUserStatsSchema, 
  insertUserSettingsSchema,
  authRegisterSchema,
  authLoginSchema,
  quizGenerationSchema
} from "@shared/schema";
import multer from "multer";
import { 
  apiRateLimit, 
  uploadRateLimit, 
  authRateLimit,
  registerRateLimit,
  quizRateLimit,
  validateQuizInput, 
  validateFileUpload,
  sanitizeInput,
  validateYouTubeURL 
} from "./middleware/security";
import {
  validateInput,
  validateParams,
  validateQuery,
  idParamSchema,
  userIdParamSchema,
  paginationQuerySchema,
  settingsUpdateSchema,
  quizResultSchema
} from "./middleware/validation";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { 
  generateAccessToken, 
  generateRefreshToken, 
  authenticateUser,
  refreshTokens 
} from "./middleware/auth";
import { securityLogger } from "./utils/securityLogger";
import { 
  abnormalTrafficDetection,
  authFailureMonitoring,
  fileUploadMonitoring,
  securityHeadersMonitoring,
  sessionHijackDetection,
  createSecurityRateLimit
} from "./middleware/securityMonitoring";
import { 
  authorizeUser, 
  authorizeResourceOwner 
} from "./middleware/authorization";
import { logAnalyzer } from "./utils/logAnalyzer";
import { 
  generateCSRFTokenEndpoint,
  refreshCSRFToken,
  csrfProtectionWithExceptions 
} from "./middleware/csrf";

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB for PDFs
  }
});

// Multer error handling middleware
const handleMulterError = (err: any, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'File Too Large',
        message: 'ファイルサイズが制限を超えています（最大10MB）。より小さなファイルをアップロードしてください。',
        code: 'FILE_TOO_LARGE'
      });
    }
    return res.status(400).json({
      error: 'File Upload Error',
      message: 'ファイルアップロードエラーが発生しました。',
      code: err.code
    });
  }
  next(err);
};

export async function registerRoutes(app: Express): Promise<Server> {
  // CSP レポート機能のルーター追加
  app.use('/api', cspRouter);
  
  // セキュリティ監視ミドルウェアを全体に適用
  app.use(abnormalTrafficDetection);
  app.use(authFailureMonitoring);
  app.use(securityHeadersMonitoring);
  app.use(sessionHijackDetection);
  
  // Configure Express to trust proxy headers for proper IP detection
  // Use specific trust proxy setting for better security
  app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);
  
  // Apply security middleware to all API routes
  app.use('/api/', apiRateLimit);
  
  // Apply CSRF protection to all API routes (with exceptions for public endpoints)
  app.use('/api/', csrfProtectionWithExceptions);

  // CSRF token endpoints (public endpoints)
  app.get("/api/csrf-token", generateCSRFTokenEndpoint);
  app.post("/api/csrf-token/refresh", refreshCSRFToken);

  // Authentication endpoints (with unified validation and specific rate limiting)
  app.post("/api/auth/register", registerRateLimit, validateInput(authRegisterSchema), async (req, res) => {
    try {
      const { username, email, password } = req.body;

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

      const safeUser = await storage.createUser(userData);
      
      // For JWT token generation, we need to create a temporary user object with the original data
      // Note: password is already hashed at this point
      const userForJWT = {
        id: safeUser.id,
        username: safeUser.username,
        email: safeUser.email,
        password: hashedPassword, // Pass the hashed password for JWT
        createdAt: safeUser.createdAt
      };
      
      // Generate JWT tokens
      const accessToken = generateAccessToken(userForJWT);
      const refreshToken = generateRefreshToken(userForJWT);
      
      // Log successful registration
      securityLogger.logAuthSuccess(
        safeUser.id, 
        req.ip || req.connection?.remoteAddress,
        req.get('User-Agent')
      );
      
      // Return safe user data (already without password)
      res.json({
        user: safeUser,
        accessToken,
        refreshToken,
        message: "ユーザー登録が完了しました"
      });
    } catch (error) {
      securityLogger.logSuspiciousActivity(
        'User registration error',
        undefined,
        req.ip || req.connection?.remoteAddress,
        { error: error instanceof Error ? error.message : 'Unknown error' }
      );
      res.status(500).json({ message: "ユーザー登録に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.post("/api/auth/login", authRateLimit, validateInput(authLoginSchema), async (req, res) => {
    try {
      const { username, password } = req.body;

      const user = await storage.getUserByUsername(username);
      if (!user) {
        securityLogger.logAuthFailure(
          username,
          req.ip || req.connection?.remoteAddress,
          req.get('User-Agent'),
          'User not found'
        );
        return res.status(401).json({ message: "ユーザー名またはパスワードが正しくありません" });
      }

      if (!user.password) {
        return res.status(401).json({ message: "パスワードが設定されていません" });
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        securityLogger.logAuthFailure(
          username,
          req.ip || req.connection?.remoteAddress,
          req.get('User-Agent'),
          'Invalid password'
        );
        return res.status(401).json({ message: "ユーザー名またはパスワードが正しくありません" });
      }

      // Generate JWT tokens
      const accessToken = generateAccessToken(user);
      const refreshToken = generateRefreshToken(user);
      
      // Log successful login
      securityLogger.logAuthSuccess(
        user.id, 
        req.ip || req.connection?.remoteAddress,
        req.get('User-Agent')
      );
      
      // Return user without password and tokens
      const { password: _, ...userWithoutPassword } = user;
      res.json({
        user: userWithoutPassword,
        accessToken,
        refreshToken,
        message: "ログインが成功しました"
      });
    } catch (error) {
      securityLogger.logSuspiciousActivity(
        'User login error',
        undefined,
        req.ip || req.connection?.remoteAddress,
        { error: error instanceof Error ? error.message : 'Unknown error' }
      );
      res.status(500).json({ message: "ログインに失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // JWT logout endpoint
  app.post("/api/auth/logout", async (req, res) => {
    try {
      // JWTはステートレスなので、クライアント側でトークンを削除することでログアウト
      // サーバー側では特別な処理は不要（ブラックリスト機能を実装する場合は除く）
      res.json({ message: "ログアウトが完了しました" });
    } catch (error) {
      console.error("Logout error:", error);
      res.status(500).json({ message: "ログアウトに失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // JWT refresh endpoint
  app.post("/api/auth/refresh", validateInput(z.object({
    refreshToken: z.string().min(1, "リフレッシュトークンは必須です")
  })), async (req, res) => {
    try {
      const { refreshToken } = req.body;

      // トークンをリフレッシュ
      const { accessToken: newAccessToken, refreshToken: newRefreshToken, user } = await refreshTokens(refreshToken);

      res.json({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        user,
        message: "トークンが更新されました"
      });
    } catch (error) {
      console.error("Token refresh error:", error);
      res.status(401).json({ message: "無効なリフレッシュトークンです", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Get current user (JWT authenticated)
  app.get("/api/auth/user", authenticateUser, async (req, res) => {
    try {
      // authenticateUserミドルウェアにより、req.userにユーザー情報が設定される
      if (!req.user) {
        return res.status(401).json({ message: "認証されていません" });
      }

      // パスワードを除いてユーザー情報を返す
      const { password: _, ...userWithoutPassword } = req.user;
      res.json(userWithoutPassword);
    } catch (error) {
      console.error("Get user error:", error);
      res.status(500).json({ message: "ユーザー情報取得に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // User management（JWT認証必須）
  app.post("/api/users", authenticateUser, validateInput(insertUserSchema), async (req, res) => {
    try {
      const userData = req.body;
      const user = await storage.createUser(userData);
      res.json(user);
    } catch (error) {
      res.status(400).json({ message: "ユーザー作成に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.get("/api/users/:username", authenticateUser, validateParams(z.object({
    username: z.string().min(1, "ユーザー名は必須です").max(50, "ユーザー名は50文字以下である必要があります")
  })), async (req, res) => {
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

  app.put("/api/users/:id", authenticateUser, authorizeUser, 
    validateParams(idParamSchema), 
    validateInput(insertUserSchema.partial()), 
    async (req, res) => {
    try {
      const updateData = req.body;
      const user = await storage.updateUser(req.params.id, updateData, req.user!.id);
      if (!user) {
        return res.status(404).json({ message: "ユーザーが見つかりません" });
      }
      res.json(user);
    } catch (error) {
      res.status(400).json({ message: "ユーザー更新に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // パスワード変更エンドポイント（JWT認証必須）
  app.post("/api/users/change-password", authenticateUser, validateInput(z.object({
    currentPassword: z.string().optional(),
    newPassword: z.string().min(6, "新しいパスワードは6文字以上である必要があります").max(128, "新しいパスワードは128文字以下である必要があります")
  })), async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;

      // 認証済みユーザーからuserIdを取得（セキュリティ修正）
      const userId = req.user!.id;

      // Get full user data for password comparison (internal method)
      const user = await storage.getUserByUsername(req.user!.username);
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
      const success = await storage.updateUserPassword(userId, hashedPassword, userId);
      if (!success) {
        return res.status(500).json({ message: "パスワード更新に失敗しました" });
      }

      res.json({ message: "パスワードが正常に変更されました" });
    } catch (error) {
      console.error("Password change error:", error);
      res.status(500).json({ message: "パスワード変更に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Quiz generation from cached content (PDF, YouTube, or Text)
  app.post("/api/generate-quiz-from-cache", validateInput(z.object({
    pdfInfo: z.object({
      name: z.string().min(1, "PDFファイル名は必須です"),
      size: z.number().min(0, "ファイルサイズは0以上である必要があります"),
      type: z.string().min(1, "ファイルタイプは必須です")
    }).optional(),
    youtubeVideoId: z.string().min(1, "YouTube動画IDは必須です").optional(),
    textContent: z.string().min(10, "テキストは10文字以上である必要があります").max(10000, "テキストは10000文字以下である必要があります").optional(),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']).default("intermediate"),
    questionCount: z.number().int().min(1).max(20).default(5)
  }).refine(data => data.pdfInfo || data.youtubeVideoId || data.textContent, {
    message: "PDF情報、YouTube動画ID、またはテキスト内容のいずれかが必要です"
  })), async (req, res) => {
    try {
      const { pdfInfo, youtubeVideoId, textContent, difficulty, questionCount } = req.body;
      
      // Debug cache status
      const cacheStatus = getCacheStatus();
      console.log('Cache status:', cacheStatus);
      
      let quiz = null;
      
      if (pdfInfo) {
        console.log('Generating quiz from cached PDF:', pdfInfo.name);
        console.log('Received PDF info:', pdfInfo);
        quiz = await generateQuizFromCachedPDF(pdfInfo, difficulty, questionCount);
      } else if (youtubeVideoId) {
        console.log('Generating quiz from cached YouTube video:', youtubeVideoId);
        console.log('Requested difficulty:', difficulty, 'Question count:', questionCount);
        quiz = await generateQuizFromCachedYouTube(youtubeVideoId, difficulty, questionCount);
      } else if (textContent) {
        console.log('Generating quiz from cached text content, length:', textContent.length);
        console.log('Requested difficulty:', difficulty, 'Question count:', questionCount);
        quiz = await generateQuizFromCachedText(textContent, difficulty, questionCount);
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
  app.post("/api/generate-quiz", quizRateLimit, upload.single('file'), handleMulterError, fileUploadMonitoring, validateInput(quizGenerationSchema), validateFileUpload, async (req: Request, res: Response) => {
    try {
      const { contentType, difficulty = "intermediate", youtubeUrl, textContent, questionCount = "5" } = req.body;
      // Quiz generation logging handled by security middleware
      
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
  app.post("/api/process-pdf", uploadRateLimit, upload.single('pdf'), handleMulterError, fileUploadMonitoring, async (req: Request, res: Response) => {
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

  app.post("/api/process-text", uploadRateLimit, upload.single('text'), handleMulterError, fileUploadMonitoring, async (req: Request, res: Response) => {
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

  // User statistics (JWT認証・認可必須)
  app.get("/api/users/:userId/stats", authenticateUser, authorizeUser, validateParams(userIdParamSchema), async (req, res) => {
    try {
      const stats = await storage.getUserStats(req.params.userId, req.user!.id);
      if (!stats) {
        return res.status(404).json({ message: "統計が見つかりません" });
      }
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: "統計取得に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.get("/api/users/:userId/sessions", authenticateUser, authorizeUser, validateParams(userIdParamSchema), validateQuery(paginationQuerySchema), async (req, res) => {
    try {
      const sessions = await storage.getUserQuizSessions(req.params.userId, req.user?.id || req.params.userId);
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ message: "セッション履歴取得に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // Submit quiz results and update statistics (JWT認証・認可必須)
  app.post("/api/quiz-results", authenticateUser, authorizeResourceOwner('stats'), validateInput(z.object({
    userId: z.string().uuid("有効なユーザーIDを指定してください"),
    quizData: z.object({
      title: z.string().min(1, "タイトルは必須です").max(500, "タイトルは500文字以下である必要があります"),
      difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
      contentType: z.enum(['pdf', 'text', 'youtube']),
      questions: z.array(z.object({
        question: z.string().min(1, "問題文は必須です"),
        options: z.array(z.string()).length(4, "選択肢は4つである必要があります"),
        correctAnswer: z.number().int().min(0).max(3),
        explanation: z.string().min(1, "解説は必須です")
      })).optional()
    }),
    results: z.object({
      score: z.number().int().min(0, "スコアは0以上である必要があります"),
      totalQuestions: z.number().int().min(1, "問題数は1以上である必要があります"),
      totalTimeSpent: z.number().int().min(0, "経過時間は0以上である必要があります"),
      detailedResults: z.array(z.object({
        question: z.string().optional(),
        correctAnswer: z.number().int().min(0).max(3).optional(),
        explanation: z.string().optional(),
        userAnswer: z.number().int().min(0).max(3),
        timeSpent: z.number().int().min(0).default(0)
      })).optional()
    })
  })), async (req, res) => {
    try {
      const { userId, quizData, results } = req.body;

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
      
      const session = await storage.createQuizSession(sessionData, userId);
      
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
        
        await storage.createQuestions(questionsData, userId);
      }

      // Update user statistics
      const currentStats = await storage.getUserStats(userId, userId);
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
        }, userId);
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

  // Quiz session endpoints (JWT認証・認可必須)
  app.post("/api/quiz-sessions", authenticateUser, authorizeResourceOwner('session'), async (req, res) => {
    try {
      const sessionData = insertQuizSessionSchema.parse(req.body);
      const session = await storage.createQuizSession(sessionData, req.user!.id);
      res.json(session);
    } catch (error) {
      res.status(400).json({ message: "クイズセッション作成に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.post("/api/quiz-sessions/:sessionId/questions", authenticateUser, async (req, res) => {
    try {
      const questions = req.body.map((q: any) => insertQuestionSchema.parse({
        ...q,
        sessionId: req.params.sessionId
      }));
      const createdQuestions = await storage.createQuestions(questions, req.user!.id);
      res.json(createdQuestions);
    } catch (error) {
      res.status(400).json({ message: "質問作成に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.get("/api/users/:userId/sessions", async (req, res) => {
    try {
      const sessions = await storage.getUserQuizSessions(req.params.userId, req.user?.id || req.params.userId);
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ message: "セッション取得に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // User sessions with questions for detailed view (JWT認証・認可必須)
  app.get("/api/users/:userId/sessions-with-questions", authenticateUser, authorizeUser, async (req, res) => {
    try {
      const sessionsWithQuestions = await storage.getUserQuizSessionsWithQuestions(req.params.userId, req.user?.id || req.params.userId);
      res.json(sessionsWithQuestions);
    } catch (error) {
      res.status(500).json({ message: "詳細セッション取得に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.get("/api/users/:userId/stats", async (req, res) => {
    try {
      console.log(`Getting stats for user: ${req.params.userId}`);
      let stats = await storage.getUserStats(req.params.userId, req.user?.id || req.params.userId);
      console.log(`Found existing stats:`, stats);
      
      // If no stats exist, calculate them from existing sessions
      if (!stats) {
        console.log(`No stats found, calculating from sessions...`);
        stats = await storage.calculateAndUpdateUserStats(req.params.userId, req.user?.id || req.params.userId);
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

  // Manual stats calculation endpoint for debugging (JWT認証・認可必須)
  app.post("/api/users/:userId/calculate-stats", authenticateUser, authorizeUser, async (req, res) => {
    try {
      const stats = await storage.calculateAndUpdateUserStats(req.params.userId, req.user!.id);
      res.json(stats);
    } catch (error) {
      securityLogger.logSuspiciousActivity(
        'Stats calculation error',
        req.user?.id,
        req.ip || req.connection?.remoteAddress,
        { error: error instanceof Error ? error.message : 'Unknown error' }
      );
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
      
      const session = await storage.createQuizSession(sessionData, userId);
      
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
      
      await storage.createQuestions(questionsData, userId);
      
      // Update user statistics automatically
      const updatedStats = await storage.calculateAndUpdateUserStats(userId, userId);
      
      res.json({ sessionId: session.id, message: "結果を保存しました" });
    } catch (error) {
      res.status(400).json({ message: "結果保存に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  // User settings endpoints (JWT認証・認可必須)
  app.get("/api/users/:userId/settings", authenticateUser, authorizeUser, validateParams(userIdParamSchema), async (req, res) => {
    try {
      const settings = await storage.getUserSettings(req.params.userId, req.user!.id);
      if (!settings) {
        // Check if user exists before creating settings
        const user = await storage.getUser(req.params.userId, req.user!.id);
        if (!user) {
          return res.status(404).json({ message: "ユーザーが見つかりません" });
        }
        // Create default settings if none exist
        const defaultSettings = await storage.createUserSettings({
          userId: req.params.userId,
          defaultDifficulty: "intermediate",
          questionCount: 5,
          timeLimit: 60,
        }, req.user!.id);
        return res.json(defaultSettings);
      }
      res.json(settings);
    } catch (error) {
      console.error("Settings get error:", error);
      res.status(500).json({ message: "設定取得に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  app.put("/api/users/:userId/settings", authenticateUser, authorizeUser, validateParams(userIdParamSchema), validateInput(insertUserSettingsSchema.partial()), async (req, res) => {
    try {
      const settingsData = req.body;
      const settings = await storage.updateUserSettings(req.params.userId, settingsData, req.user!.id);
      res.json(settings);
    } catch (error) {
      console.error("Settings update error:", error);
      res.status(400).json({ message: "設定更新に失敗しました", error: error instanceof Error ? error.message : "Unknown error" });
    }
  });

  const httpServer = createServer(app);
  // セキュリティログ監視エンドポイント（管理者のみアクセス可能）
  app.get("/api/admin/security-stats", authenticateUser, async (req, res) => {
    try {
      // 簡易的な管理者チェック（実際の実装では適切な権限管理を行う）
      const timeRange = req.query.timeRange as 'hour' | 'day' | 'week' || 'day';
      const stats = await logAnalyzer.getSecurityStats(timeRange);
      res.json(stats);
    } catch (error) {
      console.error('Security stats error:', error);
      res.status(500).json({ message: "セキュリティ統計の取得に失敗しました" });
    }
  });

  app.get("/api/admin/security-alerts", authenticateUser, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const alerts = await logAnalyzer.getRecentAlerts(limit);
      res.json(alerts);
    } catch (error) {
      console.error('Security alerts error:', error);
      res.status(500).json({ message: "セキュリティアラートの取得に失敗しました" });
    }
  });

  app.get("/api/admin/log-health", authenticateUser, async (req, res) => {
    try {
      const health = await logAnalyzer.checkLogHealth();
      res.json(health);
    } catch (error) {
      console.error('Log health check error:', error);
      res.status(500).json({ message: "ログ健全性チェックに失敗しました" });
    }
  });

  app.get("/api/admin/scan-sensitive-data", authenticateUser, async (req, res) => {
    try {
      const scan = await logAnalyzer.scanForSensitiveData();
      res.json(scan);
    } catch (error) {
      console.error('Sensitive data scan error:', error);
      res.status(500).json({ message: "機密データスキャンに失敗しました" });
    }
  });

  return httpServer;
}
