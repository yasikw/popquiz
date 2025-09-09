/**
 * Central Type Exports
 * Single source of truth for all type definitions
 */

// API Types
export type {
  ApiResponse,
  QuizResultDetail,
  QuizResultsData,
  QuizSubmissionRequest,
  QuizSubmissionResponse,
  PDFQuizRequest,
  YouTubeQuizRequest,
  TextQuizRequest,
  ContentQuizRequest,
  DifficultyAccuracy,
  UserStatsUpdate,
  FileUploadInfo,
  UploadValidationResult,
  ApiError,
  isApiResponse,
  isQuizResultsData,
  createSuccessResponse,
  createErrorResponse
} from './api';

// Security Types  
export type {
  SecurityEvent,
  SecurityEventType,
  SecurityLogLevel,
  CSPViolationReport,
  CSPViolationWrapper,
  SanitizedInput,
  SecureRequest,
  RateLimitConfig,
  RateLimitInfo,
  FileValidationOptions,
  FileSecurityCheck,
  SafeLogData,
  UserSession,
  isSecurityEvent,
  isCSPViolationReport,
  isValidationResult,
  SensitiveDataKeys,
  SecureObject,
  SecurityAuditLog
} from './security';

// Unique exports from security (avoid conflicts)
export type {
  AuthenticatedUser as SecureAuthenticatedUser,
  SecurityContext as SecureSecurityContext,
  ValidationError as SecurityValidationError,
  ValidationResult as SecurityValidationResult
} from './security';

// Database Types
export * from './database';

// Utility Types
export * from './utils';

// Re-export common types from schema for convenience
export {
  User,
  SafeUser,
  UserStats,
  UserSettings,
  QuizSession,
  Question,
  GeneratedQuiz,
  QuizQuestion,
  InsertUser,
  InsertQuizSession,
  InsertQuestion,
  InsertUserStats,
  InsertUserSettings
} from '../schema';