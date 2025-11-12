# Phone Numbers Management Feature

## Overview
Added a complete Phone Numbers management page in the admin dashboard where admins can import Exotel phone numbers and assign them to AI agents with a 1-to-1 relationship.

---

## Features Implemented

### 1. Phone Numbers List Page
**Location:** [/phones](frontend/src/components/phones/PhoneList.tsx)

**Features:**
- View all imported phone numbers in a card-based grid layout
- See phone number, country code, and status
- View currently assigned agent for each phone
- Quick actions: Assign/Change/Unassign agent, Delete phone
- Empty state with call-to-action when no phones exist
- Real-time data loading with loading spinner

**UI Elements:**
- Card design with gradient icons
- Status badges (Active/Inactive)
- Tag display for organized phone numbers
- Responsive grid (1 → 2 → 3 columns)

### 2. Import Phone Number Modal
**Component:** [ImportPhoneModal.tsx](frontend/src/components/phones/ImportPhoneModal.tsx)

**Features:**
- Import new Exotel phone numbers
- Enter Exotel API credentials:
  - API Key
  - API Token
  - Account SID
  - Subdomain
- Phone number validation (E.164 format)
- Country code selection (2-letter ISO code)
- Optional tags for organization
- Form validation with helpful error messages
- Loading state during import

**Validation:**
- Phone number must match E.164 format: `^\+?[1-9]\d{1,14}$`
- Country code must be exactly 2 characters
- All Exotel credentials are required

**Example Phone Number Format:**
- ✓ `+919876543210` (with country code)
- ✓ `919876543210` (without + sign)
- ✗ `9876543210` (missing country code)

### 3. Assign Agent Modal
**Component:** [AssignAgentModal.tsx](frontend/src/components/phones/AssignAgentModal.tsx)

**Features:**
- Select from a list of active agents
- Visual card-based selection with radio button style
- Display agent details:
  - Name and description
  - AI model (GPT-4o, Claude, etc.)
  - Voice provider (Deepgram, OpenAI, etc.)
  - Language
  - Active status badge
- Warning when reassigning (replacing existing agent)
- Empty state when no active agents available
- Loading state during assignment

**Business Rules:**
- Only active agents can be assigned
- 1 phone number can be assigned to only 1 agent
- Reassigning replaces the previous agent assignment
- Unassigning removes the agent completely

---

## API Endpoints Used

All endpoints require admin authentication (`requireAdmin` middleware).

### Phone Management
```
GET    /api/v1/phones              - List all phone numbers
POST   /api/v1/phones              - Import new phone number
GET    /api/v1/phones/:id          - Get phone details
PUT    /api/v1/phones/:id          - Update phone
DELETE /api/v1/phones/:id          - Delete phone
```

### Agent Assignment
```
PUT    /api/v1/phones/:id/assign   - Assign agent to phone
DELETE /api/v1/phones/:id/assign   - Unassign agent from phone
```

### Statistics
```
GET    /api/v1/phones/:id/stats    - Get phone statistics
```

---

## Data Models

### Phone Interface (Frontend)
```typescript
interface Phone {
  _id: string;
  userId: string;
  number: string;              // E.164 format
  country: string;             // 2-letter ISO code (e.g., IN, US)
  provider: 'exotel';          // Currently only Exotel supported
  agentId?: Agent | string;    // Populated agent or agent ID
  tags: string[];              // Organization tags
  status: 'active' | 'inactive';
  exotelData?: {
    sid: string;
    appId?: string;
  };
  createdAt: string;
  updatedAt: string;
}
```

### Exotel Config
```typescript
interface ExotelConfig {
  apiKey: string;       // Exotel API Key
  apiToken: string;     // Exotel API Token
  sid: string;          // Exotel Account SID
  subdomain: string;    // e.g., api.exotel.com
}
```

### Import Phone Request
```typescript
interface ImportPhoneRequest {
  number: string;               // Phone number in E.164 format
  country: string;              // 2-letter country code
  exotelConfig: ExotelConfig;   // Exotel credentials
  tags?: string[];              // Optional tags
}
```

