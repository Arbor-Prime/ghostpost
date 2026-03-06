require('dotenv').config();
const { Pool } = require('pg');

var EXPECTED_TABLES = [
    'users', 'voice_profiles', 'observer_accounts', 'observed_tweets',
    'opportunities', 'drafts', 'posted_replies', 'tracked_profiles', 'observer_logs'
];

var EXPECTED_INDEXES = [
    'idx_observed_tweets_author', 'idx_observed_tweets_observed_at',
    'idx_opportunities_status', 'idx_opportunities_score',
    'idx_drafts_status', 'idx_tracked_profiles_handle'
];

async function test() {
    console.log('Testing PostgreSQL...\n');
    var pool = new Pool({ connectionString: process.env.DATABASE_URL });

    var client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('OK: Database connection');

    var tables = await pool.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name"
    );
    var tableNames = tables.rows.map(function(r) { return r.table_name; });
    var allOk = true;

    EXPECTED_TABLES.forEach(function(t) {
        if (tableNames.includes(t)) {
            console.log('OK: Table ' + t);
        } else {
            console.log('MISSING: Table ' + t);
            allOk = false;
        }
    });

    var indexes = await pool.query(
        "SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname LIKE 'idx_%'"
    );
    var idxNames = indexes.rows.map(function(r) { return r.indexname; });

    EXPECTED_INDEXES.forEach(function(idx) {
        if (idxNames.includes(idx)) {
            console.log('OK: Index ' + idx);
        } else {
            console.log('MISSING: Index ' + idx);
            allOk = false;
        }
    });

    await pool.end();

    if (allOk) {
        console.log('\nPASSED: Database (' + EXPECTED_TABLES.length + ' tables, ' + EXPECTED_INDEXES.length + ' indexes)');
    } else {
        console.error('\nFAILED: Missing tables or indexes');
        process.exit(1);
    }
}

test().catch(function(e) { console.error('FAILED: ' + e.message); process.exit(1); });
