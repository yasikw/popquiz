interface LoadingOverlayProps {
  isVisible: boolean;
  message: string;
}

export default function LoadingOverlay({ isVisible, message }: LoadingOverlayProps) {
  if (!isVisible) return null;

  return (
    <div
      className="fixed inset-0 flex items-end justify-center z-50 p-6 pb-28"
      style={{ backgroundColor: "rgba(253, 246, 227, 0.85)" }}
      data-testid="loading-overlay"
    >
      <style>{`
        @keyframes quiz-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes quiz-progress {
          0% { width: 15%; }
          50% { width: 75%; }
          100% { width: 95%; }
        }
        @keyframes quiz-dot-pulse {
          0%, 100% { transform: scale(1); opacity: 0.7; }
          50% { transform: scale(1.4); opacity: 1; }
        }
      `}</style>

      <div
        className="w-full max-w-sm flex flex-col items-center text-center relative overflow-hidden"
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "2rem",
          padding: "2.5rem 2rem",
          boxShadow: "0 16px 48px rgba(50, 47, 34, 0.12)",
        }}
      >
        {/* Background blobs */}
        <div
          className="absolute -top-12 -right-12 w-32 h-32"
          style={{
            backgroundColor: "rgba(255, 112, 159, 0.15)",
            borderRadius: "9999px",
            filter: "blur(32px)",
          }}
        />
        <div
          className="absolute -bottom-12 -left-12 w-32 h-32"
          style={{
            backgroundColor: "rgba(255, 215, 9, 0.15)",
            borderRadius: "9999px",
            filter: "blur(32px)",
          }}
        />

        {/* Spinner */}
        <div className="relative w-20 h-20 flex items-center justify-center mb-6">
          <div
            className="absolute inset-0 rounded-full"
            style={{ border: "4px solid rgba(255, 112, 159, 0.2)" }}
          />
          <div
            className="absolute inset-0 rounded-full"
            style={{
              border: "4px solid transparent",
              borderTopColor: "#a8275a",
              animation: "quiz-spin 2s linear infinite",
            }}
          />
          <span
            className="material-symbols-outlined text-3xl"
            style={{ color: "#a8275a", fontVariationSettings: "'FILL' 1" }}
          >
            auto_awesome
          </span>
        </div>

        {/* Text */}
        <h2
          className="text-2xl tracking-tight mb-1"
          style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: 800,
            color: "#322f22",
          }}
        >
          AI is generating your quiz...
        </h2>
        <p
          className="text-sm font-medium mb-6"
          style={{ color: "#5f5b4d" }}
        >
          {message || "Getting the most fun quiz ready for you"}
        </p>

        {/* Progress bar */}
        <div className="w-full space-y-3 relative z-10">
          <div
            className="w-full h-3 overflow-hidden"
            style={{ backgroundColor: "#e4ddc5", borderRadius: "9999px" }}
          >
            <div
              className="h-full"
              style={{
                background: "linear-gradient(90deg, #a8275a, #ff709f)",
                borderRadius: "9999px",
                animation: "quiz-progress 4s ease-in-out infinite",
              }}
            />
          </div>
          <p
            className="text-xs font-bold tracking-wide"
            style={{ color: "rgba(95, 91, 77, 0.7)" }}
          >
            Usually takes 1-2 minutes
          </p>
        </div>

        {/* Bubble dots */}
        <div className="flex items-center justify-center gap-2 mt-5">
          {["#a8275a", "#ff709f", "#ffd709", "#74f7f1"].map((color, i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full"
              style={{
                backgroundColor: color,
                animation: `quiz-dot-pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
