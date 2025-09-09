/**
 * Database Type Definitions
 * Enhanced type safety for database operations
 */

import { z } from 'zod';
import { 
  User, 
  UserStats, 
  UserSettings, 
  Question, 
  QuizSession 
} from '../schema';

// Core Database Types (extending existing schema)
export interface UserWithStats {
  id: string;
  username: string;
  email?: string;
  password: string;
  createdAt: Date;
  stats?: UserStats;
  settings?: UserSettings;
}

export interface QuizSessionWithQuestions {
  id: string;
  userId: string;
  title: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  contentType: 'pdf' | 'text' | 'youtube';
  score: number;
  totalQuestions: number;
  timeSpent: number;
  completedAt: Date;
  questions: Question[];
}

export interface QuestionWithSession {
  id: string;
  sessionId: string;
  questionText: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  userAnswer?: number;
  timeSpent: number;
  session?: QuizSession;
}

// Database Operation Types
export interface CreateQuizSessionData {
  userId: string;
  title: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  contentType: 'pdf' | 'text' | 'youtube';
  score: number;
  totalQuestions: number;
  timeSpent: number;
}

export interface CreateQuestionData {
  sessionId: string;
  questionText: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  userAnswer?: number;
  timeSpent: number;
}

export interface UpdateUserStatsData {
  totalScore?: number;
  completedQuizzes?: number;
  averageAccuracy?: number;
  beginnerAccuracy?: number;
  intermediateAccuracy?: number;
  advancedAccuracy?: number;
}

// Validation Schemas with Enhanced Type Safety
export const createQuizSessionSchema = z.object({
  userId: z.string().uuid('有効なユーザーIDが必要です'),
  title: z.string().min(1, 'タイトルは必須です').max(500, 'タイトルは500文字以下である必要があります'),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced'], {
    errorMap: () => ({ message: '難易度はbeginner、intermediate、advancedのいずれかである必要があります' })
  }),
  contentType: z.enum(['pdf', 'text', 'youtube'], {
    errorMap: () => ({ message: 'コンテンツタイプはpdf、text、youtubeのいずれかである必要があります' })
  }),
  score: z.number().int().min(0, 'スコアは0以上である必要があります'),
  totalQuestions: z.number().int().min(1, '問題数は1以上である必要があります').max(50, '問題数は50以下である必要があります'),
  timeSpent: z.number().int().min(0, '経過時間は0以上である必要があります')
});

export const createQuestionSchema = z.object({
  sessionId: z.string().uuid('有効なセッションIDが必要です'),
  questionText: z.string().min(1, '問題文は必須です').max(2000, '問題文は2000文字以下である必要があります'),
  options: z.array(z.string().min(1, '選択肢は空にできません')).length(4, '選択肢は4つである必要があります'),
  correctAnswer: z.number().int().min(0, '正解は0以上である必要があります').max(3, '正解は3以下である必要があります'),
  explanation: z.string().min(1, '解説は必須です').max(1000, '解説は1000文字以下である必要があります'),
  userAnswer: z.number().int().min(0).max(3).optional(),
  timeSpent: z.number().int().min(0, '経過時間は0以上である必要があります').default(0)
});

export const updateUserStatsSchema = z.object({
  totalScore: z.number().int().min(0).optional(),
  completedQuizzes: z.number().int().min(0).optional(),
  averageAccuracy: z.number().min(0).max(1).optional(),
  beginnerAccuracy: z.number().min(0).max(1).optional(),
  intermediateAccuracy: z.number().min(0).max(1).optional(),
  advancedAccuracy: z.number().min(0).max(1).optional()
});

export const quizResultDetailSchema = z.object({
  question: z.string().optional(),
  correctAnswer: z.number().int().min(0).max(3).optional(),
  explanation: z.string().optional(),
  userAnswer: z.number().int().min(0).max(3),
  timeSpent: z.number().int().min(0).default(0)
});

export const quizSubmissionSchema = z.object({
  userId: z.string().uuid('有効なユーザーIDが必要です'),
  quizData: z.object({
    title: z.string().optional(),
    difficulty: z.string().optional(),
    contentType: z.string().optional(),
    questions: z.array(z.object({
      question: z.string(),
      options: z.array(z.string()),
      correctAnswer: z.number().int().min(0).max(3),
      explanation: z.string()
    })).optional()
  }),
  results: z.object({
    score: z.number().int().min(0, 'スコアは0以上である必要があります'),
    totalQuestions: z.number().int().min(1, '問題数は1以上である必要があります'),
    totalTimeSpent: z.number().int().min(0, '経過時間は0以上である必要があります'),
    detailedResults: z.array(quizResultDetailSchema).optional()
  })
});

// Type Inference from Schemas
export type CreateQuizSessionInput = z.infer<typeof createQuizSessionSchema>;
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;
export type UpdateUserStatsInput = z.infer<typeof updateUserStatsSchema>;
export type QuizResultDetailInput = z.infer<typeof quizResultDetailSchema>;
export type QuizSubmissionInput = z.infer<typeof quizSubmissionSchema>;

// Database Query Types
export interface UserStatsQuery {
  userId: string;
  startDate?: Date;
  endDate?: Date;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  contentType?: 'pdf' | 'text' | 'youtube';
}

export interface SessionsQuery {
  userId: string;
  limit?: number;
  offset?: number;
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
  contentType?: 'pdf' | 'text' | 'youtube';
  orderBy?: 'completedAt' | 'score' | 'timeSpent';
  orderDirection?: 'asc' | 'desc';
}

export interface QuestionsQuery {
  sessionId: string;
  includeAnswers?: boolean;
}

// Aggregation Types
export interface UserStatsAggregation {
  totalQuizzes: number;
  totalScore: number;
  averageScore: number;
  averageAccuracy: number;
  totalTimeSpent: number;
  averageTimePerQuiz: number;
  difficultyBreakdown: {
    beginner: { count: number; accuracy: number };
    intermediate: { count: number; accuracy: number };
    advanced: { count: number; accuracy: number };
  };
  contentTypeBreakdown: {
    pdf: { count: number; accuracy: number };
    text: { count: number; accuracy: number };
    youtube: { count: number; accuracy: number };
  };
}

export interface SessionAnalytics {
  sessionId: string;
  accuracy: number;
  timeEfficiency: number; // score per minute
  difficultyRating: number;
  questionAnalysis: {
    questionId: string;
    correct: boolean;
    timeSpent: number;
    difficulty: 'easy' | 'medium' | 'hard';
  }[];
}

// Type Guards for Database Operations
export function isCreateQuizSessionData(obj: unknown): obj is CreateQuizSessionData {
  return createQuizSessionSchema.safeParse(obj).success;
}

export function isCreateQuestionData(obj: unknown): obj is CreateQuestionData {
  return createQuestionSchema.safeParse(obj).success;
}

export function isUpdateUserStatsData(obj: unknown): obj is UpdateUserStatsData {
  return updateUserStatsSchema.safeParse(obj).success;
}

export function isQuizSubmissionInput(obj: unknown): obj is QuizSubmissionInput {
  return quizSubmissionSchema.safeParse(obj).success;
}

// Error Types for Database Operations
export interface DatabaseError extends Error {
  code: string;
  table?: string;
  constraint?: string;
  detail?: string;
}

export interface ValidationError extends Error {
  field: string;
  value: unknown;
  constraint: string;
}