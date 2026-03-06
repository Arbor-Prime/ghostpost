/**
 * Posting Queue
 *
 * BullMQ queue for posting approved replies.
 * Processes one reply at a time per user (no concurrent posting).
 * Respects rate limits and adds human-like delay before each post.
 */

const { Queue, Worker } = require('bullmq');
const { postReply } = require('./publisher');
const { calculatePostingDelay } = require('./delay');
const db = require('../../config/database');
const { sleep } = require('../../utils/humanise');

const QUEUE_NAME = 'posting-queue';

const redisConnection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

const postingQueue = new Queue(QUEUE_NAME, { connection: redisConnection });

let _io = null;
function setIo(ioInstance) { _io = ioInstance; }

const worker = new Worker(QUEUE_NAME, async (job) => {
  const { userId, draftId } = job.data;
  console.log(`[PostingWorker] Processing draft ${draftId} for user ${userId}`);

  const delayMs = await calculatePostingDelay(userId);
  if (delayMs > 0) {
    console.log(`[PostingWorker] Human delay: ${Math.round(delayMs / 1000)}s before posting`);
    if (_io) _io.emit('reply:delayed', { draftId, userId, delayMs });
    await sleep(delayMs);
  }

  const result = await postReply(userId, draftId, _io);
  console.log(`[PostingWorker] Draft ${draftId} posted successfully`);
  return result;
}, {
  connection: redisConnection,
  concurrency: 1,
});

worker.on('completed', (job) => {
  console.log(`[PostingWorker] Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`[PostingWorker] Job ${job ? job.id : 'unknown'} failed: ${err.message}`);
  if (_io) _io.emit('reply:failed', { draftId: job?.data?.draftId, userId: job?.data?.userId, error: err.message });
});

/**
 * Queue an approved draft for posting.
 */
async function queueForPosting(userId, draftId) {
  const draft = await db.query(
    "SELECT id FROM drafts WHERE id = $1 AND user_id = $2 AND status IN ('approved', 'edited')",
    [draftId, userId]
  );
  if (draft.rows.length === 0) {
    throw new Error('Draft not found or not approved');
  }

  const job = await postingQueue.add('post-reply', {
    userId,
    draftId,
  }, {
    removeOnComplete: 50,
    removeOnFail: 20,
    attempts: 2,
    backoff: { type: 'exponential', delay: 300000 },
  });

  console.log(`[PostingQueue] Queued draft ${draftId} for user ${userId} (job ${job.id})`);
  return job.id;
}

async function getQueueStats() {
  return postingQueue.getJobCounts();
}

module.exports = { postingQueue, queueForPosting, getQueueStats, setIo };
