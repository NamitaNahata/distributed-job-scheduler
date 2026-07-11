import { Router, Response } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';
import { z } from 'zod';

const router = Router();

const createQueueSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1),
  priority: z.number().int().optional(),
  concurrencyLimit: z.number().int().min(1).optional(),
});

const updateQueueSchema = z.object({
  name: z.string().min(1).optional(),
  priority: z.number().int().optional(),
  concurrencyLimit: z.number().int().min(1).optional(),
  isPaused: z.boolean().optional(),
});

// Helper: confirm the project belongs to the caller's org before touching its queues
async function assertProjectOwnership(projectId: string, organizationId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, organizationId } });
  return project;
}

// Create a queue
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = createQueueSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
  }

  const project = await assertProjectOwnership(parsed.data.projectId, req.organizationId as string);
  if (!project) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
  }

  const queue = await prisma.queue.create({
    data: {
      projectId: parsed.data.projectId,
      name: parsed.data.name,
      priority: parsed.data.priority ?? 0,
      concurrencyLimit: parsed.data.concurrencyLimit ?? 5,
    },
  });

  res.status(201).json(queue);
});

// List queues for a project
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const projectId = req.query.projectId as string;
  if (!projectId) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'projectId query param is required' } });
  }

  const project = await assertProjectOwnership(projectId, req.organizationId as string);
  if (!project) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
  }

  const queues = await prisma.queue.findMany({ where: { projectId }, orderBy: { createdAt: 'desc' } });
  res.json(queues);
});

// Get a single queue
router.get('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const queue = await prisma.queue.findUnique({
    where: { id: req.params.id },
    include: { project: true },
  });

  if (!queue || queue.project.organizationId !== req.organizationId) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Queue not found' } });
  }

  res.json(queue);
});

// Update a queue (pause/resume, priority, concurrency)
router.patch('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = updateQueueSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
  }

  const existing = await prisma.queue.findUnique({
    where: { id: req.params.id },
    include: { project: true },
  });

  if (!existing || existing.project.organizationId !== req.organizationId) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Queue not found' } });
  }

  const updated = await prisma.queue.update({
    where: { id: req.params.id },
    data: parsed.data,
  });

  res.json(updated);
});

export default router;