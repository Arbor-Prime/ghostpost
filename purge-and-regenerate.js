/**
 * Purge old JFK drafts and regenerate with real voice profile
 * Run on server: node /opt/ghostpost/purge-and-regenerate.js
 */

const db = require('/opt/ghostpost/src/config/database');
const { generateReply } = require('/opt/ghostpost/src/services/brain/reply-generator');

async function main() {
  try {
    console.log('[Purge] Starting draft purge...');
    
    // 1. Delete all pending drafts (JFK ones)
    const deleteResult = await db.query(
      "DELETE FROM drafts WHERE status = 'pending' RETURNING id"
    );
    console.log(`[Purge] ✓ Deleted ${deleteResult.rows.length} JFK drafts`);
    
    // 2. Reset opportunities that were drafted back to pending
    await db.query(
      "UPDATE opportunities SET status = 'pending' WHERE status = 'drafted'"
    );
    console.log('[Purge] ✓ Reset opportunities to pending');
    
    // 3. Get top 5 opportunities by score
    const oppsResult = await db.query(
      `SELECT id, score, profile_handle, content_excerpt 
       FROM opportunities 
       WHERE user_id = 1 AND status = 'pending' 
       ORDER BY score DESC 
       LIMIT 5`
    );
    
    console.log(`\n[Regenerate] Found ${oppsResult.rows.length} top opportunities:`);
    oppsResult.rows.forEach(opp => {
      console.log(`  • Opp ${opp.id}: @${opp.profile_handle} - Score ${opp.score} - "${opp.content_excerpt.substring(0, 60)}..."`);
    });
    
    // 4. Generate drafts for each opportunity
    console.log('\n[Regenerate] Generating drafts with real voice profile...');
    
    for (const opp of oppsResult.rows) {
      try {
        console.log(`  → Generating draft for opportunity ${opp.id}...`);
        const draft = await generateReply(1, opp.id);
        console.log(`    ✓ Draft ${draft.id} created: "${draft.reply_text.substring(0, 80)}..."`);
      } catch (err) {
        console.error(`    ✗ Failed for opportunity ${opp.id}:`, err.message);
      }
    }
    
    console.log('\n[Done] Purge and regeneration complete!');
    console.log('Check the Approvals page - you should now see drafts with your real voice.');
    
    await db.end();
    process.exit(0);
    
  } catch (err) {
    console.error('[Error]', err);
    process.exit(1);
  }
}

main();
