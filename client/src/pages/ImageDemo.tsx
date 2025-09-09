/**
 * Image Demo Page
 * Demonstration of secure image loading and optimization features
 */

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import SecureImage from '@/components/ui/SecureImage';
import ImageErrorBoundary from '@/components/ui/ImageErrorBoundary';
import ImagePerformanceMonitor from '@/components/ui/ImagePerformanceMonitor';
import ImageCacheDashboard from '@/components/admin/ImageCacheDashboard';
import { useImageOptimization } from '@/hooks/useImageOptimization';
import { Image as ImageIcon, Settings, Shield, Zap } from 'lucide-react';

const ImageDemo: React.FC = () => {
  const [imageUrl, setImageUrl] = useState('https://images.unsplash.com/photo-1506905925346-21bda4d32df4');
  const [width, setWidth] = useState<number>(800);
  const [height, setHeight] = useState<number>(600);
  const [quality, setQuality] = useState<number>(85);
  const [format, setFormat] = useState<'jpeg' | 'png' | 'webp'>('webp');
  const [fit, setFit] = useState<'cover' | 'contain' | 'fill' | 'inside' | 'outside'>('inside');

  // Example image URLs for testing
  const sampleImages = [
    {
      name: 'Landscape (Unsplash)',
      url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4',
      description: '大きな風景画像 - 圧縮テスト用'
    },
    {
      name: 'Portrait (Unsplash)',
      url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d',
      description: 'ポートレート画像 - 品質テスト用'
    },
    {
      name: 'Technology (Unsplash)',
      url: 'https://images.unsplash.com/photo-1518709268805-4e9042af2176',
      description: 'テクノロジー画像 - WebP変換テスト用'
    },
    {
      name: 'Invalid URL',
      url: 'https://invalid-domain-for-testing.com/image.jpg',
      description: 'エラーハンドリングテスト用'
    }
  ];

  const optimizationResult = useImageOptimization(imageUrl, {
    width,
    height,
    quality,
    format,
    fit,
    enableAutoFormat: true,
    enableResponsive: true
  });

  return (
    <div className="container mx-auto p-6 space-y-6" data-testid="image-demo-page">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-bold tracking-tight">セキュア画像システム デモ</h1>
        <p className="text-lg text-muted-foreground">
          高度なセキュリティと最適化機能を備えた画像処理システム
        </p>
        <div className="flex justify-center gap-2">
          <Badge variant="outline">
            <Shield className="h-3 w-3 mr-1" />
            SSRF防御
          </Badge>
          <Badge variant="outline">
            <Zap className="h-3 w-3 mr-1" />
            自動最適化
          </Badge>
          <Badge variant="outline">
            <ImageIcon className="h-3 w-3 mr-1" />
            プロキシ処理
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="demo" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="demo">画像デモ</TabsTrigger>
          <TabsTrigger value="performance">パフォーマンス</TabsTrigger>
          <TabsTrigger value="admin">管理画面</TabsTrigger>
          <TabsTrigger value="examples">サンプル</TabsTrigger>
        </TabsList>

        <TabsContent value="demo" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Controls */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  画像設定
                </CardTitle>
                <CardDescription>
                  画像URLと最適化パラメータを設定
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Image URL */}
                <div className="space-y-2">
                  <Label htmlFor="image-url">画像URL</Label>
                  <Input
                    id="image-url"
                    type="url"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://example.com/image.jpg"
                    data-testid="image-url-input"
                  />
                  <p className="text-xs text-muted-foreground">
                    外部URLは自動的にセキュアプロキシ経由で処理されます
                  </p>
                </div>

                {/* Quick Sample URLs */}
                <div className="space-y-2">
                  <Label>サンプル画像</Label>
                  <div className="grid gap-2">
                    {sampleImages.map((sample, index) => (
                      <Button
                        key={index}
                        variant="outline"
                        size="sm"
                        onClick={() => setImageUrl(sample.url)}
                        className="justify-start text-left h-auto p-2"
                        data-testid={`sample-image-${index}`}
                      >
                        <div>
                          <div className="font-medium">{sample.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {sample.description}
                          </div>
                        </div>
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Optimization Parameters */}
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="width">幅</Label>
                    <Input
                      id="width"
                      type="number"
                      value={width}
                      onChange={(e) => setWidth(parseInt(e.target.value) || 0)}
                      min="1"
                      max="4096"
                      data-testid="width-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="height">高さ</Label>
                    <Input
                      id="height"
                      type="number"
                      value={height}
                      onChange={(e) => setHeight(parseInt(e.target.value) || 0)}
                      min="1"
                      max="4096"
                      data-testid="height-input"
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="quality">品質</Label>
                    <Input
                      id="quality"
                      type="number"
                      value={quality}
                      onChange={(e) => setQuality(parseInt(e.target.value) || 85)}
                      min="1"
                      max="100"
                      data-testid="quality-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="format">形式</Label>
                    <Select value={format} onValueChange={(value: any) => setFormat(value)}>
                      <SelectTrigger data-testid="format-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="webp">WebP</SelectItem>
                        <SelectItem value="jpeg">JPEG</SelectItem>
                        <SelectItem value="png">PNG</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fit">フィット</Label>
                  <Select value={fit} onValueChange={(value: any) => setFit(value)}>
                    <SelectTrigger data-testid="fit-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inside">inside (縦横比保持)</SelectItem>
                      <SelectItem value="outside">outside (範囲外切り取り)</SelectItem>
                      <SelectItem value="cover">cover (全体覆う)</SelectItem>
                      <SelectItem value="contain">contain (全体収める)</SelectItem>
                      <SelectItem value="fill">fill (強制リサイズ)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Optimization Info */}
                {optimizationResult.isOptimized && (
                  <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                    <div className="font-medium text-sm">最適化情報</div>
                    <div className="grid gap-2 text-xs">
                      {optimizationResult.loadTime && (
                        <div className="flex justify-between">
                          <span>読み込み時間:</span>
                          <span>{optimizationResult.loadTime.toFixed(0)}ms</span>
                        </div>
                      )}
                      {optimizationResult.compressionRatio && (
                        <div className="flex justify-between">
                          <span>圧縮率:</span>
                          <span>{optimizationResult.compressionRatio.toFixed(1)}%</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>プロキシ使用:</span>
                        <span>{optimizationResult.isOptimized ? 'はい' : 'いいえ'}</span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Image Display */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="h-5 w-5" />
                  画像プレビュー
                </CardTitle>
                <CardDescription>
                  セキュアプロキシ経由で最適化された画像
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ImageErrorBoundary
                  retryable
                  showDetails={process.env.NODE_ENV === 'development'}
                >
                  <div className="space-y-4">
                    <SecureImage
                      src={imageUrl}
                      alt="デモ画像"
                      width={width}
                      height={height}
                      quality={quality}
                      format={format}
                      fit={fit}
                      className="w-full h-auto rounded-lg border"
                      data-testid="demo-secure-image"
                    />
                    
                    {/* Image URL Display */}
                    <div className="p-3 bg-muted/30 rounded text-xs font-mono break-all">
                      <div className="font-medium mb-1">最適化URL:</div>
                      <div className="text-muted-foreground">
                        {optimizationResult.optimizedSrc}
                      </div>
                    </div>
                  </div>
                </ImageErrorBoundary>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="performance">
          <ImagePerformanceMonitor />
        </TabsContent>

        <TabsContent value="admin">
          <ImageCacheDashboard />
        </TabsContent>

        <TabsContent value="examples" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {sampleImages.map((sample, index) => (
              <Card key={index}>
                <CardHeader>
                  <CardTitle className="text-base">{sample.name}</CardTitle>
                  <CardDescription>{sample.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ImageErrorBoundary retryable>
                    <SecureImage
                      src={sample.url}
                      alt={sample.name}
                      width={300}
                      height={200}
                      quality={80}
                      format="webp"
                      fit="cover"
                      className="w-full h-40 object-cover rounded"
                      data-testid={`example-image-${index}`}
                    />
                  </ImageErrorBoundary>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-3"
                    onClick={() => setImageUrl(sample.url)}
                    data-testid={`load-example-${index}`}
                  >
                    このURLを読み込む
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ImageDemo;