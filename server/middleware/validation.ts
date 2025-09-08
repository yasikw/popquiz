import { Request, Response, NextFunction } from "express";
import { z, ZodError } from "zod";
import { sanitizeInput } from "./security";

// Generic validation middleware factory
export function validateInput<T extends z.ZodType>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Parse and validate the request body
      const validated = schema.parse(req.body);
      
      // Sanitize string inputs to prevent XSS
      req.body = sanitizeObjectInputs(validated);
      
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }));
        
        return res.status(400).json({
          error: "入力検証エラー",
          details: errorMessages
        });
      }
      
      return res.status(400).json({
        error: "リクエストの処理中にエラーが発生しました"
      });
    }
  };
}

// Query parameter validation middleware factory
export function validateQuery<T extends z.ZodType>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Parse and validate query parameters
      const validated = schema.parse(req.query);
      
      // Sanitize string inputs
      req.query = sanitizeObjectInputs(validated);
      
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }));
        
        return res.status(400).json({
          error: "クエリパラメータ検証エラー",
          details: errorMessages
        });
      }
      
      return res.status(400).json({
        error: "クエリパラメータの処理中にエラーが発生しました"
      });
    }
  };
}

// URL parameter validation middleware factory
export function validateParams<T extends z.ZodType>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Parse and validate URL parameters
      const validated = schema.parse(req.params);
      
      // Sanitize string inputs
      req.params = sanitizeObjectInputs(validated);
      
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errorMessages = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }));
        
        return res.status(400).json({
          error: "URLパラメータ検証エラー",
          details: errorMessages
        });
      }
      
      return res.status(400).json({
        error: "URLパラメータの処理中にエラーが発生しました"
      });
    }
  };
}

// Recursively sanitize string values in an object
function sanitizeObjectInputs(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'string') {
    return sanitizeInput(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObjectInputs(item));
  }
  
  if (typeof obj === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      sanitized[key] = sanitizeObjectInputs(value);
    }
    return sanitized;
  }
  
  return obj;
}

// Common parameter schemas
export const idParamSchema = z.object({
  id: z.string().uuid("有効なIDを指定してください")
});

export const userIdParamSchema = z.object({
  userId: z.string().uuid("有効なユーザーIDを指定してください")
});

export const paginationQuerySchema = z.object({
  page: z
    .string()
    .regex(/^\d+$/, "ページ番号は数値である必要があります")
    .transform(Number)
    .refine(val => val >= 1, "ページ番号は1以上である必要があります")
    .optional()
    .default("1"),
  limit: z
    .string()
    .regex(/^\d+$/, "制限数は数値である必要があります")
    .transform(Number)
    .refine(val => val >= 1 && val <= 100, "制限数は1から100の間である必要があります")
    .optional()
    .default("20")
});

// Specific validation schemas for different endpoints
export const settingsUpdateSchema = z.object({
  defaultDifficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  questionCount: z.number().int().min(1).max(50).optional(),
  timeLimit: z.number().int().min(10).max(300).optional()
});

export const quizResultSchema = z.object({
  sessionId: z.string().uuid("有効なセッションIDを指定してください"),
  answers: z.array(z.object({
    questionId: z.string().uuid("有効な問題IDを指定してください"),
    userAnswer: z.number().int().min(0).max(3),
    timeSpent: z.number().int().min(0)
  })).min(1, "少なくとも1つの回答が必要です")
});