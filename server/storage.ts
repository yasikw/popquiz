import { type User, type SafeUser, type InsertUser, type QuizSession, type InsertQuizSession, type Question, type InsertQuestion, type UserStats, type InsertUserStats, type UserSettings, type InsertUserSettings, users, userSettings, quizSessions, questions, userStats } from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";

// Authorization error class
export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

// Parameter validation schemas
const userIdSchema = z.string().uuid("無効なユーザーIDです");
const sessionIdSchema = z.string().uuid("無効なセッションIDです");
const questionIdSchema = z.string().uuid("無効な問題IDです");
const usernameSchema = z.string().min(3).max(50);

// Validation helper
function validateParam<T>(schema: z.ZodSchema<T>, value: unknown, paramName: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`Invalid ${paramName}: ${result.error.issues[0]?.message || 'Validation failed'}`);
  }
  return result.data;
}

// Logging helper for security-sensitive operations
function securityLog(operation: string, requestingUserId: string, targetUserId?: string, success: boolean = true) {
  const logData = {
    timestamp: new Date().toISOString(),
    operation,
    requestingUserId,
    targetUserId,
    success
  };
  
  if (success) {
    console.log(`[SECURITY] ${operation}:`, logData);
  } else {
    console.warn(`[SECURITY VIOLATION] ${operation}:`, logData);
  }
}

export interface IStorage {
  // User operations (secure - return SafeUser without password)
  getUser(id: string, requestingUserId: string): Promise<SafeUser | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>; // Internal use only for authentication
  getSafeUserByUsername(username: string, requestingUserId: string): Promise<SafeUser | undefined>;
  createUser(user: InsertUser): Promise<SafeUser>; // Returns safe user data
  updateUser(id: string, user: Partial<InsertUser>, requestingUserId: string): Promise<SafeUser | undefined>;
  updateUserPassword(id: string, hashedPassword: string, requestingUserId: string): Promise<boolean>;

  // Quiz session operations (with authorization)
  createQuizSession(session: InsertQuizSession, requestingUserId: string): Promise<QuizSession>;
  getQuizSession(id: string, requestingUserId: string): Promise<QuizSession | undefined>;
  getUserQuizSessions(userId: string, requestingUserId: string): Promise<QuizSession[]>;
  getUserSessions(userId: string, requestingUserId: string): Promise<QuizSession[]>;
  getUserQuizSessionsWithQuestions(userId: string, requestingUserId: string): Promise<(QuizSession & { questions: Question[] })[]>;

  // Question operations (with authorization)
  createQuestions(questions: InsertQuestion[], requestingUserId: string): Promise<Question[]>;
  getSessionQuestions(sessionId: string, requestingUserId: string): Promise<Question[]>;
  updateQuestion(id: string, question: Partial<InsertQuestion>, requestingUserId: string): Promise<Question | undefined>;

  // User stats operations (with authorization)
  getUserStats(userId: string, requestingUserId: string): Promise<UserStats | undefined>;
  updateUserStats(userId: string, stats: Partial<InsertUserStats>, requestingUserId: string): Promise<UserStats>;
  calculateAndUpdateUserStats(userId: string, requestingUserId: string): Promise<UserStats>;

  // User settings operations (with authorization)
  getUserSettings(userId: string, requestingUserId: string): Promise<UserSettings | undefined>;
  updateUserSettings(userId: string, settings: Partial<InsertUserSettings>, requestingUserId: string): Promise<UserSettings>;
  createUserSettings(settings: InsertUserSettings, requestingUserId: string): Promise<UserSettings>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private quizSessions: Map<string, QuizSession>;
  private questions: Map<string, Question>;
  private userStats: Map<string, UserStats>;
  private userSettings: Map<string, UserSettings>;

  constructor() {
    this.users = new Map();
    this.quizSessions = new Map();
    this.questions = new Map();
    this.userStats = new Map();
    this.userSettings = new Map();
  }

