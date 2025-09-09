/**
 * Shared type definitions for enhanced type safety
 */

// Common utility types
export type Brand<T, K> = T & { __brand: K };
export type NonEmptyString = Brand<string, 'NonEmptyString'>;
export type PositiveNumber = Brand<number, 'PositiveNumber'>;
export type SafeInteger = Brand<number, 'SafeInteger'>;

// Error handling types
export interface AppError {
  code: string;
  message: string;
  status: number;
  details?: Record<string, unknown>;
  timestamp: string;
}

export interface ValidationError extends AppError {
  field: string;
  value: unknown;
}

// API response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: AppError;
  meta?: {
    timestamp: string;
    requestId?: string;
  };
}

// HTTP related types
export interface HttpError extends Error {
  status: number;
  code?: string;
  isCSRFRetry?: boolean;
}

// Quiz related types
export interface QuizQuestion {
  question: string;
  options: readonly [string, string, string, string];
  correctAnswer: string;
  explanation: string;
}

export interface QuizResult {
  question: string;
  selectedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  explanation: string;
}

export interface QuizGenerationRequest {
  content: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  questionCount: PositiveNumber;
  timeLimit: PositiveNumber;
}

// Security related types
export interface SecurityLogData {
  ipAddress?: string;
  userAgent?: string;
  userId?: string;
  sessionId?: string;
  endpoint?: string;
  method?: string;
  statusCode?: number;
  metadata?: Record<string, unknown>;
}

export interface CSRFTokenData {
  token: string;
  createdAt: number;
  ipAddress: string;
}

// File upload types
export interface UploadedFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

// Type guards
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

export function isPositiveNumber(value: unknown): value is PositiveNumber {
  return isNumber(value) && value > 0;
}

export function isSafeInteger(value: unknown): value is SafeInteger {
  return isNumber(value) && Number.isSafeInteger(value);
}

export function isNonEmptyString(value: unknown): value is NonEmptyString {
  return isString(value) && value.length > 0;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isArray<T>(value: unknown, itemGuard: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.every(itemGuard);
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof Error && 'status' in error && typeof (error as any).status === 'number';
}

export function isAppError(error: unknown): error is AppError {
  return isObject(error) && 
         isString(error.code) &&
         isString(error.message) &&
         isNumber(error.status) &&
         isString(error.timestamp);
}

export function isQuizQuestion(value: unknown): value is QuizQuestion {
  return isObject(value) &&
         isNonEmptyString(value.question) &&
         Array.isArray(value.options) &&
         value.options.length === 4 &&
         value.options.every(isNonEmptyString) &&
         isNonEmptyString(value.correctAnswer) &&
         isNonEmptyString(value.explanation);
}

export function isQuizResult(value: unknown): value is QuizResult {
  return isObject(value) &&
         isNonEmptyString(value.question) &&
         isString(value.selectedAnswer) &&
         isNonEmptyString(value.correctAnswer) &&
         typeof value.isCorrect === 'boolean' &&
         isNonEmptyString(value.explanation);
}

// Utility functions for type assertion
export function assertIsString(value: unknown, name: string): asserts value is string {
  if (!isString(value)) {
    throw new Error(`Expected ${name} to be a string, but got ${typeof value}`);
  }
}

export function assertIsNumber(value: unknown, name: string): asserts value is number {
  if (!isNumber(value)) {
    throw new Error(`Expected ${name} to be a number, but got ${typeof value}`);
  }
}

export function assertIsPositiveNumber(value: unknown, name: string): asserts value is PositiveNumber {
  if (!isPositiveNumber(value)) {
    throw new Error(`Expected ${name} to be a positive number, but got ${value}`);
  }
}

export function assertIsNonEmptyString(value: unknown, name: string): asserts value is NonEmptyString {
  if (!isNonEmptyString(value)) {
    throw new Error(`Expected ${name} to be a non-empty string, but got "${value}"`);
  }
}

export function assertIsObject(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (!isObject(value)) {
    throw new Error(`Expected ${name} to be an object, but got ${typeof value}`);
  }
}