/**
 * ユーザーフレンドリーなエラーページシステム
 * HTMLエラーページ、API統一レスポンス、多言語対応
 */

import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';

// エラーページテンプレート
export interface ErrorPageData {
  status: number;
  title: string;
  message: string;
  description: string;
  actionText: string;
  actionUrl: string;
  supportInfo: string;
  correlationId?: string;
}

// 多言語エラーメッセージ
interface ErrorMessages {
  [key: string]: {
    [statusCode: number]: {
      title: string;
      message: string;
      description: string;
      actionText: string;
      supportInfo: string;
    }
  }
}

const errorMessages: ErrorMessages = {
  ja: {
    400: {
      title: '不正なリクエスト',
      message: 'リクエストに問題があります',
      description: '送信されたデータに問題があります。入力内容を確認して再試行してください。',
      actionText: 'ホームに戻る',
      supportInfo: '問題が解決しない場合は、サポートにお問い合わせください。'
    },
    401: {
      title: '認証が必要です',
      message: 'ログインが必要です',
      description: 'このページにアクセスするには認証が必要です。',
      actionText: 'ログインする',
      supportInfo: 'ログインに問題がある場合は、パスワードをリセットしてください。'
    },
    403: {
      title: 'アクセス権限がありません',
      message: 'このリソースにアクセスする権限がありません',
      description: 'このページやリソースにアクセスする権限をお持ちではありません。',
      actionText: 'ホームに戻る',
      supportInfo: 'アクセス権限が必要な場合は、管理者にお問い合わせください。'
    },
    404: {
      title: 'ページが見つかりません',
      message: 'お探しのページは見つかりませんでした',
      description: 'URLが間違っているか、ページが削除された可能性があります。',
      actionText: 'ホームに戻る',
      supportInfo: 'リンクが正しいことを確認するか、サイト内検索をご利用ください。'
    },
    429: {
      title: 'リクエストが多すぎます',
      message: 'アクセス頻度が制限を超えています',
      description: '短時間に多くのリクエストが送信されました。しばらく時間をおいてから再試行してください。',
      actionText: '時間をおいて再試行',
      supportInfo: '継続的にこのエラーが発生する場合は、サポートにお問い合わせください。'
    },
    500: {
      title: 'サーバーエラー',
      message: 'サーバーで問題が発生しました',
      description: '申し訳ございませんが、サーバーで一時的な問題が発生しています。',
      actionText: '再読み込み',
      supportInfo: 'この問題が継続する場合は、サポートにお問い合わせください。'
    },
    502: {
      title: 'サービス一時停止',
      message: 'サービスが一時的に利用できません',
      description: 'メンテナンスまたは一時的な問題により、サービスが利用できません。',
      actionText: 'しばらく待ってから再試行',
      supportInfo: 'メンテナンス情報については、お知らせをご確認ください。'
    },
    503: {
      title: 'サービス利用不可',
      message: 'サービスが一時的に利用できません',
      description: 'サーバーが過負荷状態またはメンテナンス中です。',
      actionText: 'しばらく待ってから再試行',
      supportInfo: 'サービス状況については、ステータスページをご確認ください。'
    }
  },
  en: {
    400: {
      title: 'Bad Request',
      message: 'There was a problem with your request',
      description: 'The data sent has some issues. Please check your input and try again.',
      actionText: 'Go Home',
      supportInfo: 'If the problem persists, please contact support.'
    },
    401: {
      title: 'Authentication Required',
      message: 'Please log in to continue',
      description: 'Authentication is required to access this page.',
      actionText: 'Log In',
      supportInfo: 'If you have login issues, please reset your password.'
    },
    403: {
      title: 'Access Forbidden',
      message: 'You do not have permission to access this resource',
      description: 'You do not have permission to access this page or resource.',
      actionText: 'Go Home',
      supportInfo: 'If you need access permissions, please contact an administrator.'
    },
    404: {
      title: 'Page Not Found',
      message: 'The page you requested was not found',
      description: 'The URL may be incorrect or the page may have been deleted.',
      actionText: 'Go Home',
      supportInfo: 'Please verify the link is correct or use our site search.'
    },
    429: {
      title: 'Too Many Requests',
      message: 'Access frequency exceeds limits',
      description: 'Too many requests were sent in a short time. Please wait a moment before retrying.',
      actionText: 'Retry Later',
      supportInfo: 'If this error continues, please contact support.'
    },
    500: {
      title: 'Server Error',
      message: 'A problem occurred on the server',
      description: 'We apologize, but a temporary problem has occurred on the server.',
      actionText: 'Reload',
      supportInfo: 'If this problem continues, please contact support.'
    },
    502: {
      title: 'Service Temporarily Unavailable',
      message: 'Service is temporarily unavailable',
      description: 'The service is unavailable due to maintenance or temporary issues.',
      actionText: 'Please wait and retry',
      supportInfo: 'Please check our announcements for maintenance information.'
    },
    503: {
      title: 'Service Unavailable',
      message: 'Service is temporarily unavailable',
      description: 'The server is overloaded or under maintenance.',
      actionText: 'Please wait and retry',
      supportInfo: 'Please check our status page for service status.'
    }
  }
};

