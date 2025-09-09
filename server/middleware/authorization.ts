import type { Request, Response, NextFunction } from 'express';
import type { User } from '@shared/schema';

// Request型の拡張（authミドルウェアと同じ）
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/**
 * ユーザーが自分のリソースのみアクセス可能にする認可ミドルウェア
 * パラメータからuserIdまたはidを取得し、認証済みユーザーのIDと比較
 */
export function authorizeUser(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    // 認証チェック（authenticateUserミドルウェアが先に実行されている前提）
    if (!req.user) {
      res.status(401).json({ 
        error: 'Unauthorized',
        message: '認証が必要です' 
      });
      return;
    }

    // URLパラメータからuserIdまたはidを取得
    const resourceUserId = req.params.userId || req.params.id;
    
    if (!resourceUserId) {
      res.status(400).json({ 
        error: 'Bad Request',
        message: 'ユーザーIDが指定されていません' 
      });
      return;
    }

    // 認証済みユーザーのIDとリソースのuserIdを比較
    if (req.user.id !== resourceUserId) {
      res.status(403).json({ 
        error: 'Forbidden',
        message: '他のユーザーのリソースにはアクセスできません' 
      });
      return;
    }

    // 認可が成功した場合、次のミドルウェアに進む
    next();

  } catch (error) {
    console.error('Authorization error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: '認可処理中にエラーが発生しました' 
    });
  }
}

/**
 * 管理者権限チェック用のミドルウェア
 * 環境変数ADMIN_USER_IDSで指定されたユーザーIDのみ管理者権限を付与
 */
export function authorizeAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    if (!req.user) {
      res.status(401).json({ 
        error: 'Authentication required' 
      });
      return;
    }

    // 環境変数から管理者ユーザーIDリストを取得
    const adminUserIds = process.env.ADMIN_USER_IDS?.split(',').map(id => id.trim()) || [];
    
    if (adminUserIds.length === 0) {
      console.error('⚠️ ADMIN_USER_IDS environment variable not configured');
      res.status(503).json({ 
        error: 'Service unavailable' 
      });
      return;
    }

    // 現在のユーザーが管理者リストに含まれているかチェック
    if (!adminUserIds.includes(req.user.id)) {
      res.status(403).json({ 
        error: 'Insufficient privileges' 
      });
      return;
    }

    // 管理者認証成功 - 次のミドルウェアに進む
    next();

  } catch (error) {
    console.error('Admin authorization error:', error);
    res.status(500).json({ 
      error: 'Authorization failed' 
    });
  }
}

/**
 * リソース所有者チェック用のミドルウェア
 * クイズセッションやクイズ結果などの所有者確認に使用
 */
export function authorizeResourceOwner(resourceType: 'session' | 'stats' | 'settings') {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (!req.user) {
        res.status(401).json({ 
          error: 'Unauthorized',
          message: '認証が必要です' 
        });
        return;
      }

      // リクエストボディからuserIdを取得（クイズ結果送信時など）
      const bodyUserId = req.body?.userId;
      
      // URLパラメータからuserIdを取得
      const paramUserId = req.params.userId || req.params.id;
      
      // どちらかのuserIdが存在し、認証済みユーザーのIDと一致するかチェック
      const targetUserId = bodyUserId || paramUserId;
      
      if (!targetUserId) {
        res.status(400).json({ 
          error: 'Bad Request',
          message: `${resourceType}のユーザーIDが指定されていません` 
        });
        return;
      }

      if (req.user.id !== targetUserId) {
        res.status(403).json({ 
          error: 'Forbidden',
          message: `他のユーザーの${resourceType}にはアクセスできません` 
        });
        return;
      }

      next();

    } catch (error) {
      console.error(`Resource owner authorization error for ${resourceType}:`, error);
      res.status(500).json({ 
        error: 'Internal Server Error',
        message: `${resourceType}の認可処理中にエラーが発生しました` 
      });
    }
  };
}