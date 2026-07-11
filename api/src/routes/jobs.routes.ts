import express from 'express';
import { prisma } from '../prisma';
import { requireAuth } from '../middleware/auth.middleware';

const router = express.Router();
router.use(requireAuth);

const VALID_TYPES = ['IMMEDIATE', 'DELAYED', 'SCHEDULED', 'RECURRING', 'BATCH'];

// POST /queues/:queueId/jobs
router.post('/queues/:queueId/jobs', async (req, res) => {
  const { queueId } = req.params;
  const { type, payload, runAt, cronExpr, maxAttempts, priority, idempotencyKey } = req.body;

  if (!VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: `type must be one of ${VALID_TYPES.join(', ')}` });
  }

  const queue = await prisma.queue.findUnique({ where: { id: queueId } });
  if (!queue) return res.status(404).json({ error: 'Queue not found' });

  try {
    const job = await prisma.job.create({
      data: {
        queueId,
        type,
        payload,
        runAt: runAt ? new Date(runAt) : new Date(),
        cronExpr: cronExpr || null,
        maxAttempts: maxAttempts ?? 3,
        priority: priority ?? 0,
        idempotencyKey: idempotencyKey || null,
      },
    });
    res.status(201).json(job);
  } catch (err: any) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'Duplicate idempotencyKey' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

// GET /queues/:queueId/jobs
router.get('/queues/:queueId/jobs', async (req, res) => {
  const { queueId } = req.params;
  const { status } = req.query;

  const jobs = await prisma.job.findMany({
    where: { queueId, ...(status ? { status: String(status) } : {}) },
    orderBy: [{ priority: 'desc' }, { runAt: 'asc' }],
  });
  res.json(jobs);
});

// GET /jobs/:id
router.get('/jobs/:id', async (req, res) => {
  const job = await prisma.job.findUnique({
    where: { id: req.params.id },
    include: { executions: true, logs: true },
  });
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

// PATCH /jobs/:id — cancel
router.patch('/jobs/:id', async (req, res) => {
  const job = await prisma.job.findUnique({ where: { id: req.params.id } });
  if (!job) return res.status(404).json({ error: 'Job not found' });

  if (['RUNNING', 'COMPLETED'].includes(job.status)) {
    return res.status(409).json({ error: `Cannot cancel job in ${job.status} state` });
  }

  const updated = await prisma.job.update({
    where: { id: req.params.id },
    data: { status: 'FAILED' },
  });
  res.json(updated);
});

export default router;