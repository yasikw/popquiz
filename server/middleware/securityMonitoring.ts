import { Request, Response, NextFunction } from 'express';
import { securityLogger, SecurityLogLevel, SecurityEventType } from '../utils/securityLogger';
import rateLimit from 'express-rate-limit';
import type { SecureAuthenticatedUser, SecureRequest } from '@shared/types';

// Express Request型の拡張 (using secure types)
interface ExtendedRequest extends Request {
  sessionID?: string;
  session?: {
    lastUserAgent?: string;
    lastIpAddress?: string;
    [key: string]: unknown;
  };
  user?: SecureAuthenticatedUser;
}

// 異常なトラフィックパターンを検知するミドルウェア
export function abnormalTrafficDetection(req: ExtendedRequest, res: Response, next: NextFunction): void {
  const userAgent = req.get('User-Agent') || '';
  const ipAddress = req.ip || req.connection?.remoteAddress || 'unknown';
  
  // 怪しいUser-Agentパターン
  const suspiciousUserAgents = [
    /sqlmap/i,
    /nikto/i,
    /dirb/i,
    /nmap/i,
    /masscan/i,
    /burp/i,
    /owasp/i,
    /python-requests/i,
    /curl.*bot/i,
    /scanner/i,
    /exploit/i,
    /attack/i
  ];

  // 怪しいパスパターン
  const suspiciousPaths = [
    /\/\.env/i,
    /\/config\./i,
    /\/admin/i,
    /\/phpmyadmin/i,
    /\/wp-admin/i,
    /\/\.git/i,
    /\/\.svn/i,
    /\/backup/i,
    /\/dump/i,
    /\/db_backup/i,
    /\/database/i,
    /\.\./,  // Directory traversal
    /%2e%2e/i, // URL encoded directory traversal
    /union.*select/i, // SQL injection
    /<script/i, // XSS
    /javascript:/i, // XSS
    /vbscript:/i, // XSS
    /onload=/i, // XSS
    /onerror=/i // XSS
  ];

  let suspiciousActivity = false;
  let reason = '';

  // User-Agentチェック
  for (const pattern of suspiciousUserAgents) {
    if (pattern.test(userAgent)) {
      suspiciousActivity = true;
      reason = 'Suspicious User-Agent detected';
      break;
    }
  }

  // パスチェック
  if (!suspiciousActivity) {
    for (const pattern of suspiciousPaths) {
      if (pattern.test(req.path) || pattern.test(req.url)) {
        suspiciousActivity = true;
        reason = 'Suspicious path pattern detected';
        break;
      }
    }
  }

  // リクエストボディの怪しいパターンをチェック
  if (!suspiciousActivity && req.body) {
    const bodyStr = JSON.stringify(req.body).toLowerCase();
    const suspiciousPatterns = [
      /union.*select/,
      /drop.*table/,
      /delete.*from/,
      /insert.*into/,
      /update.*set/,
      /<script/,
      /javascript:/,
      /eval\(/,
      /settimeout\(/,
      /setinterval\(/
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(bodyStr)) {
        suspiciousActivity = true;
        reason = 'Suspicious payload pattern detected';
        break;
      }
    }
  }

  if (suspiciousActivity) {
    securityLogger.logSuspiciousActivity(reason, req.user?.id, ipAddress, {
      userAgent,
      path: req.path,
      method: req.method,
      headers: {
        referer: req.get('Referer'),
        contentType: req.get('Content-Type')
      }
    });
  }

  next();
}

// ファイルアップロード監視ミドルウェア
export function fileUploadMonitoring(req: ExtendedRequest, res: Response, next: NextFunction): void {
  const originalSend = res.send;
  
  res.send = function(data: any) {
    const ipAddress = req.ip || req.connection?.remoteAddress || 'unknown';
    
    if (req.file) {
      if (res.statusCode >= 400) {
        // アップロード失敗をログ
        securityLogger.logFileUploadRejected(
          req.user?.id,
          req.file.originalname,
          res.statusCode === 413 ? 'File too large' : 
          res.statusCode === 415 ? 'Unsupported media type' :
          res.statusCode === 400 ? 'Invalid file' : 'Upload failed',
          ipAddress
        );
      } else {
        // 成功したアップロードをログ
        securityLogger.logFileUpload(
          req.user?.id,
          req.file.originalname,
          req.file.size,
          req.file.mimetype,
          ipAddress
        );
      }
    }

    return originalSend.call(this, data);
  };

  next();
}

// 認証失敗監視ミドルウェア
export function authFailureMonitoring(req: ExtendedRequest, res: Response, next: NextFunction): void {
  const originalSend = res.send;
  
  res.send = function(data: any) {
    const ipAddress = req.ip || req.connection?.remoteAddress || 'unknown';
    const userAgent = req.get('User-Agent');

    if (res.statusCode === 401) {
      securityLogger.logAuthFailure(
        req.body?.username,
        ipAddress,
        userAgent,
        'Invalid credentials'
      );
    } else if (res.statusCode === 403) {
      securityLogger.logPermissionDenied(
        req.user?.id,
        req.path,
        ipAddress
      );
    }

    return originalSend.call(this, data);
  };

  next();
}

// レート制限監視用のカスタムハンドラー
export const rateLimitHandler = (req: ExtendedRequest, res: Response) => {
  const ipAddress = req.ip || req.connection?.remoteAddress || 'unknown';
  
  securityLogger.logRateLimitExceeded(
    ipAddress,
    req.path,
    req.user?.id
  );

  res.status(429).json({
    message: 'Too many requests',
    retryAfter: '1 minute'
  });
};

// セキュリティヘッダー監視ミドルウェア
export function securityHeadersMonitoring(req: ExtendedRequest, res: Response, next: NextFunction): void {
  // CSRF トークンの検証
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    const csrfToken = req.get('X-CSRF-Token') || req.body?._csrf;
    if (!csrfToken && !req.path.startsWith('/api/auth/')) {
      securityLogger.log(
        SecurityLogLevel.WARNING,
        SecurityEventType.CSRF_VIOLATION,
        'Missing CSRF token',
        {
          userId: req.user?.id,
          ipAddress: req.ip || req.connection?.remoteAddress,
          endpoint: req.path,
          method: req.method
        }
      );
    }
  }

  // Referrer チェック（CSRF攻撃の検知）
  const referer = req.get('Referer');
  const origin = req.get('Origin');
  const host = req.get('Host');
  
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) && referer) {
    try {
      const refererUrl = new URL(referer);
      if (refererUrl.hostname !== host && !origin?.includes(host || '')) {
        securityLogger.log(
          SecurityLogLevel.WARNING,
          SecurityEventType.CSRF_VIOLATION,
          'Suspicious cross-origin request',
          {
            userId: req.user?.id,
            ipAddress: req.ip || req.connection?.remoteAddress,
            endpoint: req.path,
            method: req.method,
            metadata: {
              referer,
              origin,
              host
            }
          }
        );
      }
    } catch (error) {
      // Invalid referer URL
    }
  }

  next();
}

