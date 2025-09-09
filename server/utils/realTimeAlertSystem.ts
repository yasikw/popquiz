/**
 * リアルタイムセキュリティアラートシステム
 * Webhook、メール、Slack通知対応
 */

import { EventEmitter } from 'events';
import { EnhancedSecurityLogEntry, EnhancedSecurityLogLevel, enhancedSecurityLogger } from './enhancedSecurityLogger';
import { AnomalyDetectionResult } from './securityAnomalyDetector';

// アラート通知チャンネル
enum AlertChannel {
  CONSOLE = 'console',
  EMAIL = 'email',
  SLACK = 'slack',
  WEBHOOK = 'webhook',
  DATABASE = 'database'
}

// アラートルール設定
interface AlertRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  channels: AlertChannel[];
  conditions: AlertCondition[];
  throttle: {
    maxAlertsPerHour: number;
    cooldownMinutes: number;
  };
  template: AlertTemplate;
}

// アラート条件
interface AlertCondition {
  type: 'eventType' | 'logLevel' | 'anomalyType' | 'customPattern';
  operator: 'equals' | 'contains' | 'matches' | 'greaterThan' | 'lessThan';
  value: string | number | RegExp;
  field?: string; // metadata field for custom patterns
}

// アラートテンプレート
interface AlertTemplate {
  title: string;
  message: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  includeContext: boolean;
  includeMetadata: boolean;
  customFields?: Record<string, string>;
}

// アラート通知
interface AlertNotification {
  id: string;
  ruleId: string;
  timestamp: Date;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  context: {
    triggerEvent?: EnhancedSecurityLogEntry;
    anomaly?: AnomalyDetectionResult;
    metadata?: Record<string, any>;
  };
  channels: AlertChannel[];
  status: 'pending' | 'sent' | 'failed' | 'acknowledged';
  attempts: number;
  lastAttempt?: Date;
  error?: string;
}

// Webhook設定
interface WebhookConfig {
  url: string;
  method: 'POST' | 'PUT';
  headers: Record<string, string>;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
}

// Slack設定
interface SlackConfig {
  webhookUrl: string;
  channel: string;
  username: string;
  iconEmoji: string;
  mentionUsers: string[];
  mentionChannel: boolean;
}

/**
 * アラートスロットリングマネージャー
 */
class AlertThrottleManager {
  private alertCounts: Map<string, { count: number; firstAlert: number; lastAlert: number }> = new Map();

  /**
   * アラートが送信可能かチェック
   */
  canSendAlert(ruleId: string, maxAlertsPerHour: number, cooldownMinutes: number): boolean {
    const now = Date.now();
    const hourInMs = 60 * 60 * 1000;
    const cooldownInMs = cooldownMinutes * 60 * 1000;

    const existing = this.alertCounts.get(ruleId);
    
    if (!existing) {
      this.alertCounts.set(ruleId, { count: 1, firstAlert: now, lastAlert: now });
      return true;
    }

    // クールダウン期間中かチェック
    if (now - existing.lastAlert < cooldownInMs) {
      return false;
    }

    // 1時間の制限をリセット
    if (now - existing.firstAlert > hourInMs) {
      this.alertCounts.set(ruleId, { count: 1, firstAlert: now, lastAlert: now });
      return true;
    }

    // 時間内制限チェック
    if (existing.count >= maxAlertsPerHour) {
      return false;
    }

    existing.count++;
    existing.lastAlert = now;
    return true;
  }

  /**
   * 統計情報取得
   */
  getThrottleStats(): Record<string, { count: number; hoursSinceFirst: number }> {
    const now = Date.now();
    const stats: Record<string, { count: number; hoursSinceFirst: number }> = {};

    for (const [ruleId, data] of this.alertCounts) {
      stats[ruleId] = {
        count: data.count,
        hoursSinceFirst: (now - data.firstAlert) / (60 * 60 * 1000)
      };
    }

    return stats;
  }
}

/**
 * アラート通知配信システム
 */
class AlertDeliverySystem {
  private webhookConfigs: Map<string, WebhookConfig> = new Map();
  private slackConfigs: Map<string, SlackConfig> = new Map();

