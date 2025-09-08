/**
 * Strict CORS middleware for sensitive endpoints
 * Use this for admin routes, payment processing, or other high-security endpoints
 */

import cors from 'cors';
import { strictCorsConfig } from '../config/cors.js';

/**
 * Apply strict CORS to sensitive routes
 * Usage: app.use('/api/admin', strictCorsMiddleware, adminRoutes);
 */
export const strictCorsMiddleware = cors(strictCorsConfig);

/**
 * Apply strict CORS to specific route handlers
 * Usage: router.get('/sensitive', applyCorsToRoute, handler);
 */
export const applyCorsToRoute = (req: any, res: any, next: any) => {
  strictCorsMiddleware(req, res, next);
};