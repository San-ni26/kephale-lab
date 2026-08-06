import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores';
import Constants from 'expo-constants';

const getDynamicApiUrl = () => {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  if (Constants.expoConfig?.extra?.apiUrl) return Constants.expoConfig.extra.apiUrl;
  const host = Constants.expoConfig?.hostUri?.split(':')?.[0];
  if (host) return `http://${host}:4000`;
  return 'http://172.20.10.3:4000';
};

const API_URL = getDynamicApiUrl();

let socket: Socket | null = null;

export const getGlobalSocket = () => socket;

export const initGlobalSocket = () => {
  const token = useAuthStore.getState().accessToken;
  if (!token) return;

  if (socket) {
    socket.disconnect();
  }

  socket = io(API_URL, {
    auth: { token },
    transports: ['websocket'],
  });

  socket.on('connect', () => {
    console.log('[Socket] Global socket connected');
  });

  socket.on('user:update', (data) => {
    console.log('[Socket] Received user:update, re-fetching auth data...');
    // Met à jour le store global
    useAuthStore.getState().checkAuth();
  });

  socket.on('disconnect', () => {
    console.log('[Socket] Global socket disconnected');
  });
};

export const disconnectGlobalSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
