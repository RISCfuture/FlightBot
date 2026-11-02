# FlightBot Test Suite

This directory contains comprehensive tests for the FlightBot application.

## Test Structure

```text
test/
├── services/
│   ├── flightService.test.ts    # Tests for flight API integration
│   └── flightMonitor.test.ts    # Tests for flight tracking logic
├── integration/
│   └── commands.test.ts    # Integration tests for Slack commands
├── setup.ts                    # Test configuration and setup
└── README.md                   # This file
```

## Running Tests

### Install Dependencies

```bash
pnpm install
```

### Run All Tests

```bash
pnpm test
```

### Run Tests with Coverage

```bash
pnpm test:coverage
```

### Run Tests in Watch Mode

```bash
pnpm test:watch
```

## Test Categories

### 1. Flight Service Tests (`services/flightService.test.ts`)

- **Input Validation**: Tests for flight number and tail number validation
- **Status Formatting**: Tests for status display and emoji mapping
- **Message Formatting**: Tests for Slack message block formatting
- **API Integration**: Tests for FlightAware lookups using mocked API responses
- **Error Handling**: Tests for various error scenarios

### 2. Flight Monitor Tests (`services/flightMonitor.test.ts`)

- **Tracking Management**: Tests for starting/stopping flight tracking
- **Multi-channel Support**: Tests for tracking flights across channels
- **Update Logic**: Tests for flight status update detection
- **Error Handling**: Tests for API and Slack errors
- **Update Frequency**: Tests for update timing logic

### 3. Slack Integration Tests (`integration/commands.test.ts`)

- **Command Validation**: Tests for input validation
- **Response Format**: Tests for proper Slack message format
- **Input Sanitization**: Tests for handling special characters
- **Error Responses**: Tests for error message formatting

## Test Configuration

### Environment Variables

The test setup loads optional local values from the ignored `.env` file. Unit and integration tests mock provider requests and require no real provider credentials.

### Mock Strategy

- Service tests mock FlightAware requests through Axios.
- Command integration tests inject fake flight services and Slack clients.
- End-to-end tests mock FlightAware HTTP responses and use a dedicated Redis test database.

## API Integration Tests

Flight lookup tests use mocked FlightAware responses for successful lookups, authentication failures, and rate limits. End-to-end setup supplies dummy credentials and blocks external HTTP requests.

End-to-end tests run with `pnpm test:e2e` when `REDIS_TEST_URL` points to a dedicated Redis database with a nonzero database index. The suite flushes that database during setup and skips when the variable is unset.

## Test Output

Tests provide detailed output including:

- ✅ Success indicators for passing tests
- ❌ Clear error messages for failing tests
- ℹ️ Information about API responses
- 📊 Coverage reports
- 🎯 Performance metrics

## Coverage Goals

The test suite aims for:

- **Functions**: 90%+ coverage
- **Lines**: 85%+ coverage
- **Branches**: 80%+ coverage
- **Statements**: 90%+ coverage

## Running Individual Test Files

```bash
# Run only flight service tests
pnpm vitest run test/services/flightService.test.ts

# Run only flight monitor tests
pnpm vitest run test/services/flightMonitor.test.ts

# Run only integration tests
pnpm vitest run test/integration/commands.test.ts
```

## Debugging Tests

### Verbose Output

```bash
pnpm test --reporter=verbose
```

### Run Specific Test

```bash
pnpm test -t "should validate correct flight numbers"
```

## Test Data

Tests use a variety of test data including:

- **Valid flight numbers**: UA400, DL1234, AA123, B61234, WN1234A
- **Valid tail numbers**: N300DG, N123AB, N12345, G-ABCD, D-ABCD
- **Invalid inputs**: Empty strings, special characters, invalid formats
- **Edge cases**: Very long/short inputs, case variations

## Continuous Integration

Tests are designed to run in CI/CD environments and include:

- Proper timeout handling for API calls
- Graceful handling of API rate limits
- Clear exit codes for automation
- Comprehensive error reporting
