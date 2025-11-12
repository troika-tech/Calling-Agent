-- Renew lease TTL with optional "recovered" wildcard support
-- KEYS[1]: campaign:{id}:lease:{callId} (String)
-- KEYS[2]: campaign:{id}:cold-start (String)
-- ARGV[1]: token
-- ARGV[2]: ttl (seconds)

local stored = redis.call('GET', KEYS[1])
if not stored then
  return 0
end

-- Normal token match
if stored == ARGV[1] then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
  return 1
end

-- Allow "recovered" only during cold-start "blocking" phase
if stored == 'recovered' then
  local guardState = redis.call('GET', KEYS[2])
  if guardState == 'blocking' then
    redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
    return 1
  end
end

return 0
