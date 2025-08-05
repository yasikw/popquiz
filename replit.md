# Overview

This is an AI-powered quiz application that generates interactive quizzes from various content sources including PDFs, text files, and YouTube videos. The app leverages Google's Gemini AI API to extract text from content and automatically generate multiple-choice questions with explanations. Built with a modern React frontend and Express backend, the application provides a comprehensive learning platform with user management, progress tracking, and performance analytics.

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
- **YouTube Integration**: URL input → subtitle extraction (placeholder for future implementation)
- **Difficulty Adjustment**: AI prompt engineering based on selected difficulty level

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