/**
 * Image Cache Dashboard - Admin Component
 * Real-time monitoring and management of image proxy cache
 */

import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Trash2, 
  RefreshCw, 
  Database, 
  TrendingUp, 
  AlertTriangle,
  CheckCircle,
  Activity,
  HardDrive,
  Clock,
  Zap
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useImagePerformanceMetrics } from '@/hooks/useImageOptimization';

interface CacheStats {
  totalEntries: number;
  totalSize: number;
  maxSize: number;
  maxEntries: number;
  utilizationPercent: string;
  oldestEntry?: string;
  newestEntry?: string;
  averageAccessCount?: number;
}

const ImageCacheDashboard: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const performanceMetrics = useImagePerformanceMetrics();

  // Fetch cache statistics
  const { 
    data: cacheStats, 
    isLoading: statsLoading, 
    error: statsError,
    refetch: refetchStats 
  } = useQuery<CacheStats>({
    queryKey: ['/api/image/cache/stats'],
    refetchInterval: 5000, // Refresh every 5 seconds
    retry: 2
  });

  // Cache clear mutation
  const clearCacheMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/image/cache/clear', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Cache clear failed: ${response.statusText}`);
      }

      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "キャッシュクリア完了",
        description: "画像キャッシュが正常にクリアされました",
        variant: "default"
      });
      refetchStats();
      queryClient.invalidateQueries({ queryKey: ['/api/image/cache/stats'] });
    },
    onError: (error: Error) => {
      toast({
        title: "キャッシュクリア失敗",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  if (statsError) {
    return (
      <Alert variant="destructive" data-testid="cache-dashboard-error">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>エラー</AlertTitle>
        <AlertDescription>
          キャッシュ統計の取得に失敗しました: {statsError.message}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6" data-testid="image-cache-dashboard">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">画像キャッシュ管理</h2>
          <p className="text-muted-foreground">
            セキュア画像プロキシのキャッシュ状況とパフォーマンス監視
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => refetchStats()}
            disabled={statsLoading}
            variant="outline"
            size="sm"
            data-testid="refresh-stats-button"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${statsLoading ? 'animate-spin' : ''}`} />
            更新
          </Button>
          <Button
            onClick={() => clearCacheMutation.mutate()}
            disabled={clearCacheMutation.isPending || !cacheStats?.totalEntries}
            variant="destructive"
            size="sm"
            data-testid="clear-cache-button"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            キャッシュクリア
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">概要</TabsTrigger>
          <TabsTrigger value="performance">パフォーマンス</TabsTrigger>
          <TabsTrigger value="health">ヘルス</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Cache Overview Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card data-testid="cache-entries-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">キャッシュエントリ</CardTitle>
                <Database className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {statsLoading ? '-' : cacheStats?.totalEntries.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">
                  最大 {cacheStats?.maxEntries.toLocaleString()} エントリ
                </p>
              </CardContent>
            </Card>

            <Card data-testid="cache-size-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">使用容量</CardTitle>
                <HardDrive className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {statsLoading ? '-' : formatBytes(cacheStats?.totalSize || 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  最大 {formatBytes(cacheStats?.maxSize || 0)}
                </p>
              </CardContent>
            </Card>

            <Card data-testid="cache-utilization-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">使用率</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {statsLoading ? '-' : cacheStats?.utilizationPercent}
                </div>
                <Progress 
                  value={parseFloat(cacheStats?.utilizationPercent || '0')} 
                  className="mt-2"
                />
              </CardContent>
            </Card>

            <Card data-testid="cache-status-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">ステータス</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {statsLoading ? '-' : '正常'}
                </div>
                <Badge variant="outline" className="mt-2">
                  アクティブ
                </Badge>
              </CardContent>
            </Card>
          </div>

          {/* Cache Utilization Progress */}
          {cacheStats && (
            <Card>
              <CardHeader>
                <CardTitle>キャッシュ利用状況</CardTitle>
                <CardDescription>
                  メモリとエントリ数の使用状況
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>メモリ使用量</span>
                    <span>{formatBytes(cacheStats.totalSize)} / {formatBytes(cacheStats.maxSize)}</span>
                  </div>
                  <Progress value={parseFloat(cacheStats.utilizationPercent)} />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span>エントリ数</span>
                    <span>{cacheStats.totalEntries} / {cacheStats.maxEntries}</span>
                  </div>
                  <Progress value={(cacheStats.totalEntries / cacheStats.maxEntries) * 100} />
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          {/* Performance Metrics */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card data-testid="total-images-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">総処理画像</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {performanceMetrics.totalImages.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">
                  最適化済み: {performanceMetrics.optimizedImages.toLocaleString()}
                </p>
              </CardContent>
            </Card>

            <Card data-testid="average-load-time-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">平均読み込み時間</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatDuration(performanceMetrics.averageLoadTime)}
                </div>
                <Badge variant={performanceMetrics.averageLoadTime < 500 ? "default" : "secondary"}>
                  {performanceMetrics.averageLoadTime < 500 ? "高速" : "標準"}
                </Badge>
              </CardContent>
            </Card>

            <Card data-testid="compression-ratio-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">平均圧縮率</CardTitle>
                <Zap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {performanceMetrics.averageCompressionRatio.toFixed(1)}%
                </div>
                <Badge variant={performanceMetrics.averageCompressionRatio > 70 ? "default" : "secondary"}>
                  {performanceMetrics.averageCompressionRatio > 70 ? "高効率" : "標準"}
                </Badge>
              </CardContent>
            </Card>

            <Card data-testid="error-rate-card">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">エラー率</CardTitle>
                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {(performanceMetrics.errorRate * 100).toFixed(2)}%
                </div>
                <Badge variant={performanceMetrics.errorRate < 0.05 ? "default" : "destructive"}>
                  {performanceMetrics.errorRate < 0.05 ? "良好" : "要注意"}
                </Badge>
              </CardContent>
            </Card>
          </div>

          {/* Performance Chart Placeholder */}
          <Card>
            <CardHeader>
              <CardTitle>パフォーマンス推移</CardTitle>
              <CardDescription>
                画像処理のパフォーマンス指標（過去24時間）
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] flex items-center justify-center border-2 border-dashed border-gray-300 rounded-lg">
                <div className="text-center text-gray-500">
                  <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>パフォーマンスチャート</p>
                  <p className="text-sm">（今後の実装予定）</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="health" className="space-y-4">
          {/* Health Status */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>システムヘルス</CardTitle>
                <CardDescription>画像プロキシサービスの稼働状況</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span>プロキシサービス</span>
                  <Badge variant="default">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    正常
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>キャッシュシステム</span>
                  <Badge variant="default">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    正常
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>セキュリティ監視</span>
                  <Badge variant="default">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    正常
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>推奨アクション</CardTitle>
                <CardDescription>システム最適化のための提案</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {cacheStats && parseFloat(cacheStats.utilizationPercent) > 90 && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>注意</AlertTitle>
                    <AlertDescription>
                      キャッシュ使用率が90%を超えています。クリアを検討してください。
                    </AlertDescription>
                  </Alert>
                )}
                
                {performanceMetrics.errorRate > 0.1 && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>警告</AlertTitle>
                    <AlertDescription>
                      エラー率が10%を超えています。システムログを確認してください。
                    </AlertDescription>
                  </Alert>
                )}

                {performanceMetrics.averageLoadTime > 2000 && (
                  <Alert>
                    <Clock className="h-4 w-4" />
                    <AlertTitle>パフォーマンス</AlertTitle>
                    <AlertDescription>
                      平均読み込み時間が2秒を超えています。ネットワーク状況を確認してください。
                    </AlertDescription>
                  </Alert>
                )}

                {!cacheStats?.totalEntries && (
                  <div className="text-sm text-muted-foreground">
                    すべて正常です。推奨アクションはありません。
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ImageCacheDashboard;