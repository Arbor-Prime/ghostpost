const http = require('http');

// Test 1: Generate persona
const data = JSON.stringify({
  chronotype: 'intermediate',
  work_pattern: 'office_9to5',
  age_bracket: '25-34',
});

function httpReq(method, path, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost', port: 3000, path, method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (body) opts.headers['Content-Length'] = Buffer.byteLength(body);
    const req = http.request(opts, (res) => {
      let d = '';
      res.on('data', (c) => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch { resolve(d); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  console.log('=== Test 1: Generate Persona ===');
  const gen = await httpReq('POST', '/api/persona/generate/1', data);
  console.log('OK:', gen.ok);
  console.log('Typing WPM:', gen.persona?.base_typing_wpm);
  console.log('Chronotype:', gen.persona?.chronotype);
  console.log('Sessions/day mean:', gen.persona?.sessions_per_day?.mean);
  console.log('Scroll-only ratio:', gen.persona?.scroll_only_ratio);
  console.log('Mobile hours:', gen.persona?.mobile_hours);
  console.log('Circadian entries:', gen.persona?.circadian_curve?.length);
  console.log('Today sessions:', gen.todaySchedule?.totalSessions);
  console.log('Today active min:', gen.todaySchedule?.totalActiveMinutes);
  console.log('Is zero day:', gen.todaySchedule?.isZeroDay);
  if (gen.todaySchedule?.sessions?.length > 0) {
    console.log('\nToday schedule:');
    for (const s of gen.todaySchedule.sessions) {
      console.log(`  ${String(s.hour).padStart(2,'0')}:${String(s.minute).padStart(2,'0')} - ${s.type} (${s.device}, ${s.duration_min}min)`);
    }
  }

  console.log('\n=== Test 2: Get Persona ===');
  const persona = await httpReq('GET', '/api/persona/1');
  console.log('Has persona:', !!persona.persona);
  console.log('Chronotype:', persona.chronotype);
  console.log('Work pattern:', persona.work_pattern);

  console.log('\n=== Test 3: Get Schedule ===');
  const today = new Date().toISOString().split('T')[0];
  const schedule = await httpReq('GET', '/api/persona/schedule/1?date=' + today);
  console.log('Sessions:', schedule.total_sessions || schedule.totalSessions);
  console.log('Active min:', schedule.total_active_minutes || schedule.totalActiveMinutes);

  console.log('\n=== Test 4: Get Circadian Curve ===');
  const curve = await httpReq('GET', '/api/persona/circadian/1');
  console.log('Entries:', Array.isArray(curve) ? curve.length : 'ERROR');
  if (Array.isArray(curve) && curve.length > 0) {
    const peak = curve.reduce((a, b) => a.energy > b.energy ? a : b);
    console.log('Peak energy hour:', peak.hour, '(' + peak.mood + ', energy:', peak.energy + ')');
    const low = curve.reduce((a, b) => a.energy < b.energy ? a : b);
    console.log('Low energy hour:', low.hour, '(' + low.mood + ', energy:', low.energy + ')');
  }

  console.log('\n=== All tests complete ===');
}

main().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
