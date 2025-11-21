-- SQL script to create initial test data for agent management system

-- Create a test agent player
INSERT INTO players (id, "userId", nickname, "cardCount", "isAgent", "agentCardBalance", "createdAt", "updatedAt")
VALUES 
  ('agent-placeholder-id', '100001', 'Test Agent', 100, true, 500, NOW(), NOW())
ON CONFLICT (id) DO UPDATE
SET "isAgent" = true, "agentCardBalance" = 500;

-- Create some agent room card products
INSERT INTO agent_room_card_products (id, "cardAmount", price, "isActive", "createdAt", "updatedAt")
VALUES
  ('product-1', 100, 1000, true, NOW(), NOW()),
  ('product-2', 500, 4500, true, NOW(), NOW()),
  ('product-3', 1000, 8000, true, NOW(), NOW()),
  ('product-4', 5000, 35000, true, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Create some test players for selling to
INSERT INTO players (id, "userId", nickname, "cardCount", "createdAt", "updatedAt")
VALUES
  ('player-test-1', '200001', 'Player One', 50, NOW(), NOW()),
  ('player-test-2', '200002', 'Player Two', 30, NOW(), NOW()),
  ('player-test-3', '200003', 'Player Three', 20, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Create some sample sales records
INSERT INTO agent_room_card_sales (id, "agentId", "buyerId", "cardAmount", status, "createdAt")
VALUES
  (gen_random_uuid(), 'agent-placeholder-id', 'player-test-1', 10, 'COMPLETED', NOW() - INTERVAL '2 days'),
  (gen_random_uuid(), 'agent-placeholder-id', 'player-test-2', 20, 'COMPLETED', NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), 'agent-placeholder-id', 'player-test-1', 15, 'COMPLETED', NOW() - INTERVAL '5 hours')
ON CONFLICT DO NOTHING;

-- Create a sample purchase record
INSERT INTO agent_room_card_purchases (id, "agentId", "productId", "cardAmount", price, status, "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'agent-placeholder-id', 'product-2', 500, 4500, 'COMPLETED', NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days')
ON CONFLICT DO NOTHING;
