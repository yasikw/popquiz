import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, json, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email"),
  password: text("password"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userSettings = pgTable("user_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull().unique(),
  defaultDifficulty: text("default_difficulty").default("intermediate").notNull(),
  questionCount: integer("question_count").default(5).notNull(),
  timeLimit: integer("time_limit").default(60).notNull(), // seconds per question
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const quizSessions = pgTable("quiz_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).notNull(),
  title: text("title").notNull(),
  difficulty: text("difficulty").notNull(), // "beginner", "intermediate", "advanced"
  contentType: text("content_type").notNull(), // "pdf", "text", "youtube"
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

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertQuizSessionSchema = createInsertSchema(quizSessions).omit({
  id: true,
  completedAt: true,
});

export const insertQuestionSchema = createInsertSchema(questions).omit({
  id: true,
});

export const insertUserStatsSchema = createInsertSchema(userStats).omit({
  id: true,
});

export const insertUserSettingsSchema = createInsertSchema(userSettings).omit({
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
