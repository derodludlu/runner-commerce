const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

async function executeMigrations() {
  const client = new Client(process.env.DATABASE_URL);
  await client.connect();
  
  console.log('Connected to database');

  try {
    // Drop and recreate the public schema to start fresh
    console.log('Dropping and recreating public schema...');
    await client.query('DROP SCHEMA IF EXISTS public CASCADE;');
    await client.query('CREATE SCHEMA public;');
    await client.query('GRANT ALL ON SCHEMA public TO runnercommerce;');
    await client.query('GRANT ALL ON SCHEMA public TO public;');
    
    // Read and execute each migration file in order
    const migrationsDir = './prisma/migrations';
    const migrationFolders = fs
      .readdirSync(migrationsDir)
      .filter(f => fs.statSync(path.join(migrationsDir, f)).isDirectory())
      .sort(); // Sort to ensure they run in the correct order

    for (const folder of migrationFolders) {
      const migrationFile = path.join(migrationsDir, folder, 'migration.sql');
      if (fs.existsSync(migrationFile)) {
        const sql = fs.readFileSync(migrationFile, 'utf8');
        console.log(`Executing migration: ${folder}`);
        await client.query(sql);
      }
    }

    console.log('All migrations executed successfully!');
  } catch (err) {
    console.error('Error executing migrations:', err);
  } finally {
    await client.end();
    console.log('Database connection closed');
  }
}

executeMigrations();