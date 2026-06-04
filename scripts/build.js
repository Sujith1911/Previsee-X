import fs from 'fs';
import path from 'url';
import nodePath from 'path';

// Support __dirname in ES modules
const __filename = path.fileURLToPath(import.meta.url);
const __dirname = nodePath.dirname(__filename);

const SRC_DIR = nodePath.resolve(__dirname, '../src');
const DIST_DIR = nodePath.resolve(__dirname, '../dist');
const VERSION = '5.0.0';

console.log(`📦 Packaging PRIVISEE-X v${VERSION}...`);

// 1. Setup Dist (clean & recreate)
try {
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(DIST_DIR);
} catch (err) {
  console.error(`❌ Failed to clean/create dist directory: ${err.message}`);
  process.exit(1);
}

// 2. Validate Manifest
const manifestPath = nodePath.join(SRC_DIR, 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error(`❌ Manifest file not found at ${manifestPath}`);
  process.exit(1);
}

try {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.version !== VERSION) {
    console.warn(`⚠️ Manifest version (${manifest.version}) does not match build version (${VERSION})`);
  }
  console.log('✅ Manifest validated.');
} catch (err) {
  console.error(`❌ Failed to parse manifest.json: ${err.message}`);
  process.exit(1);
}

// 3. Copy files recursively
try {
  fs.cpSync(SRC_DIR, DIST_DIR, { recursive: true });
  console.log(`✅ All source files successfully copied to /dist`);
  console.log('🚀 Build Complete.');
} catch (err) {
  console.error('❌ Build failed during copy:', err.message);
  process.exit(1);
}
