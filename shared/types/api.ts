/**
 * API Response Type Definitions
 * Comprehensive type safety for all API interactions
 */

import { GeneratedQuiz } from '../schema';
import { User } from '../schema';

// Core API Response Interface
export interface ApiResponse<T = unknown> {
  success: boolean;
  data: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta?: {
    timestamp: string;
    requestId: string;
  };
}

// Quiz Results Types
export interface QuizResultDetail {
  question: string;
  correctAnswer: number; // 0-3 index
  explanation: string;
  userAnswer: number | null; // 0-3 index, null if unanswered
  timeSpent: number; // seconds
}

export interface QuizResultsData {
  score: number;
  totalQuestions: number;
  totalTimeSpent: number; // seconds
  detailedResults: QuizResultDetail[];
}

export interface QuizSubmissionRequest {
  userId: string;
  quizData: GeneratedQuiz & { contentType?: string };
  results: QuizResultsData;
}

export interface QuizSubmissionResponse {
  sessionId: string;
  message: string;
  success: boolean;
}

// Content Generation Request Types
export interface PDFQuizRequest {
  difficulty: string;
  questionCount: number;
  pdfInfo: {
    name: string;
    size: number;
    type: string;
    lastModified: number;
  };
}

export interface YouTubeQuizRequest {
  difficulty: string;
  questionCount: number;
  youtubeVideoId: string;
}

export interface TextQuizRequest {
  difficulty: string;
  questionCount: number;
  textContent: string;
}

export type ContentQuizRequest = PDFQuizRequest | YouTubeQuizRequest | TextQuizRequest;

// User Statistics Types
export interface DifficultyAccuracy {
  beginnerAccuracy?: number;
  intermediateAccuracy?: number;
  advancedAccuracy?: number;
}

export interface UserStatsUpdate extends DifficultyAccuracy {
  totalScore?: number;
  completedQuizzes?: number;
  averageAccuracy?: number;
}

// Authentication Types
export interface AuthenticatedUser {
  id: string;
  username: string;
  email?: string;
  isAuthenticated: true;
  permissions?: string[];
  sessionId?: string;
}

export interface SecurityContext {
  user?: AuthenticatedUser;
  ipAddress: string;
  userAgent: string;
  sessionId?: string;
  requestId: string;
}

// File Upload Types
export interface FileUploadInfo {
  name: string;
  size: number;
  type: string;
  lastModified: number;
}

export interface UploadValidationResult {
  isValid: boolean;
  errors?: string[];
  sanitizedData?: FileUploadInfo;
}

// Error Types
export interface ValidationError {
  field: string;
  message: string;
  code?: string;
}

export interface ApiError extends Error {
  status: number;
  code: string;
  details?: ValidationError[];
}

// Type Guards
export function isApiResponse<T>(
  obj: unknown,
  dataValidator?: (data: unknown) => data is T
): obj is ApiResponse<T> {
  if (
    typeof obj !== 'object' ||
    obj === null ||
    typeof (obj as ApiResponse).success !== 'boolean'
  ) {
    return false;
  }

  if (dataValidator && (obj as ApiResponse).success) {
    return dataValidator((obj as ApiResponse<T>).data);
  }

  return true;
}

export function isQuizResultsData(obj: unknown): obj is QuizResultsData {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as QuizResultsData).score === 'number' &&
    typeof (obj as QuizResultsData).totalQuestions === 'number' &&
    typeof (obj as QuizResultsData).totalTimeSpent === 'number' &&
    Array.isArray((obj as QuizResultsData).detailedResults)
  );
}

export function isAuthenticatedUser(obj: unknown): obj is AuthenticatedUser {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as AuthenticatedUser).id === 'string' &&
    typeof (obj as AuthenticatedUser).username === 'string' &&
    (obj as AuthenticatedUser).isAuthenticated === true
  );
}

// API Response Helpers
export function createSuccessResponse<T>(data: T, meta?: ApiResponse<T>['meta']): ApiResponse<T> {
  return {
    success: true,
    data,
    meta
  };
}

export function createErrorResponse(
  code: string,
  message: string,
  details?: Record<string, unknown>
): ApiResponse<never> {
  return {
    success: false,
    data: null as never,
    error: {
      code,
      message,
      details
    }
  };
}