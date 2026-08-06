-- CreateEnum
CREATE TYPE "AlbumStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE');

-- AlterEnum
ALTER TYPE "PurchaseType" ADD VALUE 'ALBUM';

-- AlterTable
ALTER TABLE "artist_profiles" ADD COLUMN     "totalFollowers" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalPlays" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalViews" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "purchases" ADD COLUMN     "albumId" TEXT;

-- AlterTable
ALTER TABLE "tracks" ADD COLUMN     "albumId" TEXT,
ALTER COLUMN "duration" SET DEFAULT 0,
ALTER COLUMN "coverUrl" SET DEFAULT '',
ALTER COLUMN "audioUrl" SET DEFAULT '',
ALTER COLUMN "currency" SET DEFAULT 'XOF';

-- CreateTable
CREATE TABLE "albums" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "coverUrl" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "status" "AlbumStatus" NOT NULL DEFAULT 'ACTIVE',
    "releaseDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "albums_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "albums_artistId_idx" ON "albums"("artistId");

-- CreateIndex
CREATE INDEX "albums_status_idx" ON "albums"("status");

-- AddForeignKey
ALTER TABLE "albums" ADD CONSTRAINT "albums_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artist_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracks" ADD CONSTRAINT "tracks_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "albums"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "albums"("id") ON DELETE SET NULL ON UPDATE CASCADE;
