import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, json, real, pgEnum, index, check } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ENUMs for better data integrity
export const difficultyEnum = pgEnum('difficulty', ['beginner', 'intermediate', 'advanced']);
export const contentTypeEnum = pgEnum('content_type', ['pdf', 'text', 'youtube']);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: varchar("username", { length: 50 }).notNull().unique(),
  email: varchar("email", { length: 255 }),
  password: varchar("password", { length: 255 }).notNull(), // NOT NULL for hashed passwords
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  // Performance indexes for common lookups and DoS prevention
  usernameIdx: index("idx_users_username").on(table.username),
  emailIdx: index("idx_users_email").on(table.email),
  createdAtIdx: index("idx_users_created_at").on(table.createdAt),
  // Pattern constraint for username (alphanumeric + underscore only)
  usernamePattern: check("chk_username_pattern", sql`${table.username} ~ '^[a-zA-Z0-9_]+$'`),
  // Length constraints
  usernameLength: check("chk_username_length", sql`length(${table.username}) >= 3 AND length(${table.username}) <= 50`),
  // Email format validation (basic pattern)
  emailFormat: check("chk_email_format", sql`${table.email} IS NULL OR ${table.email} ~ '^[^@]+@[^@]+\.[^@]+$'`),
}));

export const userSettings = pgTable("user_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull().unique(),
  defaultDifficulty: difficultyEnum("default_difficulty").default("intermediate").notNull(),
  questionCount: integer("question_count").default(5).notNull(),
  timeLimit: integer("time_limit").default(60).notNull(), // seconds per question
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  // Performance index for user lookups
  userIdIdx: index("idx_user_settings_user_id").on(table.userId),
  updatedAtIdx: index("idx_user_settings_updated_at").on(table.updatedAt),
  // Business logic constraints
  questionCountRange: check("chk_question_count_range", sql`${table.questionCount} >= 1 AND ${table.questionCount} <= 50`),
  timeLimitRange: check("chk_time_limit_range", sql`${table.timeLimit} >= 10 AND ${table.timeLimit} <= 300`),
}));

export const quizSessions = pgTable("quiz_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  difficulty: difficultyEnum("difficulty").notNull(),
  contentType: contentTypeEnum("content_type").notNull(),
  score: integer("score").notNull(),
  totalQuestions: integer("total_questions").notNull(),
  timeSpent: integer("time_spent").notNull(), // in seconds
  completedAt: timestamp("completed_at").defaultNow().notNull(),
}, (table) => ({
  // Performance indexes for common queries and analytics
  userIdIdx: index("idx_quiz_sessions_user_id").on(table.userId),
  completedAtIdx: index("idx_quiz_sessions_completed_at").on(table.completedAt),
  difficultyIdx: index("idx_quiz_sessions_difficulty").on(table.difficulty),
  contentTypeIdx: index("idx_quiz_sessions_content_type").on(table.contentType),
  // Composite index for user statistics queries
  userStatsIdx: index("idx_quiz_sessions_user_stats").on(table.userId, table.difficulty, table.completedAt),
  // Business logic constraints
  scoreRange: check("chk_score_range", sql`${table.score} >= 0`),
  totalQuestionsRange: check("chk_total_questions_range", sql`${table.totalQuestions} >= 1 AND ${table.totalQuestions} <= 50`),
  timeSpentRange: check("chk_time_spent_range", sql`${table.timeSpent} >= 0`),
  titleLength: check("chk_title_length", sql`length(${table.title}) >= 1 AND length(${table.title}) <= 500`),
}));

export const questions = pgTable("questions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => quizSessions.id, { onDelete: "cascade" }).notNull(),
  questionText: text("question_text").notNull(),
  options: json("options").notNull(),
  correctAnswer: integer("correct_answer").notNull(), // 0-3 index
  explanation: text("explanation").notNull(),
  userAnswer: integer("user_answer"), // 0-3 index, null if not answered
  timeSpent: integer("time_spent"), // in seconds
}, (table) => ({
  // Performance indexes for session queries
  sessionIdIdx: index("idx_questions_session_id").on(table.sessionId),
  correctAnswerIdx: index("idx_questions_correct_answer").on(table.correctAnswer),
  // Business logic constraints
  correctAnswerRange: check("chk_correct_answer_range", sql`${table.correctAnswer} >= 0 AND ${table.correctAnswer} <= 3`),
  userAnswerRange: check("chk_user_answer_range", sql`${table.userAnswer} IS NULL OR (${table.userAnswer} >= 0 AND ${table.userAnswer} <= 3)`),
  timeSpentRange: check("chk_question_time_spent_range", sql`${table.timeSpent} IS NULL OR ${table.timeSpent} >= 0`),
  questionTextLength: check("chk_question_text_length", sql`length(${table.questionText}) >= 10 AND length(${table.questionText}) <= 1000`),
  explanationLength: check("chk_explanation_length", sql`length(${table.explanation}) >= 1 AND length(${table.explanation}) <= 2000`),
}));

