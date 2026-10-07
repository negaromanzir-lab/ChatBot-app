import { useAuth as useClerkAuth, useUser } from '@clerk/react';
import { setAuthTokenProvider } from '../services/apiClient.js';

export function useAuth() {
  const { isLoaded, isSignedIn, getToken } = useClerkAuth();
  const { user, isLoaded: isUserLoaded } = useUser();
  setAuthTokenProvider(getToken);

  return {
    isLoading: !isLoaded || (Boolean(isSignedIn) && !isUserLoaded),
    user:
      isSignedIn && user
        ? {
            id: user.id,
            email: user.primaryEmailAddress?.emailAddress ?? '',
            fullName: user.fullName,
          }
        : null,
  };
}

export default useAuth;