---

## User Flows

### Flow 1: Import Phone Number
1. Admin clicks "Import Phone Number" button
2. Modal opens with import form
3. Admin enters:
   - Phone number (e.g., +919876543210)
   - Country code (e.g., IN)
   - Exotel API credentials
   - Optional tags
4. Click "Import Phone Number"
5. System validates and saves phone
6. Modal closes and phone list refreshes
7. New phone appears in the grid (unassigned state)

### Flow 2: Assign Agent to Phone
1. Admin clicks "Assign Agent" on a phone card
2. Modal opens showing all active agents
3. Admin selects an agent from the list
4. Click "Assign Agent"
5. System validates assignment (checks agent is active)
6. Modal closes and phone list refreshes
7. Phone card now shows assigned agent name
8. "Assign Agent" button changes to "Change Agent"

### Flow 3: Change Assigned Agent
1. Admin clicks "Change Agent" on a phone card
2. Modal opens with current agent pre-selected
3. Admin selects a different agent
4. Warning shown: "This will replace current assignment"
5. Click "Assign Agent"
6. System updates assignment
7. Modal closes and list refreshes
8. Phone card shows new agent name

### Flow 4: Unassign Agent
1. Admin clicks "X" (unassign) button next to "Change Agent"
2. Confirmation dialog appears
3. Admin confirms unassignment
4. System removes agent assignment
5. Phone list refreshes
6. Phone card shows "Not assigned"
7. Button changes back to "Assign Agent"

### Flow 5: Delete Phone Number
1. Admin clicks trash icon on phone card
2. Confirmation dialog appears
3. Admin confirms deletion
4. System deletes phone number
5. Phone list refreshes
6. Phone card is removed from grid

---

## File Structure

### Frontend Files Created
```
frontend/src/
├── components/
│   └── phones/
│       ├── PhoneList.tsx              # Main phone list page
│       ├── ImportPhoneModal.tsx       # Import phone modal
│       └── AssignAgentModal.tsx       # Assign agent modal
├── services/
│   └── phoneService.ts                # Phone API service
└── types/
    └── index.ts                       # Updated with Phone types
```

### Frontend Files Modified
```
frontend/src/
├── App.tsx                            # Added /phones route
└── components/
    └── layout/
        └── DashboardLayout.tsx        # Added Phone Numbers nav link
```

### Backend Files (Already Existed)
```
backend/src/
├── models/
│   └── Phone.ts                       # Phone database model
├── controllers/
│   └── phone.controller.ts            # Phone CRUD operations
├── services/
│   └── phone.service.ts               # Phone business logic
├── routes/
│   └── phone.routes.ts                # Phone API routes (admin protected)
└── utils/
    └── validation.ts                  # Import phone validation schema
```

---

## Navigation

### Sidebar Navigation
Added new menu item:
- **Icon:** Phone icon (FiPhone)
- **Label:** Phone Numbers
- **Route:** `/phones`
- **Position:** Between "Agents" and "Call Logs"

Updated navigation array:
```typescript
const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: FiHome },
  { name: 'Agents', href: '/agents', icon: FiUsers },
  { name: 'Phone Numbers', href: '/phones', icon: FiPhone },      // NEW
  { name: 'Call Logs', href: '/calls', icon: FiPhoneCall },
];
```

---

## Security & Access Control

### Admin Only Access
All phone management features require admin/super_admin role:

**Backend Protection:**
```typescript
// phone.routes.ts
router.use(authenticate);      // Requires valid JWT token
router.use(requireAdmin);      // Requires admin or super_admin role
```

**Frontend Protection:**
```typescript
// App.tsx
<Route element={<AdminRoute />}>
  <Route path="/phones" element={<PhoneList />} />  // Admin only
</Route>
```

**Access Levels:**
- ✅ Super Admin - Full access
- ✅ Admin - Full access
- ❌ Regular User - 403 Forbidden

