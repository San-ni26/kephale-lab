import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Chemin vers le dossier racine du projet (apps/backend/scripts -> apps/backend -> apps -> root)
const rootDir = path.resolve(__dirname, '../../../');
const dbDir = path.join(rootDir, 'packages/database');

console.log('🔄 Checking Prisma migrations status...');

try {
  // Execute prisma migrate status
  execSync('npx prisma migrate status', { 
    cwd: dbDir, 
    stdio: 'inherit',
    env: process.env // Ensure DATABASE_URL is passed
  });
  console.log('✅ All migrations are applied. Safe to proceed with Compute deployment (db push).');
} catch (error) {
  console.error('❌ ERROR: There are pending migrations or the database is not in sync.');
  console.error('⚠️ Please run `prisma migrate deploy` on your target database before deploying to Prisma Compute.');
  process.exit(1);
}
