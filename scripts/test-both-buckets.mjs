async function checkPublic(bucket) {
  const res = await fetch(`https://aojtioctjqarqjifgnmn.supabase.co/storage/v1/object/public/${bucket}/test.jpg`);
  const body = await res.text();
  console.log(`Bucket "${bucket}": status=${res.status}, body=${body}`);
}

async function main() {
  await checkPublic('kephale-media');
  await checkPublic('kephale-lab');
}

main();
