import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { addCSRFHeaders, isCSRFError, handleCSRFError } from "./csrf";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    const error = { status: res.status, message: text };
    
    // Handle CSRF errors
    if (isCSRFError(error)) {
      const tokenRefreshed = await handleCSRFError();
      if (tokenRefreshed) {
        // Mark this as a retryable CSRF error
        const retryError = new Error(`${res.status}: ${text}`) as any;
        retryError.isCSRFRetry = true;
        throw retryError;
      }
    }
    
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const makeRequest = async (): Promise<Response> => {
    // Build headers properly for TypeScript
    const baseHeaders: Record<string, string> = data ? { "Content-Type": "application/json" } : {};
    const headers = method.toUpperCase() !== 'GET' 
      ? await addCSRFHeaders(baseHeaders)
      : baseHeaders;

    return fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });
  };

  let res = await makeRequest();
  
  try {
    await throwIfResNotOk(res);
  } catch (error: any) {
    // Retry once if it's a CSRF error that was handled
    if (error.isCSRFRetry) {
      res = await makeRequest();
      await throwIfResNotOk(res);
    } else {
      throw error;
    }
  }
  
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // GET requests typically don't need CSRF tokens, but include credentials for authentication
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