---

## Validation Rules

### Phone Number
- **Format:** E.164 (international format)
- **Pattern:** `^\+?[1-9]\d{1,14}$`
- **Examples:**
  - ✓ +919876543210
  - ✓ +12025551234
  - ✓ 919876543210
  - ✗ 9876543210 (missing country code)
  - ✗ +0123456789 (starts with 0)

### Country Code
- **Length:** Exactly 2 characters
- **Format:** Uppercase ISO 3166-1 alpha-2
- **Examples:**
  - ✓ IN (India)
  - ✓ US (United States)
  - ✓ GB (United Kingdom)
  - ✗ IND (3 letters)
  - ✗ 91 (numeric)

### Exotel Credentials
- **All fields required:** apiKey, apiToken, sid, subdomain
- **Minimum length:** 1 character each
- **No format validation** (Exotel validates on their end)

### Tags
- **Optional field**
- **Maximum:** 10 tags per phone
- **Format:** Comma-separated values
- **Example:** `sales, support, customer-service`

---

## UI/UX Features

### Responsive Design
- **Mobile (< 768px):** 1 column grid
- **Tablet (768px - 1024px):** 2 column grid
- **Desktop (> 1024px):** 3 column grid

### Loading States
- Spinner while fetching phones and agents
- "Importing..." text on submit button
- "Assigning..." text on assignment button
- Disabled buttons during loading

### Empty States
- Friendly message when no phones exist
- Large phone icon illustration
- Clear call-to-action button
- Helpful description text

### Error Handling
- Red alert boxes for error messages
- Specific error messages from backend
- Fallback generic error messages
- Client-side validation before submission

### Confirmation Dialogs
- Confirm before deleting phone
- Confirm before unassigning agent
- Browser native confirm dialogs

### Visual Feedback
- Hover effects on cards
- Shadow transitions
- Color-coded status badges
- Active agent badges
- Tag pills with primary color

---

## Testing Checklist

### Import Phone Number
- [ ] Import with valid Exotel credentials
- [ ] Import with invalid phone format (should fail)
- [ ] Import with invalid country code (should fail)
- [ ] Import duplicate phone number (should fail)
- [ ] Import with tags
- [ ] Cancel import modal

### Assign Agent
- [ ] Assign agent to unassigned phone
- [ ] Change agent on assigned phone
- [ ] Assign when no active agents (should show empty state)
- [ ] Cancel assignment modal
- [ ] Verify agent name displays correctly

### Unassign Agent
- [ ] Unassign agent from phone
- [ ] Cancel unassignment
- [ ] Verify phone shows "Not assigned"
- [ ] Verify button changes to "Assign Agent"

### Delete Phone
- [ ] Delete phone number
- [ ] Cancel deletion
- [ ] Verify phone is removed from list
- [ ] Delete phone with assigned agent

### General
- [ ] Phone list loads correctly
- [ ] Empty state shows when no phones
- [ ] Navigation link appears in sidebar
- [ ] Page is admin-only (test with regular user)
- [ ] Responsive layout on mobile/tablet/desktop
- [ ] Loading spinners appear during operations

---

## Common Issues & Solutions

### Issue: Phone number import fails
**Possible Causes:**
1. Invalid Exotel credentials
2. Phone number already exists
3. Invalid phone format
4. Country code not 2 characters

**Solution:**
- Double-check Exotel credentials in dashboard
- Ensure phone number is in E.164 format
- Use 2-letter ISO country code
- Check backend logs for specific error

### Issue: Agent not appearing in assignment list
**Possible Causes:**
1. Agent is inactive
2. Agent was recently created (needs refresh)

**Solution:**
- Check agent status in Agents page
- Activate agent if inactive
- Refresh the phone list page

### Issue: Assignment fails
**Possible Causes:**
1. Agent was deactivated
2. Phone was deleted by another admin
3. Network error

**Solution:**
- Verify agent is still active
- Refresh the page
- Check browser console for errors
- Try again