  async getUser(id: string, requestingUserId: string): Promise<SafeUser | undefined> {
    validateParam(userIdSchema, id, "user ID");
    validateParam(userIdSchema, requestingUserId, "requesting user ID");
    
    // Authorization: users can only access their own data
    if (id !== requestingUserId) {
      securityLog("getUser", requestingUserId, id, false);
      throw new AuthorizationError("ユーザーは自分のデータのみアクセス可能です");
    }
    
    const user = this.users.get(id);
    if (user) {
      securityLog("getUser", requestingUserId, id, true);
      // Return user without password
      const { password, ...safeUser } = user;
      return safeUser;
    }
    return undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    validateParam(usernameSchema, username, "username");
    // Internal method for authentication - returns full user with password
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async getSafeUserByUsername(username: string, requestingUserId: string): Promise<SafeUser | undefined> {
    validateParam(usernameSchema, username, "username");
    validateParam(userIdSchema, requestingUserId, "requesting user ID");
    
    const user = Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
    
    if (user) {
      // Authorization: users can only access their own data
      if (user.id !== requestingUserId) {
        securityLog("getSafeUserByUsername", requestingUserId, user.id, false);
        throw new AuthorizationError("ユーザーは自分のデータのみアクセス可能です");
      }
      
      securityLog("getSafeUserByUsername", requestingUserId, user.id, true);
      const { password, ...safeUser } = user;
      return safeUser;
    }
    return undefined;
  }

  async createUser(insertUser: InsertUser): Promise<SafeUser> {
    try {
      const id = randomUUID();
      const user: User = { 
        id,
        username: insertUser.username,
        email: insertUser.email || null,
        password: insertUser.password,
        createdAt: new Date()
      };
      this.users.set(id, user);

      // Initialize user stats
      const statsId = randomUUID();
      const stats: UserStats = {
        id: statsId,
        userId: id,
        totalScore: 0,
        completedQuizzes: 0,
        averageAccuracy: 0,
        beginnerAccuracy: 0,
        intermediateAccuracy: 0,
        advancedAccuracy: 0,
      };
      this.userStats.set(id, stats);

      securityLog("createUser", id, id, true);
      
      // Return user without password
      const { password, ...safeUser } = user;
      return safeUser;
    } catch (error) {
      console.error("[STORAGE ERROR] Failed to create user:", error);
      throw new Error("ユーザーの作成に失敗しました");
    }
  }

  async updateUser(id: string, updateData: Partial<InsertUser>, requestingUserId: string): Promise<SafeUser | undefined> {
    validateParam(userIdSchema, id, "user ID");
    validateParam(userIdSchema, requestingUserId, "requesting user ID");
    
    // Authorization: users can only update their own data
    if (id !== requestingUserId) {
      securityLog("updateUser", requestingUserId, id, false);
      throw new AuthorizationError("ユーザーは自分のデータのみ更新可能です");
    }
    
    try {
      const user = this.users.get(id);
      if (!user) return undefined;

      const updatedUser = { ...user, ...updateData };
      this.users.set(id, updatedUser);
      
      securityLog("updateUser", requestingUserId, id, true);
      
      // Return user without password
      const { password, ...safeUser } = updatedUser;
      return safeUser;
    } catch (error) {
      console.error("[STORAGE ERROR] Failed to update user:", error);
      throw new Error("ユーザーの更新に失敗しました");
    }
  }

  async updateUserPassword(id: string, hashedPassword: string, requestingUserId: string): Promise<boolean> {
    validateParam(userIdSchema, id, "user ID");
    validateParam(userIdSchema, requestingUserId, "requesting user ID");
    
    // Authorization: users can only update their own password
    if (id !== requestingUserId) {
      securityLog("updateUserPassword", requestingUserId, id, false);
      throw new AuthorizationError("ユーザーは自分のパスワードのみ更新可能です");
    }
    
    try {
      const user = this.users.get(id);
      if (!user) return false;

      const updatedUser = { ...user, password: hashedPassword };
      this.users.set(id, updatedUser);
      
      securityLog("updateUserPassword", requestingUserId, id, true);
      return true;
    } catch (error) {
      console.error("[STORAGE ERROR] Failed to update password:", error);
      throw new Error("パスワードの更新に失敗しました");
    }
  }

  async createQuizSession(insertSession: InsertQuizSession, requestingUserId: string): Promise<QuizSession> {
    validateParam(userIdSchema, requestingUserId, "requesting user ID");
    
    // Authorization: users can only create sessions for themselves
    if (insertSession.userId !== requestingUserId) {
      securityLog("createQuizSession", requestingUserId, insertSession.userId, false);
      throw new AuthorizationError("ユーザーは自分のセッションのみ作成可能です");
    }
    
    try {
      const id = randomUUID();
      const session: QuizSession = {
        ...insertSession,
        id,
        completedAt: new Date(),
      };
      this.quizSessions.set(id, session);
      
      securityLog("createQuizSession", requestingUserId, insertSession.userId, true);
      return session;
    } catch (error) {
      console.error("[STORAGE ERROR] Failed to create quiz session:", error);
      throw new Error("クイズセッションの作成に失敗しました");
    }
  }

  async getQuizSession(id: string, requestingUserId: string): Promise<QuizSession | undefined> {
    validateParam(sessionIdSchema, id, "session ID");
    validateParam(userIdSchema, requestingUserId, "requesting user ID");
    
    try {
      const session = this.quizSessions.get(id);
      if (!session) return undefined;
      
      // Authorization: users can only access their own sessions
      if (session.userId !== requestingUserId) {
        securityLog("getQuizSession", requestingUserId, session.userId, false);
        throw new AuthorizationError("ユーザーは自分のセッションのみアクセス可能です");
      }
      
      securityLog("getQuizSession", requestingUserId, session.userId, true);
      return session;
    } catch (error) {
      if (error instanceof AuthorizationError) {
        throw error;
      }
      console.error("[STORAGE ERROR] Failed to get quiz session:", error);
      throw new Error("クイズセッションの取得に失敗しました");
    }
  }

  async getUserQuizSessions(userId: string, requestingUserId: string): Promise<QuizSession[]> {
    validateParam(userIdSchema, userId, "user ID");
    validateParam(userIdSchema, requestingUserId, "requesting user ID");
    
    // Authorization: users can only access their own sessions
    if (userId !== requestingUserId) {
      securityLog("getUserQuizSessions", requestingUserId, userId, false);
      throw new AuthorizationError("ユーザーは自分のセッションのみアクセス可能です");
    }
    
    try {
      const sessions = Array.from(this.quizSessions.values())
        .filter(session => session.userId === userId)
        .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());
      
      securityLog("getUserQuizSessions", requestingUserId, userId, true);
      return sessions;
    } catch (error) {
      console.error("[STORAGE ERROR] Failed to get user quiz sessions:", error);
      throw new Error("ユーザーセッションの取得に失敗しました");
    }
  }