/**
 * エラーページHTMLテンプレート
 */
const generateErrorPageHTML = (data: ErrorPageData): string => {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${data.title} - Japanese Quiz App</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #333;
        }
        
        .error-container {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border-radius: 20px;
            padding: 3rem;
            max-width: 500px;
            width: 90%;
            text-align: center;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
            animation: fadeIn 0.5s ease-out;
        }
        
        @keyframes fadeIn {
            from {
                opacity: 0;
                transform: translateY(20px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        .error-icon {
            font-size: 4rem;
            margin-bottom: 1rem;
            color: #ff6b6b;
            animation: bounce 2s infinite;
        }
        
        @keyframes bounce {
            0%, 20%, 50%, 80%, 100% {
                transform: translateY(0);
            }
            40% {
                transform: translateY(-10px);
            }
            60% {
                transform: translateY(-5px);
            }
        }
        
        .error-status {
            font-size: 6rem;
            font-weight: bold;
            color: #667eea;
            margin-bottom: 1rem;
            line-height: 1;
        }
        
        .error-title {
            font-size: 1.5rem;
            font-weight: 600;
            margin-bottom: 1rem;
            color: #2c3e50;
        }
        
        .error-message {
            font-size: 1.1rem;
            margin-bottom: 1rem;
            color: #555;
        }
        
        .error-description {
            font-size: 0.9rem;
            line-height: 1.6;
            margin-bottom: 2rem;
            color: #666;
        }
        
        .action-button {
            background: linear-gradient(45deg, #667eea, #764ba2);
            color: white;
            padding: 0.75rem 2rem;
            border: none;
            border-radius: 50px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            text-decoration: none;
            display: inline-block;
            margin-bottom: 1.5rem;
        }
        
        .action-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
        }
        
        .support-info {
            font-size: 0.8rem;
            color: #888;
            margin-bottom: 1rem;
        }
        
        .correlation-id {
            font-family: 'Courier New', monospace;
            font-size: 0.7rem;
            color: #999;
            background: #f8f9fa;
            padding: 0.5rem;
            border-radius: 5px;
            margin-top: 1rem;
        }
        
        .correlation-id span {
            font-weight: 600;
        }
        
        @media (max-width: 600px) {
            .error-container {
                padding: 2rem;
                margin: 1rem;
            }
            
            .error-status {
                font-size: 4rem;
            }
            
            .error-title {
                font-size: 1.3rem;
            }
        }
        
        .decorative-elements {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            overflow: hidden;
            z-index: -1;
        }
        
        .floating-shape {
            position: absolute;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 50%;
            animation: float 6s ease-in-out infinite;
        }
        
        .floating-shape:nth-child(1) {
            width: 80px;
            height: 80px;
            top: 10%;
            left: 10%;
            animation-delay: 0s;
        }
        
        .floating-shape:nth-child(2) {
            width: 60px;
            height: 60px;
            top: 70%;
            right: 10%;
            animation-delay: 2s;
        }
        
        .floating-shape:nth-child(3) {
            width: 100px;
            height: 100px;
            bottom: 10%;
            left: 20%;
            animation-delay: 4s;
        }
        
        @keyframes float {
            0%, 100% {
                transform: translateY(0px) rotate(0deg);
            }
            50% {
                transform: translateY(-20px) rotate(10deg);
            }
        }
    </style>
</head>
<body>
    <div class="decorative-elements">
        <div class="floating-shape"></div>
        <div class="floating-shape"></div>
        <div class="floating-shape"></div>
    </div>
    
    <div class="error-container">
        <div class="error-icon">⚠️</div>
        <div class="error-status">${data.status}</div>
        <h1 class="error-title">${data.title}</h1>
        <p class="error-message">${data.message}</p>
        <p class="error-description">${data.description}</p>
        
        <a href="${data.actionUrl}" class="action-button">
            ${data.actionText}
        </a>
        
        <p class="support-info">${data.supportInfo}</p>
        
        ${data.correlationId ? `
        <div class="correlation-id">
            <span>エラーID:</span> ${data.correlationId}
        </div>
        ` : ''}
    </div>

    <script>
        // 自動リロード機能（5xxエラーの場合）
        if (${data.status} >= 500 && ${data.status} < 600) {
            let retryCount = 0;
            const maxRetries = 3;
            const retryDelay = 30000; // 30秒
            
            function autoRetry() {
                if (retryCount < maxRetries) {
                    retryCount++;
                    setTimeout(() => {
                        window.location.reload();
                    }, retryDelay);
                }
            }
            
            // 30秒後に自動リトライ開始
            setTimeout(autoRetry, retryDelay);
        }
        
        // 戻るボタンの処理
        document.querySelector('.action-button').addEventListener('click', (e) => {
            if (e.target.href === '#') {
                e.preventDefault();
                if (window.history.length > 1) {
                    window.history.back();
                } else {
                    window.location.href = '/';
                }
            }
        });
    </script>
</body>
</html>`;
};

/**
 * エラーページ管理システム
 */
export class UserFriendlyErrorPages {
  private defaultLanguage = 'ja';
  
  /**
   * 言語の検出
   */
  private detectLanguage(req: Request): string {
    const acceptLanguage = req.get('Accept-Language') || '';
    
    if (acceptLanguage.includes('en')) {
      return 'en';
    }
    
    return this.defaultLanguage;
  }

  /**
   * エラーページデータの生成
   */
  private generateErrorPageData(
    status: number, 
    language: string, 
    correlationId?: string,
    customMessage?: string
  ): ErrorPageData {
    const messages = errorMessages[language] || errorMessages[this.defaultLanguage];
    const errorData = messages[status] || messages[500];
    
    let actionUrl = '/';
    
    // ステータス別のアクション設定
    switch (status) {
      case 401:
        actionUrl = '/login';
        break;
      case 404:
        actionUrl = '/';
        break;
      case 429:
        actionUrl = '#'; // JavaScript で処理
        break;
      case 500:
      case 502:
      case 503:
        actionUrl = '#'; // JavaScript でリロード
        break;
      default:
        actionUrl = '/';
        break;
    }

    return {
      status,
      title: errorData.title,
      message: customMessage || errorData.message,
      description: errorData.description,
      actionText: errorData.actionText,
      actionUrl,
      supportInfo: errorData.supportInfo,
      correlationId
    };
  }

  /**
   * HTMLエラーページの生成
   */
  generateErrorPage(
    req: Request, 
    status: number, 
    correlationId?: string,
    customMessage?: string
  ): string {
    const language = this.detectLanguage(req);
    const pageData = this.generateErrorPageData(status, language, correlationId, customMessage);
    
    return generateErrorPageHTML(pageData);
  }

  /**
   * API向けエラーレスポンスの生成
   */
  generateApiErrorResponse(
    req: Request, 
    status: number, 
    correlationId?: string,
    customMessage?: string,
    details?: any
  ): any {
    const language = this.detectLanguage(req);
    const messages = errorMessages[language] || errorMessages[this.defaultLanguage];
    const errorData = messages[status] || messages[500];

    return {
      error: true,
      status,
      code: this.getErrorCode(status),
      message: customMessage || errorData.message,
      description: errorData.description,
      correlationId,
      timestamp: new Date().toISOString(),
      path: req.path,
      details: process.env.NODE_ENV !== 'production' ? details : undefined
    };
  }

  private getErrorCode(status: number): string {
    const codes: { [key: number]: string } = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      405: 'METHOD_NOT_ALLOWED',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_SERVER_ERROR',
      501: 'NOT_IMPLEMENTED',
      502: 'BAD_GATEWAY',
      503: 'SERVICE_UNAVAILABLE',
      504: 'GATEWAY_TIMEOUT'
    };
    
    return codes[status] || 'UNKNOWN_ERROR';
  }

  /**
   * カスタムエラーページの登録
   */
  registerCustomErrorPage(
    status: number, 
    language: string, 
    errorInfo: {
      title: string;
      message: string;
      description: string;
      actionText: string;
      supportInfo: string;
    }
  ): void {
    if (!errorMessages[language]) {
      errorMessages[language] = {};
    }
    
    errorMessages[language][status] = errorInfo;
  }

  /**
   * 健康状態チェック用のページ
   */
  generateHealthCheckPage(): string {
    return `<!DOCTYPE html>
<html>
<head>
    <title>Service Health Check</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 2rem; }
        .status { color: green; font-size: 2rem; margin: 1rem; }
        .info { color: #666; margin: 0.5rem; }
    </style>
</head>
<body>
    <h1>Japanese Quiz App</h1>
    <div class="status">✓ Service is running</div>
    <div class="info">Timestamp: ${new Date().toISOString()}</div>
    <div class="info">Environment: ${process.env.NODE_ENV || 'development'}</div>
</body>
</html>`;
  }
}

// シングルトンインスタンス
export const userFriendlyErrorPages = new UserFriendlyErrorPages();

/**
 * ユーザーフレンドリーエラーページミドルウェア
 */
export function userFriendlyErrorMiddleware(
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const status = error.status || error.statusCode || 500;
  const correlationId = error.correlationId || `err-${Date.now()}`;
  
  // APIリクエストの判定
  const isApiRequest = req.path.startsWith('/api/') || 
                       req.get('Accept')?.includes('application/json') ||
                       req.get('Content-Type')?.includes('application/json');

  if (isApiRequest) {
    // API向けレスポンス
    const apiResponse = userFriendlyErrorPages.generateApiErrorResponse(
      req, 
      status, 
      correlationId, 
      error.message,
      process.env.NODE_ENV !== 'production' ? error.details : undefined
    );
    
    res.status(status).json(apiResponse);
  } else {
    // HTML向けレスポンス
    const errorPage = userFriendlyErrorPages.generateErrorPage(
      req, 
      status, 
      correlationId,
      error.message
    );
    
    res.status(status).type('html').send(errorPage);
  }
}