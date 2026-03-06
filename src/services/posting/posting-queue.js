/**
 * Posting Queue
 * 
 * BullMQ queue for posting approved replies.
 * Processes one reply at a time per user (no concurrent posting).
 * Respects rate limits and circadian timing.
 */

const { Queue, Worker } = require('bullmq');
const { postReply } = require('./poster');
const db = require('../../config/database');

const QUEUE_NAME = 'posting-queue';

const redisConnection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

const postingQueue = new Queue(QUEUE_NAME, { connection: redisConnection });

// Worker: one at a time (concurrency 1 to avoid simultaneous logins)
const worker = new Worker(QUEUE_NAME, async (job) => {
  const { userId, draftId } = job.data;
  console.log(`[PostingWorker] Posting draft ${draftId} for user ${userId}`);

  try {
    const result = await postReply(userId, draftId);
    console.log(`[PostingWorker] Draft ${draftId} posted successfully`);
    return result;
  } catch (err) {
    console.error(`[PostingWorker] Draft ${draftId} failed: ${err.message}`);
    throw err;
  }
}, {
  connection: redisConnection,
  concurrency: 1,
});

worker.on('completed', (job) => {
  console.log(`[PostingWorker] Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`[PostingWorker] Job ${job ? job.id : 'unknown'} failed: ${err.message}`);
});

/**
 * Queue an approved draft for posting.
 */
async function queueForPosting(userId, draftId) {
  // Verify draft is approved
  const draft = await db.query(
    "SELECT id FROM drafts WHERE id = $1 AND user_id = $2 AND status IN ('approved', 'edited')",
    [draftId, userId]
  );
  if (draft.rows.length === 0) {
    throw new Error('Draft not found or not approved');
  }

  await postingQueue.add('post-reply', {
    userId,
    draftId,
  }, {
    removeOnComplete: 50,
    removeOnFail: 20,
    attempts: 2,
    backoff: { type: 'exponential', delay: 300000 }, // 5 min backoff
  });
}

module.exports = { postingQueue, queueForPosting };
