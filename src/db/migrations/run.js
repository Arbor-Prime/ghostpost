require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function migrate() {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
        const sql = fs.readFileSync(path.join(__dirname, '001-initial.sql'), 'utf8');
        console.log('Running migration: 001-initial.sql');
        await pool.query(sql);

        const tables = await pool.query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
        );
        console.log('\nMigration complete. ' + tables.rows.length + ' tables:');
        tables.rows.forEach(r => console.log('  + ' + r.table_name));

        const indexes = await pool.query(
            "SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname LIKE 'idx_%' ORDER BY indexname"
        );
        console.log('\n' + indexes.rows.length + ' indexes:');
        indexes.rows.forEach(r => console.log('  + ' + r.indexname));
    } catch (e) {
        console.error('Migration failed:', e.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

migrate();