export const userStats = pgTable("user_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "cascade" }).notNull().unique(),
  totalScore: integer("total_score").default(0).notNull(),
  completedQuizzes: integer("completed_quizzes").default(0).notNull(),
  averageAccuracy: real("average_accuracy").default(0).notNull(),
  beginnerAccuracy: real("beginner_accuracy").default(0).notNull(),
  intermediateAccuracy: real("intermediate_accuracy").default(0).notNull(),
  advancedAccuracy: real("advanced_accuracy").default(0).notNull(),
}, (table) => ({
  // Performance index for user lookups
  userIdIdx: index("idx_user_stats_user_id").on(table.userId),
  // Business logic constraints for statistics
  totalScoreRange: check("chk_total_score_range", sql`${table.totalScore} >= 0`),
  completedQuizzesRange: check("chk_completed_quizzes_range", sql`${table.completedQuizzes} >= 0`),
  averageAccuracyRange: check("chk_average_accuracy_range", sql`${table.averageAccuracy} >= 0 AND ${table.averageAccuracy} <= 1`),
  beginnerAccuracyRange: check("chk_beginner_accuracy_range", sql`${table.beginnerAccuracy} >= 0 AND ${table.beginnerAccuracy} <= 1`),
  intermediateAccuracyRange: check("chk_intermediate_accuracy_range", sql`${table.intermediateAccuracy} >= 0 AND ${table.intermediateAccuracy} <= 1`),
  advancedAccuracyRange: check("chk_advanced_accuracy_range", sql`${table.advancedAccuracy} >= 0 AND ${table.advancedAccuracy} <= 1`),
}));

// Enhanced validation schemas with detailed constraints
export const insertUserSchema = createInsertSchema(users, {
  username: z
    .string()
    .min(3, "ユーザー名は3文字以上である必要があります")
    .max(50, "ユーザー名は50文字以下である必要があります")
    .regex(/^[a-zA-Z0-9_]+$/, "ユーザー名は英数字とアンダースコアのみ使用できます"),
  email: z
    .string()
    .email("有効なメールアドレスを入力してください")
    .max(255, "メールアドレスは255文字以下である必要があります")
    .optional()
    .or(z.literal(null)),
  password: z
    .string()
    .min(6, "パスワードは6文字以上である必要があります")
    .max(128, "パスワードは128文字以下である必要があります"),
}).omit({
  id: true,
  createdAt: true,
});

export const insertQuizSessionSchema = createInsertSchema(quizSessions, {
  title: z
    .string()
    .min(1, "タイトルは必須です")
    .max(500, "タイトルは500文字以下である必要があります"),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced'], {
    errorMap: () => ({ message: "難易度はbeginner、intermediate、advancedのいずれかである必要があります" })
  }),
  contentType: z.enum(['pdf', 'text', 'youtube'], {
    errorMap: () => ({ message: "コンテンツタイプはpdf、text、youtubeのいずれかである必要があります" })
  }),
  score: z
    .number()
    .int("スコアは整数である必要があります")
    .min(0, "スコアは0以上である必要があります"),
  totalQuestions: z
    .number()
    .int("問題数は整数である必要があります")
    .min(1, "問題数は1以上である必要があります")
    .max(50, "問題数は50以下である必要があります"),
  timeSpent: z
    .number()
    .int("経過時間は整数である必要があります")
    .min(0, "経過時間は0以上である必要があります")
}).omit({
  id: true,
  completedAt: true,
});