  constructor() {
    this.setupDefaultConfigurations();
  }

  private setupDefaultConfigurations(): void {
    // デフォルトWebhook設定（環境変数から読み込み）
    if (process.env.SECURITY_WEBHOOK_URL) {
      this.webhookConfigs.set('default', {
        url: process.env.SECURITY_WEBHOOK_URL,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': process.env.SECURITY_WEBHOOK_TOKEN || ''
        },
        timeout: 10000,
        retryAttempts: 3,
        retryDelay: 5000
      });
    }

    // デフォルトSlack設定
    if (process.env.SLACK_SECURITY_WEBHOOK_URL) {
      this.slackConfigs.set('default', {
        webhookUrl: process.env.SLACK_SECURITY_WEBHOOK_URL,
        channel: process.env.SLACK_SECURITY_CHANNEL || '#security-alerts',
        username: 'Security Alert Bot',
        iconEmoji: ':warning:',
        mentionUsers: (process.env.SLACK_MENTION_USERS || '').split(',').filter(u => u.trim()),
        mentionChannel: process.env.SLACK_MENTION_CHANNEL === 'true'
      });
    }
  }

  /**
   * コンソールへの通知
   */
  private async sendConsoleAlert(notification: AlertNotification): Promise<boolean> {
    try {
      const emoji = {
        low: '💛',
        medium: '🟠',
        high: '🔴',
        critical: '🚨'
      }[notification.severity];

      console.log(`\n${emoji} SECURITY ALERT [${notification.severity.toUpperCase()}]`);
      console.log(`Title: ${notification.title}`);
      console.log(`Message: ${notification.message}`);
      console.log(`Timestamp: ${notification.timestamp.toISOString()}`);
      
      if (notification.context.triggerEvent) {
        console.log(`Event Type: ${notification.context.triggerEvent.eventType}`);
        console.log(`Source IP: ${notification.context.triggerEvent.context.ipAddress || 'unknown'}`);
      }

      console.log(`Alert ID: ${notification.id}\n`);
      return true;
    } catch (error) {
      console.error('Failed to send console alert:', error);
      return false;
    }
  }

  /**
   * Webhookへの通知
   */
  private async sendWebhookAlert(notification: AlertNotification, configName: string = 'default'): Promise<boolean> {
    const config = this.webhookConfigs.get(configName);
    if (!config) {
      console.error(`Webhook config '${configName}' not found`);
      return false;
    }

    const payload = {
      id: notification.id,
      ruleId: notification.ruleId,
      timestamp: notification.timestamp.toISOString(),
      severity: notification.severity,
      title: notification.title,
      message: notification.message,
      context: notification.context,
      source: 'security-monitoring-system'
    };

    for (let attempt = 1; attempt <= config.retryAttempts; attempt++) {
      try {
        const response = await fetch(config.url, {
          method: config.method,
          headers: config.headers,
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(config.timeout)
        });

        if (response.ok) {
          return true;
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        console.error(`Webhook alert attempt ${attempt} failed:`, error);
        
        if (attempt < config.retryAttempts) {
          await new Promise(resolve => setTimeout(resolve, config.retryDelay));
        }
      }
    }

    return false;
  }

  /**
   * Slackへの通知
   */
  private async sendSlackAlert(notification: AlertNotification, configName: string = 'default'): Promise<boolean> {
    const config = this.slackConfigs.get(configName);
    if (!config) {
      console.error(`Slack config '${configName}' not found`);
      return false;
    }

    const color = {
      low: '#36a64f',
      medium: '#ff9500',
      high: '#ff0000',
      critical: '#8B0000'
    }[notification.severity];

    let mentions = '';
    if (config.mentionChannel) {
      mentions = '<!channel> ';
    } else if (config.mentionUsers.length > 0) {
      mentions = config.mentionUsers.map(user => `<@${user}>`).join(' ') + ' ';
    }

    const payload = {
      channel: config.channel,
      username: config.username,
      icon_emoji: config.iconEmoji,
      attachments: [{
        color,
        title: `🚨 ${notification.title}`,
        text: `${mentions}${notification.message}`,
        fields: [
          {
            title: 'Severity',
            value: notification.severity.toUpperCase(),
            short: true
          },
          {
            title: 'Timestamp',
            value: notification.timestamp.toISOString(),
            short: true
          },
          ...(notification.context.triggerEvent ? [{
            title: 'Event Type',
            value: notification.context.triggerEvent.eventType,
            short: true
          }] : []),
          ...(notification.context.triggerEvent?.context.ipAddress ? [{
            title: 'Source IP',
            value: notification.context.triggerEvent.context.ipAddress,
            short: true
          }] : [])
        ],
        footer: 'Security Monitoring System',
        ts: Math.floor(notification.timestamp.getTime() / 1000)
      }]
    };

    try {
      const response = await fetch(config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000)
      });

      return response.ok;
    } catch (error) {
      console.error('Failed to send Slack alert:', error);
      return false;
    }
  }

  /**
   * データベースへの通知記録
   */
  private async sendDatabaseAlert(notification: AlertNotification): Promise<boolean> {
    try {
      // 実装：データベースにアラート通知を記録
      // 実際の実装では、アラート履歴テーブルに保存
      enhancedSecurityLogger.log(
        EnhancedSecurityLogLevel.INFO,
        'ALERT_NOTIFICATION' as any,
        `Security alert sent: ${notification.title}`,
        {
          userId: notification.context.triggerEvent?.context.userId,
          ipAddress: notification.context.triggerEvent?.context.ipAddress
        },
        {
          alertId: notification.id,
          ruleId: notification.ruleId,
          severity: notification.severity,
          channels: notification.channels
        }
      );
      return true;
    } catch (error) {
      console.error('Failed to record alert in database:', error);
      return false;
    }
  }

  /**
   * 通知の配信
   */
  async deliverAlert(notification: AlertNotification): Promise<{ channel: AlertChannel; success: boolean }[]> {
    const results: { channel: AlertChannel; success: boolean }[] = [];

    for (const channel of notification.channels) {
      let success = false;

      try {
        switch (channel) {
          case AlertChannel.CONSOLE:
            success = await this.sendConsoleAlert(notification);
            break;
          case AlertChannel.WEBHOOK:
            success = await this.sendWebhookAlert(notification);
            break;
          case AlertChannel.SLACK:
            success = await this.sendSlackAlert(notification);
            break;
          case AlertChannel.DATABASE:
            success = await this.sendDatabaseAlert(notification);
            break;
          default:
            console.warn(`Unknown alert channel: ${channel}`);
            success = false;
        }
      } catch (error) {
        console.error(`Error delivering alert via ${channel}:`, error);
        success = false;
      }

      results.push({ channel, success });
    }

    return results;
  }
}

