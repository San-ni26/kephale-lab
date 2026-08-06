const https = require('https');
const fs = require('fs');
const { execSync } = require('child_process');

try {
  const easOutput = execSync('npx eas-cli build:view 952d1f27-1d73-4404-8f32-d3b503aff618 --json', { encoding: 'utf-8', cwd: './apps/mobile' });
  const buildInfo = JSON.parse(easOutput.trim());
  const logUrl = buildInfo.logFiles[0];
  
  https.get(logUrl, (res) => {
    const fileStream = fs.createWriteStream('./build_log_full.txt');
    res.pipe(fileStream);
    fileStream.on('finish', () => {
      console.log('Download complete');
      process.exit(0);
    });
  }).on('error', (e) => {
    console.error(e);
    process.exit(1);
  });
} catch (e) {
  console.error('Error getting build info', e.message);
}
