import { useEffect, useState } from 'react';

const PLAYER_SESSION_TOKEN_KEY = 'ai-town-player-session-token';
const PLAYER_SESSION_EVENT = 'ai-town-player-session-change';

export function getPlayerSessionToken() {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.localStorage.getItem(PLAYER_SESSION_TOKEN_KEY);
}

export function setPlayerSessionToken(token: string) {
  window.localStorage.setItem(PLAYER_SESSION_TOKEN_KEY, token);
  window.dispatchEvent(new Event(PLAYER_SESSION_EVENT));
}

export function clearPlayerSessionToken() {
  window.localStorage.removeItem(PLAYER_SESSION_TOKEN_KEY);
  window.dispatchEvent(new Event(PLAYER_SESSION_EVENT));
}

export function usePlayerSessionToken() {
  const [token, setToken] = useState(() => getPlayerSessionToken());

  useEffect(() => {
    const handleChange = () => setToken(getPlayerSessionToken());
    window.addEventListener(PLAYER_SESSION_EVENT, handleChange);
    window.addEventListener('storage', handleChange);
    return () => {
      window.removeEventListener(PLAYER_SESSION_EVENT, handleChange);
      window.removeEventListener('storage', handleChange);
    };
  }, []);

  return token;
}
