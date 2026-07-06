/**
 * Tek migration çalıştırır. .env.local'de DATABASE_URL gerekli.
 * Supabase Dashboard > Project Settings > Database > Connection string (URI)
 * Örnek: postgresql://postgres.[ref]:[PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
  const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL veya SUPABASE_DB_URL .env.local içinde tanımlı olmalı.');
    console.error('Supabase Dashboard > Project Settings > Database > Connection string (URI)');
    process.exit(1);
  }
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase-migrations', '005_auth_tokens_pool.sql'), 'utf8');
  const client = new Client({ connectionString: dbUrl });
  try {
    await client.connect();
    await client.query(sql);
    console.log('005_auth_tokens_pool.sql çalıştırıldı.');
  } catch (err) {
    console.error('Hata:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}
main();
