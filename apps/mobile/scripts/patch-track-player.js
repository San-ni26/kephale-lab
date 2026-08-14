const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../node_modules/react-native-track-player/android/src/main/java/com/doublesymmetry/trackplayer/module/MusicModule.kt');

if (fs.existsSync(filePath)) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Fix line 548
  content = content.replace(
    /callback\.resolve\(Arguments\.fromBundle\(musicService\.tracks\[index\]\.originalItem\)\)/g,
    'callback.resolve(musicService.tracks[index].originalItem?.let { Arguments.fromBundle(it) })'
  );

  // Fix line 588
  content = content.replace(
    /else Arguments\.fromBundle\(\s*musicService\.tracks\[musicService\.getCurrentTrackIndex\(\)\]\.originalItem\s*\)/g,
    'else musicService.tracks[musicService.getCurrentTrackIndex()].originalItem?.let { Arguments.fromBundle(it) }'
  );

  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Successfully patched react-native-track-player for Kotlin 2.x null-safety.');
} else {
  console.log('react-native-track-player MusicModule.kt not found. Skipping patch.');
}
