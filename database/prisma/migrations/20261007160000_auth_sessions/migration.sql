BEGIN;
-- CreateTable
CREATE TABLE "auth_sessions" (
    "token_hash" CHAR(64) NOT NULL,
    "company_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("token_hash")
);

-- CreateIndex
CREATE INDEX "auth_sessions_company_id_user_id_idx" ON "auth_sessions"("company_id", "user_id");

-- CreateIndex
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_company_id_id_key" ON "users"("company_id", "id");

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_company_id_user_id_fkey" FOREIGN KEY ("company_id", "user_id") REFERENCES "users"("company_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE auth_sessions ADD CONSTRAINT auth_session_expiry_chk CHECK (expires_at > created_at);
COMMIT;
