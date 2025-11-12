-- Acquire pre-dial slot
-- KEYS[1]: campaign:{id}:leases (SET)
-- KEYS[2]: campaign:{id}:lease:pre-{callId} (String)
-- KEYS[3]: campaign:{id}:limit (String)
-- ARGV[1]: callId
-- ARGV[2]: pre-{callId} (SET member)
-- ARGV[3]: token (UUID)
-- ARGV[4]: ttl (15-20s)

local limit = tonumber(redis.call('GET', KEYS[3]) or '3')
local inflight = redis.call('SCARD', KEYS[1])

if inflight < limit then
  redis.call('SADD', KEYS[1], ARGV[2])  -- Add "pre-{callId}"
  redis.call('SET', KEYS[2], ARGV[3], 'EX', tonumber(ARGV[4]))
  return ARGV[3]  -- Return token
end
return ''
