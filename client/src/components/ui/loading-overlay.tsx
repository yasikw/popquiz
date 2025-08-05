interface LoadingOverlayProps {
  isLoading: boolean;
  message: string;
}

export default function LoadingOverlay({ isLoading, message }: LoadingOverlayProps) {
  if (!isLoading) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" data-testid="loading-overlay">
      <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto mb-4" data-testid="loading-spinner"></div>
          <h4 className="text-lg font-semibold text-gray-900 mb-2">AIでクイズを生成中...</h4>
          <p className="text-sm text-gray-600 mb-4" data-testid="loading-message">
            {message || "コンテンツを解析し、最適なクイズを作成しています。"}
          </p>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div className="bg-primary h-2 rounded-full animate-pulse" style={{ width: "65%" }}></div>
          </div>
          <p className="text-xs text-gray-500 mt-2">通常1-2分で完了します</p>
        </div>
      </div>
    </div>
  );
}
