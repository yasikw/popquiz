/**
 * ログローテーション・保存期間管理システム
 * 自動化された定期実行とストレージ最適化
 */

import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { gzip } from 'zlib';

const gzipAsync = promisify(gzip);

// 保存期間設定
interface RetentionPolicy {
  logType: 'security' | 'access' | 'error' | 'audit';
  retentionDays: number;
  compressionAfterDays: number;
  archiveAfterDays: number;
  maxFileSize: number; // bytes
  maxTotalSize: number; // bytes
  enabled: boolean;
}

// ログファイル情報
interface LogFileInfo {
  filePath: string;
  fileName: string;
  size: number;
  createdAt: Date;
  modifiedAt: Date;
  isCompressed: boolean;
  isArchived: boolean;
  logType: string;
}

// ストレージ統計
interface StorageStats {
  totalFiles: number;
  totalSize: number;
  compressedFiles: number;
  compressedSize: number;
  oldestFile: Date | null;
  newestFile: Date | null;
  byType: Record<string, {
    files: number;
    size: number;
    averageAge: number;
  }>;
}

/**
 * ログローテーション管理
 */
class LogRotationManager {
  private rotationSchedule: Map<string, NodeJS.Timeout> = new Map();

  /**
   * ファイルサイズベースのローテーション
   */
  async rotateBySize(filePath: string, maxSize: number, keepFiles: number = 10): Promise<boolean> {
    try {
      if (!fs.existsSync(filePath)) {
        return false;
      }

      const stats = fs.statSync(filePath);
      if (stats.size < maxSize) {
        return false;
      }

      const directory = path.dirname(filePath);
      const baseName = path.basename(filePath);
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      
      // 新しいファイル名
      const rotatedFileName = `${baseName}.${timestamp}`;
      const rotatedFilePath = path.join(directory, rotatedFileName);

      // ファイルを移動
      fs.renameSync(filePath, rotatedFilePath);

      // 古いローテーションファイルを削除
      await this.cleanupOldRotations(directory, baseName, keepFiles);

      console.log(`Log rotated: ${filePath} -> ${rotatedFilePath}`);
      return true;
    } catch (error) {
      console.error('Error rotating log file:', error);
      return false;
    }
  }

  /**
   * 時間ベースのローテーション
   */
  async rotateByTime(filePath: string, intervalHours: number = 24): Promise<boolean> {
    try {
      if (!fs.existsSync(filePath)) {
        return false;
      }

      const stats = fs.statSync(filePath);
      const ageHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);

      if (ageHours < intervalHours) {
        return false;
      }

      const directory = path.dirname(filePath);
      const baseName = path.basename(filePath);
      const timestamp = stats.mtime.toISOString().replace(/[:.]/g, '-');
      
      const rotatedFileName = `${baseName}.${timestamp}`;
      const rotatedFilePath = path.join(directory, rotatedFileName);

      fs.renameSync(filePath, rotatedFilePath);

      console.log(`Log rotated by time: ${filePath} -> ${rotatedFilePath}`);
      return true;
    } catch (error) {
      console.error('Error rotating log by time:', error);
      return false;
    }
  }

  /**
   * 古いローテーションファイルの削除
   */
  private async cleanupOldRotations(directory: string, baseName: string, keepFiles: number): Promise<void> {
    try {
      const files = fs.readdirSync(directory)
        .filter(file => file.startsWith(`${baseName}.`))
        .map(file => ({
          name: file,
          path: path.join(directory, file),
          stats: fs.statSync(path.join(directory, file))
        }))
        .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime());

      // 保持数を超えたファイルを削除
      if (files.length > keepFiles) {
        for (const file of files.slice(keepFiles)) {
          fs.unlinkSync(file.path);
          console.log(`Deleted old rotation file: ${file.name}`);
        }
      }
    } catch (error) {
      console.error('Error cleaning up old rotation files:', error);
    }
  }

  /**
   * 自動ローテーションスケジュールの設定
   */
  scheduleRotation(filePath: string, intervalHours: number, maxSize: number): void {
    const scheduleKey = filePath;
    
    // 既存のスケジュールをクリア
    if (this.rotationSchedule.has(scheduleKey)) {
      clearInterval(this.rotationSchedule.get(scheduleKey)!);
    }

    // 新しいスケジュールを設定
    const interval = setInterval(async () => {
      await this.rotateBySize(filePath, maxSize);
      await this.rotateByTime(filePath, intervalHours);
    }, 60 * 60 * 1000); // 1時間ごとにチェック

    this.rotationSchedule.set(scheduleKey, interval);
    console.log(`Scheduled rotation for ${filePath}: ${intervalHours}h or ${maxSize} bytes`);
  }

  /**
   * スケジュールの停止
   */
  stopRotation(filePath: string): void {
    const interval = this.rotationSchedule.get(filePath);
    if (interval) {
      clearInterval(interval);
      this.rotationSchedule.delete(filePath);
      console.log(`Stopped rotation schedule for ${filePath}`);
    }
  }

  /**
   * 全スケジュールの停止
   */
  stopAllRotations(): void {
    for (const [filePath, interval] of this.rotationSchedule) {
      clearInterval(interval);
    }
    this.rotationSchedule.clear();
    console.log('Stopped all rotation schedules');
  }
}

