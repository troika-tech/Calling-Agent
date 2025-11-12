-- Force release (webhook reconciliation, no token check)
-- Checks both active and pre-dial membership
-- KEYS[1]: campaign:{id}:leases (SET)
-- KEYS[2]: campaign:{id}:lease:{callId} (String, active)
-- KEYS[3]: campaign:{id}:lease:pre-{callId} (String, pre-dial)
-- ARGV[1]: {callId} (active member)
-- ARGV[2]: pre-{callId} (pre-dial member)
-- ARGV[3]: campaignId (for pub/sub)
-- ARGV[4]: publish ('1' = yes, '0' = no)

-- Try active lease first
local activeExists = redis.call('EXISTS', KEYS[2])
if activeExists == 1 then
  redis.call('DEL', KEYS[2])
  redis.call('SREM', KEYS[1], ARGV[1])

  -- PUBLISH slot-available
  if ARGV[4] == '1' then
    redis.call('PUBLISH', 'campaign:' .. ARGV[3] .. ':slot-available', '1')
  end
  return 1  -- Released active
end

-- Try pre-dial lease
local preExists = redis.call('EXISTS', KEYS[3])
if preExists == 1 then
  redis.call('DEL', KEYS[3])
  redis.call('SREM', KEYS[1], ARGV[2])

  -- PUBLISH slot-available
  if ARGV[4] == '1' then
    redis.call('PUBLISH', 'campaign:' .. ARGV[3] .. ':slot-available', '1')
  end
  return 2  -- Released pre-dial
end

-- Neither exists, no-op
return 0