  async getUserQuizSessionsWithQuestions(userId: string, requestingUserId: string): Promise<(QuizSession & { questions: Question[] })[]> {
    const sessions = await this.getUserQuizSessions(userId, requestingUserId);
    return sessions.map(session => ({
      ...session,
      questions: Array.from(this.questions.values())
        .filter(question => question.sessionId === session.id)
    }));
  }

  async getUserSessions(userId: string, requestingUserId: string): Promise<QuizSession[]> {
    return this.getUserQuizSessions(userId, requestingUserId);
  }

  async createQuestions(insertQuestions: InsertQuestion[], requestingUserId: string): Promise<Question[]> {
    validateParam(userIdSchema, requestingUserId, "requesting user ID");
    
    try {
      // Verify session ownership for authorization
      if (insertQuestions.length > 0) {
        const session = this.quizSessions.get(insertQuestions[0].sessionId);
        if (!session || session.userId !== requestingUserId) {
          securityLog("createQuestions", requestingUserId, session?.userId, false);
          throw new AuthorizationError("ユーザーは自分のセッションの問題のみ作成可能です");
        }
      }
      
      const questions: Question[] = insertQuestions.map(q => ({
        id: randomUUID(),
        sessionId: q.sessionId,
        questionText: q.questionText,
        options: Array.isArray(q.options) ? [...q.options] : [],
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        userAnswer: q.userAnswer || null,
        timeSpent: q.timeSpent || null,
      }));

      questions.forEach(q => this.questions.set(q.id, q));
      
      securityLog("createQuestions", requestingUserId, undefined, true);
      return questions;
    } catch (error) {
      if (error instanceof AuthorizationError) {
        throw error;
      }
      console.error("[STORAGE ERROR] Failed to create questions:", error);
      throw new Error("問題の作成に失敗しました");
    }
  }

  async getSessionQuestions(sessionId: string, requestingUserId: string): Promise<Question[]> {
    validateParam(sessionIdSchema, sessionId, "session ID");
    validateParam(userIdSchema, requestingUserId, "requesting user ID");
    
    try {
      // Verify session ownership
      const session = this.quizSessions.get(sessionId);
      if (!session || session.userId !== requestingUserId) {
        securityLog("getSessionQuestions", requestingUserId, session?.userId, false);
        throw new AuthorizationError("ユーザーは自分のセッションの問題のみアクセス可能です");
      }
      
      const questions = Array.from(this.questions.values()).filter(q => q.sessionId === sessionId);
      securityLog("getSessionQuestions", requestingUserId, session.userId, true);
      return questions;
    } catch (error) {
      if (error instanceof AuthorizationError) {
        throw error;
      }
      console.error("[STORAGE ERROR] Failed to get session questions:", error);
      throw new Error("セッション問題の取得に失敗しました");
    }
  }

  async updateQuestion(id: string, updateData: Partial<InsertQuestion>, requestingUserId: string): Promise<Question | undefined> {
    validateParam(questionIdSchema, id, "question ID");
    validateParam(userIdSchema, requestingUserId, "requesting user ID");
    
    try {
      const question = this.questions.get(id);
      if (!question) return undefined;
      
      // Verify session ownership
      const session = this.quizSessions.get(question.sessionId);
      if (!session || session.userId !== requestingUserId) {
        securityLog("updateQuestion", requestingUserId, session?.userId, false);
        throw new AuthorizationError("ユーザーは自分のセッションの問題のみ更新可能です");
      }

      const updatedQuestion: Question = { 
        ...question, 
        ...updateData,
        options: updateData.options && Array.isArray(updateData.options) ? [...updateData.options] : question.options
      };
      this.questions.set(id, updatedQuestion);
      
      securityLog("updateQuestion", requestingUserId, session.userId, true);
      return updatedQuestion;
    } catch (error) {
      if (error instanceof AuthorizationError) {
        throw error;
      }
      console.error("[STORAGE ERROR] Failed to update question:", error);
      throw new Error("問題の更新に失敗しました");
    }
  }

  async getUserStats(userId: string, requestingUserId: string): Promise<UserStats | undefined> {
    validateParam(userIdSchema, userId, "user ID");
    validateParam(userIdSchema, requestingUserId, "requesting user ID");
    
    // Authorization: users can only access their own stats
    if (userId !== requestingUserId) {
      securityLog("getUserStats", requestingUserId, userId, false);
      throw new AuthorizationError("ユーザーは自分の統計のみアクセス可能です");
    }
    
    try {
      const stats = this.userStats.get(userId);
      securityLog("getUserStats", requestingUserId, userId, true);
      return stats;
    } catch (error) {
      console.error("[STORAGE ERROR] Failed to get user stats:", error);
      throw new Error("ユーザー統計の取得に失敗しました");
    }
  }

