const fs = require('fs');
const path = require('path');
const os = require('os');

// Detect local IPv4 address
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  const candidates = [];
  
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      const isIPv4 = net.family === 'IPv4' || net.family === 4;
      if (isIPv4 && !net.internal && !net.address.startsWith('169.254.') && net.address !== '0.0.0.0') {
        // Prioritize Wi-Fi and Ethernet interfaces on macOS/Linux
        if (name.startsWith('en') || name.startsWith('wlan') || name.startsWith('eth')) {
          // Put 192.168.x.x or 172.x.x.x or 10.x.x.x at the very front
          if (net.address.startsWith('192.168.') || net.address.startsWith('172.') || net.address.startsWith('10.')) {
            candidates.unshift(net.address);
          } else {
            candidates.push(net.address);
          }
        } else {
          candidates.push(net.address);
        }
      }
    }
  }
  
  return candidates[0] || '127.0.0.1';
}

const localIp = getLocalIp();
console.log(`🌐 [IP Resolver] IP locale détectée : ${localIp}`);

const projectRoot = path.join(__dirname, '..');
const backendEnvPath = path.join(projectRoot, 'apps', 'backend', '.env');
const mobileEnvPath = path.join(projectRoot, 'apps', 'mobile', '.env');

// Update Backend .env
if (fs.existsSync(backendEnvPath)) {
  let content = fs.readFileSync(backendEnvPath, 'utf8');
  let updated = false;

  const s3EndpointRegex = /^S3_ENDPOINT=http:\/\/[^:]+:9000/m;
  const s3BucketPublicRegex = /^S3_BUCKET_PUBLIC_URL=http:\/\/[^:]+:9000\/kephale-media/m;

  const newS3Endpoint = `S3_ENDPOINT=http://${localIp}:9000`;
  const newS3BucketPublic = `S3_BUCKET_PUBLIC_URL=http://${localIp}:9000/kephale-media`;

  if (s3EndpointRegex.test(content) && !content.includes(newS3Endpoint)) {
    content = content.replace(s3EndpointRegex, newS3Endpoint);
    updated = true;
  }
  if (s3BucketPublicRegex.test(content) && !content.includes(newS3BucketPublic)) {
    content = content.replace(s3BucketPublicRegex, newS3BucketPublic);
    updated = true;
  }

  if (updated) {
    fs.writeFileSync(backendEnvPath, content, 'utf8');
    console.log(`\x1b[32m✅ [IP Resolver] Mis à jour ${backendEnvPath} avec l'IP ${localIp}\x1b[0m`);
  } else {
    console.log(`ℹ️ [IP Resolver] Pas de modifications nécessaires pour ${backendEnvPath}`);
  }
} else {
  console.log(`⚠️ [IP Resolver] Fichier backend .env introuvable à : ${backendEnvPath}`);
}

// Update Mobile .env
if (fs.existsSync(mobileEnvPath)) {
  let content = fs.readFileSync(mobileEnvPath, 'utf8');
  let updated = false;

  const apiUrlRegex = /^API_URL=http:\/\/[^:]+:4000/m;
  const expoPublicApiUrlRegex = /^EXPO_PUBLIC_API_URL=http:\/\/[^:]+:4000/m;

  const newApiUrl = `API_URL=http://${localIp}:4000`;
  const newExpoPublicApiUrl = `EXPO_PUBLIC_API_URL=http://${localIp}:4000`;

  if (apiUrlRegex.test(content) && !content.includes(newApiUrl)) {
    content = content.replace(apiUrlRegex, newApiUrl);
    updated = true;
  }
  if (expoPublicApiUrlRegex.test(content) && !content.includes(newExpoPublicApiUrl)) {
    content = content.replace(expoPublicApiUrlRegex, newExpoPublicApiUrl);
    updated = true;
  }

  if (updated) {
    fs.writeFileSync(mobileEnvPath, content, 'utf8');
    console.log(`\x1b[32m✅ [IP Resolver] Mis à jour ${mobileEnvPath} avec l'IP ${localIp}\x1b[0m`);
  } else {
    console.log(`ℹ️ [IP Resolver] Pas de modifications nécessaires pour ${mobileEnvPath}`);
  }
} else {
  console.log(`⚠️ [IP Resolver] Fichier mobile .env introuvable à : ${mobileEnvPath}`);
}
