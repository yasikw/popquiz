/**
 * Image Performance Monitor Component
 * Real-time monitoring of image loading performance
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Activity, 
  Zap, 
  Clock, 
  TrendingUp, 
  TrendingDown,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';
import { useImagePerformanceMetrics } from '@/hooks/useImageOptimization';

interface PerformanceAlert {
  type: 'success' | 'warning' | 'error';
  message: string;
  timestamp: Date;
}

const ImagePerformanceMonitor: React.FC = () => {
  const metrics = useImagePerformanceMetrics();
  const [alerts, setAlerts] = useState<PerformanceAlert[]>([]);
  const [previousMetrics, setPreviousMetrics] = useState(metrics);

  // Monitor for performance changes and generate alerts
  useEffect(() => {
    if (metrics.totalImages === 0) return;

    const newAlerts: PerformanceAlert[] = [];

    // Check for significant performance changes
    if (metrics.totalImages > previousMetrics.totalImages) {
      const loadTimeDelta = metrics.averageLoadTime - previousMetrics.averageLoadTime;
      const compressionDelta = metrics.averageCompressionRatio - previousMetrics.averageCompressionRatio;
      const errorDelta = metrics.errorRate - previousMetrics.errorRate;

      // Load time alerts
      if (loadTimeDelta > 500) {
        newAlerts.push({
          type: 'warning',
          message: `平均読み込み時間が${Math.round(loadTimeDelta)}ms増加しました`,
          timestamp: new Date()
        });
      } else if (loadTimeDelta < -200) {
        newAlerts.push({
          type: 'success',
          message: `平均読み込み時間が${Math.round(-loadTimeDelta)}ms改善しました`,
          timestamp: new Date()
        });
      }

      // Compression ratio alerts
      if (compressionDelta > 10) {
        newAlerts.push({
          type: 'success',
          message: `圧縮効率が${compressionDelta.toFixed(1)}%向上しました`,
          timestamp: new Date()
        });
      } else if (compressionDelta < -10) {
        newAlerts.push({
          type: 'warning',
          message: `圧縮効率が${(-compressionDelta).toFixed(1)}%低下しました`,
          timestamp: new Date()
        });
      }

      // Error rate alerts
      if (errorDelta > 0.05) {
        newAlerts.push({
          type: 'error',
          message: `エラー率が${(errorDelta * 100).toFixed(1)}%増加しました`,
          timestamp: new Date()
        });
      } else if (errorDelta < -0.02) {
        newAlerts.push({
          type: 'success',
          message: `エラー率が${(-errorDelta * 100).toFixed(1)}%改善しました`,
          timestamp: new Date()
        });
      }
    }

    // Add new alerts and maintain only recent ones
    if (newAlerts.length > 0) {
      setAlerts(prev => [
        ...newAlerts,
        ...prev.slice(0, 4) // Keep only 5 most recent alerts
      ]);
    }

    setPreviousMetrics(metrics);
  }, [metrics, previousMetrics]);

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const getPerformanceStatus = () => {
    if (metrics.totalImages === 0) return { status: 'idle', color: 'gray' };
    
    const conditions = [
      metrics.averageLoadTime < 1000,
      metrics.averageCompressionRatio > 60,
      metrics.errorRate < 0.05
    ];

    const goodConditions = conditions.filter(Boolean).length;
    
    if (goodConditions === 3) return { status: '優秀', color: 'green' };
    if (goodConditions === 2) return { status: '良好', color: 'blue' };
    if (goodConditions === 1) return { status: '普通', color: 'yellow' };
    return { status: '要改善', color: 'red' };
  };

  const performanceStatus = getPerformanceStatus();

  return (
    <div className="space-y-4" data-testid="image-performance-monitor">
      {/* Performance Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            画像パフォーマンス監視
          </CardTitle>
          <CardDescription>
            リアルタイムの画像処理パフォーマンス指標
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            {/* Total Images */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">総処理数</span>
                <Badge variant="outline">
                  {metrics.totalImages.toLocaleString()}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground">
                最適化済み: {metrics.optimizedImages.toLocaleString()}
              </div>
            </div>

            {/* Average Load Time */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">平均読み込み</span>
                <Badge variant={metrics.averageLoadTime < 1000 ? "default" : "secondary"}>
                  <Clock className="h-3 w-3 mr-1" />
                  {formatDuration(metrics.averageLoadTime)}
                </Badge>
              </div>
              <Progress 
                value={Math.min((1000 / metrics.averageLoadTime) * 100, 100)} 
                className="h-2"
              />
            </div>

            {/* Compression Ratio */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">圧縮効率</span>
                <Badge variant={metrics.averageCompressionRatio > 60 ? "default" : "secondary"}>
                  <Zap className="h-3 w-3 mr-1" />
                  {metrics.averageCompressionRatio.toFixed(1)}%
                </Badge>
              </div>
              <Progress 
                value={metrics.averageCompressionRatio} 
                className="h-2"
              />
            </div>

            {/* Error Rate */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">エラー率</span>
                <Badge variant={metrics.errorRate < 0.05 ? "default" : "destructive"}>
                  {metrics.errorRate < 0.05 ? (
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                  ) : (
                    <AlertCircle className="h-3 w-3 mr-1" />
                  )}
                  {(metrics.errorRate * 100).toFixed(2)}%
                </Badge>
              </div>
              <Progress 
                value={(1 - metrics.errorRate) * 100} 
                className="h-2"
              />
            </div>
          </div>

          {/* Overall Performance Status */}
          <div className="mt-4 p-3 rounded-lg bg-muted/50">
            <div className="flex items-center justify-between">
              <span className="font-medium">総合パフォーマンス</span>
              <Badge 
                variant={performanceStatus.color === 'green' ? "default" : "secondary"}
                className={
                  performanceStatus.color === 'red' ? 'bg-red-100 text-red-800' :
                  performanceStatus.color === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                  performanceStatus.color === 'blue' ? 'bg-blue-100 text-blue-800' :
                  ''
                }
              >
                {performanceStatus.status}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Performance Alerts */}
      {alerts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              パフォーマンス アラート
            </CardTitle>
            <CardDescription>
              最近のパフォーマンス変化
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {alerts.slice(0, 5).map((alert, index) => (
                <div 
                  key={index}
                  className={`flex items-center gap-3 p-2 rounded-lg text-sm ${
                    alert.type === 'success' ? 'bg-green-50 text-green-800' :
                    alert.type === 'warning' ? 'bg-yellow-50 text-yellow-800' :
                    'bg-red-50 text-red-800'
                  }`}
                  data-testid={`performance-alert-${alert.type}`}
                >
                  {alert.type === 'success' && <TrendingUp className="h-4 w-4" />}
                  {alert.type === 'warning' && <AlertCircle className="h-4 w-4" />}
                  {alert.type === 'error' && <TrendingDown className="h-4 w-4" />}
                  
                  <span className="flex-1">{alert.message}</span>
                  <span className="text-xs opacity-75">
                    {alert.timestamp.toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Stats */}
      <div className="grid gap-2 md:grid-cols-3 text-sm">
        <div className="text-center p-2 bg-muted/30 rounded">
          <div className="font-medium">最適化率</div>
          <div className="text-lg font-bold">
            {metrics.totalImages > 0 
              ? ((metrics.optimizedImages / metrics.totalImages) * 100).toFixed(1)
              : 0
            }%
          </div>
        </div>
        
        <div className="text-center p-2 bg-muted/30 rounded">
          <div className="font-medium">信頼性</div>
          <div className="text-lg font-bold">
            {((1 - metrics.errorRate) * 100).toFixed(1)}%
          </div>
        </div>
        
        <div className="text-center p-2 bg-muted/30 rounded">
          <div className="font-medium">効率スコア</div>
          <div className="text-lg font-bold">
            {Math.round(
              (metrics.averageCompressionRatio * 0.4) +
              ((1000 / Math.max(metrics.averageLoadTime, 100)) * 30) +
              ((1 - metrics.errorRate) * 30)
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImagePerformanceMonitor;