-- CreateEnum
CREATE TYPE "Category" AS ENUM ('BUY', 'REFI', 'EQUITY');

-- CreateEnum
CREATE TYPE "Intent" AS ENUM ('BUY', 'REFI', 'CASH');

-- CreateEnum
CREATE TYPE "RateSegment" AS ENUM ('PURCHASE', 'REFINANCE');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'SYNCED', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "loan_officers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nmls" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "languages" TEXT[],
    "specialties" TEXT[],
    "ratingAvg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "photoUrl" TEXT,
    "scheduleUrl" TEXT,
    "ghlContactId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loan_officers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_programs" (
    "id" TEXT NOT NULL,
    "category" "Category" NOT NULL,
    "name" TEXT NOT NULL,
    "blurb" TEXT NOT NULL,
    "bestFor" TEXT,
    "badge" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loan_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_rows" (
    "id" TEXT NOT NULL,
    "segment" "RateSegment" NOT NULL,
    "product" TEXT NOT NULL,
    "subLabel" TEXT,
    "rate" DECIMAL(6,3) NOT NULL,
    "apr" DECIMAL(6,3) NOT NULL,
    "points" DECIMAL(6,3) NOT NULL,
    "applyIntent" "Intent" NOT NULL,
    "termMonths" INTEGER NOT NULL DEFAULT 360,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "testimonials" (
    "id" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "context" TEXT,
    "rating" INTEGER NOT NULL DEFAULT 5,
    "surface" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "testimonials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "intent" "Intent" NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'web',
    "location" TEXT,
    "answers" JSONB NOT NULL,
    "consentTcpa" BOOLEAN NOT NULL DEFAULT false,
    "consentAt" TIMESTAMP(3),
    "ghlContactId" TEXT,
    "ghlOpportunityId" TEXT,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncAttempts" INTEGER NOT NULL DEFAULT 0,
    "syncError" TEXT,
    "crmStatus" TEXT,
    "crmStageId" TEXT,
    "cognitoSub" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "intent" "Intent" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'started',
    "contact" JSONB NOT NULL,
    "leadId" TEXT,
    "cognitoSub" TEXT,
    "ghlOpportunityId" TEXT,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_steps" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "stepKey" TEXT NOT NULL,
    "stepType" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventType" TEXT,
    "externalId" TEXT,
    "signatureOk" BOOLEAN NOT NULL DEFAULT false,
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "chatSessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "toolName" TEXT,
    "orderIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "secret" TEXT,
    "scopes" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "loan_officers_nmls_key" ON "loan_officers"("nmls");

-- CreateIndex
CREATE UNIQUE INDEX "loan_programs_category_name_key" ON "loan_programs"("category", "name");

-- CreateIndex
CREATE UNIQUE INDEX "rate_rows_segment_product_subLabel_key" ON "rate_rows"("segment", "product", "subLabel");

-- CreateIndex
CREATE UNIQUE INDEX "leads_idempotencyKey_key" ON "leads"("idempotencyKey");

-- CreateIndex
CREATE INDEX "leads_syncStatus_idx" ON "leads"("syncStatus");

-- CreateIndex
CREATE INDEX "leads_ghlContactId_idx" ON "leads"("ghlContactId");

-- CreateIndex
CREATE INDEX "leads_ghlOpportunityId_idx" ON "leads"("ghlOpportunityId");

-- CreateIndex
CREATE INDEX "leads_cognitoSub_idx" ON "leads"("cognitoSub");

-- CreateIndex
CREATE UNIQUE INDEX "applications_idempotencyKey_key" ON "applications"("idempotencyKey");

-- CreateIndex
CREATE INDEX "applications_cognitoSub_idx" ON "applications"("cognitoSub");

-- CreateIndex
CREATE INDEX "application_steps_applicationId_idx" ON "application_steps"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_idempotencyKey_key" ON "webhook_events"("idempotencyKey");

-- CreateIndex
CREATE INDEX "webhook_events_provider_idx" ON "webhook_events"("provider");

-- CreateIndex
CREATE INDEX "chat_sessions_leadId_idx" ON "chat_sessions"("leadId");

-- CreateIndex
CREATE INDEX "chat_messages_chatSessionId_idx" ON "chat_messages"("chatSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "api_keys_active_idx" ON "api_keys"("active");

-- AddForeignKey
ALTER TABLE "application_steps" ADD CONSTRAINT "application_steps_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_chatSessionId_fkey" FOREIGN KEY ("chatSessionId") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
