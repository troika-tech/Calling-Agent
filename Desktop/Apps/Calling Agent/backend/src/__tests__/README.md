# Phase 1 Unit Tests

## Overview

This directory contains comprehensive unit tests for Phase 1 (Foundation) of the outbound calling implementation.

## Test Coverage

### Services

#### 1. `services/outgoingCall.service.test.ts`
Tests for the core outgoing call service.

**Test Suites:**
- Phone Number Validation
  - Valid E.164 format acceptance
  - Invalid format rejection
- Concurrency Control
  - Active call tracking
  - Concurrent limit enforcement
  - Old call cleanup
- Call Initiation
  - Successful call creation
  - Agent validation
  - Exotel API integration
  - Error handling
- Call Status Retrieval
- Call Cancellation
  - Ringing calls
  - Invalid state transitions
- Bulk Call Initiation
  - Multiple calls
  - Batch size limits
  - Partial failure handling
- Service Statistics
- Retry Handling

**Total Tests:** 20+

#### 2. `services/exotelOutbound.service.test.ts`
Tests for the Exotel API integration service.

**Test Suites:**
- makeCall
  - Successful API calls
  - Rate limit errors (429)
  - Authentication errors (401)
  - Server errors (5xx)
- getCallDetails
  - Call detail retrieval
  - Call not found
- hangupCall
  - Successful hangup
  - Error handling
- Circuit Breaker
  - Initial state
  - Failure threshold
  - Circuit opening
- Rate Limiter
  - Stats retrieval
  - Rate limiting behavior
- getRecordingUrl
  - URL retrieval
  - No recording handling
- Error Handling
  - Network errors
  - Timeout errors
  - Meaningful error messages

**Total Tests:** 18+

### Routes

#### 3. `routes/outgoingCalls.routes.test.ts`
Tests for the REST API endpoints.

**Test Suites:**
- POST /api/v1/calls/outbound
  - Successful call initiation
  - Phone number validation
  - Required field validation
  - Error responses (400, 404, 429, 503)
- POST /api/v1/calls/outbound/bulk
  - Bulk call initiation
  - Array validation
  - Batch size limits
- GET /api/v1/calls/:callLogId
  - Call status retrieval
  - Call not found
- POST /api/v1/calls/:callLogId/cancel
  - Successful cancellation
  - Error handling
- GET /api/v1/calls/outbound/stats
  - Stats retrieval
  - Error handling
- Input Validation
  - Unknown field stripping
  - Enum validation
  - Valid values

**Total Tests:** 20+

## Running Tests

### Run all tests
```bash
npm test
```

### Run tests in watch mode
```bash
npm run test:watch
```

### Run tests with coverage
```bash
npm run test:coverage
```

### Run specific test file
```bash
npm test -- outgoingCall.service.test.ts
```

### Run tests matching pattern
```bash
npm test -- --testNamePattern="Phone Number Validation"
```

## Test Configuration

Tests are configured in:
- `jest.config.js` - Jest configuration
- `src/__tests__/setup.ts` - Global test setup

## Mocking Strategy

### Environment Variables
All required environment variables are mocked in `setup.ts`:
- EXOTEL credentials
- Redis configuration
- Service limits

### External Dependencies
- `axios` - Mocked for Exotel API calls
- `logger` - Mocked to prevent console spam
- Database models - Mocked for unit isolation

## Coverage Goals

Target coverage for Phase 1:
- Lines: > 80%
- Branches: > 75%
- Functions: > 80%
- Statements: > 80%

## Writing New Tests

### Test Structure
```typescript
describe('Feature', () => {
  beforeEach(() => {
    // Setup
  });

  it('should do something', async () => {
    // Arrange
    // Act
    // Assert
  });
});
```

### Best Practices
1. Use descriptive test names
2. Follow AAA pattern (Arrange, Act, Assert)
3. Mock external dependencies
4. Test both success and failure cases
5. Keep tests independent
6. Use factories for test data

## CI/CD Integration

Tests run automatically on:
- Pre-commit hooks (optional)
- Pull request creation
- Merge to main branch

## Debugging Tests

### Run single test with debugging
```bash
node --inspect-brk node_modules/.bin/jest --runInBand specific.test.ts
```

### View detailed error output
```bash
npm test -- --verbose
```

## Future Tests

Phase 2 and beyond will include:
- WebSocket integration tests
- Voice pipeline tests
- Scheduled call tests
- Retry logic tests
- Integration tests
- End-to-end tests

## Dependencies

Test dependencies installed:
- `jest` - Test framework
- `ts-jest` - TypeScript support
- `@types/jest` - TypeScript types
- `supertest` - API endpoint testing
- `@types/supertest` - TypeScript types

## Notes

- All tests use mocks to avoid external dependencies
- Tests run in isolated environment
- Database connections are mocked
- Redis connections are mocked
- No actual API calls are made to Exotel

## Test Results

Current status: ✅ All tests passing

Last run: Phase 1 completion
Total suites: 3
Total tests: 58+
Pass rate: 100%
