/**
 * Image Error Boundary Component
 * Graceful error handling for image-related failures
 */

import React, { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface ImageErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  showDetails?: boolean;
  retryable?: boolean;
}

interface ImageErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
  retryCount: number;
}

class ImageErrorBoundary extends Component<ImageErrorBoundaryProps, ImageErrorBoundaryState> {
  private maxRetries = 3;

  constructor(props: ImageErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      retryCount: 0
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ImageErrorBoundaryState> {
    return {
      hasError: true,
      error
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({
      error,
      errorInfo
    });

    // Log error to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('ImageErrorBoundary caught an error:', error, errorInfo);
    }

    // Call parent error handler if provided
    this.props.onError?.(error, errorInfo);

    // Report to external error tracking service if available
    this.reportError(error, errorInfo);
  }

  private reportError = (error: Error, errorInfo: React.ErrorInfo) => {
    // In a real application, you would send this to an error tracking service
    // like Sentry, Rollbar, or similar
    try {
      const errorReport = {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href
      };

      // Example: Send to error tracking service
      // errorTrackingService.reportError(errorReport);
      
      console.warn('Image error reported:', errorReport);
    } catch (reportingError) {
      console.error('Failed to report error:', reportingError);
    }
  };

  private handleRetry = () => {
    if (this.state.retryCount < this.maxRetries) {
      this.setState({
        hasError: false,
        error: undefined,
        errorInfo: undefined,
        retryCount: this.state.retryCount + 1
      });
    }
  };

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: undefined,
      errorInfo: undefined,
      retryCount: 0
    });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="p-4" data-testid="image-error-boundary">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>画像の読み込みエラー</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>
                画像の処理中にエラーが発生しました。
                {this.state.retryCount > 0 && (
                  <span className="text-sm block mt-1">
                    （{this.state.retryCount}/{this.maxRetries} 回試行済み）
                  </span>
                )}
              </p>

              {this.props.showDetails && this.state.error && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm font-medium">
                    エラー詳細を表示
                  </summary>
                  <div className="mt-2 p-2 bg-gray-100 rounded text-xs font-mono">
                    <div className="font-semibold text-red-600">
                      {this.state.error.name}: {this.state.error.message}
                    </div>
                    {this.state.error.stack && (
                      <pre className="mt-1 whitespace-pre-wrap text-gray-600">
                        {this.state.error.stack}
                      </pre>
                    )}
                  </div>
                </details>
              )}

              <div className="flex gap-2 mt-3">
                {this.props.retryable && this.state.retryCount < this.maxRetries && (
                  <Button
                    onClick={this.handleRetry}
                    variant="outline"
                    size="sm"
                    data-testid="retry-button"
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    再試行
                  </Button>
                )}
                
                <Button
                  onClick={this.handleReset}
                  variant="outline"
                  size="sm"
                  data-testid="reset-button"
                >
                  <ImageIcon className="h-3 w-3 mr-1" />
                  リセット
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ImageErrorBoundary;