  async updateUserStats(userId: string, updateData: Partial<InsertUserStats>, requestingUserId: string): Promise<UserStats> {
    validateParam(userIdSchema, userId, "user ID");
    validateParam(userIdSchema, requestingUserId, "requesting user ID");
    
    // Authorization: users can only update their own stats
    if (userId !== requestingUserId) {
      securityLog("updateUserStats", requestingUserId, userId, false);
      throw new AuthorizationError("ユーザーは自分の統計のみ更新可能です");
    }
    
    try {
      const existing = this.userStats.get(userId);
      if (!existing) {
        const id = randomUUID();
        const stats: UserStats = {
          id,
          userId,
          totalScore: 0,
          completedQuizzes: 0,
          averageAccuracy: 0,
          beginnerAccuracy: 0,
          intermediateAccuracy: 0,
          advancedAccuracy: 0,
          ...updateData,
        };
        this.userStats.set(userId, stats);
        securityLog("updateUserStats", requestingUserId, userId, true);
        return stats;
      }

      const updated = { ...existing, ...updateData };
      this.userStats.set(userId, updated);
      securityLog("updateUserStats", requestingUserId, userId, true);
      return updated;
    } catch (error) {
      console.error("[STORAGE ERROR] Failed to update user stats:", error);
      throw new Error("ユーザー統計の更新に失敗しました");
    }
  }

  async calculateAndUpdateUserStats(userId: string, requestingUserId: string): Promise<UserStats> {
    validateParam(userIdSchema, userId, "user ID");
    validateParam(userIdSchema, requestingUserId, "requesting user ID");
    
    // Authorization: users can only calculate their own stats
    if (userId !== requestingUserId) {
      securityLog("calculateAndUpdateUserStats", requestingUserId, userId, false);
      throw new AuthorizationError("ユーザーは自分の統計のみ計算可能です");
    }
    
    try {
      const sessions = await this.getUserQuizSessions(userId, requestingUserId);
      
      if (sessions.length === 0) {
        return this.updateUserStats(userId, {
          totalScore: 0,
          completedQuizzes: 0,
          averageAccuracy: 0,
          beginnerAccuracy: 0,
          intermediateAccuracy: 0,
          advancedAccuracy: 0,
        }, requestingUserId);
      }

      const totalScore = sessions.reduce((sum, session) => sum + session.score, 0);
      const completedQuizzes = sessions.length;
      
      const difficultyGroups = {
        beginner: sessions.filter(s => s.difficulty === 'beginner'),
        intermediate: sessions.filter(s => s.difficulty === 'intermediate'),
        advanced: sessions.filter(s => s.difficulty === 'advanced'),
      };

      const calculateAccuracy = (sessionsGroup: QuizSession[]) => {
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

      const statsData = {
        totalScore,
        completedQuizzes,
        averageAccuracy: Math.round(overallAccuracy),
        beginnerAccuracy,
        intermediateAccuracy,
        advancedAccuracy,
      };
      
      securityLog("calculateAndUpdateUserStats", requestingUserId, userId, true);
      return this.updateUserStats(userId, statsData, requestingUserId);
    } catch (error) {
      if (error instanceof AuthorizationError) {
        throw error;
      }
      console.error("[STORAGE ERROR] Failed to calculate user stats:", error);
      throw new Error("ユーザー統計の計算に失敗しました");
    }
  }

  // User settings operations for MemStorage
  async getUserSettings(userId: string, requestingUserId: string): Promise<UserSettings | undefined> {
    validateParam(userIdSchema, userId, "user ID");
    validateParam(userIdSchema, requestingUserId, "requesting user ID");
    
    // Authorization: users can only access their own settings
    if (userId !== requestingUserId) {
      securityLog("getUserSettings", requestingUserId, userId, false);
      throw new AuthorizationError("ユーザーは自分の設定のみアクセス可能です");
    }
    
    try {
      const settings = this.userSettings.get(userId);
      securityLog("getUserSettings", requestingUserId, userId, true);
      return settings;
    } catch (error) {
      console.error("[STORAGE ERROR] Failed to get user settings:", error);
      throw new Error("ユーザー設定の取得に失敗しました");
    }
  }

  async updateUserSettings(userId: string, updateData: Partial<InsertUserSettings>, requestingUserId: string): Promise<UserSettings> {
    validateParam(userIdSchema, userId, "user ID");
    validateParam(userIdSchema, requestingUserId, "requesting user ID");
    
    // Authorization: users can only update their own settings
    if (userId !== requestingUserId) {
      securityLog("updateUserSettings", requestingUserId, userId, false);
      throw new AuthorizationError("ユーザーは自分の設定のみ更新可能です");
    }
    
    try {
      const existing = this.userSettings.get(userId);
      if (!existing) {
        const id = randomUUID();
        const settings: UserSettings = {
          id,
          userId,
          defaultDifficulty: "intermediate",
          questionCount: 5,
          timeLimit: 60,
          updatedAt: new Date(),
          ...updateData,
        };
        this.userSettings.set(userId, settings);
        securityLog("updateUserSettings", requestingUserId, userId, true);
        return settings;
      }

      const updated = { ...existing, ...updateData, updatedAt: new Date() };
      this.userSettings.set(userId, updated);
      securityLog("updateUserSettings", requestingUserId, userId, true);
      return updated;
    } catch (error) {
      console.error("[STORAGE ERROR] Failed to update user settings:", error);
      throw new Error("ユーザー設定の更新に失敗しました");
    }
  }

  async createUserSettings(insertSettings: InsertUserSettings, requestingUserId: string): Promise<UserSettings> {
    validateParam(userIdSchema, requestingUserId, "requesting user ID");
    
    // Authorization: users can only create their own settings
    if (insertSettings.userId !== requestingUserId) {
      securityLog("createUserSettings", requestingUserId, insertSettings.userId, false);
      throw new AuthorizationError("ユーザーは自分の設定のみ作成可能です");
    }
    
    try {
      const id = randomUUID();
      const settings: UserSettings = {
        id,
        userId: insertSettings.userId,
        defaultDifficulty: insertSettings.defaultDifficulty || "intermediate",
        questionCount: insertSettings.questionCount || 5,
        timeLimit: insertSettings.timeLimit || 60,
        updatedAt: new Date(),
      };
      this.userSettings.set(insertSettings.userId, settings);
      
      securityLog("createUserSettings", requestingUserId, insertSettings.userId, true);
      return settings;
    } catch (error) {
      console.error("[STORAGE ERROR] Failed to create user settings:", error);
      throw new Error("ユーザー設定の作成に失敗しました");
    }
  }
}

export class DatabaseStorage implements IStorage {
  // User operations with secure password handling
  async getUser(id: string, requestingUserId: string): Promise<SafeUser | undefined> {
    validateParam(userIdSchema, id, "user ID");
    validateParam(userIdSchema, requestingUserId, "requesting user ID");
    
    // Authorization: users can only access their own data
    if (id !== requestingUserId) {
      securityLog("getUser", requestingUserId, id, false);
      throw new AuthorizationError("ユーザーは自分のデータのみアクセス可能です");
    }
    
    try {
      const [user] = await db
        .select({
          id: users.id,
          username: users.username,
          email: users.email,
          createdAt: users.createdAt,
          // Explicitly exclude password
        })
        .from(users)
        .where(eq(users.id, id));
      
      if (user) {
        securityLog("getUser", requestingUserId, id, true);
      }
      return user || undefined;
    } catch (error) {
      console.error("[STORAGE ERROR] Failed to get user:", error);
      throw new Error("ユーザーの取得に失敗しました");
    }
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    validateParam(usernameSchema, username, "username");
    // Internal method for authentication - returns full user with password
    try {
      const [user] = await db.select().from(users).where(eq(users.username, username));
      return user || undefined;
    } catch (error) {
      console.error("[STORAGE ERROR] Failed to get user by username:", error);
      throw new Error("ユーザー名によるユーザー取得に失敗しました");
    }
  }

