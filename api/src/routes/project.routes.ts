import { Router, Response } from 'express';
import { prisma } from '../prisma';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';
import { z } from 'zod';

const router = Router();

const createProjectSchema = z.object({
  name: z.string().min(1),
});

// Create a project
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const parsed = createProjectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } });
  }

  const project = await prisma.project.create({
    data: {
      name: parsed.data.name,
      organizationId: req.organizationId as string,
    },
  });

  res.status(201).json(project);
});

// List all projects for the logged-in user's organization
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where: { organizationId: req.organizationId as string },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.project.count({ where: { organizationId: req.organizationId as string } }),
  ]);

  res.json({ data: projects, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
});

// Get single project
router.get('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const project = await prisma.project.findFirst({
    where: { id: req.params.id, organizationId: req.organizationId as string },
  });

  if (!project) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
  }

  res.json(project);
});

export default router;