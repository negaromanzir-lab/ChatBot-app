import { apiRequest } from './apiClient.js';

export async function getCurrentUser() {
  const payload = await apiRequest('/auth/me');
  return payload.user;
}

export async function signIn(credentials) {
  const payload = await apiRequest('/auth/login', {
    method: 'POST',
    body: credentials,
  });
  return payload.user;
}

export async function signUp(credentials) {
  const payload = await apiRequest('/auth/register', {
    method: 'POST',
    body: credentials,
  });
  return payload.user;
}

export function signOut() {
  return apiRequest('/auth/logout', { method: 'POST' });
}