  async getSafeUserByUsername(username: string, requestingUserId: string): Promise<SafeUser | undefined> {
    validateParam(usernameSchema, username, "username");
    validateParam(userIdSchema, requestingUserId, "requesting user ID");
    
    try {
      const [user] = await db
        .select({
          id: users.id,
          username: users.username,
          email: users.email,
          createdAt: users.createdAt,
          // Explicitly exclude password
        })
        .from(users)
        .where(eq(users.username, username));
      
      if (user) {
        // Authorization: users can only access their own data
        if (user.id !== requestingUserId) {
          securityLog("getSafeUserByUsername", requestingUserId, user.id, false);
          throw new AuthorizationError("ユーザーは自分のデータのみアクセス可能です");
        }
        
        securityLog("getSafeUserByUsername", requestingUserId, user.id, true);
      }
      return user || undefined;
    } catch (error) {
      if (error instanceof AuthorizationError) {
        throw error;
      }
      console.error("[STORAGE ERROR] Failed to get safe user by username:", error);
      throw new Error("ユーザー名による安全なユーザー取得に失敗しました");
    }
  }

  async createUser(insertUser: InsertUser): Promise<SafeUser> {
    try {
      const [user] = await db
        .insert(users)
        .values(insertUser)
        .returning({
          id: users.id,
          username: users.username,
          email: users.email,
          createdAt: users.createdAt,
          // Explicitly exclude password
        });
      
      // Create default user settings
      await this.createUserSettings({
        userId: user.id,
        defaultDifficulty: "intermediate",
        questionCount: 5,
        timeLimit: 60,
      }, user.id);

      // Initialize user stats
      await db.insert(userStats).values({
        userId: user.id,
        totalScore: 0,
        completedQuizzes: 0,
        averageAccuracy: 0,
        beginnerAccuracy: 0,
        intermediateAccuracy: 0,
        advancedAccuracy: 0,
      });

      securityLog("createUser", user.id, user.id, true);
      return user;
    } catch (error) {
      console.error("[STORAGE ERROR] Failed to create user:", error);
      throw new Error("ユーザーの作成に失敗しました");
    }
  }

