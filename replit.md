# Overview

This is an AI-powered Japanese language quiz application that generates interactive quizzes from various content sources including PDFs, text files, and YouTube videos. The app leverages Google's Gemini AI API to extract text from content and automatically generate multiple-choice questions with explanations. Built with a modern React frontend and Express backend, the application provides a comprehensive learning platform with user management, progress tracking, and performance analytics.

## Recent Changes (January 13, 2025)

✓ **YouTube Data API v3 Migration & Compliance**
  - **Security Enhancement**: Removed non-compliant youtubei.js unofficial API package
  - **Official API Integration**: Implemented YouTube Data API v3 with googleapis library
  - **Comprehensive Rate Limiting**: Added quota management (10,000 units/day) and request throttling
  - **Fallback System**: Primary official API with Gemini Vision fallback for enhanced reliability
  - **API Monitoring**: Real-time quota usage tracking, error rate monitoring, and health checks
  - **Security Logging**: Detailed audit trail for all YouTube API operations and compliance tracking
  - **Administrative Dashboard**: Added /api/admin/youtube-stats and /api/admin/youtube-health endpoints
  - **Quota Alerts**: Automatic warnings at 80% usage, service protection at 95% capacity
  - **SRT Caption Processing**: Safe extraction of text content from official subtitle formats
  - **Error Recovery**: Graceful degradation with detailed error messages and retry guidance

✓ **Image Security & SSRF Protection**
  - Added Helmet middleware for security headers (XSS protection, Content Security Policy, clickjacking prevention)
  - Implemented DOMPurify for client-side and server-side input sanitization
  - **Image Loading Restrictions**: Implemented domain whitelist for trusted image sources only
  - **SSRF Attack Prevention**: Created secure image proxy server with validation
  - **CSP Image Controls**: Restricted img-src to self, data, blob, and whitelisted domains
  - Applied rate limiting to API endpoints (10 requests/minute general, 5 uploads/minute)
  - Enhanced file upload validation with Content-Type verification and magic number checks
  - **Fixed XSS vulnerabilities**: Replaced dangerouslySetInnerHTML with safe CSS injection method
  - **Enhanced API security**: Added input sanitization to all API endpoints including quiz results

## Previous Changes (January 8, 2025)

✓ Migrated from localStorage to comprehensive PostgreSQL database storage
✓ Created user_settings table with default difficulty, question count, and time limit preferences
✓ Implemented API endpoints for user settings CRUD operations (GET/PUT /api/users/:id/settings)
✓ Updated settings interface to load and save preferences from database
✓ Enhanced quiz generation to use database settings instead of localStorage
✓ Maintained 60% transparency for interface elements and 40% for select boxes
✓ Added loading states and error handling for database operations
✓ Integrated React Query for settings data management and caching
✓ Fixed critical "別の問題を出題" (different quiz) button functionality for both PDF and YouTube content
✓ Implemented comprehensive YouTube caching system with video ID extraction and storage
✓ Added generateQuizFromCachedYouTube function for consistent YouTube quiz regeneration
✓ Enhanced quiz interface with balanced 3-column button layout (前の問題/スキップ/次の問題)
✓ Implemented comprehensive PDF cache key system for consistent content reuse
✓ Added advanced question variation system with focus area randomization
✓ Implemented fallback cache search with multiple matching strategies
✓ Enhanced AI temperature settings and similarity checking for question diversity
✓ Added detailed debugging and error handling for cache operations
✓ Resolved cache key generation inconsistencies between PDF processing and quiz generation
✓ Fixed variable scoping issues and added extractVideoId helper function
✓ Added generateQuizFromCachedText function for text content re-use
✓ Implemented password functionality in user settings with bcrypt security
✓ Updated database schema with password field and secure storage system
✓ Redesigned settings layout to display all cards in vertical single-column layout
✓ Created modern login/registration system with authentication and session management
✓ Applied custom background image throughout the app for cohesive design
✓ Integrated custom AI Quiz logo in header and login screen
✓ Updated to new minimalist hexagon logo design with transparent background
✓ Implemented comprehensive learning statistics tracking system
✓ Added automatic quiz result submission to database with performance metrics
✓ Created user statistics API endpoints for data retrieval and updates
✓ Integrated difficulty-specific accuracy tracking (beginner/intermediate/advanced)
✓ Fixed quiz history display to show sessions instead of individual questions
✓ Enhanced content title extraction for text input topics (e.g., "日本の歴史")
✓ Implemented real-time statistics updates after quiz completion in home screen
✓ Added proper duplicate session filtering in statistics display
✓ Optimized React Query caching with fresh data fetching for accurate statistics
✓ Improved YouTube quiz generation to focus on specific video content rather than general topics
✓ Enhanced content extraction with stricter prompts for accurate, factual information
✓ Fixed URL-based analysis to generate quiz-appropriate detailed content with specific facts
✓ Updated Gemini API integration with improved temperature settings for consistent results

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React 18 with TypeScript and Vite for fast development
- **UI Library**: Shadcn/ui components built on Radix UI primitives for accessibility
- **Styling**: Tailwind CSS with CSS variables for theming and responsive design
- **State Management**: TanStack React Query for server state management and caching
- **Routing**: Wouter for lightweight client-side routing
- **Form Handling**: React Hook Form with Zod validation schemas

## Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **API Design**: RESTful endpoints for user management, quiz sessions, and content processing
- **File Processing**: Multer for handling file uploads with memory storage
- **Error Handling**: Centralized error middleware with structured error responses

## Data Storage Solutions
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Schema**: Relational design with tables for users, quiz sessions, questions, and user statistics
- **Connection**: Neon Database serverless PostgreSQL for cloud deployment
- **Session Management**: PostgreSQL session store with connect-pg-simple
- **Migrations**: Drizzle Kit for database schema migrations

## AI Integration (Gemini API)
- **Text Extraction**: Gemini Vision API for PDF content extraction using base64 encoding
- **Quiz Generation**: Gemini Pro for generating structured quiz questions from extracted content
- **Content Processing**: Supports multiple difficulty levels (beginner, intermediate, advanced)
- **Response Format**: JSON-structured quiz responses with questions, options, correct answers, and explanations

## Authentication and User Management
- **User System**: Simple username-based authentication without passwords
- **Session Tracking**: Server-side session management for user state persistence
- **User Data**: Profile management with customizable settings and preferences
- **Statistics**: Comprehensive tracking of quiz performance and learning progress

## Content Processing Pipeline
- **PDF Processing**: File upload → Gemini Vision API → text extraction → quiz generation
- **Text Processing**: Direct text file upload → content parsing → quiz generation
- **YouTube Integration**: URL input → YouTube Data API v3 captions → quiz generation (with Gemini fallback)
- **Difficulty Adjustment**: AI prompt engineering based on selected difficulty level
- **API Compliance**: Official YouTube Data API v3 with comprehensive quota management

## Performance and Caching
- **Query Caching**: TanStack React Query with infinite stale time for optimal performance
- **File Limits**: 10MB maximum file size for PDF uploads
- **Loading States**: Comprehensive loading overlays with progress indicators
- **Error Recovery**: Graceful error handling with user-friendly error messages

# External Dependencies

## AI Services
- **Google Gemini API**: Primary AI service for text extraction and quiz generation
- **API Models**: gemini-2.5-pro for text processing and vision capabilities
- **Authentication**: Environment variable-based API key management (GEMINI_API_KEY)

## Security Libraries
- **Helmet**: Security middleware for Express.js providing XSS protection and security headers
- **DOMPurify**: HTML/text sanitization library for preventing XSS attacks (client and server)
- **JSDOM**: Server-side DOM implementation for DOMPurify integration
- **bcryptjs**: Password hashing and validation for secure user authentication

## Database and Infrastructure
- **Neon Database**: Serverless PostgreSQL hosting with automatic scaling
- **Connection**: Environment-based DATABASE_URL configuration
- **Drizzle ORM**: Type-safe database operations with schema validation

## Content Processing
- **YouTube Data API**: Planned integration for subtitle extraction (currently placeholder)
- **PDF Processing**: Gemini Vision API handles PDF-to-text conversion
- **File Upload**: Multer middleware for handling multipart form data

## UI and Component Libraries
- **Radix UI**: Accessible component primitives for complex UI elements
- **Lucide React**: Icon library for consistent iconography
- **React Hook Form**: Form state management with validation
- **Zod**: Runtime type validation for forms and API responses

## Development and Build Tools
- **Vite**: Fast build tool with hot module replacement
- **TypeScript**: Type safety across frontend and backend
- **Tailwind CSS**: Utility-first CSS framework
- **ESBuild**: Fast JavaScript bundler for production builds