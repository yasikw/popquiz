/**
 * CSRF token management for the frontend
 */

let csrfToken: string | null = null;

// Fetch CSRF token from server
export async function fetchCSRFToken(): Promise<string | null> {
  try {
    const response = await fetch('/api/csrf-token', {
      method: 'GET',
      credentials: 'include' // Include cookies for secure token delivery
    });
    
    if (!response.ok) {
      console.error('Failed to fetch CSRF token:', response.statusText);
      return null;
    }
    
    const data = await response.json();
    csrfToken = data.csrfToken;
    return csrfToken;
  } catch (error) {
    console.error('Error fetching CSRF token:', error);
    return null;
  }
}

// Get current CSRF token (fetch if not available)
export async function getCSRFToken(): Promise<string | null> {
  if (!csrfToken) {
    await fetchCSRFToken();
  }
  return csrfToken;
}

// Refresh CSRF token
export async function refreshCSRFToken(): Promise<string | null> {
  try {
    const response = await fetch('/api/csrf-token/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.error('Failed to refresh CSRF token:', response.statusText);
      return null;
    }
    
    const data = await response.json();
    csrfToken = data.csrfToken;
    return csrfToken;
  } catch (error) {
    console.error('Error refreshing CSRF token:', error);
    return null;
  }
}

// Clear stored CSRF token (useful for logout)
export function clearCSRFToken(): void {
  csrfToken = null;
}

// Add CSRF token to request headers
export async function addCSRFHeaders(headers: Record<string, string> = {}): Promise<Record<string, string>> {
  const token = await getCSRFToken();
  
  if (token) {
    return {
      ...headers,
      'X-CSRF-Token': token
    };
  }
  
  return headers;
}

// Check if error is CSRF-related and handle it
export function isCSRFError(error: any): boolean {
  return error?.status === 403 && 
         (error?.code === 'INVALID_CSRF_TOKEN' || 
          error?.message?.includes('CSRF'));
}

// Handle CSRF error by refreshing token and retrying request
export async function handleCSRFError(): Promise<boolean> {
  console.log('CSRF error detected, refreshing token...');
  const newToken = await refreshCSRFToken();
  return newToken !== null;
}