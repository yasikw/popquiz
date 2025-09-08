import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, json, real, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ENUMs for better data integrity
export const difficultyEnum = pgEnum('difficulty', ['beginner', 'intermediate', 'advanced']);
export const contentTypeEnum = pgEnum('content_type', ['pdf', 'text', 'youtube']);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: varchar("username", { length: 50 }).notNull().unique(),
  email: varchar("email", { length: 255 }),
  password: varchar("password", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userSettings = pgTable("user_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull().unique(),
  defaultDifficulty: difficultyEnum("default_difficulty").default("intermediate").notNull(),
  questionCount: integer("question_count").default(5).notNull(),
  timeLimit: integer("time_limit").default(60).notNull(), // seconds per question
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const quizSessions = pgTable("quiz_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  difficulty: difficultyEnum("difficulty").notNull(),
  contentType: contentTypeEnum("content_type").notNull(),
  score: integer("score").notNull(),
  totalQuestions: integer("total_questions").notNull(),
  timeSpent: integer("time_spent").notNull(), // in seconds
  completedAt: timestamp("completed_at").defaultNow().notNull(),
});

export const questions = pgTable("questions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar("session_id").references(() => quizSessions.id).notNull(),
  questionText: text("question_text").notNull(),
  options: json("options").notNull(),
  correctAnswer: integer("correct_answer").notNull(), // 0-3 index
  explanation: text("explanation").notNull(),
  userAnswer: integer("user_answer"), // 0-3 index, null if not answered
  timeSpent: integer("time_spent"), // in seconds
});

export const userStats = pgTable("user_stats", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  totalScore: integer("total_score").default(0).notNull(),
  completedQuizzes: integer("completed_quizzes").default(0).notNull(),
  averageAccuracy: real("average_accuracy").default(0).notNull(),
  beginnerAccuracy: real("beginner_accuracy").default(0).notNull(),
  intermediateAccuracy: real("intermediate_accuracy").default(0).notNull(),
  advancedAccuracy: real("advanced_accuracy").default(0).notNull(),
});

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