/**
 * メインのリアルタイムアラートシステム
 */
export class RealTimeAlertSystem extends EventEmitter {
  private alertRules: Map<string, AlertRule> = new Map();
  private throttleManager: AlertThrottleManager = new AlertThrottleManager();
  private deliverySystem: AlertDeliverySystem = new AlertDeliverySystem();
  private pendingAlerts: Map<string, AlertNotification> = new Map();

  constructor() {
    super();
    this.setupDefaultAlertRules();
    this.setupEventListeners();
  }

  private setupDefaultAlertRules(): void {
    const defaultRules: AlertRule[] = [
      {
        id: 'critical-security-events',
        name: 'Critical Security Events',
        description: 'High-priority security incidents requiring immediate attention',
        enabled: true,
        severity: 'critical',
        channels: [AlertChannel.CONSOLE, AlertChannel.SLACK, AlertChannel.WEBHOOK, AlertChannel.DATABASE],
        conditions: [
          { type: 'logLevel', operator: 'equals', value: 'critical' },
          { type: 'eventType', operator: 'equals', value: 'auth_brute_force' },
          { type: 'eventType', operator: 'equals', value: 'privilege_escalation_attempt' },
          { type: 'eventType', operator: 'equals', value: 'malicious_file_detected' }
        ],
        throttle: {
          maxAlertsPerHour: 10,
          cooldownMinutes: 5
        },
        template: {
          title: '🚨 CRITICAL SECURITY ALERT',
          message: 'Critical security event detected requiring immediate attention',
          priority: 'urgent',
          includeContext: true,
          includeMetadata: true
        }
      },
      {
        id: 'authentication-failures',
        name: 'Authentication Failures',
        description: 'Multiple authentication failures indicating potential attacks',
        enabled: true,
        severity: 'high',
        channels: [AlertChannel.CONSOLE, AlertChannel.DATABASE],
        conditions: [
          { type: 'eventType', operator: 'equals', value: 'auth_multiple_failures' }
        ],
        throttle: {
          maxAlertsPerHour: 20,
          cooldownMinutes: 10
        },
        template: {
          title: '🔐 Authentication Security Alert',
          message: 'Multiple authentication failures detected',
          priority: 'high',
          includeContext: true,
          includeMetadata: false
        }
      },
      {
        id: 'anomaly-detection',
        name: 'Anomaly Detection Alerts',
        description: 'Automated anomaly detection results',
        enabled: true,
        severity: 'medium',
        channels: [AlertChannel.CONSOLE, AlertChannel.DATABASE],
        conditions: [
          { type: 'anomalyType', operator: 'contains', value: 'statistical_outlier' },
          { type: 'anomalyType', operator: 'contains', value: 'suspicious_user_agent' }
        ],
        throttle: {
          maxAlertsPerHour: 50,
          cooldownMinutes: 2
        },
        template: {
          title: '📊 Anomaly Detection Alert',
          message: 'Suspicious pattern or anomaly detected',
          priority: 'normal',
          includeContext: true,
          includeMetadata: true
        }
      }
    ];

    defaultRules.forEach(rule => {
      this.alertRules.set(rule.id, rule);
    });
  }