  async updateUser(id: string, updateData: Partial<InsertUser>, requestingUserId: string): Promise<SafeUser | undefined> {
    validateParam(userIdSchema, id, "user ID");
    validateParam(userIdSchema, requestingUserId, "requesting user ID");
    
    // Authorization: users can only update their own data
    if (id !== requestingUserId) {
      securityLog("updateUser", requestingUserId, id, false);
      throw new AuthorizationError("ユーザーは自分のデータのみ更新可能です");
    }
    
    try {
      const [user] = await db
        .update(users)
        .set(updateData)
        .where(eq(users.id, id))
        .returning({
          id: users.id,
          username: users.username,
          email: users.email,
          createdAt: users.createdAt,
          // Explicitly exclude password
        });
      
      if (user) {
        securityLog("updateUser", requestingUserId, id, true);
      }
      return user || undefined;
    } catch (error) {
      console.error("[STORAGE ERROR] Failed to update user:", error);
      throw new Error("ユーザーの更新に失敗しました");
    }
  }

  async updateUserPassword(id: string, hashedPassword: string, requestingUserId: string): Promise<boolean> {
    validateParam(userIdSchema, id, "user ID");
    validateParam(userIdSchema, requestingUserId, "requesting user ID");
    
    // Authorization: users can only update their own password
    if (id !== requestingUserId) {
      securityLog("updateUserPassword", requestingUserId, id, false);
      throw new AuthorizationError("ユーザーは自分のパスワードのみ更新可能です");
    }
    
    try {
      const [result] = await db
        .update(users)
        .set({ password: hashedPassword })
        .where(eq(users.id, id))
        .returning({ id: users.id });
      
      const success = !!result;
      securityLog("updateUserPassword", requestingUserId, id, success);
      return success;
    } catch (error) {
      console.error("[STORAGE ERROR] Failed to update password:", error);
      throw new Error("パスワードの更新に失敗しました");
    }
  }

  // Quiz session operations with authorization
  async createQuizSession(insertSession: InsertQuizSession, requestingUserId: string): Promise<QuizSession> {
    validateParam(userIdSchema, requestingUserId, "requesting user ID");
    
    // Authorization: users can only create sessions for themselves
    if (insertSession.userId !== requestingUserId) {
      securityLog("createQuizSession", requestingUserId, insertSession.userId, false);
      throw new AuthorizationError("ユーザーは自分のセッションのみ作成可能です");
    }
    
    try {
      const [session] = await db
        .insert(quizSessions)
        .values(insertSession)
        .returning();
      
      securityLog("createQuizSession", requestingUserId, insertSession.userId, true);
      return session;
    } catch (error) {
      console.error("[STORAGE ERROR] Failed to create quiz session:", error);
      throw new Error("クイズセッションの作成に失敗しました");
    }
  }

  async getQuizSession(id: string, requestingUserId: string): Promise<QuizSession | undefined> {
    validateParam(sessionIdSchema, id, "session ID");
    validateParam(userIdSchema, requestingUserId, "requesting user ID");
    
    try {
      const [session] = await db.select().from(quizSessions).where(eq(quizSessions.id, id));
      if (!session) return undefined;
      
      // Authorization: users can only access their own sessions
      if (session.userId !== requestingUserId) {
        securityLog("getQuizSession", requestingUserId, session.userId, false);
        throw new AuthorizationError("ユーザーは自分のセッションのみアクセス可能です");
      }
      
      securityLog("getQuizSession", requestingUserId, session.userId, true);
      return session;
    } catch (error) {
      if (error instanceof AuthorizationError) {
        throw error;
      }
      console.error("[STORAGE ERROR] Failed to get quiz session:", error);
      throw new Error("クイズセッションの取得に失敗しました");
    }
  }

  async getUserQuizSessions(userId: string, requestingUserId: string): Promise<QuizSession[]> {
    validateParam(userIdSchema, userId, "user ID");
    validateParam(userIdSchema, requestingUserId, "requesting user ID");
    
    // Authorization: users can only access their own sessions
    if (userId !== requestingUserId) {
      securityLog("getUserQuizSessions", requestingUserId, userId, false);
      throw new AuthorizationError("ユーザーは自分のセッションのみアクセス可能です");
    }
    
    try {
      const sessions = await db
        .select()
        .from(quizSessions)
        .where(eq(quizSessions.userId, userId))
        .orderBy(desc(quizSessions.completedAt));
      
      securityLog("getUserQuizSessions", requestingUserId, userId, true);
      return sessions;
    } catch (error) {
      console.error("[STORAGE ERROR] Failed to get user quiz sessions:", error);
      throw new Error("ユーザーセッションの取得に失敗しました");
    }
  }

  async getUserSessions(userId: string, requestingUserId: string): Promise<QuizSession[]> {
    return this.getUserQuizSessions(userId, requestingUserId);
  }

  async getUserQuizSessionsWithQuestions(userId: string, requestingUserId: string): Promise<(QuizSession & { questions: Question[] })[]> {
    const sessions = await this.getUserQuizSessions(userId, requestingUserId);
    const sessionsWithQuestions = await Promise.all(
      sessions.map(async session => ({
        ...session,
        questions: await this.getSessionQuestions(session.id, requestingUserId)
      }))
    );
    return sessionsWithQuestions;
  }

