import { apiRequest } from "./queryClient";
import { type GeneratedQuiz, type User, type QuizSession, type Question, type UserStats } from "@shared/schema";

// User operations
export async function createUser(userData: { username: string; email?: string }) {
  const response = await apiRequest("POST", "/api/users", userData);
  return response.json() as Promise<User>;
}

export async function getUserByUsername(username: string) {
  const response = await apiRequest("GET", `/api/users/${username}`);
  return response.json() as Promise<User>;
}

export async function updateUser(id: string, userData: Partial<{ username: string; email?: string }>) {
  const response = await apiRequest("PUT", `/api/users/${id}`, userData);
  return response.json() as Promise<User>;
}

// Content processing
export async function processPDF(file: File, difficulty: string, title: string) {
  const formData = new FormData();
  formData.append('pdf', file);
  formData.append('difficulty', difficulty);
  formData.append('title', title);

  const response = await fetch("/api/process-pdf", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "PDF処理に失敗しました");
  }

  return response.json() as Promise<GeneratedQuiz>;
}

export async function processText(file: File, difficulty: string, title: string) {
  const formData = new FormData();
  formData.append('text', file);
  formData.append('difficulty', difficulty);
  formData.append('title', title);

  const response = await fetch("/api/process-text", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "テキスト処理に失敗しました");
  }

  return response.json() as Promise<GeneratedQuiz>;
}

export async function processYouTube(url: string, difficulty: string, title: string) {
  const response = await apiRequest("POST", "/api/process-youtube", {
    url,
    difficulty,
    title,
  });
  return response.json() as Promise<GeneratedQuiz>;
}

// Quiz session operations
export async function createQuizSession(sessionData: {
  userId: string;
  title: string;
  difficulty: string;
  contentType: string;
  score: number;
  totalQuestions: number;
  timeSpent: number;
}) {
  const response = await apiRequest("POST", "/api/quiz-sessions", sessionData);
  return response.json() as Promise<QuizSession>;
}

export async function createQuestions(sessionId: string, questions: Array<{
  questionText: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  userAnswer?: number;
  timeSpent?: number;
}>) {
  const response = await apiRequest("POST", `/api/quiz-sessions/${sessionId}/questions`, questions);
  return response.json() as Promise<Question[]>;
}

export async function getSessionQuestions(sessionId: string) {
  const response = await apiRequest("GET", `/api/quiz-sessions/${sessionId}/questions`);
  return response.json() as Promise<Question[]>;
}

export async function submitAnswer(questionId: string, userAnswer: number, timeSpent: number) {
  const response = await apiRequest("PUT", `/api/questions/${questionId}/answer`, {
    userAnswer,
    timeSpent,
  });
  return response.json() as Promise<Question>;
}

// User statistics
export async function getUserSessions(userId: string) {
  const response = await apiRequest("GET", `/api/users/${userId}/sessions`);
  return response.json() as Promise<QuizSession[]>;
}

export async function getUserStats(userId: string) {
  const response = await apiRequest("GET", `/api/users/${userId}/stats`);
  return response.json() as Promise<UserStats>;
}

export async function updateUserStats(userId: string, stats: Partial<UserStats>) {
  const response = await apiRequest("PUT", `/api/users/${userId}/stats`, stats);
  return response.json() as Promise<UserStats>;
}

// Submit quiz results
export async function submitQuizResults(userId: string, quizData: any, results: any) {
  const response = await apiRequest("POST", "/api/quiz-results", {
    userId,
    quizData,
    results,
  });
  return response.json();
}
