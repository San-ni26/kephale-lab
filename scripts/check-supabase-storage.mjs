import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '/Users/paulkone/Desktop/app/app-kephale/apps/backend/.env' });

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  try {
    const res = await pool.query(`
      SELECT id, name, public, created_at FROM storage.buckets;
    `);
    console.log('Buckets dans Supabase DB storage.buckets:', res.rows);

    // Make kephale-media public
    const updateRes = await pool.query(`
      INSERT INTO storage.buckets (id, name, public) 
      VALUES ('kephale-media', 'kephale-media', true)
      ON CONFLICT (id) DO UPDATE SET public = true;
    `);
    console.log('Update kephale-media to public: true success!');

    const resAfter = await pool.query(`
      SELECT id, name, public, created_at FROM storage.buckets;
    `);
    console.log('Buckets après update:', resAfter.rows);
  } catch (err) {
    console.error('Erreur query storage.buckets:', err);
  } finally {
    await pool.end();
  }
}

main();
