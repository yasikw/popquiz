/**
 * Utility Type Definitions
 * Generic type guards and validation utilities
 */

// Generic Type Guards
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

export function isStringArray(value: unknown): value is string[] {
  return isArray(value) && value.every(isString);
}

export function isNumberArray(value: unknown): value is number[] {
  return isArray(value) && value.every(isNumber);
}

// Validation Utility Types
export type ValidationFn<T> = (value: unknown) => value is T;

export interface TypedValidationResult<T> {
  isValid: boolean;
  data?: T;
  errors?: string[];
}

export function createTypedValidator<T>(
  validator: ValidationFn<T>,
  errorMessage: string = 'Invalid type'
): (value: unknown) => TypedValidationResult<T> {
  return (value: unknown): TypedValidationResult<T> => {
    if (validator(value)) {
      return { isValid: true, data: value };
    }
    return { isValid: false, errors: [errorMessage] };
  };
}

// Safe Object Property Access
export function hasProperty<T extends Record<string, unknown>, K extends string>(
  obj: T,
  key: K
): obj is T & Record<K, unknown> {
  return key in obj;
}

export function getTypedProperty<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  key: K,
  validator: ValidationFn<T[K]>
): T[K] | undefined {
  if (hasProperty(obj, key as string) && validator(obj[key])) {
    return obj[key] as T[K];
  }
  return undefined;
}

// Error Handling Types
export interface TypedError<T = unknown> extends Error {
  code: string;
  context?: T;
  timestamp: Date;
}

export function createTypedError<T>(
  message: string,
  code: string,
  context?: T
): TypedError<T> {
  const error = new Error(message) as TypedError<T>;
  error.code = code;
  error.context = context;
  error.timestamp = new Date();
  return error;
}

// Promise Result Types
export type Result<T, E = Error> = 
  | { success: true; data: T }
  | { success: false; error: E };

export function createSuccessResult<T>(data: T): Result<T> {
  return { success: true, data };
}

export function createErrorResult<E extends Error>(error: E): Result<never, E> {
  return { success: false, error };
}

// Async Result Wrapper
export async function safeAsync<T>(
  promise: Promise<T>
): Promise<Result<T, Error>> {
  try {
    const data = await promise;
    return createSuccessResult(data);
  } catch (error) {
    return createErrorResult(error instanceof Error ? error : new Error(String(error)));
  }
}

// Type Assertion Utilities
export function assertIsString(value: unknown, message?: string): asserts value is string {
  if (!isString(value)) {
    throw new TypeError(message || `Expected string, got ${typeof value}`);
  }
}

export function assertIsNumber(value: unknown, message?: string): asserts value is number {
  if (!isNumber(value)) {
    throw new TypeError(message || `Expected number, got ${typeof value}`);
  }
}

export function assertIsObject(value: unknown, message?: string): asserts value is Record<string, unknown> {
  if (!isObject(value)) {
    throw new TypeError(message || `Expected object, got ${typeof value}`);
  }
}

// Array Utilities with Type Safety
export function filterTyped<T>(
  array: unknown[],
  predicate: ValidationFn<T>
): T[] {
  return array.filter(predicate);
}

export function mapTyped<T, U>(
  array: T[],
  mapper: (item: T, index: number) => U
): U[] {
  return array.map(mapper);
}

// Object Utilities
export function pickTyped<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

export function omitTyped<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result;
}

// Deep Type Checking
export function isDeepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  
  if (typeof a === 'object') {
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      return a.every((item, index) => isDeepEqual(item, b[index]));
    }
    
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);
    
    if (aKeys.length !== bKeys.length) return false;
    
    return aKeys.every(key => 
      bKeys.includes(key) && isDeepEqual(aObj[key], bObj[key])
    );
  }
  
  return false;
}

// Conditional Types for Better Type Inference
export type NonNullable<T> = T extends null | undefined ? never : T;

export type RequiredKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? never : K;
}[keyof T];

export type OptionalKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? K : never;
}[keyof T];

export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;