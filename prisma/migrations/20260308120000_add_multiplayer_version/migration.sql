-- CreateEnum
CREATE TYPE "MultiplayerVersion" AS ENUM ('V1', 'V2');

-- AlterTable
ALTER TABLE "rooms" ADD COLUMN     "multiplayerVersion" "MultiplayerVersion" NOT NULL DEFAULT 'V1';

