-- Upgrade pre-dial to active lease (atomically swaps SET member)
-- KEYS[1]: campaign:{id}:leases (SET)
-- KEYS[2]: campaign:{id}:lease:pre-{callId} (String)
-- KEYS[3]: campaign:{id}:lease:{callId} (String)
-- ARGV[1]: {callId} (active member)
-- ARGV[2]: pre-{callId} (pre-dial member)
-- ARGV[3]: pre-dial token (verify)
-- ARGV[4]: active token (new UUID)
-- ARGV[5]: ttl (180-240s)

local stored = redis.call('GET', KEYS[2])
if stored and stored == ARGV[3] then
  -- Atomically swap SET member
  redis.call('SREM', KEYS[1], ARGV[2])  -- Remove "pre-{callId}"
  redis.call('SADD', KEYS[1], ARGV[1])  -- Add "{callId}"

  -- Swap lease keys
  redis.call('DEL', KEYS[2])
  redis.call('SET', KEYS[3], ARGV[4], 'EX', tonumber(ARGV[5]))
  return ARGV[4]  -- Return new token
end
return ''
