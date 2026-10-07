import { useCallback, useEffect, useState } from 'react';
import {
  getCurrentUser,
  signIn as signInRequest,
  signOut as signOutRequest,
  signUp as signUpRequest,
} from '../services/authService.js';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [authVersion, setAuthVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    getCurrentUser()
      .then((currentUser) => {
        if (active) setUser(currentUser);
      })
      .catch((caught) => {
        if (active && caught.status !== 401) {
          setError(caught.message || 'Could not connect to the account service.');
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [authVersion]);

  const signIn = useCallback(async (credentials) => {
    setError(null);
    const authenticatedUser = await signInRequest(credentials);
    setUser(authenticatedUser);
    setAuthVersion((current) => current + 1);
    return authenticatedUser;
  }, []);

  const signUp = useCallback(async (credentials) => {
    setError(null);
    const authenticatedUser = await signUpRequest(credentials);
    setUser(authenticatedUser);
    setAuthVersion((current) => current + 1);
    return authenticatedUser;
  }, []);

  const signOut = useCallback(async () => {
    await signOutRequest();
    setUser(null);
  }, []);

  return { user, isLoading, error, setError, signIn, signUp, signOut };
}

export default useAuth;
