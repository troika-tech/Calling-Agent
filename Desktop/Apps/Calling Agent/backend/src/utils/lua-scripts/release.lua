-- Release slot with optional pub/sub notification
-- KEYS[1]: campaign:{id}:leases (SET)
-- KEYS[2]: campaign:{id}:lease:{callId} (String)
-- ARGV[1]: callId (or pre-{callId})
-- ARGV[2]: token
-- ARGV[3]: campaignId (for pub/sub)
-- ARGV[4]: publish ('1' = yes, '0' = no)

local stored = redis.call('GET', KEYS[2])

if stored and stored == ARGV[2] then
  redis.call('DEL', KEYS[2])
  redis.call('SREM', KEYS[1], ARGV[1])

  -- PUBLISH slot-available to wake promoters
  if ARGV[4] == '1' then
    redis.call('PUBLISH', 'campaign:' .. ARGV[3] .. ':slot-available', '1')
  end
  return 1
end
return 0
