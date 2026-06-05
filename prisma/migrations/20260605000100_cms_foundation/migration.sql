-- CMS Phase 0: draft→publish→history versioning engine + RBAC.
-- Adds enums AdminRole, RevisionState, EditableKind and models
-- AdminUser, Membership, Editable, Revision, AuditLog.
-- Applied by: npx prisma migrate deploy (gated — see Phase 0 checkpoint)

-- Enums

CREATE TYPE "AdminRole" AS ENUM ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER');

CREATE TYPE "RevisionState" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

CREATE TYPE "EditableKind" AS ENUM (
    'CONFIG',
    'PAGE_SEO',
    'REDIRECTS',
    'NAV',
    'OFFICER',
    'RATE',
    'TESTIMONIAL',
    'PROGRAM'
);

-- AdminUser (global — no tenantId)

CREATE TABLE "admin_users" (
    "id"              TEXT        NOT NULL,
    "cognitoSub"      TEXT        NOT NULL,
    "email"           TEXT        NOT NULL,
    "name"            TEXT        NOT NULL,
    "isPlatformAdmin" BOOLEAN     NOT NULL DEFAULT false,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "admin_users_cognitoSub_key"
    ON "admin_users"("cognitoSub");

-- Membership

CREATE TABLE "memberships" (
    "id"        TEXT        NOT NULL,
    "userId"    TEXT        NOT NULL,
    "tenantId"  TEXT        NOT NULL,
    "role"      "AdminRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "memberships_userId_tenantId_key"
    ON "memberships"("userId", "tenantId");

CREATE INDEX "memberships_tenantId_idx"
    ON "memberships"("tenantId");

ALTER TABLE "memberships"
    ADD CONSTRAINT "memberships_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "admin_users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Editable

CREATE TABLE "editables" (
    "id"        TEXT            NOT NULL,
    "tenantId"  TEXT            NOT NULL,
    "kind"      "EditableKind"  NOT NULL,
    "key"       TEXT            NOT NULL,
    "createdAt" TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "editables_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "editables_tenantId_kind_key_key"
    ON "editables"("tenantId", "kind", "key");

CREATE INDEX "editables_tenantId_idx"
    ON "editables"("tenantId");

-- Revision

CREATE TABLE "revisions" (
    "id"          TEXT            NOT NULL,
    "tenantId"    TEXT            NOT NULL,
    "editableId"  TEXT            NOT NULL,
    "version"     INTEGER         NOT NULL,
    "state"       "RevisionState" NOT NULL DEFAULT 'DRAFT',
    "data"        JSONB           NOT NULL,
    "authorId"    TEXT,
    "note"        TEXT,
    "createdAt"   TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "revisions_editableId_version_key"
    ON "revisions"("editableId", "version");

CREATE INDEX "revisions_tenantId_idx"
    ON "revisions"("tenantId");

CREATE INDEX "revisions_editableId_state_idx"
    ON "revisions"("editableId", "state");

ALTER TABLE "revisions"
    ADD CONSTRAINT "revisions_editableId_fkey"
    FOREIGN KEY ("editableId") REFERENCES "editables"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AuditLog

CREATE TABLE "audit_logs" (
    "id"         TEXT        NOT NULL,
    "tenantId"   TEXT        NOT NULL,
    "userId"     TEXT,
    "action"     TEXT        NOT NULL,
    "editableId" TEXT,
    "meta"       JSONB,
    "at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_tenantId_at_idx"
    ON "audit_logs"("tenantId", "at");
