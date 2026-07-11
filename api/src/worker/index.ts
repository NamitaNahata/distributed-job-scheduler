import { prisma } from '../prisma';
import { claimNextJob } from './claim';
import crypto from 'crypto';

const WORKER_ID = `worker-${crypto.randomUUID().slice(0, 8)}`;
const POLL_INTERVAL_MS = 2000;

async function executeJob(job: { id: string; type: string; payload: any }) {
  // Placeholder — replace with real handlers per job type later.
  // Simulates work; throws to simulate failure for testing retry logic.
  await new Promise((resolve) => setTimeout(resolve, 200));
  if (job.payload?.forceFail) {
    throw new Error('Simulated failure (forceFail=true in payload)');
  }
  return { ok: true };
}

async function processJob(job: { id: string; type: string; payload: any; attemptCount: number; maxAttempts: number }) {
  await prisma.job.update({ where: { id: job.id }, data: { status: 'RUNNING' } });

  const execution = await prisma.jobExecution.create({
    data: { jobId: job.id, workerId: WORKER_ID },
  });

  const startedAt = Date.now();

  try {
    await executeJob(job);
    const durationMs = Date.now() - startedAt;

    await prisma.$transaction([
      prisma.job.update({
        where: { id: job.id },
        data: { status: 'COMPLETED' },
      }),
      prisma.jobExecution.update({
        where: { id: execution.id },
        data: { finishedAt: new Date(), success: true, durationMs },
      }),
      prisma.jobLog.create({
        data: { jobId: job.id, level: 'INFO', message: `Completed by ${WORKER_ID}` },
      }),
    ]);
  } catch (err: any) {
    const durationMs = Date.now() - startedAt;
    const willRetry = job.attemptCount < job.maxAttempts;

    await prisma.$transaction([
      prisma.jobExecution.update({
        where: { id: execution.id },
        data: { finishedAt: new Date(), success: false, durationMs, errorMessage: err.message },
      }),
      prisma.jobLog.create({
        data: { jobId: job.id, level: 'ERROR', message: err.message },
      }),
      prisma.job.update({
        where: { id: job.id },
        data: willRetry
          ? { status: 'QUEUED' } // goes back into the pool; claim increments attemptCount already
          : { status: 'DEAD_LETTER' },
      }),
      ...(willRetry
        ? []
        : [
            prisma.deadLetterEntry.create({
              data: { jobId: job.id, reason: err.message, payload: job.payload },
            }),
          ]),
    ]);
  }
}

async function pollLoop() {
  console.log(`[${WORKER_ID}] Starting poll loop (interval ${POLL_INTERVAL_MS}ms)`);
  while (true) {
    try {
      const job = await claimNextJob(WORKER_ID);
      if (job) {
        console.log(`[${WORKER_ID}] Claimed job ${job.id}`);
        await processJob(job);
      } else {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    } catch (err) {
      console.error(`[${WORKER_ID}] Poll loop error:`, err);
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
}

pollLoop();