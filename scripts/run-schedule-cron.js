require('dotenv').config();
const { generateAllSchedules } = require('../src/services/persona/schedule-cron');
generateAllSchedules().then(function() { process.exit(0); }).catch(function(e) { console.error(e); process.exit(1); });
