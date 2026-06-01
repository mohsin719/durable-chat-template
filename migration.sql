-- Create enums
CREATE TYPE "PlatformStatus" AS ENUM ('AVAILABLE', 'COOLDOWN', 'BLOCKED', 'HIGH_RISK');
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- Create platform-specific number status table
CREATE TABLE "number_platform_status" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "number_id" UUID NOT NULL,
  "platform" VARCHAR(50) NOT NULL,
  "status" "PlatformStatus" NOT NULL DEFAULT 'AVAILABLE',
  "failure_count" INTEGER NOT NULL DEFAULT 0,
  "success_count" INTEGER NOT NULL DEFAULT 0,
  "health_score" INTEGER NOT NULL DEFAULT 100,
  "last_error" TEXT,
  "cooldown_until" TIMESTAMP(6),
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "number_platform_status_pkey" PRIMARY KEY ("id")
);

-- Create failure log table
CREATE TABLE "number_failure_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "number_id" UUID NOT NULL,
  "platform" VARCHAR(50) NOT NULL,
  "error_type" VARCHAR(50) NOT NULL,
  "error_message" TEXT,
  "timestamp" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "number_failure_logs_pkey" PRIMARY KEY ("id")
);

-- Create platform rule table
CREATE TABLE "platform_rules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "platform" VARCHAR(50) NOT NULL,
  "base_cooldown_hours" INTEGER NOT NULL,
  "high_risk_cooldown_hours" INTEGER NOT NULL,
  "max_failures_before_block" INTEGER NOT NULL,
  "risk_level" "RiskLevel" NOT NULL,
  "created_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "platform_rules_pkey" PRIMARY KEY ("id")
);

-- Constraints
CREATE UNIQUE INDEX "uk_number_platform_status" ON "number_platform_status"("number_id", "platform");
CREATE UNIQUE INDEX "platform_rules_platform_key" ON "platform_rules"("platform");

-- Indexes
CREATE INDEX "idx_platform_status_platform_status" ON "number_platform_status"("platform", "status");
CREATE INDEX "idx_platform_status_number_platform" ON "number_platform_status"("number_id", "platform");
CREATE INDEX "idx_platform_status_cooldown_until" ON "number_platform_status"("cooldown_until");

CREATE INDEX "idx_failure_logs_number_platform" ON "number_failure_logs"("number_id", "platform");
CREATE INDEX "idx_failure_logs_platform_timestamp" ON "number_failure_logs"("platform", "timestamp");
CREATE INDEX "idx_failure_logs_error_type" ON "number_failure_logs"("error_type");

CREATE INDEX "idx_platform_rules_platform" ON "platform_rules"("platform");

-- Foreign keys
ALTER TABLE "number_platform_status"
  ADD CONSTRAINT "number_platform_status_number_id_fkey"
  FOREIGN KEY ("number_id") REFERENCES "number_pools"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "number_failure_logs"
  ADD CONSTRAINT "number_failure_logs_number_id_fkey"
  FOREIGN KEY ("number_id") REFERENCES "number_pools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
