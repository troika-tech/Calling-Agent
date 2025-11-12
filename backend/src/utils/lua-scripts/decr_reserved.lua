-- Decrement reservation counter with clamping
-- KEYS[1]: campaign:{id}:reserved (Counter)
-- ARGV[1]: count to decrement

local current = tonumber(redis.call('GET', KEYS[1]) or '0')
local newVal = math.max(0, current - tonumber(ARGV[1]))
redis.call('SET', KEYS[1], newVal)
return newVal