export const insertQuestionSchema = createInsertSchema(questions, {
  questionText: z
    .string()
    .min(10, "問題文は10文字以上である必要があります")
    .max(1000, "問題文は1000文字以下である必要があります"),
  correctAnswer: z
    .number()
    .int("正解は整数である必要があります")
    .min(0, "正解は0以上である必要があります")
    .max(3, "正解は3以下である必要があります"),
  explanation: z
    .string()
    .min(1, "解説は必須です")
    .max(2000, "解説は2000文字以下である必要があります"),
  userAnswer: z
    .number()
    .int("回答は整数である必要があります")
    .min(0, "回答は0以上である必要があります")
    .max(3, "回答は3以下である必要があります")
    .optional()
    .or(z.literal(null)),
  timeSpent: z
    .number()
    .int("経過時間は整数である必要があります")
    .min(0, "経過時間は0以上である必要があります")
    .optional()
    .or(z.literal(null))
}).omit({
  id: true,
});

export const insertUserStatsSchema = createInsertSchema(userStats, {
  totalScore: z
    .number()
    .int("合計スコアは整数である必要があります")
    .min(0, "合計スコアは0以上である必要があります"),
  completedQuizzes: z
    .number()
    .int("完了したクイズ数は整数である必要があります")
    .min(0, "完了したクイズ数は0以上である必要があります"),
  averageAccuracy: z
    .number()
    .min(0, "平均正解率は0以上である必要があります")
    .max(1, "平均正解率は1以下である必要があります"),
  beginnerAccuracy: z
    .number()
    .min(0, "初級正解率は0以上である必要があります")
    .max(1, "初級正解率は1以下である必要があります"),
  intermediateAccuracy: z
    .number()
    .min(0, "中級正解率は0以上である必要があります")
    .max(1, "中級正解率は1以下である必要があります"),
  advancedAccuracy: z
    .number()
    .min(0, "上級正解率は0以上である必要があります")
    .max(1, "上級正解率は1以下である必要があります")
}).omit({
  id: true,
});

export const insertUserSettingsSchema = createInsertSchema(userSettings, {
  defaultDifficulty: z.enum(['beginner', 'intermediate', 'advanced'], {
    errorMap: () => ({ message: "デフォルト難易度はbeginner、intermediate、advancedのいずれかである必要があります" })
  }),
  questionCount: z
    .number()
    .int("問題数は整数である必要があります")
    .min(1, "問題数は1以上である必要があります")
    .max(50, "問題数は50以下である必要があります"),
  timeLimit: z
    .number()
    .int("制限時間は整数である必要があります")
    .min(10, "制限時間は10秒以上である必要があります")
    .max(300, "制限時間は300秒以下である必要があります")
}).omit({
  id: true,
  updatedAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type SafeUser = Omit<User, 'password'>; // Safe user type without password for API responses
export type InsertUser = z.infer<typeof insertUserSchema>;

export type QuizSession = typeof quizSessions.$inferSelect;
export type InsertQuizSession = z.infer<typeof insertQuizSessionSchema>;

export type Question = typeof questions.$inferSelect;
export type InsertQuestion = z.infer<typeof insertQuestionSchema>;

export type UserStats = typeof userStats.$inferSelect;
export type InsertUserStats = z.infer<typeof insertUserStatsSchema>;

export type UserSettings = typeof userSettings.$inferSelect;
export type InsertUserSettings = z.infer<typeof insertUserSettingsSchema>;

// Additional validation schemas for API endpoints
export const authRegisterSchema = z.object({
  username: insertUserSchema.shape.username,
  email: insertUserSchema.shape.email.optional(),
  password: insertUserSchema.shape.password
});

export const authLoginSchema = z.object({
  username: z.string().min(1, "ユーザー名は必須です"),
  password: z.string().min(1, "パスワードは必須です")
});

export const quizGenerationSchema = z.object({
  contentType: z.enum(['pdf', 'text', 'youtube'], {
    errorMap: () => ({ message: "コンテンツタイプはpdf、text、youtubeのいずれかである必要があります" })
  }),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced'], {
    errorMap: () => ({ message: "難易度はbeginner、intermediate、advancedのいずれかである必要があります" })
  }),
  questionCount: z
    .string()
    .regex(/^\d+$/, "問題数は数値である必要があります")
    .transform(Number)
    .refine(val => val >= 1 && val <= 20, "問題数は1から20の間である必要があります"),
  youtubeUrl: z
    .string()
    .url("有効なURLを入力してください")
    .regex(/^https:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)[\w-]+/, 
           "有効なYouTube URLを入力してください")
    .optional(),
  textContent: z
    .string()
    .min(10, "テキストは10文字以上である必要があります")
    .max(10000, "テキストは10000文字以下である必要があります")
    .optional()
});

// Quiz generation types
export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
}

export interface GeneratedQuiz {
  questions: QuizQuestion[];
  difficulty: string;
  title: string;
}
