import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { storage } from '../storage';
import type { User } from '@shared/schema';

// JWTペイロードの型定義
export interface JWTPayload {
  userId: string;
  username: string;
  iat?: number;
  exp?: number;
}

// Requestにuserプロパティを追加する型定義
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

// JWT設定
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '24h';
const JWT_REFRESH_EXPIRES_IN = '7d';

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

/**
 * JWTアクセストークンを生成
 */
export function generateAccessToken(user: User): string {
  const payload: JWTPayload = {
    userId: user.id,
    username: user.username
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: 'japanese-quiz-app',
    audience: 'japanese-quiz-users'
  });
}

/**
 * JWTリフレッシュトークンを生成
 */
export function generateRefreshToken(user: User): string {
  const payload: JWTPayload = {
    userId: user.id,
    username: user.username
  };

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRES_IN,
    issuer: 'japanese-quiz-app',
    audience: 'japanese-quiz-users'
  });
}

/**
 * JWTトークンを検証し、ペイロードを返す
 */
export function verifyToken(token: string): JWTPayload {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: 'japanese-quiz-app',
      audience: 'japanese-quiz-users'
    }) as JWTPayload;

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Token expired');
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid token');
    } else {
      throw new Error('Token verification failed');
    }
  }
}

/**
 * Authorizationヘッダーからトークンを抽出
 */
function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  // "Bearer <token>" 形式からトークンを抽出
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

/**
 * JWT認証ミドルウェア
 * Authorizationヘッダーからトークンを抽出し、検証してユーザー情報をreq.userに設定
 */
export async function authenticateUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Authorizationヘッダーからトークンを抽出
    const token = extractTokenFromHeader(req.headers.authorization);
    
    if (!token) {
      res.status(401).json({ 
        error: 'Access token required',
        message: 'Authorization header with Bearer token is required' 
      });
      return;
    }

    // トークンを検証
    const decoded = verifyToken(token);

    // ユーザー情報を取得
    const user = await storage.getUser(decoded.userId);
    if (!user) {
      res.status(401).json({ 
        error: 'Invalid token',
        message: 'User not found' 
      });
      return;
    }

    // req.userにユーザー情報を設定
    req.user = user;
    next();

  } catch (error) {
    if (error instanceof Error) {
      if (error.message === 'Token expired') {
        res.status(401).json({ 
          error: 'Token expired',
          message: 'Access token has expired. Please refresh your token.' 
        });
        return;
      } else if (error.message === 'Invalid token') {
        res.status(401).json({ 
          error: 'Invalid token',
          message: 'Access token is invalid' 
        });
        return;
      }
    }

    console.error('JWT authentication error:', error);
    res.status(500).json({ 
      error: 'Authentication failed',
      message: 'Internal server error during authentication' 
    });
  }
}

/**
 * オプショナル認証ミドルウェア
 * トークンがある場合のみ認証を行い、ない場合はそのまま通す
 */
export async function optionalAuthentication(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);
    
    if (!token) {
      // トークンがない場合はそのまま通す
      next();
      return;
    }

    // トークンがある場合は検証を試行
    const decoded = verifyToken(token);
    const user = await storage.getUser(decoded.userId);
    
    if (user) {
      req.user = user;
    }

    next();

  } catch (error) {
    // オプショナル認証なので、エラーが発生してもそのまま通す
    console.warn('Optional authentication failed:', error);
    next();
  }
}

/**
 * トークンリフレッシュのためのユーティリティ関数
 */
export async function refreshTokens(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  user: User;
}> {
  try {
    // リフレッシュトークンを検証
    const decoded = verifyToken(refreshToken);

    // ユーザー情報を取得
    const user = await storage.getUser(decoded.userId);
    if (!user) {
      throw new Error('User not found');
    }

    // 新しいトークンを生成
    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user
    };

  } catch (error) {
    throw new Error('Invalid refresh token');
  }
}