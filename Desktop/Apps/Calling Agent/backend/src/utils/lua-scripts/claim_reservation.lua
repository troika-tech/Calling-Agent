-- Claim reservation (remove from ledger + decrement counter)
-- Handles both H:jobId and N:jobId prefixes
-- KEYS[1]: campaign:{id}:reserved (Counter)
-- KEYS[2]: campaign:{id}:reserved:ledger (ZSET)
-- ARGV[1]: jobId (bare, without origin prefix)

-- Try to remove with both prefixes
local removedH = redis.call('ZREM', KEYS[2], 'H:' .. ARGV[1])
local removedN = redis.call('ZREM', KEYS[2], 'N:' .. ARGV[1])
local removed = removedH + removedN

if removed > 0 then
  -- Clamp to max(0, reserved - removed)
  local current = tonumber(redis.call('GET', KEYS[1]) or '0')
  local newVal = math.max(0, current - removed)
  redis.call('SET', KEYS[1], newVal)
  return removed
end
return 0
