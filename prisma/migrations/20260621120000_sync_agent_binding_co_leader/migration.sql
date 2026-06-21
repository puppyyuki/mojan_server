-- 既有 AgentClubBinding 的玩家同步為副會長（會長維持 OWNER）
UPDATE "club_members" cm
SET
  "role" = 'CO_LEADER',
  "coLeaderPermissions" = '{"modifyClubRules":true,"approveJoinRequests":true,"kickMembers":true,"banMembers":true,"banSameTable":true,"setScoreLimit":true,"setBaseTaiLimit":true,"manageRoomCards":false}'::jsonb
FROM "agent_club_bindings" acb
INNER JOIN "clubs" c ON c."id" = acb."clubId"
WHERE cm."clubId" = acb."clubId"
  AND cm."playerId" = acb."playerId"
  AND cm."role" = 'MEMBER'
  AND cm."playerId" <> c."creatorId";

UPDATE "club_members" cm
SET
  "coLeaderPermissions" = '{"modifyClubRules":true,"approveJoinRequests":true,"kickMembers":true,"banMembers":true,"banSameTable":true,"setScoreLimit":true,"setBaseTaiLimit":true,"manageRoomCards":false}'::jsonb
FROM "agent_club_bindings" acb
WHERE cm."clubId" = acb."clubId"
  AND cm."playerId" = acb."playerId"
  AND cm."role" = 'CO_LEADER'
  AND cm."coLeaderPermissions" IS NULL;