  private setupEventListeners(): void {
    // 強化ログシステムからのイベント
    enhancedSecurityLogger.on('logEntry', (entry: EnhancedSecurityLogEntry) => {
      this.processLogEntryForAlerts(entry);
    });

    enhancedSecurityLogger.on('thresholdAlert', (data: any) => {
      this.processThresholdAlert(data);
    });

    enhancedSecurityLogger.on('anomalyDetected', (data: any) => {
      this.processAnomalyAlert(data);
    });
  }

  /**
   * ログエントリのアラート処理
   */
  private async processLogEntryForAlerts(entry: EnhancedSecurityLogEntry): Promise<void> {
    for (const rule of this.alertRules.values()) {
      if (!rule.enabled) continue;

      const matches = this.evaluateRuleConditions(rule, entry);
      if (matches) {
        await this.triggerAlert(rule, { triggerEvent: entry });
      }
    }
  }

  /**
   * 閾値アラートの処理
   */
  private async processThresholdAlert(data: { alertEntry: EnhancedSecurityLogEntry }): Promise<void> {
    const rule = this.alertRules.get('critical-security-events');
    if (rule && rule.enabled) {
      await this.triggerAlert(rule, { triggerEvent: data.alertEntry });
    }
  }

  /**
   * 異常検知アラートの処理
   */
  private async processAnomalyAlert(data: { anomaly: AnomalyDetectionResult; triggerEntry: EnhancedSecurityLogEntry }): Promise<void> {
    const rule = this.alertRules.get('anomaly-detection');
    if (rule && rule.enabled) {
      await this.triggerAlert(rule, { 
        triggerEvent: data.triggerEntry,
        anomaly: data.anomaly
      });
    }
  }

  /**
   * ルール条件の評価
   */
  private evaluateRuleConditions(rule: AlertRule, entry: EnhancedSecurityLogEntry): boolean {
    return rule.conditions.some(condition => {
      try {
        switch (condition.type) {
          case 'eventType':
            return this.evaluateCondition(condition, entry.eventType);
          case 'logLevel':
            return this.evaluateCondition(condition, entry.level);
          case 'customPattern':
            const fieldValue = condition.field ? entry.metadata?.[condition.field] : JSON.stringify(entry);
            return this.evaluateCondition(condition, fieldValue);
          default:
            return false;
        }
      } catch (error) {
        console.error(`Error evaluating condition:`, error);
        return false;
      }
    });
  }

