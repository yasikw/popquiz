/**
 * Security Type Definitions
 * Type safety for security monitoring and validation
 */

// Security Monitoring Types
export interface SecurityEvent {
  type: SecurityEventType;
  severity: SecurityLogLevel;
  message: string;
  details?: Record<string, unknown>;
  timestamp: Date;
  ipAddress: string;
  userAgent?: string;
  userId?: string;
  sessionId?: string;
}

export enum SecurityEventType {
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  AUTHENTICATION_FAILURE = 'authentication_failure',
  AUTHORIZATION_FAILURE = 'authorization_failure',
  CSRF_VIOLATION = 'csrf_violation',
  XSS_ATTEMPT = 'xss_attempt',
  SQL_INJECTION_ATTEMPT = 'sql_injection_attempt',
  FILE_UPLOAD_VIOLATION = 'file_upload_violation',
  ABNORMAL_TRAFFIC = 'abnormal_traffic'
}

export enum SecurityLogLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

// Content Security Policy Types
export interface CSPViolationReport {
  'document-uri': string;
  referrer: string;
  'violated-directive': string;
  'effective-directive': string;
  'original-policy': string;
  disposition: string;
  'blocked-uri': string;
  'line-number'?: number;
  'column-number'?: number;
  'source-file'?: string;
  'status-code': number;
}

export interface CSPViolationWrapper {
  'csp-report': CSPViolationReport;
}

// Input Validation Types
export type SanitizedInput<T> = T extends string 
  ? string 
  : T extends object 
    ? { [K in keyof T]: SanitizedInput<T[K]> }
    : T extends Array<infer U>
      ? Array<SanitizedInput<U>>
      : T;

export interface ValidationResult<T> {
  isValid: boolean;
  data?: SanitizedInput<T>;
  errors?: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

// Request Extensions for Security Monitoring
export interface SecureRequest extends Request {
  sessionID?: string;
  session?: {
    lastUserAgent?: string;
    lastIpAddress?: string;
    [key: string]: unknown;
  };
  user?: AuthenticatedUser;
  securityContext?: SecurityContext;
  requestId?: string;
}

export interface SecurityContext {
  user?: AuthenticatedUser;
  ipAddress: string;
  userAgent: string;
  sessionId?: string;
  requestId: string;
  timestamp: Date;
}

// Rate Limiting Types
export interface RateLimitConfig {
  windowMs: number;
  max: number;
  message?: string;
  standardHeaders?: boolean;
  legacyHeaders?: boolean;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: Date;
  windowMs: number;
}

// File Upload Security Types
export interface FileValidationOptions {
  allowedTypes: string[];
  maxSize: number;
  checkMagicBytes?: boolean;
  scanForMalware?: boolean;
}

export interface FileSecurityCheck {
  isSecure: boolean;
  threats: string[];
  sanitizedFilename?: string;
}

// Logging Security Types
export type SafeLogData<T> = T extends object 
  ? {
      [K in keyof T as K extends 'password' | 'token' | 'secret' | 'apiKey' | 'accessToken' 
        ? never 
        : K
      ]: T[K] extends object ? SafeLogData<T[K]> : T[K];
    }
  : T;

// Authentication Types
export interface AuthenticatedUser {
  id: string;
  username: string;
  email?: string;
  isAuthenticated: true;
  permissions?: string[];
  sessionId?: string;
  lastLogin?: Date;
}

export interface UserSession {
  userId: string;
  sessionId: string;
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
  lastActivity: Date;
  isActive: boolean;
}

// Type Guards
export function isSecurityEvent(obj: unknown): obj is SecurityEvent {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as SecurityEvent).type === 'string' &&
    typeof (obj as SecurityEvent).severity === 'string' &&
    typeof (obj as SecurityEvent).message === 'string' &&
    (obj as SecurityEvent).timestamp instanceof Date
  );
}

export function isCSPViolationReport(obj: unknown): obj is CSPViolationWrapper {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as CSPViolationWrapper)['csp-report'] === 'object' &&
    typeof (obj as CSPViolationWrapper)['csp-report']['violated-directive'] === 'string'
  );
}

export function isValidationResult<T>(obj: unknown): obj is ValidationResult<T> {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof (obj as ValidationResult<T>).isValid === 'boolean'
  );
}

// Security Utility Types
export type SensitiveDataKeys = 'password' | 'token' | 'secret' | 'apiKey' | 'accessToken' | 'privateKey';

export type SecureObject<T> = Omit<T, SensitiveDataKeys>;

export interface SecurityAuditLog {
  event: SecurityEvent;
  actionTaken?: string;
  resolution?: string;
  investigationNotes?: string;
}