const supabaseUrl = 'https://aojtioctjqarqjifgnmn.supabase.co';
const supabaseKey = 'sb_publishable_BvDC3w5bsRAcAu8_JIyj8A_05JJEMvM';

async function main() {
  console.log('--- CREATING PUBLIC BUCKET kephale-media ---');

  // Create public bucket kephale-media
  const createRes = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
    method: 'POST',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      id: 'kephale-media',
      name: 'kephale-media',
      public: true,
    }),
  });
  console.log('Create bucket status:', createRes.status, await createRes.text());

  // List buckets
  const listRes = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
    },
  });
  console.log('Buckets après création:', await listRes.json());
}

main().catch(console.error);
