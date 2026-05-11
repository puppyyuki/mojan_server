-- CreateTable
CREATE TABLE "app_release_settings" (
    "id" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL DEFAULT '',
    "forceUpdate" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_release_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "app_release_settings" ("id", "policyVersion", "forceUpdate")
VALUES ('default', '', false);
