import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { getCorsConfig, corsErrorHandler } from "./config/cors.js";
import { generateCSPNonce, applyCSP } from "./middleware/csp.js";
import { getCurrentCSPConfig } from "./config/csp.js";

const app = express();

// CORS middleware - must be applied before other middleware
app.use(cors(getCorsConfig()));

// CSP nonce generation - must be before other middleware
app.use(generateCSPNonce);

// Disable default helmet CSP (we'll use our custom CSP)
app.use(helmet({
  contentSecurityPolicy: false, // Disabled - using custom CSP middleware
  crossOriginEmbedderPolicy: false, // Disabled for external content compatibility
}));

// Apply custom CSP with nonce support
app.use(applyCSP);

// Additional security headers
app.use((req, res, next) => {
  // X-Frame-Options (additional protection)
  res.setHeader('X-Frame-Options', 'DENY');
  
  // X-Content-Type-Options
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Remove X-Powered-By header
  res.removeHeader('X-Powered-By');
  
  next();
});

// Cookie parser middleware (required for CSRF protection)
app.use(cookieParser());

app.use(express.json({ limit: '5mb' })); // Balanced limit for security and functionality
app.use(express.urlencoded({ extended: false, limit: '5mb' }));

// Payload size error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: 'Payload Too Large',
      message: 'リクエストサイズが制限を超えています（最大5MB）。ファイルサイズを小さくしてください。',
      code: 'PAYLOAD_TOO_LARGE'
    });
  }
  next(err);
});

// CORS error handling middleware
app.use(corsErrorHandler);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