/**
 * ログ圧縮管理
 */
class LogCompressionManager {
  /**
   * ファイルの圧縮
   */
  async compressFile(filePath: string): Promise<string | null> {
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const fileContent = fs.readFileSync(filePath);
      const compressedContent = await gzipAsync(fileContent);
      const compressedPath = `${filePath}.gz`;

      fs.writeFileSync(compressedPath, compressedContent);
      fs.unlinkSync(filePath); // 元ファイルを削除

      console.log(`Compressed: ${filePath} -> ${compressedPath}`);
      return compressedPath;
    } catch (error) {
      console.error('Error compressing file:', error);
      return null;
    }
  }

  /**
   * 古いファイルの自動圧縮
   */
  async compressOldFiles(directory: string, ageThresholdDays: number): Promise<number> {
    try {
      if (!fs.existsSync(directory)) {
        return 0;
      }

      const cutoffTime = Date.now() - (ageThresholdDays * 24 * 60 * 60 * 1000);
      let compressedCount = 0;

      const files = fs.readdirSync(directory, { withFileTypes: true });
      
      for (const file of files) {
        if (!file.isFile() || file.name.endsWith('.gz')) {
          continue;
        }

        const filePath = path.join(directory, file.name);
        const stats = fs.statSync(filePath);

        if (stats.mtime.getTime() < cutoffTime) {
          const compressed = await this.compressFile(filePath);
          if (compressed) {
            compressedCount++;
          }
        }
      }

      return compressedCount;
    } catch (error) {
      console.error('Error compressing old files:', error);
      return 0;
    }
  }

  /**
   * 圧縮率の計算
   */
  calculateCompressionRatio(originalSize: number, compressedSize: number): number {
    if (originalSize === 0) return 0;
    return ((originalSize - compressedSize) / originalSize) * 100;
  }
}

/**
 * ログアーカイブ管理
 */
class LogArchiveManager {
  private archiveDirectory: string;

  constructor() {
    this.archiveDirectory = path.join(process.cwd(), 'logs', 'archive');
    this.ensureArchiveDirectory();
  }

  private ensureArchiveDirectory(): void {
    if (!fs.existsSync(this.archiveDirectory)) {
      fs.mkdirSync(this.archiveDirectory, { recursive: true });
    }
  }

