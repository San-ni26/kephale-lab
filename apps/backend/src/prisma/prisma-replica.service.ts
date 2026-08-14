/**
 * Prisma Read Replica Service — PostgreSQL Read Replicas pour la scalabilité
 *
 * Architecture :
 * - Écriture (INSERT, UPDATE, DELETE) → Base principale (DATABASE_URL)
 * - Lecture (SELECT) → Replica en lecture seule (DATABASE_URL_REPLICA)
 *
 * Si DATABASE_URL_REPLICA n'est pas configuré, le client principal est utilisé
 * pour les deux (mode développement / début de prod sans replica).
 *
 * Routes qui bénéficient du replica (lectures lourdes) :
 * - GET /feed              — Feed "For You"
 * - GET /videos/reels      — Liste des Reels
 * - GET /tracks            — Catalogue musical
 * - GET /artists           — Liste des artistes
 * - GET /search/*          — Recherche full-text
 *
 * Configuration requise dans .env (optionnelle) :
 *   DATABASE_URL_REPLICA=postgresql://user:password@replica-host:5432/kephale
 *
 * Avec Prisma Postgres (Supabase / Render) :
 *   Activer les read replicas dans le dashboard puis copier l'URL du replica.
 *
 * Avec Neon PostgreSQL :
 *   Utiliser la branche read-only automatiquement créée.
 */

import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaReplicaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaReplicaService.name);
  private _replicaClient: PrismaClient | null = null;
  private _isReplicaAvailable = false;

  async onModuleInit() {
    const replicaUrl = process.env.DATABASE_URL_REPLICA;

    if (!replicaUrl) {
      this.logger.warn(
        'DATABASE_URL_REPLICA non configuré. Les lectures utiliseront la base principale. ' +
        'Configurer un replica PostgreSQL pour améliorer les performances à grande échelle.'
      );
      return;
    }

    try {
      this._replicaClient = new PrismaClient({
        datasources: { db: { url: replicaUrl } },
        log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
      });

      await this._replicaClient.$connect();
      this._isReplicaAvailable = true;
      this.logger.log('✅ Read Replica PostgreSQL connecté avec succès');
    } catch (error: any) {
      this.logger.error(`Échec de connexion au read replica : ${error?.message}. Fallback sur la base principale.`);
      this._replicaClient = null;
      this._isReplicaAvailable = false;
    }
  }

  async onModuleDestroy() {
    if (this._replicaClient) {
      await this._replicaClient.$disconnect();
    }
  }

  /**
   * Client Prisma en lecture seule (replica si disponible, sinon principal)
   *
   * Usage dans les services :
   * ```typescript
   * constructor(
   *   private readonly prisma: PrismaClient,              // Pour les écritures
   *   private readonly replicaPrisma: PrismaReplicaService, // Pour les lectures
   * ) {}
   *
   * async getFeed(userId: string) {
   *   // Lecture depuis le replica
   *   return this.replicaPrisma.reader.track.findMany({ ... });
   * }
   * ```
   */
  get reader(): PrismaClient {
    if (this._isReplicaAvailable && this._replicaClient) {
      return this._replicaClient;
    }
    // Fallback transparent : si pas de replica, utiliser le client principal
    // (injecté via le module Prisma global)
    throw new Error(
      'PrismaReplicaService.reader appelé mais aucun replica configuré. ' +
      'Utiliser PrismaClient directement ou configurer DATABASE_URL_REPLICA.'
    );
  }

  /**
   * Vérifier si un replica est disponible
   */
  get isAvailable(): boolean {
    return this._isReplicaAvailable;
  }

  /**
   * Helper : obtenir le bon client selon la disponibilité du replica
   * Retourne le replica si disponible, sinon le client principal
   *
   * Usage recommandé pour les services qui veulent être transparent :
   * ```typescript
   * const client = this.replicaPrisma.getReaderOrPrimary(this.prisma);
   * const tracks = await client.track.findMany({ ... });
   * ```
   */
  getReaderOrPrimary(primaryPrisma: PrismaClient): PrismaClient {
    if (this._isReplicaAvailable && this._replicaClient) {
      return this._replicaClient;
    }
    return primaryPrisma;
  }
}
