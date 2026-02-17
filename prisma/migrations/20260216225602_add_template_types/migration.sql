-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TemplateType" ADD VALUE 'NIS2';
ALTER TYPE "TemplateType" ADD VALUE 'NIST';
ALTER TYPE "TemplateType" ADD VALUE 'MITRE';
ALTER TYPE "TemplateType" ADD VALUE 'SUPPLY_CHAIN';
ALTER TYPE "TemplateType" ADD VALUE 'ISO27001';
ALTER TYPE "TemplateType" ADD VALUE 'GDPR';
ALTER TYPE "TemplateType" ADD VALUE 'PCI_DSS';

-- AlterTable
ALTER TABLE "agent_identities" ADD COLUMN     "certificateSerial" TEXT,
ADD COLUMN     "publicKey" TEXT;

-- AlterTable
ALTER TABLE "check_results" ADD COLUMN     "execHostname" TEXT,
ADD COLUMN     "execTimestamp" TIMESTAMP(3),
ADD COLUMN     "execUser" TEXT,
ADD COLUMN     "exitCode" INTEGER,
ADD COLUMN     "outputHash" TEXT,
ADD COLUMN     "signature" TEXT,
ADD COLUMN     "verified" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "servers" ADD COLUMN     "riskLevel" TEXT;
