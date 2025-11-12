-- Atomic pop + reserve + promote with fairness
-- KEYS[1]: campaign:{id}:waitlist:high (LIST)
-- KEYS[2]: campaign:{id}:waitlist:normal (LIST)
-- KEYS[3]: campaign:{id}:leases (SET)
-- KEYS[4]: campaign:{id}:limit (String)
-- KEYS[5]: campaign:{id}:reserved (Counter)
-- KEYS[6]: campaign:{id}:reserved:ledger (ZSET)
-- KEYS[7]: campaign:{id}:promote-gate (String)
-- KEYS[8]: campaign:{id}:promote-gate:seq (Counter)
-- KEYS[9]: campaign:{id}:fairness (Counter)
-- ARGV[1]: max_batch
-- ARGV[2]: reserve_ttl (70s)
-- ARGV[3]: gate_ttl (20s)
-- ARGV[4]: now (timestamp)

-- Step 1: Atomic fairness counter (3:1 high:normal ratio)
local fairness = tonumber(redis.call('INCR', KEYS[9]))
redis.call('EXPIRE', KEYS[9], 300)  -- 5min TTL

-- Step 2: Pop with fairness + correct origin tracking
local jobIds = {}
local origins = {}
local remaining = tonumber(ARGV[1])

-- Fairness: every 4th batch prefers normal
local popHighFirst = (fairness % 4 ~= 0)

if popHighFirst then
  -- Pop 3:1 ratio (high:normal)
  local highQuota = math.ceil(remaining * 0.75)

  for i = 1, highQuota do
    local id = redis.call('LPOP', KEYS[1])
    if not id then break end
    table.insert(jobIds, id)
    table.insert(origins, 'H')
  end

  local normalQuota = remaining - #jobIds
  for i = 1, normalQuota do
    local id = redis.call('LPOP', KEYS[2])
    if not id then break end
    table.insert(jobIds, id)
    table.insert(origins, 'N')
  end

  -- Fill remaining: alternate high then normal (correct origin!)
  while #jobIds < remaining do
    local idH = redis.call('LPOP', KEYS[1])
    if idH then
      table.insert(jobIds, idH)
      table.insert(origins, 'H')
    else
      local idN = redis.call('LPOP', KEYS[2])
      if idN then
        table.insert(jobIds, idN)
        table.insert(origins, 'N')
      else
        break
      end
    end
  end
else
  -- Fairness cycle: pull 1 normal first, then fill from high
  local idN = redis.call('LPOP', KEYS[2])
  if idN then
    table.insert(jobIds, idN)
    table.insert(origins, 'N')
  end

  while #jobIds < remaining do
    local id = redis.call('LPOP', KEYS[1])
    if id then
      table.insert(jobIds, id)
      table.insert(origins, 'H')
    else
      break
    end
  end
end

if #jobIds == 0 then
  return {0, 0, {}, {}}
end

-- Step 3: Calculate available capacity
local limit = tonumber(redis.call('GET', KEYS[4]) or '3')
local inflight = redis.call('SCARD', KEYS[3])
local reserved = tonumber(redis.call('GET', KEYS[5]) or '0')
local available = math.max(0, limit - inflight - reserved)

-- Step 4: Reserve capacity
local toPromote = math.min(#jobIds, available)
local promoteIds = {}
local pushBackIds = {}
local pushBackOrigins = {}

for i = 1, #jobIds do
  if i <= toPromote then
    table.insert(promoteIds, jobIds[i])
  else
    table.insert(pushBackIds, jobIds[i])
    table.insert(pushBackOrigins, origins[i])
  end
end

if toPromote > 0 then
  -- Increment counter
  redis.call('INCRBY', KEYS[5], toPromote)
  redis.call('EXPIRE', KEYS[5], tonumber(ARGV[2]))

  -- Store jobIds in ledger WITH origin prefix (H:jobId or N:jobId)
  for i, id in ipairs(promoteIds) do
    local originPrefix = (i <= #origins) and origins[i] or 'N'
    redis.call('ZADD', KEYS[6], ARGV[4], originPrefix .. ':' .. id)
  end
  redis.call('EXPIRE', KEYS[6], tonumber(ARGV[2]))

  -- Generate gate seq
  local seq = redis.call('INCR', KEYS[8])
  redis.call('SET', KEYS[7], seq, 'EX', tonumber(ARGV[3]))

  -- Push back extras with preserved origin
  for i = #pushBackIds, 1, -1 do
    local targetKey = pushBackOrigins[i] == 'H' and KEYS[1] or KEYS[2]
    redis.call('LPUSH', targetKey, pushBackIds[i])
  end

  return {toPromote, seq, promoteIds, pushBackIds}
end

-- No capacity - push back all with correct origin
for i = #jobIds, 1, -1 do
  local targetKey = origins[i] == 'H' and KEYS[1] or KEYS[2]
  redis.call('LPUSH', targetKey, jobIds[i])
end

return {0, 0, {}, jobIds}