  // Question operations with authorization
  async createQuestions(insertQuestions: InsertQuestion[], requestingUserId: string): Promise<Question[]> {
    validateParam(userIdSchema, requestingUserId, "requesting user ID");
    
    try {
      // Verify session ownership for authorization
      if (insertQuestions.length > 0) {
        const [session] = await db
          .select({ userId: quizSessions.userId })
          .from(quizSessions)
          .where(eq(quizSessions.id, insertQuestions[0].sessionId));
        
        if (!session || session.userId !== requestingUserId) {
          securityLog("createQuestions", requestingUserId, session?.userId, false);
          throw new AuthorizationError("ユーザーは自分のセッションの問題のみ作成可能です");
        }
      }
      
      const createdQuestions = await db
        .insert(questions)
        .values(insertQuestions)
        .returning();
      
      securityLog("createQuestions", requestingUserId, undefined, true);
      return createdQuestions;
    } catch (error) {
      if (error instanceof AuthorizationError) {
        throw error;
      }
      console.error("[STORAGE ERROR] Failed to create questions:", error);
      throw new Error("問題の作成に失敗しました");
    }
  }

  async getSessionQuestions(sessionId: string, requestingUserId: string): Promise<Question[]> {
    validateParam(sessionIdSchema, sessionId, "session ID");
    validateParam(userIdSchema, requestingUserId, "requesting user ID");
    
    try {
      // Verify session ownership
      const [session] = await db
        .select({ userId: quizSessions.userId })
        .from(quizSessions)
        .where(eq(quizSessions.id, sessionId));
      
      if (!session || session.userId !== requestingUserId) {
        securityLog("getSessionQuestions", requestingUserId, session?.userId, false);
        throw new AuthorizationError("ユーザーは自分のセッションの問題のみアクセス可能です");
      }
      
      const questionResults = await db
        .select()
        .from(questions)
        .where(eq(questions.sessionId, sessionId));
      
      securityLog("getSessionQuestions", requestingUserId, session.userId, true);
      return questionResults;
    } catch (error) {
      if (error instanceof AuthorizationError) {
        throw error;
      }
      console.error("[STORAGE ERROR] Failed to get session questions:", error);
      throw new Error("セッション問題の取得に失敗しました");
    }
  }

  async updateQuestion(id: string, updateData: Partial<InsertQuestion>, requestingUserId: string): Promise<Question | undefined> {
    validateParam(questionIdSchema, id, "question ID");
    validateParam(userIdSchema, requestingUserId, "requesting user ID");
    
    try {
      // First get the question to verify session ownership
      const [existingQuestion] = await db
        .select({ sessionId: questions.sessionId })
        .from(questions)
        .where(eq(questions.id, id));
      
      if (!existingQuestion) return undefined;
      
      // Verify session ownership
      const [session] = await db
        .select({ userId: quizSessions.userId })
        .from(quizSessions)
        .where(eq(quizSessions.id, existingQuestion.sessionId));
      
      if (!session || session.userId !== requestingUserId) {
        securityLog("updateQuestion", requestingUserId, session?.userId, false);
        throw new AuthorizationError("ユーザーは自分のセッションの問題のみ更新可能です");
      }
      
      const [question] = await db
        .update(questions)
        .set(updateData)
        .where(eq(questions.id, id))
        .returning();
      
      securityLog("updateQuestion", requestingUserId, session.userId, true);
      return question || undefined;
    } catch (error) {
      if (error instanceof AuthorizationError) {
        throw error;
      }
      console.error("[STORAGE ERROR] Failed to update question:", error);
      throw new Error("問題の更新に失敗しました");
    }
  }

  // User stats operations with authorization
  async getUserStats(userId: string, requestingUserId: string): Promise<UserStats | undefined> {
    validateParam(userIdSchema, userId, "user ID");
    validateParam(userIdSchema, requestingUserId, "requesting user ID");
    
    // Authorization: users can only access their own stats
    if (userId !== requestingUserId) {
      securityLog("getUserStats", requestingUserId, userId, false);
      throw new AuthorizationError("ユーザーは自分の統計のみアクセス可能です");
    }
    
    try {
      const [stats] = await db.select().from(userStats).where(eq(userStats.userId, userId));
      securityLog("getUserStats", requestingUserId, userId, true);
      return stats || undefined;
    } catch (error) {
      console.error("[STORAGE ERROR] Failed to get user stats:", error);
      throw new Error("ユーザー統計の取得に失敗しました");
    }
  }

  async updateUserStats(userId: string, updateData: Partial<InsertUserStats>, requestingUserId: string): Promise<UserStats> {
    validateParam(userIdSchema, userId, "user ID");
    validateParam(userIdSchema, requestingUserId, "requesting user ID");
    
    // Authorization: users can only update their own stats
    if (userId !== requestingUserId) {
      securityLog("updateUserStats", requestingUserId, userId, false);
      throw new AuthorizationError("ユーザーは自分の統計のみ更新可能です");
    }
    
    try {
      // Try to update existing stats first
      const [updated] = await db
        .update(userStats)
        .set(updateData)
        .where(eq(userStats.userId, userId))
        .returning();

      // If no stats exist, create new ones
      if (!updated) {
        const [newStats] = await db
          .insert(userStats)
          .values({
            userId,
            totalScore: 0,
            completedQuizzes: 0,
            averageAccuracy: 0,
            beginnerAccuracy: 0,
            intermediateAccuracy: 0,
            advancedAccuracy: 0,
            ...updateData,
          })
          .returning();
        securityLog("updateUserStats", requestingUserId, userId, true);
        return newStats;
      }

      securityLog("updateUserStats", requestingUserId, userId, true);
      return updated;
    } catch (error) {
      console.error("[STORAGE ERROR] Failed to update user stats:", error);
      throw new Error("ユーザー統計の更新に失敗しました");
    }
  }

