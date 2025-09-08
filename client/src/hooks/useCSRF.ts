import { useEffect, useState } from 'react';
import { fetchCSRFToken, clearCSRFToken } from '@/lib/csrf';

/**
 * Hook to manage CSRF token lifecycle
 */
export function useCSRF() {
  const [isTokenReady, setIsTokenReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function initializeCSRF() {
      try {
        const token = await fetchCSRFToken();
        if (mounted) {
          if (token) {
            setIsTokenReady(true);
            setError(null);
          } else {
            setError('Failed to fetch CSRF token');
          }
        }
      } catch (err) {
        if (mounted) {
          setError('Error initializing CSRF protection');
          console.error('CSRF initialization error:', err);
        }
      }
    }

    initializeCSRF();

    return () => {
      mounted = false;
      clearCSRFToken();
    };
  }, []);

  return {
    isTokenReady,
    error
  };
}