  private evaluateCondition(condition: AlertCondition, value: any): boolean {
    switch (condition.operator) {
      case 'equals':
        return value === condition.value;
      case 'contains':
        return String(value).toLowerCase().includes(String(condition.value).toLowerCase());
      case 'matches':
        return condition.value instanceof RegExp ? 
          condition.value.test(String(value)) : 
          new RegExp(String(condition.value)).test(String(value));
      case 'greaterThan':
        return Number(value) > Number(condition.value);
      case 'lessThan':
        return Number(value) < Number(condition.value);
      default:
        return false;
    }
  }

  /**
   * アラートの発動
   */
  private async triggerAlert(rule: AlertRule, context: any): Promise<void> {
    // スロットリングチェック
    if (!this.throttleManager.canSendAlert(rule.id, rule.throttle.maxAlertsPerHour, rule.throttle.cooldownMinutes)) {
      return;
    }

    const notification: AlertNotification = {
      id: crypto.randomUUID(),
      ruleId: rule.id,
      timestamp: new Date(),
      severity: rule.severity,
      title: rule.template.title,
      message: this.formatAlertMessage(rule.template, context),
      context,
      channels: rule.channels,
      status: 'pending',
      attempts: 0
    };

    this.pendingAlerts.set(notification.id, notification);

    // アラート配信
    const deliveryResults = await this.deliverySystem.deliverAlert(notification);
    
    // 結果の更新
    notification.status = deliveryResults.every(r => r.success) ? 'sent' : 'failed';
    notification.attempts = 1;
    notification.lastAttempt = new Date();

    if (notification.status === 'failed') {
      const failedChannels = deliveryResults.filter(r => !r.success).map(r => r.channel);
      notification.error = `Failed to deliver to: ${failedChannels.join(', ')}`;
    }

    // イベント発行
    this.emit('alertTriggered', notification);
  }

  private formatAlertMessage(template: AlertTemplate, context: any): string {
    let message = template.message;

    // コンテキスト情報の追加
    if (template.includeContext && context.triggerEvent) {
      const event = context.triggerEvent;
      message += `\n\nEvent Details:\n`;
      message += `- Type: ${event.eventType}\n`;
      message += `- Level: ${event.level}\n`;
      message += `- Source IP: ${event.context.ipAddress || 'unknown'}\n`;
      message += `- User: ${event.context.userId || 'anonymous'}\n`;
    }

    // 異常検知情報の追加
    if (context.anomaly) {
      message += `\n\nAnomaly Details:\n`;
      message += `- Type: ${context.anomaly.anomalyType}\n`;
      message += `- Confidence: ${context.anomaly.confidence}%\n`;
      message += `- Description: ${context.anomaly.description}\n`;
    }

    return message;
  }

  /**
   * アラート統計の取得
   */
  public getAlertStats(): {
    totalRules: number;
    activeRules: number;
    alertsLast24h: number;
    pendingAlerts: number;
    throttleStats: Record<string, any>;
  } {
    const now = Date.now();
    const yesterday = now - 24 * 60 * 60 * 1000;

    const alertsLast24h = Array.from(this.pendingAlerts.values())
      .filter(alert => alert.timestamp.getTime() > yesterday).length;

    return {
      totalRules: this.alertRules.size,
      activeRules: Array.from(this.alertRules.values()).filter(r => r.enabled).length,
      alertsLast24h,
      pendingAlerts: this.pendingAlerts.size,
      throttleStats: this.throttleManager.getThrottleStats()
    };
  }

  /**
   * アラートルールの管理
   */
  public addAlertRule(rule: AlertRule): void {
    this.alertRules.set(rule.id, rule);
  }

  public updateAlertRule(ruleId: string, updates: Partial<AlertRule>): boolean {
    const existing = this.alertRules.get(ruleId);
    if (!existing) return false;

    this.alertRules.set(ruleId, { ...existing, ...updates });
    return true;
  }

  public deleteAlertRule(ruleId: string): boolean {
    return this.alertRules.delete(ruleId);
  }

  public getAlertRule(ruleId: string): AlertRule | undefined {
    return this.alertRules.get(ruleId);
  }

  public listAlertRules(): AlertRule[] {
    return Array.from(this.alertRules.values());
  }
}

// シングルトンインスタンス
export const realTimeAlertSystem = new RealTimeAlertSystem();