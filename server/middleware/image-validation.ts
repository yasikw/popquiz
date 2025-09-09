/**
 * 画像検証ミドルウェア
 * 画像アップロードと処理のセキュリティ強化
 */

import { Request, Response, NextFunction } from 'express';
import { validateImageFile, validateImageUrl } from '../config/image-security';
import { securityLogger } from '../utils/securityLogger';

/**
 * 画像アップロード検証ミドルウェア
 */
export function validateImageUpload(req: Request, res: Response, next: NextFunction): void {
  try {
    if (!req.file) {
      next();
      return;
    }
    
    const file = req.file;
    const validation = validateImageFile(file.buffer, file.mimetype, file.originalname);
    
    if (!validation.valid) {
      securityLogger.logSuspiciousActivity(
        'Invalid image upload attempt',
        req.user?.id,
        req.ip ?? 'unknown',
        { 
          filename: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          error: validation.error
        }
      );
      
      res.status(400).json({
        error: 'Invalid Image',
        message: validation.error
      });
      return;
    }
    
    // 成功ログ
    securityLogger.log(
      'info',
      'IMAGE_UPLOAD_SUCCESS', 
      'Image upload validated successfully',
      {
        userId: req.user?.id,
        ipAddress: req.ip ?? 'unknown',
        userAgent: req.get('User-Agent') ?? 'unknown',
        filename: file.originalname,
        metadata: {
          mimetype: file.mimetype,
          size: file.size
        }
      }
    );
    
    next();
  } catch (error) {
    console.error('Image validation error:', error);
    securityLogger.logSuspiciousActivity(
      'Image validation error',
      req.user?.id,
      req.ip ?? 'unknown',
      { error: error instanceof Error ? error.message : 'Unknown error' }
    );
    
    res.status(500).json({
      error: 'Validation Error',
      message: '画像検証でエラーが発生しました'
    });
  }
}

/**
 * 画像URL検証ミドルウェア
 */
export function validateImageUrlMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    const { imageUrl } = req.body;
    
    if (!imageUrl) {
      next();
      return;
    }
    
    const validation = validateImageUrl(imageUrl);
    
    if (!validation.valid) {
      securityLogger.logSuspiciousActivity(
        'Invalid image URL submitted',
        req.user?.id,
        req.ip ?? 'unknown',
        { 
          imageUrl,
          error: validation.error
        }
      );
      
      res.status(400).json({
        error: 'Invalid Image URL',
        message: validation.error
      });
      return;
    }
    
    next();
  } catch (error) {
    console.error('Image URL validation error:', error);
    res.status(500).json({
      error: 'Validation Error',
      message: '画像URL検証でエラーが発生しました'
    });
  }
}

/**
 * Content-Type強化検証
 */
export function enforceImageContentType(req: Request, res: Response, next: NextFunction): void {
  try {
    if (!req.file) {
      next();
      return;
    }
    
    const file = req.file;
    const contentType = file.mimetype;
    
    // Content-Typeヘッダーとファイル内容の整合性チェック
    const buffer = file.buffer;
    let expectedMimeType: string | null = null;
    
    // マジックナンバーでMIMEタイプを判定
    if (buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      expectedMimeType = 'image/jpeg';
    } else if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      expectedMimeType = 'image/png';
    } else if (buffer.length >= 6 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
      expectedMimeType = 'image/gif';
    } else if (buffer.length >= 12 && 
               buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
               buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
      expectedMimeType = 'image/webp';
    }
    
    // MIMEタイプの不一致をチェック
    if (expectedMimeType && expectedMimeType !== contentType) {
      securityLogger.logSuspiciousActivity(
        'MIME type mismatch detected',
        req.user?.id,
        req.ip ?? 'unknown',
        { 
          filename: file.originalname,
          declaredMimeType: contentType,
          detectedMimeType: expectedMimeType
        }
      );
      
      res.status(400).json({
        error: 'MIME Type Mismatch',
        message: 'ファイルの実際の形式と申告された形式が一致しません'
      });
      return;
    }
    
    next();
  } catch (error) {
    console.error('Content-Type validation error:', error);
    res.status(500).json({
      error: 'Content-Type Validation Error',
      message: 'Content-Type検証でエラーが発生しました'
    });
  }
}