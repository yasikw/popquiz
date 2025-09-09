/**
 * CSP Violation Handler
 * Logs and monitors Content Security Policy violations
 */

import { Request, Response, NextFunction } from 'express';
import { securityLogger, SecurityEventType, SecurityLogLevel } from '../utils/securityLogger';
import { CSPViolationWrapper } from '../../shared/types/security';

export interface CSPViolationMetrics {
  totalViolations: number;
  imageViolations: number;
  scriptViolations: number;
  styleViolations: number;
  lastReset: Date;
}

class CSPViolationMonitor {
  private metrics: CSPViolationMetrics;
  private readonly RESET_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    this.metrics = {
      totalViolations: 0,
      imageViolations: 0,
      scriptViolations: 0,
      styleViolations: 0,
      lastReset: new Date()
    };
  }

  private resetMetricsIfNeeded(): void {
    const now = new Date();
    if (now.getTime() - this.metrics.lastReset.getTime() > this.RESET_INTERVAL) {
      this.metrics = {
        totalViolations: 0,
        imageViolations: 0,
        scriptViolations: 0,
        styleViolations: 0,
        lastReset: now
      };
    }
  }

  private updateMetrics(directive: string): void {
    this.resetMetricsIfNeeded();
    this.metrics.totalViolations++;

    if (directive.includes('img-src')) {
      this.metrics.imageViolations++;
    } else if (directive.includes('script-src')) {
      this.metrics.scriptViolations++;
    } else if (directive.includes('style-src')) {
      this.metrics.styleViolations++;
    }
  }

  private shouldAlert(directive: string): boolean {
    // Alert on image violations immediately (potential data exfiltration)
    if (directive.includes('img-src')) {
      return true;
    }
    
    // Alert on high frequency violations
    return this.metrics.totalViolations > 100 || this.metrics.scriptViolations > 20;
  }

  public processViolation(violation: CSPViolationWrapper, clientIP?: string, userAgent?: string): void {
    const report = violation['csp-report'];
    const directive = report['violated-directive'];
    
    this.updateMetrics(directive);

    // Determine severity based on violation type
    let severity = SecurityLogLevel.WARNING;
    if (directive.includes('img-src') || directive.includes('script-src')) {
      severity = SecurityLogLevel.ERROR; // Higher risk violations
    }

    // Log the violation
    securityLogger.log(
      severity,
      SecurityEventType.SUSPICIOUS_ACTIVITY,
      `CSP violation detected: ${directive}`,
      {
        ipAddress: clientIP || undefined,
        userAgent: userAgent || undefined,
        metadata: {
          violatedDirective: report['violated-directive'],
          blockedUri: report['blocked-uri'],
          documentUri: report['document-uri'],
          effectiveDirective: report['effective-directive'],
          sourceFile: report['source-file'],
          lineNumber: report['line-number'],
          statusCode: report['status-code'],
          violationType: this.categorizeViolation(directive),
          isImageViolation: directive.includes('img-src'),
          currentMetrics: { ...this.metrics }
        }
      }
    );

    // Trigger alerts for critical violations
    if (this.shouldAlert(directive)) {
      securityLogger.log(
        SecurityLogLevel.CRITICAL,
        SecurityEventType.SUSPICIOUS_ACTIVITY,
        `High-priority CSP violation alert: ${directive}`,
        {
          ipAddress: clientIP || undefined,
          userAgent: userAgent || undefined,
          metadata: {
            alertReason: directive.includes('img-src') ? 'POTENTIAL_DATA_EXFILTRATION' : 'HIGH_FREQUENCY_VIOLATIONS',
            violatedDirective: directive,
            blockedUri: report['blocked-uri'],
            totalViolations: this.metrics.totalViolations,
            imageViolations: this.metrics.imageViolations,
            timeWindow: '24h'
          }
        }
      );
    }
  }

  private categorizeViolation(directive: string): string {
    if (directive.includes('img-src')) return 'IMAGE_SOURCE_VIOLATION';
    if (directive.includes('script-src')) return 'SCRIPT_INJECTION_ATTEMPT';
    if (directive.includes('style-src')) return 'STYLE_INJECTION_ATTEMPT';
    if (directive.includes('connect-src')) return 'NETWORK_CONNECTION_VIOLATION';
    if (directive.includes('frame-src')) return 'FRAME_INJECTION_ATTEMPT';
    return 'OTHER_CSP_VIOLATION';
  }

  public getMetrics(): CSPViolationMetrics {
    this.resetMetricsIfNeeded();
    return { ...this.metrics };
  }
}

// Singleton instance
const cspMonitor = new CSPViolationMonitor();

/**
 * Express middleware to handle CSP violation reports
 */
export function cspViolationHandler(req: Request, res: Response): void {
  try {
    // Validate the CSP violation report format
    const violation = req.body as CSPViolationWrapper;
    
    if (!violation || !violation['csp-report']) {
      res.status(400).json({ error: 'Invalid CSP violation report format' });
      return;
    }

    const report = violation['csp-report'];
    if (!report['violated-directive'] || !report['blocked-uri']) {
      res.status(400).json({ error: 'Missing required CSP violation fields' });
      return;
    }

    // Process the violation
    cspMonitor.processViolation(
      violation,
      req.ip || req.connection?.remoteAddress,
      req.get('User-Agent')
    );

    // Always respond with 204 No Content (standard for CSP reports)
    res.status(204).send();
    
  } catch (error) {
    securityLogger.log(
      SecurityLogLevel.ERROR,
      SecurityEventType.SUSPICIOUS_ACTIVITY,
      'Error processing CSP violation report',
      {
        ipAddress: req.ip || undefined,
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error',
          rawBody: req.body
        }
      }
    );
    
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Get current CSP violation metrics (for monitoring/dashboard)
 */
export function getCSPMetrics(): CSPViolationMetrics {
  return cspMonitor.getMetrics();
}

/**
 * CSP report URI endpoint setup helper
 */
export function setupCSPReporting(): string {
  // Return the endpoint path for CSP report-uri directive
  return '/security/csp-violation-report';
}