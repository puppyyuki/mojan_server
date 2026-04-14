-- Add cross-player opening rule weight (higher first).
ALTER TABLE "v2_tile_bias_rules"
ADD COLUMN "weight" INTEGER NOT NULL DEFAULT 0;
