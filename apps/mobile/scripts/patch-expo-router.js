const fs = require('fs');
const path = require('path');

try {
  const expoRouterDir = path.dirname(require.resolve('expo-router/package.json'));
  
  const ctxFiles = [
    path.join(expoRouterDir, '_ctx.android.js'),
    path.join(expoRouterDir, '_ctx.ios.js'),
    path.join(expoRouterDir, '_ctx.web.js')
  ];
  
  for (const file of ctxFiles) {
    if (fs.existsSync(file)) {
      let content = fs.readFileSync(file, 'utf8');
      content = content.replace(/process\.env\.EXPO_ROUTER_APP_ROOT/g, "'../../app'");
      content = content.replace(/process\.env\.EXPO_ROUTER_IMPORT_MODE/g, "'sync'");
      fs.writeFileSync(file, content, 'utf8');
      console.log(`Patched ${file}`);
    }
  }
} catch (e) {
  console.log('expo-router not found or patch failed', e);
}
