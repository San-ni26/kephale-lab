const fs = require('fs');
const zlib = require('zlib');
const input = fs.readFileSync('/Users/paulkone/Desktop/app/app-kephale/build_log_full.txt');

try {
  const unzipped = zlib.unzipSync(input);
  fs.writeFileSync('/Users/paulkone/Desktop/app/app-kephale/build_log_extracted.txt', unzipped);
  console.log('Unzipped successfully');
} catch(e) {
  try {
    const brotli = zlib.brotliDecompressSync(input);
    fs.writeFileSync('/Users/paulkone/Desktop/app/app-kephale/build_log_extracted.txt', brotli);
    console.log('Brotli decompressed successfully');
  } catch(e2) {
    console.error('Failed to decompress', e, e2);
  }
}