  async calculateAndUpdateUserStats(userId: string, requestingUserId: string): Promise<UserStats> {
    validateParam(userIdSchema, userId, "user ID");
    validateParam(userIdSchema, requestingUserId, "requesting user ID");
    
    // Authorization: users can only calculate their own stats
    if (userId !== requestingUserId) {
      securityLog("calculateAndUpdateUserStats", requestingUserId, userId, false);
      throw new AuthorizationError("ユーザーは自分の統計のみ計算可能です");
    }
    
    try {
      const sessions = await this.getUserQuizSessions(userId, requestingUserId);
      
      if (sessions.length === 0) {
        return this.updateUserStats(userId, {
          totalScore: 0,
          completedQuizzes: 0,
          averageAccuracy: 0,
          beginnerAccuracy: 0,
          intermediateAccuracy: 0,
          advancedAccuracy: 0,
        }, requestingUserId);
      }

      const totalScore = sessions.reduce((sum, session) => sum + session.score, 0);
      const completedQuizzes = sessions.length;
      
      const difficultyGroups = {
        beginner: sessions.filter(s => s.difficulty === 'beginner'),
        intermediate: sessions.filter(s => s.difficulty === 'intermediate'),
        advanced: sessions.filter(s => s.difficulty === 'advanced'),
      };

      const calculateAccuracy = (sessionsGroup: QuizSession[]) => {
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

      const statsData = {
        totalScore,
        completedQuizzes,
        averageAccuracy: Math.round(overallAccuracy),
        beginnerAccuracy,
        intermediateAccuracy,
        advancedAccuracy,
      };
      
      securityLog("calculateAndUpdateUserStats", requestingUserId, userId, true);
      return this.updateUserStats(userId, statsData, requestingUserId);
    } catch (error) {
      if (error instanceof AuthorizationError) {
        throw error;
      }
      console.error("[STORAGE ERROR] Failed to calculate user stats:", error);
      throw new Error("ユーザー統計の計算に失敗しました");
    }
  }

  // User settings operations with authorization
  async getUserSettings(userId: string, requestingUserId: string): Promise<UserSettings | undefined> {
    validateParam(userIdSchema, userId, "user ID");
    validateParam(userIdSchema, requestingUserId, "requesting user ID");
    
    // Authorization: users can only access their own settings
    if (userId !== requestingUserId) {
      securityLog("getUserSettings", requestingUserId, userId, false);
      throw new AuthorizationError("ユーザーは自分の設定のみアクセス可能です");
    }
    
    try {
      const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
      securityLog("getUserSettings", requestingUserId, userId, true);
      return settings || undefined;
    } catch (error) {
      console.error("[STORAGE ERROR] Failed to get user settings:", error);
      throw new Error("ユーザー設定の取得に失敗しました");
    }
  }

  async updateUserSettings(userId: string, updateData: Partial<InsertUserSettings>, requestingUserId: string): Promise<UserSettings> {
    validateParam(userIdSchema, userId, "user ID");
    validateParam(userIdSchema, requestingUserId, "requesting user ID");
    
    // Authorization: users can only update their own settings
    if (userId !== requestingUserId) {
      securityLog("updateUserSettings", requestingUserId, userId, false);
      throw new AuthorizationError("ユーザーは自分の設定のみ更新可能です");
    }
    
    try {
      // Try to update existing settings first
      const [updated] = await db
        .update(userSettings)
        .set({
          ...updateData,
          updatedAt: new Date(),
        })
        .where(eq(userSettings.userId, userId))
        .returning();

      // If no settings exist, create new ones
      if (!updated) {
        const [newSettings] = await db
          .insert(userSettings)
          .values({
            userId,
            defaultDifficulty: "intermediate",
            questionCount: 5,
            timeLimit: 60,
            ...updateData,
          })
          .returning();
        securityLog("updateUserSettings", requestingUserId, userId, true);
        return newSettings;
      }

      securityLog("updateUserSettings", requestingUserId, userId, true);
      return updated;
    } catch (error) {
      console.error("[STORAGE ERROR] Failed to update user settings:", error);
      throw new Error("ユーザー設定の更新に失敗しました");
    }
  }

  async createUserSettings(insertSettings: InsertUserSettings, requestingUserId: string): Promise<UserSettings> {
    validateParam(userIdSchema, requestingUserId, "requesting user ID");
    
    // Authorization: users can only create their own settings
    if (insertSettings.userId !== requestingUserId) {
      securityLog("createUserSettings", requestingUserId, insertSettings.userId, false);
      throw new AuthorizationError("ユーザーは自分の設定のみ作成可能です");
    }
    
    try {
      const [settings] = await db
        .insert(userSettings)
        .values(insertSettings)
        .returning();
      
      securityLog("createUserSettings", requestingUserId, insertSettings.userId, true);
      return settings;
    } catch (error) {
      console.error("[STORAGE ERROR] Failed to create user settings:", error);
      throw new Error("ユーザー設定の作成に失敗しました");
    }
  }
}

export const storage = new DatabaseStorage();
