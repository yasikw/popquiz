/**
 * 画像プロキシミドルウェア
 * SSRF攻撃防止と信頼できるドメインからの画像のみを提供
 */

import { Request, Response, NextFunction } from 'express';
import fetch from 'node-fetch';
import { validateImageUrl, validateImageFile } from '../config/image-security';
import { securityLogger } from '../utils/securityLogger';
import rateLimit from 'express-rate-limit';

/**
 * 画像プロキシ用レート制限
 */
export const imageProxyRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分
  max: 100, // 1IPあたり15分間に100リクエスト
  message: {
    error: 'Too Many Requests',
    message: '画像プロキシへのリクエストが多すぎます。しばらく待ってから再試行してください。'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * 画像プロキシエンドポイント
 */
export async function imageProxyHandler(req: Request, res: Response): Promise<void> {
  try {
    const { url } = req.query;
    
    if (!url || typeof url !== 'string') {
      res.status(400).json({ 
        error: 'Bad Request',
        message: '画像URLパラメータが必要です' 
      });
      return;
    }
    
    // URL検証
    const validation = validateImageUrl(url);
    if (!validation.valid) {
      securityLogger.logSuspiciousActivity(
        'Invalid image URL request',
        req.user?.id,
        req.ip ?? 'unknown',
        { url, error: validation.error }
      );
      
      res.status(403).json({
        error: 'Forbidden',
        message: validation.error
      });
      return;
    }
    
    // 画像フェッチ
    const fetchResponse = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'AI-Quiz-App/1.0 (Image Proxy)',
        'Accept': 'image/*',
      },
      timeout: 10000, // 10秒タイムアウト
      size: 5 * 1024 * 1024, // 5MB制限
    });
    
    if (!fetchResponse.ok) {
      res.status(fetchResponse.status).json({
        error: 'Fetch Failed',
        message: '画像の取得に失敗しました'
      });
      return;
    }
    
    // Content-Type検証
    const contentType = fetchResponse.headers.get('content-type');
    if (!contentType || !contentType.startsWith('image/')) {
      securityLogger.logSuspiciousActivity(
        'Invalid content type from image URL',
        req.user?.id,
        req.ip ?? 'unknown',
        { url, contentType }
      );
      
      res.status(400).json({
        error: 'Invalid Content Type',
        message: '画像ファイルではありません'
      });
      return;
    }
    
    // 画像データ取得
    const buffer = await fetchResponse.buffer();
    
    // ファイル検証
    const fileValidation = validateImageFile(buffer, contentType, url);
    if (!fileValidation.valid) {
      securityLogger.logSuspiciousActivity(
        'Invalid image file from URL',
        req.user?.id,
        req.ip ?? 'unknown',
        { url, error: fileValidation.error }
      );
      
      res.status(400).json({
        error: 'Invalid Image File',
        message: fileValidation.error
      });
      return;
    }
    
    // キャッシュヘッダー設定
    res.set({
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600', // 1時間キャッシュ
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    });
    
    // 成功ログ
    securityLogger.log(
      'INFO', 
      'IMAGE_PROXY_SUCCESS',
      'Image successfully proxied',
      {
        userId: req.user?.id,
        ipAddress: req.ip ?? 'unknown',
        userAgent: req.get('User-Agent') ?? 'unknown',
        url: url,
        metadata: {
          contentType,
          size: buffer.length
        }
      }
    );
    
    res.send(buffer);
    
  } catch (error) {
    console.error('Image proxy error:', error);
    
    securityLogger.logSuspiciousActivity(
      'Image proxy error',
      req.user?.id,
      req.ip ?? 'unknown',
      { 
        url: req.query.url,
        error: error instanceof Error ? error.message : 'Unknown error' 
      }
    );
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: '画像プロキシでエラーが発生しました'
    });
  }
}

/**
 * 画像URL変換ミドルウェア
 * 外部画像URLを内部プロキシURL に変換
 */
export function transformImageUrls(req: Request, res: Response, next: NextFunction): void {
  const originalSend = res.send;
  
  res.send = function(data: any) {
    try {
      // HTMLレスポンスの場合のみ処理
      if (typeof data === 'string' && res.get('Content-Type')?.includes('text/html')) {
        // 外部画像URLをプロキシURLに変換
        const transformedData = data.replace(
          /<img[^>]+src="(https:\/\/[^"]+)"[^>]*>/gi,
          (match, imageUrl) => {
            const validation = validateImageUrl(imageUrl);
            if (validation.valid) {
              const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(imageUrl)}`;
              return match.replace(imageUrl, proxyUrl);
            }
            return match;
          }
        );
        return originalSend.call(this, transformedData);
      }
      
      return originalSend.call(this, data);
    } catch (error) {
      console.error('Image URL transformation error:', error);
      return originalSend.call(this, data);
    }
  };
  
  next();
}