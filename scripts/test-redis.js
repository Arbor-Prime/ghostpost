var Redis = require('ioredis');

async function test() {
    console.log('Testing Redis...\n');
    var redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

    var pong = await redis.ping();
    console.log('PING: ' + pong);
    if (pong !== 'PONG') { console.error('FAILED: Ping'); process.exit(1); }
    console.log('OK: Connection');

    await redis.set('ghostpost:test', 'sprint1');
    var val = await redis.get('ghostpost:test');
    console.log('SET/GET: ' + val);
    if (val !== 'sprint1') { console.error('FAILED: Set/Get'); process.exit(1); }
    console.log('OK: Set/Get');

    await redis.del('ghostpost:test');
    await redis.quit();
    console.log('\nPASSED: Redis');
}

test().catch(function(e) { console.error('FAILED: ' + e.message); process.exit(1); });