// セッションハイジャック検知ミドルウェア
export function sessionHijackDetection(req: ExtendedRequest, res: Response, next: NextFunction): void {
  if (req.user && req.sessionID) {
    const currentUserAgent = req.get('User-Agent') || '';
    const currentIp = req.ip || req.connection?.remoteAddress || 'unknown';
    
    // セッションに前回のUser-AgentとIPアドレスを保存
    if (req.session) {
      if (!req.session.lastUserAgent || !req.session.lastIpAddress) {
        req.session.lastUserAgent = currentUserAgent;
        req.session.lastIpAddress = currentIp;
      } else {
        // User-Agentの急激な変化をチェック
        if (req.session.lastUserAgent !== currentUserAgent) {
          securityLogger.log(
            SecurityLogLevel.WARNING,
            SecurityEventType.SESSION_HIJACK_ATTEMPT,
            'User-Agent change detected in active session',
            {
              userId: req.user.id,
              sessionId: req.sessionID,
              ipAddress: currentIp,
              metadata: {
                previousUserAgent: '[REDACTED]',
                currentUserAgent: '[REDACTED]',
                ipChanged: req.session.lastIpAddress !== currentIp
              }
            }
          );
        }

        // IPアドレスの変化をチェック（警告レベル）
        if (req.session.lastIpAddress !== currentIp) {
          securityLogger.log(
            SecurityLogLevel.INFO,
            SecurityEventType.SUSPICIOUS_ACTIVITY,
            'IP address change detected in active session',
            {
              userId: req.user.id,
              sessionId: req.sessionID,
              ipAddress: currentIp,
              metadata: {
                previousIp: req.session.lastIpAddress,
                userAgentChanged: req.session.lastUserAgent !== currentUserAgent
              }
            }
          );
        }

        // 現在の値を更新
        req.session.lastUserAgent = currentUserAgent;
        req.session.lastIpAddress = currentIp;
      }
    }
  }

  next();
}

// レート制限の設定
export const createSecurityRateLimit = (windowMs: number, max: number, message: string) => {
  return rateLimit({
    windowMs,
    max,
    message: { message },
    handler: rateLimitHandler,
    standardHeaders: true,
    legacyHeaders: false,
  });
};