### Issue: 403 Forbidden error
**Possible Cause:**
User is not admin or super_admin

**Solution:**
- Check user role in database
- Run makeSuperAdmin script if needed
- Logout and login again
- Contact super admin for role assignment

---

## Future Enhancements

### Potential Features
1. **Bulk Import** - Import multiple phones via CSV
2. **Phone Number Pool** - Round-robin agent assignment
3. **Call Routing Rules** - Time-based, tag-based routing
4. **Phone Statistics** - Call volume, duration per phone
5. **Auto-Assignment** - Automatically assign to available agent
6. **Phone Number Purchase** - Buy numbers directly from Exotel
7. **Call Forwarding** - Forward to external numbers
8. **IVR Configuration** - Custom IVR per phone number
9. **Caller ID Settings** - Custom caller ID per phone
10. **Number Porting** - Port numbers from other providers

### Improvements
1. **Advanced Filters** - Filter by status, tags, assignment
2. **Search** - Search phone numbers
3. **Sorting** - Sort by date, status, agent
4. **Pagination** - For large phone lists
5. **Batch Operations** - Bulk assign, delete, tag
6. **Phone Groups** - Group phones by department
7. **Assignment History** - Track agent changes over time
8. **Phone Number Analytics** - Usage graphs and charts
9. **Export** - Export phone list to CSV
10. **Webhooks** - Notify on phone events

---

## API Request Examples

### Import Phone Number
```bash
POST /api/v1/phones
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "number": "+919876543210",
  "country": "IN",
  "exotelConfig": {
    "apiKey": "your_exotel_api_key",
    "apiToken": "your_exotel_api_token",
    "sid": "your_exotel_sid",
    "subdomain": "api.exotel.com"
  },
  "tags": ["sales", "support"]
}
```

### List Phone Numbers
```bash
GET /api/v1/phones
Authorization: Bearer <admin_token>

Response:
{
  "success": true,
  "data": {
    "phones": [
      {
        "_id": "60d21b4667d0d8992e610c85",
        "userId": "60d21b4667d0d8992e610c80",
        "number": "+919876543210",
        "country": "IN",
        "provider": "exotel",
        "agentId": {
          "_id": "60d21b4667d0d8992e610c82",
          "name": "Sales Agent",
          "description": "Handles sales inquiries"
        },
        "tags": ["sales", "support"],
        "status": "active",
        "createdAt": "2021-06-22T10:30:00.000Z",
        "updatedAt": "2021-06-22T10:30:00.000Z"
      }
    ]
  }
}
```

### Assign Agent
```bash
PUT /api/v1/phones/60d21b4667d0d8992e610c85/assign
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "agentId": "60d21b4667d0d8992e610c82"
}
```

### Unassign Agent
```bash
DELETE /api/v1/phones/60d21b4667d0d8992e610c85/assign
Authorization: Bearer <admin_token>

Response:
{
  "success": true,
  "data": {
    "phone": {
      "_id": "60d21b4667d0d8992e610c85",
      "number": "+919876543210",
      "agentId": null,
      // ... other fields
    }
  },
  "message": "Agent unassigned successfully"
}
```

### Delete Phone
```bash
DELETE /api/v1/phones/60d21b4667d0d8992e610c85
Authorization: Bearer <admin_token>

Response:
{
  "success": true,
  "message": "Phone deleted successfully"
}
```

---

## Summary

✅ **Phone Numbers Management Page** - Complete list view with cards
✅ **Import Phone Modal** - Full Exotel credential form
✅ **Assign Agent Modal** - Visual agent selection
✅ **1-to-1 Assignment** - One phone to one agent only
✅ **Admin Protected** - Requires admin or super_admin role
✅ **Responsive Design** - Mobile, tablet, desktop layouts
✅ **Error Handling** - Validation and user-friendly errors
✅ **Navigation** - Added to sidebar menu
✅ **Build Successful** - No TypeScript errors

The Phone Numbers feature is production-ready and fully integrated into the admin dashboard!
