# Testing the Authentication System

## Prerequisites

1. **Docker Desktop Running** - MongoDB and Redis containers
2. **Environment Variables** - `.env` file configured
3. **Dependencies Installed** - `npm install` completed

## Step 1: Start Services

```bash
# From project root
cd "C:\Users\USER\Desktop\Apps\Calling Agent"

# Start MongoDB and Redis
docker-compose up -d

# Verify containers are running
docker ps
```

You should see:
- `ai-calling-mongodb` on port 27017
- `ai-calling-redis` on port 6379

## Step 2: Start Backend Server

```bash
# From backend directory
cd backend

# Start development server
npm run dev
```

You should see:
```
[INFO] MongoDB connected successfully
[INFO] Redis connected successfully
[INFO] Server started successfully on port 5000
```

## Step 3: Test Authentication Endpoints

### Option 1: Using cURL

**1. Health Check:**
```bash
curl http://localhost:5000/health
```

**2. Sign Up:**
```bash
curl -X POST http://localhost:5000/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"test@example.com\",\"password\":\"password123\",\"name\":\"Test User\"}"
```

Expected Response:
```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "...",
      "email": "test@example.com",
      "name": "Test User",
      "role": "user",
      "credits": 0
    },
    "tokens": {
      "access": "eyJhbGciOiJIUzI1NiIs...",
      "refresh": "eyJhbGciOiJIUzI1NiIs..."
    }
  }
}
```

**3. Login:**
```bash
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"test@example.com\",\"password\":\"password123\"}"
```

**4. Get Current User (Protected):**
```bash
# Replace YOUR_TOKEN with actual token from signup/login response
curl -X GET http://localhost:5000/api/v1/auth/me \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**5. Refresh Token:**
```bash
curl -X POST http://localhost:5000/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\":\"YOUR_REFRESH_TOKEN\"}"
```

### Option 2: Using test-auth.http File

If you have VS Code with REST Client extension:

1. Open `backend/test-auth.http`
2. Click "Send Request" above each request
3. View responses inline

### Option 3: Using Postman

1. Import the collection from `backend/postman/` (if created)
2. Set base URL: `http://localhost:5000/api/v1`
3. Test each endpoint

## Expected Results

### ✅ Successful Signup
- Status: 201 Created
- Returns user object and tokens
- User saved in MongoDB
- Token cached in Redis

### ✅ Successful Login
- Status: 200 OK
- Returns user object and tokens
- Updates lastLoginAt field
- Token cached in Redis

### ✅ Get Current User
- Status: 200 OK
- Returns authenticated user's data
- Requires valid JWT token

### ✅ Refresh Token
- Status: 200 OK
- Returns new access token
- Requires valid refresh token

## Error Cases to Test

### ❌ Invalid Email Format
```bash
curl -X POST http://localhost:5000/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"invalid-email\",\"password\":\"password123\",\"name\":\"Test\"}"
```
Expected: 400 Bad Request with validation error

### ❌ Password Too Short
```bash
curl -X POST http://localhost:5000/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"test2@example.com\",\"password\":\"pass\",\"name\":\"Test\"}"
```
Expected: 400 Bad Request - "Password must be at least 8 characters"

### ❌ Duplicate Email
```bash
# Try to signup with same email twice
curl -X POST http://localhost:5000/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"test@example.com\",\"password\":\"password123\",\"name\":\"Test2\"}"
```
Expected: 409 Conflict - "Email already registered"

### ❌ Wrong Password
```bash
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"test@example.com\",\"password\":\"wrongpassword\"}"
```
Expected: 401 Unauthorized - "Invalid credentials"

### ❌ Missing Token
```bash
curl -X GET http://localhost:5000/api/v1/auth/me
```
Expected: 401 Unauthorized - "No token provided"

### ❌ Invalid Token
```bash
curl -X GET http://localhost:5000/api/v1/auth/me \
  -H "Authorization: Bearer invalid-token"
```
Expected: 401 Unauthorized - "Invalid or expired token"

## Verify Data in MongoDB

```bash
# Connect to MongoDB
docker exec -it ai-calling-mongodb mongosh

# Switch to database
use ai-calling-platform

# View users
db.users.find().pretty()

# Count users
db.users.countDocuments()

# Find specific user
db.users.findOne({ email: "test@example.com" })
```

## Verify Cache in Redis

```bash
# Connect to Redis
docker exec -it ai-calling-redis redis-cli

# List all keys
KEYS *

# Get cached token
GET user:token:<user_id>

# Check TTL
TTL user:token:<user_id>
```

## Check Logs

```bash
# View backend logs
tail -f backend/logs/combined.log

# View error logs only
tail -f backend/logs/error.log

# In development console
# Logs appear in terminal where you ran `npm run dev`
```

## Troubleshooting

### Server Won't Start

**MongoDB Connection Error:**
```
Error: connect ECONNREFUSED 127.0.0.1:27017
```
Solution: Make sure Docker containers are running
```bash
docker-compose up -d
docker ps
```

**Redis Connection Error:**
```
Error: connect ECONNREFUSED 127.0.0.1:6379
```
Solution: Restart Redis container
```bash
docker-compose restart redis
```

**Port Already in Use:**
```
Error: listen EADDRINUSE: address already in use :::5000
```
Solution: Change PORT in .env or kill process using port 5000

### JWT Secret Error

```
Error: JWT_SECRET must be at least 32 characters
```
Solution: Update JWT_SECRET in `.env` file:
```bash
JWT_SECRET=your-super-secret-jwt-key-must-be-at-least-32-characters-long
```

### Validation Errors

If getting unexpected validation errors, check:
1. Request body format (JSON)
2. Content-Type header is set to `application/json`
3. All required fields are present
4. Field values meet requirements (min/max length, format)

## Next Steps

Once authentication is working:

1. ✅ Authentication system complete
2. ⏳ Create Agent management endpoints
3. ⏳ Create Phone management endpoints
4. ⏳ Integrate Exotel for calling
5. ⏳ Add OpenAI for LLM
6. ⏳ Add Deepgram for STT
7. ⏳ Add voice pipeline
8. ⏳ Build frontend

## Quick Test Script

Save this as `test-auth.sh`:

```bash
#!/bin/bash

BASE_URL="http://localhost:5000/api/v1"

echo "Testing Authentication System..."

# Test signup
echo "\n1. Testing Signup..."
SIGNUP_RESPONSE=$(curl -s -X POST "$BASE_URL/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{"email":"testuser@example.com","password":"password123","name":"Test User"}')

echo "$SIGNUP_RESPONSE" | jq .

# Extract token
TOKEN=$(echo "$SIGNUP_RESPONSE" | jq -r '.data.tokens.access')

# Test get current user
echo "\n2. Testing Get Current User..."
curl -s -X GET "$BASE_URL/auth/me" \
  -H "Authorization: Bearer $TOKEN" | jq .

echo "\n\nTests complete!"
```

Run with:
```bash
chmod +x test-auth.sh
./test-auth.sh
```

---

**Status:** Authentication system ready for testing! 🚀