  /**
   * ファイルのアーカイブ
   */
  async archiveFile(filePath: string, logType: string): Promise<string | null> {
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const fileName = path.basename(filePath);
      const typeDirectory = path.join(this.archiveDirectory, logType);
      
      if (!fs.existsSync(typeDirectory)) {
        fs.mkdirSync(typeDirectory, { recursive: true });
      }

      const archivedPath = path.join(typeDirectory, fileName);
      
      // ファイルを移動
      fs.renameSync(filePath, archivedPath);

      console.log(`Archived: ${filePath} -> ${archivedPath}`);
      return archivedPath;
    } catch (error) {
      console.error('Error archiving file:', error);
      return null;
    }
  }

  /**
   * 古いファイルの自動アーカイブ
   */
  async archiveOldFiles(directory: string, logType: string, ageThresholdDays: number): Promise<number> {
    try {
      if (!fs.existsSync(directory)) {
        return 0;
      }

      const cutoffTime = Date.now() - (ageThresholdDays * 24 * 60 * 60 * 1000);
      let archivedCount = 0;

      const files = fs.readdirSync(directory, { withFileTypes: true });
      
      for (const file of files) {
        if (!file.isFile()) {
          continue;
        }

        const filePath = path.join(directory, file.name);
        const stats = fs.statSync(filePath);

        if (stats.mtime.getTime() < cutoffTime) {
          const archived = await this.archiveFile(filePath, logType);
          if (archived) {
            archivedCount++;
          }
        }
      }

      return archivedCount;
    } catch (error) {
      console.error('Error archiving old files:', error);
      return 0;
    }
  }

  /**
   * アーカイブ統計の取得
   */
  getArchiveStats(): Record<string, { files: number; totalSize: number }> {
    const stats: Record<string, { files: number; totalSize: number }> = {};

    try {
      if (!fs.existsSync(this.archiveDirectory)) {
        return stats;
      }

      const logTypes = fs.readdirSync(this.archiveDirectory, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);

      for (const logType of logTypes) {
        const typeDirectory = path.join(this.archiveDirectory, logType);
        const files = fs.readdirSync(typeDirectory, { withFileTypes: true })
          .filter(entry => entry.isFile());

        let totalSize = 0;
        for (const file of files) {
          const filePath = path.join(typeDirectory, file.name);
          const fileStats = fs.statSync(filePath);
          totalSize += fileStats.size;
        }

        stats[logType] = {
          files: files.length,
          totalSize
        };
      }
    } catch (error) {
      console.error('Error getting archive stats:', error);
    }

    return stats;
  }
}

/**
 * メインのログ保存期間管理システム
 */
