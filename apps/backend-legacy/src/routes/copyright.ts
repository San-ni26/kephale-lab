import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { CopyrightService } from '../services/copyright.service.js';
import { prisma } from '@kephale/database';

const ReportSchema = z.object({
  videoId: z.string().min(1),
  trackId: z.string().min(1),
  reason: z.string().max(1000).optional(),
});

const AdminActionSchema = z.object({
  adminNotes: z.string().max(2000).optional(),
});

const ListReportsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(20),
  status: z.enum(['PENDING', 'CONFIRMED', 'REJECTED']).optional(),
});

export async function copyrightRoutes(fastify: FastifyInstance) {

  /**
   * POST /api/v1/copyright/report
   * Un artiste signale qu'une vidéo utilise sa musique sans autorisation.
   */
  fastify.post('/report', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user;
    const parsed = ReportSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Paramètres invalides', details: parsed.error.issues },
      });
    }

    // Vérifier que l'utilisateur est un artiste
    const artist = await prisma.artistProfile.findUnique({ where: { userId: user.userId } });
    if (!artist) {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Seuls les artistes peuvent signaler des violations de droits d\'auteur' },
      });
    }

    const result = await CopyrightService.submitReport({
      reporterId: user.userId,
      videoId: parsed.data.videoId,
      trackId: parsed.data.trackId,
      reason: parsed.data.reason,
    });

    if (!result.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'REPORT_FAILED', message: result.error },
      });
    }

    return reply.status(201).send({
      success: true,
      data: { reportId: result.reportId },
    });
  });

  /**
   * GET /api/v1/copyright/my-reports
   * Un artiste voit ses signalements.
   */
  fastify.get('/my-reports', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user;

    const reports = await prisma.copyrightReport.findMany({
      where: { reporterId: user.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        video: { select: { id: true, title: true, thumbnailUrl: true } },
        track: { select: { id: true, title: true } },
        strike: { select: { id: true, createdAt: true } },
      },
    });

    return reply.send({ success: true, data: reports });
  });

  /**
   * GET /api/v1/copyright/my-strikes
   * Un utilisateur voit ses strikes actifs.
   */
  fastify.get('/my-strikes', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user;
    const result = await CopyrightService.getUserStrikes(user.userId);

    return reply.send({
      success: true,
      data: result,
    });
  });

  // ── Routes Admin ──────────────────────────────────────────────────────────────

  /**
   * GET /api/v1/copyright/admin/reports
   * Admin : Liste les signalements (filtrés par statut).
   */
  fastify.get('/admin/reports', { preHandler: [authenticate, requireAdmin] }, async (request, reply) => {
    const query = ListReportsQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid query' },
      });
    }

    const result = await CopyrightService.listReports(query.data);

    return reply.send({
      success: true,
      data: result.reports,
      pagination: result.pagination,
    });
  });

  /**
   * POST /api/v1/copyright/admin/reports/:id/confirm
   * Admin : Confirme un signalement → crée un strike + désactive la vidéo.
   */
  fastify.post('/admin/reports/:id/confirm', { preHandler: [authenticate, requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = AdminActionSchema.safeParse(request.body);

    const result = await CopyrightService.confirmReport({
      reportId: id,
      adminNotes: parsed.success ? parsed.data.adminNotes : undefined,
    });

    if (!result.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'ACTION_FAILED', message: result.error },
      });
    }

    return reply.send({
      success: true,
      data: {
        strikeId: result.strikeId,
        totalStrikes: result.totalStrikes,
        userBanned: result.userBanned,
      },
    });
  });

  /**
   * POST /api/v1/copyright/admin/reports/:id/reject
   * Admin : Rejette un signalement (pas de strike).
   */
  fastify.post('/admin/reports/:id/reject', { preHandler: [authenticate, requireAdmin] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = AdminActionSchema.safeParse(request.body);

    const result = await CopyrightService.rejectReport({
      reportId: id,
      adminNotes: parsed.success ? parsed.data.adminNotes : undefined,
    });

    if (!result.success) {
      return reply.status(400).send({
        success: false,
        error: { code: 'ACTION_FAILED', message: result.error },
      });
    }

    return reply.send({ success: true });
  });
}
