import { prisma } from '../prisma';

export async function claimNextJob(workerId: string) {
  return prisma.$transaction(async (tx) => {
    const [job] = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Job"
      WHERE status = 'QUEUED'
        AND "runAt" <= now()
      ORDER BY priority DESC, "runAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;

    if (!job) return null;

    const claimed = await tx.job.update({
      where: { id: job.id },
      data: {
        status: 'CLAIMED',
        claimedBy: workerId,
        claimedAt: new Date(),
        attemptCount: { increment: 1 },
      },
    });

    return claimed;
  });
}