export class LogRetentionManager {
  private rotationManager: LogRotationManager;
  private compressionManager: LogCompressionManager;
  private archiveManager: LogArchiveManager;
  private retentionPolicies: Map<string, RetentionPolicy> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.rotationManager = new LogRotationManager();
    this.compressionManager = new LogCompressionManager();
    this.archiveManager = new LogArchiveManager();
    this.setupDefaultPolicies();
    this.startAutomaticCleanup();
  }

  private setupDefaultPolicies(): void {
    const defaultPolicies: RetentionPolicy[] = [
      {
        logType: 'security',
        retentionDays: 90, // 3ヶ月保存
        compressionAfterDays: 7, // 1週間後に圧縮
        archiveAfterDays: 30, // 1ヶ月後にアーカイブ
        maxFileSize: 50 * 1024 * 1024, // 50MB
        maxTotalSize: 1024 * 1024 * 1024, // 1GB
        enabled: true
      },
      {
        logType: 'access',
        retentionDays: 30, // 1ヶ月保存
        compressionAfterDays: 3, // 3日後に圧縮
        archiveAfterDays: 14, // 2週間後にアーカイブ
        maxFileSize: 100 * 1024 * 1024, // 100MB
        maxTotalSize: 500 * 1024 * 1024, // 500MB
        enabled: true
      },
      {
        logType: 'error',
        retentionDays: 60, // 2ヶ月保存
        compressionAfterDays: 5, // 5日後に圧縮
        archiveAfterDays: 21, // 3週間後にアーカイブ
        maxFileSize: 25 * 1024 * 1024, // 25MB
        maxTotalSize: 256 * 1024 * 1024, // 256MB
        enabled: true
      },
      {
        logType: 'audit',
        retentionDays: 365, // 1年保存（監査要件）
        compressionAfterDays: 1, // 1日後に圧縮
        archiveAfterDays: 7, // 1週間後にアーカイブ
        maxFileSize: 10 * 1024 * 1024, // 10MB
        maxTotalSize: 2048 * 1024 * 1024, // 2GB
        enabled: true
      }
    ];

    defaultPolicies.forEach(policy => {
      this.retentionPolicies.set(policy.logType, policy);
    });
  }

  private startAutomaticCleanup(): void {
    // 毎日午前2時に自動クリーンアップを実行
    this.cleanupInterval = setInterval(async () => {
      await this.performAutomaticMaintenance();
    }, 24 * 60 * 60 * 1000); // 24時間ごと

    console.log('Started automatic log retention management');
  }

  /**
   * 自動メンテナンスの実行
   */
  async performAutomaticMaintenance(): Promise<{
    rotated: number;
    compressed: number;
    archived: number;
    deleted: number;
  }> {
    console.log('Starting automatic log maintenance...');
    
    const results = {
      rotated: 0,
      compressed: 0,
      archived: 0,
      deleted: 0
    };

    const logBaseDirectory = path.join(process.cwd(), 'logs');

    for (const [logType, policy] of this.retentionPolicies) {
      if (!policy.enabled) continue;

      const logDirectory = path.join(logBaseDirectory, logType);
      if (!fs.existsSync(logDirectory)) continue;

      try {
        // 1. ファイルローテーション
        const rotationCount = await this.performRotation(logDirectory, policy);
        results.rotated += rotationCount;

        // 2. 古いファイルの圧縮
        const compressionCount = await this.compressionManager.compressOldFiles(
          logDirectory, 
          policy.compressionAfterDays
        );
        results.compressed += compressionCount;

        // 3. アーカイブ処理
        const archiveCount = await this.archiveManager.archiveOldFiles(
          logDirectory, 
          logType, 
          policy.archiveAfterDays
        );
        results.archived += archiveCount;

        // 4. 保存期間を超えたファイルの削除
        const deletionCount = await this.deleteExpiredFiles(logDirectory, policy);
        results.deleted += deletionCount;

        // 5. ストレージ制限の適用
        await this.enforceSizeLimit(logDirectory, policy.maxTotalSize);

      } catch (error) {
        console.error(`Error in maintenance for ${logType}:`, error);
      }
    }

    console.log('Automatic log maintenance completed:', results);
    return results;
  }

  private async performRotation(directory: string, policy: RetentionPolicy): Promise<number> {
    let rotationCount = 0;

    try {
      const files = fs.readdirSync(directory, { withFileTypes: true });
      
      for (const file of files) {
        if (!file.isFile() || file.name.includes('.')) continue; // Skip rotated files
        
        const filePath = path.join(directory, file.name);
        const rotated = await this.rotationManager.rotateBySize(filePath, policy.maxFileSize);
        if (rotated) rotationCount++;
      }
    } catch (error) {
      console.error('Error in rotation:', error);
    }

    return rotationCount;
  }

  private async deleteExpiredFiles(directory: string, policy: RetentionPolicy): Promise<number> {
    let deletedCount = 0;

    try {
      const cutoffTime = Date.now() - (policy.retentionDays * 24 * 60 * 60 * 1000);
      const files = fs.readdirSync(directory, { withFileTypes: true });

      for (const file of files) {
        if (!file.isFile()) continue;

        const filePath = path.join(directory, file.name);
        const stats = fs.statSync(filePath);

        if (stats.mtime.getTime() < cutoffTime) {
          fs.unlinkSync(filePath);
          deletedCount++;
          console.log(`Deleted expired file: ${file.name}`);
        }
      }
    } catch (error) {
      console.error('Error deleting expired files:', error);
    }

    return deletedCount;
  }

  private async enforceSizeLimit(directory: string, maxTotalSize: number): Promise<void> {
    try {
      const files = fs.readdirSync(directory, { withFileTypes: true })
        .filter(file => file.isFile())
        .map(file => {
          const filePath = path.join(directory, file.name);
          const stats = fs.statSync(filePath);
          return {
            path: filePath,
            name: file.name,
            size: stats.size,
            mtime: stats.mtime
          };
        })
        .sort((a, b) => a.mtime.getTime() - b.mtime.getTime()); // 古い順

      let totalSize = files.reduce((sum, file) => sum + file.size, 0);

      // サイズ制限を超えている場合、古いファイルから削除
      for (const file of files) {
        if (totalSize <= maxTotalSize) break;

        fs.unlinkSync(file.path);
        totalSize -= file.size;
        console.log(`Deleted for size limit: ${file.name}`);
      }
    } catch (error) {
      console.error('Error enforcing size limit:', error);
    }
  }

  /**
   * ログファイル情報の取得
   */
  async getLogFileInfo(directory: string): Promise<LogFileInfo[]> {
    const fileInfos: LogFileInfo[] = [];

    try {
      if (!fs.existsSync(directory)) {
        return fileInfos;
      }

      const files = fs.readdirSync(directory, { withFileTypes: true });

      for (const file of files) {
        if (!file.isFile()) continue;

        const filePath = path.join(directory, file.name);
        const stats = fs.statSync(filePath);

        fileInfos.push({
          filePath,
          fileName: file.name,
          size: stats.size,
          createdAt: stats.birthtime,
          modifiedAt: stats.mtime,
          isCompressed: file.name.endsWith('.gz'),
          isArchived: false, // TODO: Check if in archive directory
          logType: path.basename(directory)
        });
      }
    } catch (error) {
      console.error('Error getting log file info:', error);
    }

    return fileInfos.sort((a, b) => b.modifiedAt.getTime() - a.modifiedAt.getTime());
  }

  /**
   * ストレージ統計の取得
   */
  async getStorageStats(): Promise<StorageStats> {
    const stats: StorageStats = {
      totalFiles: 0,
      totalSize: 0,
      compressedFiles: 0,
      compressedSize: 0,
      oldestFile: null,
      newestFile: null,
      byType: {}
    };

    try {
      const logBaseDirectory = path.join(process.cwd(), 'logs');
      
      for (const [logType] of this.retentionPolicies) {
        const logDirectory = path.join(logBaseDirectory, logType);
        const fileInfos = await this.getLogFileInfo(logDirectory);
        
        let typeSize = 0;
        let compressedCount = 0;
        let compressedSize = 0;
        let totalAge = 0;

        for (const fileInfo of fileInfos) {
          stats.totalFiles++;
          stats.totalSize += fileInfo.size;
          typeSize += fileInfo.size;

          if (fileInfo.isCompressed) {
            stats.compressedFiles++;
            compressedCount++;
            stats.compressedSize += fileInfo.size;
            compressedSize += fileInfo.size;
          }

          // 最古・最新ファイルの更新
          if (!stats.oldestFile || fileInfo.modifiedAt < stats.oldestFile) {
            stats.oldestFile = fileInfo.modifiedAt;
          }
          if (!stats.newestFile || fileInfo.modifiedAt > stats.newestFile) {
            stats.newestFile = fileInfo.modifiedAt;
          }

          totalAge += Date.now() - fileInfo.modifiedAt.getTime();
        }

        stats.byType[logType] = {
          files: fileInfos.length,
          size: typeSize,
          averageAge: fileInfos.length > 0 ? totalAge / fileInfos.length / (24 * 60 * 60 * 1000) : 0
        };
      }
    } catch (error) {
      console.error('Error getting storage stats:', error);
    }

    return stats;
  }

  /**
   * 保存期間ポリシーの管理
   */
  setRetentionPolicy(logType: string, policy: RetentionPolicy): void {
    this.retentionPolicies.set(logType, policy);
    console.log(`Updated retention policy for ${logType}`);
  }

  getRetentionPolicy(logType: string): RetentionPolicy | undefined {
    return this.retentionPolicies.get(logType);
  }

  listRetentionPolicies(): RetentionPolicy[] {
    return Array.from(this.retentionPolicies.values());
  }

  /**
   * 手動でメンテナンスを実行
   */
  async performMaintenance(logType?: string): Promise<any> {
    if (logType) {
      // 特定のログタイプのみ
      const policy = this.retentionPolicies.get(logType);
      if (!policy || !policy.enabled) {
        throw new Error(`Retention policy for ${logType} not found or disabled`);
      }

      const logDirectory = path.join(process.cwd(), 'logs', logType);
      return await this.performSingleTypeMaintenance(logDirectory, logType, policy);
    } else {
      // 全ログタイプ
      return await this.performAutomaticMaintenance();
    }
  }

  private async performSingleTypeMaintenance(directory: string, logType: string, policy: RetentionPolicy) {
    const results = { rotated: 0, compressed: 0, archived: 0, deleted: 0 };

    if (!fs.existsSync(directory)) {
      return results;
    }

    results.rotated = await this.performRotation(directory, policy);
    results.compressed = await this.compressionManager.compressOldFiles(directory, policy.compressionAfterDays);
    results.archived = await this.archiveManager.archiveOldFiles(directory, logType, policy.archiveAfterDays);
    results.deleted = await this.deleteExpiredFiles(directory, policy);
    await this.enforceSizeLimit(directory, policy.maxTotalSize);

    return results;
  }

  /**
   * システム終了時のクリーンアップ
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.rotationManager.stopAllRotations();
    console.log('Log retention manager shutdown completed');
  }
}

// シングルトンインスタンス
export const logRetentionManager = new LogRetentionManager();