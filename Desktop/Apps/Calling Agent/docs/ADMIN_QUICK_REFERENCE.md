# Admin Dashboard - Quick Reference

## Current Status
✓ Dashboard converted to admin-only access
✓ Existing user upgraded to super_admin
✓ All routes protected with role-based access control

---

## Super Admin User
```
Name: Pratik Yesare
Email: pratik.yesare68@gmail.com
Role: super_admin
```

---

## How to Make Another User Admin

### Option 1: Using the Script (Recommended)
```bash
cd backend
npx ts-node scripts/makeSuperAdmin.ts
```
This will upgrade the **first user** in the database to super_admin.

### Option 2: Manually via MongoDB
```javascript
// Connect to MongoDB and run:
db.users.updateOne(
  { email: "user@example.com" },
  { $set: { role: "super_admin" } }
)

// Or make them a regular admin:
db.users.updateOne(
  { email: "user@example.com" },
  { $set: { role: "admin" } }
)
```

### Option 3: Create a New Admin Script
Create `backend/scripts/makeUserAdmin.ts`:
```typescript
// Pass email as argument
const email = process.argv[2];
const user = await User.findOne({ email });
user.role = 'admin'; // or 'super_admin'
await user.save();
```

Run with:
```bash
npx ts-node scripts/makeUserAdmin.ts user@example.com
```

---

## Role Differences

| Feature | User | Admin | Super Admin |
|---------|------|-------|-------------|
| Dashboard Access | ❌ | ✅ | ✅ |
| Create Agents | ❌ | ✅ | ✅ |
| View Calls | ❌ | ✅ | ✅ |
| Manage KB | ❌ | ✅ | ✅ |
| Make Calls | ❌ | ✅ | ✅ |
| Future: Manage Users | ❌ | ❌ | ✅ |

**Note:** Currently `admin` and `super_admin` have the same permissions. The distinction is for future features.

---

## Testing Admin Access

### 1. Test Login as Super Admin
```bash
# Visit: http://localhost:5173/login
Email: pratik.yesare68@gmail.com
Password: [your password]

# You should see:
✓ Access to /dashboard
✓ "Super Admin" badge in sidebar
✓ Full access to all features
```

### 2. Test Regular User Access
```bash
# Create a new user via registration
# Visit: http://localhost:5173/register

# After login, try accessing /dashboard
# You should see:
✓ "Access Denied" page
✓ Cannot access any admin routes
```

### 3. Test API Protection
```bash
# Get admin token (after login as admin)
TOKEN="your_admin_token_here"

# Test protected endpoint
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:5000/api/v1/agents

# Should return: 200 OK with agents list

# Test without token
curl http://localhost:5000/api/v1/agents
# Should return: 401 Unauthorized

# Test with regular user token
curl -H "Authorization: Bearer $USER_TOKEN" \
  http://localhost:5000/api/v1/agents
# Should return: 403 Forbidden
```

---

## Protected Routes

### Frontend Routes (All require admin/super_admin)
- `/dashboard` - Admin Dashboard
- `/agents` - Agent Management
- `/agents/new` - Create Agent
- `/agents/:id/edit` - Edit Agent
- `/calls` - Call Logs
- `/calls/:id` - Call Details

### API Routes (All require admin/super_admin)

**Agents:**
- `GET /api/v1/agents` - List all agents
- `POST /api/v1/agents` - Create agent
- `PUT /api/v1/agents/:id` - Update agent
- `DELETE /api/v1/agents/:id` - Delete agent

**Calls:**
- `GET /api/v1/exotel/calls` - Get call history
- `GET /api/v1/exotel/calls/:callId` - Get call details
- `POST /api/v1/exotel/calls` - Make outbound call
- `POST /api/v1/exotel/calls/:callId/hangup` - End call

**Knowledge Base:**
- `POST /api/v1/knowledge-base/upload` - Upload document
- `GET /api/v1/knowledge-base/:agentId` - List documents
- `DELETE /api/v1/knowledge-base/:documentId` - Delete document

**Phones:**
- `GET /api/v1/phones` - List phone numbers
- `POST /api/v1/phones` - Import phone number
- `DELETE /api/v1/phones/:id` - Delete phone number

---

## Modifying Access Control

### To Add More Admin-Only Routes

**Backend:**
```typescript
// In route file (e.g., backend/src/routes/myRoute.routes.ts)
import { authenticate, requireAdmin } from '../middlewares/auth.middleware';

router.use(authenticate);
router.use(requireAdmin); // Apply to all routes in this router
```

**Frontend:**
```typescript
// In frontend/src/App.tsx
<Route element={<AdminRoute />}>
  <Route path="/new-admin-page" element={<NewAdminPage />} />
</Route>
```

### To Add Super Admin-Only Routes

**Backend:**
```typescript
import { authenticate, requireSuperAdmin } from '../middlewares/auth.middleware';

router.use(authenticate);
router.use(requireSuperAdmin); // Only super_admin can access
```

**Frontend:**
Create a new `SuperAdminRoute.tsx` component similar to `AdminRoute.tsx` but check for `super_admin` only.

---

## Troubleshooting

### Issue: "Access Denied" even with admin token
**Solution:**
1. Check user role in database: `db.users.findOne({ email: "your@email.com" })`
2. Verify token is valid: JWT should contain correct userId
3. Clear localStorage and login again
4. Run the makeSuperAdmin script again

### Issue: 403 Forbidden on API calls
**Solution:**
1. Check if token is being sent in Authorization header
2. Verify token format: `Bearer <token>`
3. Check if user role is admin or super_admin
4. Look at backend logs for specific error

### Issue: Role not updating after running script
**Solution:**
1. Restart backend server
2. Clear frontend localStorage
3. Login again to get new token with updated role

### Issue: TypeScript errors after changes
**Solution:**
```bash
# Backend
cd backend && npm run build

# Frontend
cd frontend && npm run build

# If errors persist, check:
# - backend/src/models/User.ts
# - frontend/src/types/index.ts
```

---

## Next Steps: Creating User Dashboard

When ready to add a regular user dashboard:

1. **Create separate routes:**
   ```
   Admin: /admin/*
   User: /dashboard/*
   ```

2. **Update login redirect logic:**
   ```typescript
   if (user.role === 'admin' || user.role === 'super_admin') {
     navigate('/admin/dashboard');
   } else {
     navigate('/dashboard');
   }
   ```

3. **Create UserRoute component:**
   - Similar to AdminRoute but for regular users
   - Shows different features/data

4. **User-specific features:**
   - View own agents only
   - View own calls only
   - Personal settings
   - Limited KB access

---

## Quick Commands

```bash
# Make user super admin
cd backend && npx ts-node scripts/makeSuperAdmin.ts

# Build backend
cd backend && npm run build

# Build frontend
cd frontend && npm run build

# Start backend (dev)
cd backend && npm run dev

# Start frontend (dev)
cd frontend && npm run dev

# Check user roles in DB
# Connect to MongoDB and run:
db.users.find({}, { email: 1, role: 1, name: 1 })
```

---

## Summary

✅ **Current Dashboard:** Admin-only (admin & super_admin)
✅ **Current User:** pratik.yesare68@gmail.com (super_admin)
✅ **Protection:** Backend routes + Frontend UI
✅ **Ready for:** User dashboard implementation

For questions or issues, refer to `ADMIN_DASHBOARD_IMPLEMENTATION.md` for detailed technical documentation.
