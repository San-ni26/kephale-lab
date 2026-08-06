/*
  Warnings:

  - You are about to alter the column `price` on the `albums` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Integer`.
  - You are about to alter the column `totalEarnings` on the `artist_profiles` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Integer`.
  - You are about to alter the column `pendingPayout` on the `artist_profiles` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Integer`.
  - You are about to alter the column `amount` on the `purchases` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Integer`.
  - You are about to alter the column `platformFeeAmount` on the `purchases` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Integer`.
  - You are about to alter the column `artistAmount` on the `purchases` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Integer`.
  - You are about to alter the column `priceEur` on the `token_packs` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Integer`.
  - You are about to alter the column `price` on the `tracks` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Integer`.
  - You are about to alter the column `price` on the `videos` table. The data in that column could be lost. The data in that column will be cast from `DoublePrecision` to `Integer`.

*/
-- CreateEnum
CREATE TYPE "LiveMode" AS ENUM ('VIDEO', 'AUDIO');

-- CreateEnum
CREATE TYPE "LiveParticipantStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'KICKED');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentProvider" ADD VALUE 'CINETPAY';
ALTER TYPE "PaymentProvider" ADD VALUE 'TOKEN';

-- AlterTable
ALTER TABLE "albums" ALTER COLUMN "price" SET DEFAULT 0,
ALTER COLUMN "price" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "artist_profiles" ALTER COLUMN "totalEarnings" SET DEFAULT 0,
ALTER COLUMN "totalEarnings" SET DATA TYPE INTEGER,
ALTER COLUMN "pendingPayout" SET DEFAULT 0,
ALTER COLUMN "pendingPayout" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "follows" ADD COLUMN     "notifyAlbums" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyAll" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyTracks" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notifyVideos" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "lives" ADD COLUMN     "allowGuests" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "duration" INTEGER,
ADD COLUMN     "likesCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "maxGuests" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "mode" "LiveMode" NOT NULL DEFAULT 'VIDEO';

-- AlterTable
ALTER TABLE "purchases" ADD COLUMN     "cinetpayTransactionId" TEXT,
ALTER COLUMN "amount" SET DATA TYPE INTEGER,
ALTER COLUMN "platformFeeAmount" SET DATA TYPE INTEGER,
ALTER COLUMN "artistAmount" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "paidStreamsUsed" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "token_packs" ALTER COLUMN "priceEur" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "tracks" ALTER COLUMN "price" SET DEFAULT 0,
ALTER COLUMN "price" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "videos" ALTER COLUMN "price" SET DEFAULT 0,
ALTER COLUMN "price" SET DATA TYPE INTEGER;

-- CreateTable
CREATE TABLE "live_participants" (
    "id" TEXT NOT NULL,
    "liveId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "LiveParticipantStatus" NOT NULL DEFAULT 'PENDING',
    "isMuted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_reports" (
    "id" TEXT NOT NULL,
    "liveId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawals" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'PENDING',
    "paymentMethod" TEXT,
    "paymentDetails" TEXT,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "user1Id" TEXT NOT NULL,
    "user2Id" TEXT NOT NULL,
    "status" "ConversationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "live_participants_liveId_userId_key" ON "live_participants"("liveId", "userId");

-- CreateIndex
CREATE INDEX "live_reports_liveId_idx" ON "live_reports"("liveId");

-- CreateIndex
CREATE INDEX "withdrawals_artistId_idx" ON "withdrawals"("artistId");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_user1Id_user2Id_key" ON "conversations"("user1Id", "user2Id");

-- CreateIndex
CREATE INDEX "messages_conversationId_idx" ON "messages"("conversationId");

-- AddForeignKey
ALTER TABLE "live_participants" ADD CONSTRAINT "live_participants_liveId_fkey" FOREIGN KEY ("liveId") REFERENCES "lives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_participants" ADD CONSTRAINT "live_participants_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_reports" ADD CONSTRAINT "live_reports_liveId_fkey" FOREIGN KEY ("liveId") REFERENCES "lives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "live_reports" ADD CONSTRAINT "live_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artist_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user1Id_fkey" FOREIGN KEY ("user1Id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user2Id_fkey" FOREIGN KEY ("user2Id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
