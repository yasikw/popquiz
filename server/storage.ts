import { type User, type InsertUser, type QuizSession, type InsertQuizSession, type Question, type InsertQuestion, type UserStats, type InsertUserStats } from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, user: Partial<InsertUser>): Promise<User | undefined>;
  updateUserPassword(id: string, hashedPassword: string): Promise<User | undefined>;

  // Quiz session operations
  createQuizSession(session: InsertQuizSession): Promise<QuizSession>;
  getQuizSession(id: string): Promise<QuizSession | undefined>;
  getUserQuizSessions(userId: string): Promise<QuizSession[]>;
  getUserSessions(userId: string): Promise<QuizSession[]>;
  getUserQuizSessionsWithQuestions(userId: string): Promise<(QuizSession & { questions: Question[] })[]>;

  // Question operations
  createQuestions(questions: InsertQuestion[]): Promise<Question[]>;
  getSessionQuestions(sessionId: string): Promise<Question[]>;
  updateQuestion(id: string, question: Partial<InsertQuestion>): Promise<Question | undefined>;

  // User stats operations
  getUserStats(userId: string): Promise<UserStats | undefined>;
  updateUserStats(userId: string, stats: Partial<InsertUserStats>): Promise<UserStats>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private quizSessions: Map<string, QuizSession>;
  private questions: Map<string, Question>;
  private userStats: Map<string, UserStats>;

  constructor() {
    this.users = new Map();
    this.quizSessions = new Map();
    this.questions = new Map();
    this.userStats = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { 
      id,
      username: insertUser.username,
      email: insertUser.email || null,
      password: insertUser.password || null,
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

    return user;
  }

  async updateUser(id: string, updateData: Partial<InsertUser>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;

    const updatedUser = { ...user, ...updateData };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async updateUserPassword(id: string, hashedPassword: string): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;

    const updatedUser = { ...user, password: hashedPassword };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  async createQuizSession(insertSession: InsertQuizSession): Promise<QuizSession> {
    const id = randomUUID();
    const session: QuizSession = {
      ...insertSession,
      id,
      completedAt: new Date(),
    };
    this.quizSessions.set(id, session);
    return session;
  }

  async getQuizSession(id: string): Promise<QuizSession | undefined> {
    return this.quizSessions.get(id);
  }

  async getUserQuizSessions(userId: string): Promise<QuizSession[]> {
    return Array.from(this.quizSessions.values())
      .filter(session => session.userId === userId)
      .sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());
  }

  async getUserQuizSessionsWithQuestions(userId: string): Promise<(QuizSession & { questions: Question[] })[]> {
    const sessions = await this.getUserQuizSessions(userId);
    return sessions.map(session => ({
      ...session,
      questions: Array.from(this.questions.values())
        .filter(question => question.sessionId === session.id)

    }));
  }

  async getUserSessions(userId: string): Promise<QuizSession[]> {
    return this.getUserQuizSessions(userId);
  }

  async createQuestions(insertQuestions: InsertQuestion[]): Promise<Question[]> {
    const questions: Question[] = insertQuestions.map(q => ({
      id: randomUUID(),
      sessionId: q.sessionId,
      questionText: q.questionText,
      options: [...q.options],
      correctAnswer: q.correctAnswer,
      explanation: q.explanation,
      userAnswer: q.userAnswer || null,
      timeSpent: q.timeSpent || null,
    }));

    questions.forEach(q => this.questions.set(q.id, q));
    return questions;
  }

  async getSessionQuestions(sessionId: string): Promise<Question[]> {
    return Array.from(this.questions.values()).filter(q => q.sessionId === sessionId);
  }

  async updateQuestion(id: string, updateData: Partial<InsertQuestion>): Promise<Question | undefined> {
    const question = this.questions.get(id);
    if (!question) return undefined;

    const updatedQuestion: Question = { 
      ...question, 
      ...updateData,
      options: updateData.options ? [...updateData.options] : question.options
    };
    this.questions.set(id, updatedQuestion);
    return updatedQuestion;
  }

  async getUserStats(userId: string): Promise<UserStats | undefined> {
    return this.userStats.get(userId);
  }

  async updateUserStats(userId: string, updateData: Partial<InsertUserStats>): Promise<UserStats> {
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
      return stats;
    }

    const updated = { ...existing, ...updateData };
    this.userStats.set(userId, updated);
    return updated;
  }
}

export const storage = new MemStorage();
