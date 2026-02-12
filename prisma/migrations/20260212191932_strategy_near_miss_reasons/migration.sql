-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StrategyBlockReason" ADD VALUE 'NO_ACTIVE_FVG';
ALTER TYPE "StrategyBlockReason" ADD VALUE 'FVG_INVALID';
ALTER TYPE "StrategyBlockReason" ADD VALUE 'FVG_ALREADY_TRADED';
ALTER TYPE "StrategyBlockReason" ADD VALUE 'NOT_RETESTED';
ALTER TYPE "StrategyBlockReason" ADD VALUE 'DIRECTION_MISMATCH';
ALTER TYPE "StrategyBlockReason" ADD VALUE 'NO_EXPANSION_PATTERN';
ALTER TYPE "StrategyBlockReason" ADD VALUE 'STOP_INVALID';
ALTER TYPE "StrategyBlockReason" ADD VALUE 'STOP_TOO_BIG';
ALTER TYPE "StrategyBlockReason" ADD VALUE 'CONTRACTS_ZERO';
