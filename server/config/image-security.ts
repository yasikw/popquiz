/**
 * 画像セキュリティ設定
 * 信頼できるドメインのホワイトリストとセキュリティ制限
 */

export interface ImageSecurityConfig {
  allowedDomains: string[];
  maxFileSize: number; // bytes
  allowedMimeTypes: string[];
  allowedExtensions: string[];
  proxyEnabled: boolean;
  ssrfProtection: boolean;
}

/**
 * 信頼できる画像ドメインのホワイトリスト
 */
export const TRUSTED_IMAGE_DOMAINS = [
  // Google サービス
  'lh3.googleusercontent.com',
  'images.unsplash.com',
  'cdn.pixabay.com',
  'assets.example.com',
  
  // CDN プロバイダー
  'cdn.jsdelivr.net',
  'cdnjs.cloudflare.com',
  
  // アプリケーション関連ドメイン
  // 必要に応じてドメインを追加
];

/**
 * 画像セキュリティ設定
 */
export const IMAGE_SECURITY_CONFIG: ImageSecurityConfig = {
  allowedDomains: TRUSTED_IMAGE_DOMAINS,
  maxFileSize: 5 * 1024 * 1024, // 5MB
  allowedMimeTypes: [
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml'
  ],
  allowedExtensions: [
    '.jpg',
    '.jpeg',
    '.png', 
    '.gif',
    '.webp',
    '.svg'
  ],
  proxyEnabled: true,
  ssrfProtection: true
};

/**
 * ドメイン検証
 */
export function isAllowedDomain(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase();
    
    // ローカルホストやプライベートIPアドレスをブロック
    if (isPrivateOrLocalhost(hostname)) {
      return false;
    }
    
    // ホワイトリストに含まれているかチェック
    return TRUSTED_IMAGE_DOMAINS.some(domain => 
      hostname === domain || hostname.endsWith('.' + domain)
    );
  } catch {
    return false;
  }
}

/**
 * プライベートIP・ローカルホストの検証
 */
export function isPrivateOrLocalhost(hostname: string): boolean {
  // ローカルホスト
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return true;
  }
  
  // プライベートIPアドレス範囲
  const privateRanges = [
    /^10\./,                    // 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[01])\./, // 172.16.0.0/12
    /^192\.168\./,              // 192.168.0.0/16
    /^169\.254\./,              // 169.254.0.0/16 (Link-local)
  ];
  
  return privateRanges.some(range => range.test(hostname));
}

/**
 * URL検証（SSRF保護）
 */
export function validateImageUrl(url: string): { valid: boolean; error?: string } {
  try {
    const parsedUrl = new URL(url);
    
    // HTTPSのみ許可
    if (parsedUrl.protocol !== 'https:') {
      return { valid: false, error: 'HTTPS URLのみ許可されています' };
    }
    
    // ドメイン検証
    if (!isAllowedDomain(url)) {
      return { valid: false, error: '許可されていないドメインです' };
    }
    
    // 危険なパターンをチェック
    const dangerousPatterns = [
      /javascript:/i,
      /data:/i,
      /vbscript:/i,
      /about:/i,
      /file:/i,
    ];
    
    if (dangerousPatterns.some(pattern => pattern.test(url))) {
      return { valid: false, error: '危険なURLパターンが検出されました' };
    }
    
    return { valid: true };
  } catch {
    return { valid: false, error: '無効なURL形式です' };
  }
}

/**
 * 画像ファイル検証
 */
export function validateImageFile(buffer: Buffer, mimeType: string, filename: string): { valid: boolean; error?: string } {
  // ファイルサイズチェック
  if (buffer.length > IMAGE_SECURITY_CONFIG.maxFileSize) {
    return { 
      valid: false, 
      error: `ファイルサイズが制限を超えています（最大: ${IMAGE_SECURITY_CONFIG.maxFileSize / 1024 / 1024}MB）` 
    };
  }
  
  // MIMEタイプチェック
  if (!IMAGE_SECURITY_CONFIG.allowedMimeTypes.includes(mimeType)) {
    return { valid: false, error: '許可されていないファイル形式です' };
  }
  
  // 拡張子チェック
  const extension = filename.toLowerCase().substring(filename.lastIndexOf('.'));
  if (!IMAGE_SECURITY_CONFIG.allowedExtensions.includes(extension)) {
    return { valid: false, error: '許可されていない拡張子です' };
  }
  
  // マジックナンバーチェック（基本的な画像形式）
  const magicNumbers = {
    jpeg: [0xFF, 0xD8, 0xFF],
    png: [0x89, 0x50, 0x4E, 0x47],
    gif: [0x47, 0x49, 0x46],
    webp: [0x52, 0x49, 0x46, 0x46] // "RIFF"
  };
  
  let validMagic = false;
  for (const [type, magic] of Object.entries(magicNumbers)) {
    if (magic.every((byte, index) => buffer[index] === byte)) {
      validMagic = true;
      break;
    }
  }
  
  // WebPの追加チェック（RIFFの後に"WEBP"があるか）
  if (buffer.length >= 12 && 
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
    validMagic = true;
  }
  
  if (!validMagic) {
    return { valid: false, error: 'ファイルのマジックナンバーが画像形式と一致しません' };
  }
  
  return { valid: true };
}