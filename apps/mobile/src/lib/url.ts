import Constants from 'expo-constants';

const getBaseApiUrl = () => {
  if (process.env.EXPO_PUBLIC_API_URL && process.env.EXPO_PUBLIC_API_URL.startsWith('https://')) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  const host = Constants.expoConfig?.hostUri?.split(':')?.[0];
  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    return `http://${host}:4000`;
  }
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  if (Constants.expoConfig?.extra?.apiUrl) return Constants.expoConfig.extra.apiUrl;
  return 'http://localhost:4000';
};

const isPrivateOrLocalHost = (host: string): boolean => {
  if (!host) return false;
  if (host === 'localhost' || host === '127.0.0.1') return true;
  
  const parts = host.split('.');
  if (parts.length === 4) {
    const first = parseInt(parts[0], 10);
    const second = parseInt(parts[1], 10);
    if (!isNaN(first) && !isNaN(second)) {
      if (first === 10) return true;
      if (first === 192 && second === 168) return true;
      if (first === 172 && (second >= 16 && second <= 31)) return true;
    }
  }
  return false;
};

let cachedBaseApiUrl: URL | null = null;
try {
  cachedBaseApiUrl = new URL(getBaseApiUrl());
} catch (e) {}

export const rewriteUrl = (url: string): string => {
  if (!url || typeof url !== 'string' || !url.startsWith('http')) return url;
  
  // Fast path: avoid URL parsing if it doesn't contain a local network IP or localhost
  if (!url.includes('localhost') && !url.includes('127.0.0.1') && !url.includes('192.168') && !url.includes('10.') && !url.includes('172.')) {
    return url;
  }
  
  try {
    const parsedUrl = new URL(url);
    
    if (isPrivateOrLocalHost(parsedUrl.hostname) && cachedBaseApiUrl) {
      parsedUrl.hostname = cachedBaseApiUrl.hostname;
      if (cachedBaseApiUrl.port) {
        parsedUrl.port = cachedBaseApiUrl.port;
      }
      parsedUrl.protocol = cachedBaseApiUrl.protocol;
      return parsedUrl.toString();
    }
  } catch (err) {
    // Ignore invalid URL structures
  }
  return url;
};

export const rewriteUrlsInObject = (obj: any): any => {
  if (obj === null || obj === undefined) return obj;
  
  if (typeof obj === 'string') {
    return rewriteUrl(obj);
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => rewriteUrlsInObject(item));
  }
  
  if (typeof obj === 'object') {
    const newObj: any = {};
    for (const key of Object.keys(obj)) {
      newObj[key] = rewriteUrlsInObject(obj[key]);
    }
    return newObj;
  }
  
  return obj;
};
