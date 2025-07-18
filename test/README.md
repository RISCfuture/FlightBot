# FlightBot Test Suite

This directory contains comprehensive tests for the FlightBot application.

## Test Structure

```
test/
├── services/
│   ├── flightService.test.js    # Tests for flight API integration
│   └── flightMonitor.test.js    # Tests for flight tracking logic
├── integration/
│   └── slackCommands.test.js    # Integration tests for Slack commands
├── setup.js                    # Test configuration and setup
├── testRunner.js               # Custom test runner script
└── README.md                   # This file
```

## Running Tests

### Install Dependencies
```bash
npm install
```

### Run All Tests
```bash
npm test
```

### Run Tests with Coverage
```bash
npm run test:coverage
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Run Custom Test Suite
```bash
node test/testRunner.js
```

## Test Categories

### 1. Flight Service Tests (`services/flightService.test.js`)
- **Input Validation**: Tests for flight number and tail number validation
- **Status Formatting**: Tests for status display and emoji mapping
- **Message Formatting**: Tests for Slack message block formatting
- **API Integration**: Tests for real API calls using your AviationStack key
- **Error Handling**: Tests for various error scenarios

### 2. Flight Monitor Tests (`services/flightMonitor.test.js`)
- **Tracking Management**: Tests for starting/stopping flight tracking
- **Multi-channel Support**: Tests for tracking flights across channels
- **Update Logic**: Tests for flight status update detection
- **Error Handling**: Tests for API and Slack errors
- **Update Frequency**: Tests for update timing logic

### 3. Slack Integration Tests (`integration/slackCommands.test.js`)
- **Command Validation**: Tests for input validation
- **Response Format**: Tests for proper Slack message format
- **Input Sanitization**: Tests for handling special characters
- **Error Responses**: Tests for error message formatting

## Test Configuration

### Environment Variables
Tests use `.env.test` file with your actual AviationStack API key for real API testing.

### Mock Strategy
- Unit tests mock external dependencies (Slack API, etc.)
- Integration tests use real API calls where beneficial
- Service tests include both mocked and real API scenarios

## Real API Tests

The test suite includes real API calls to AviationStack using your provided key:
- `7fa2b56e5c0ca29401498f5b2b181125`

These tests will:
- ✅ Test actual flight data retrieval
- ✅ Validate API response format
- ✅ Test error handling with real API errors
- ✅ Verify flight number and tail number lookups

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
npx jest test/services/flightService.test.js

# Run only flight monitor tests
npx jest test/services/flightMonitor.test.js

# Run only integration tests
npx jest test/integration/slackCommands.test.js
```

## Debugging Tests

### Verbose Output
```bash
npm test -- --verbose
```

### Run Specific Test
```bash
npm test -- --testNamePattern="should validate correct flight numbers"
```

### Debug Mode
```bash
npm test -- --detectOpenHandles --forceExit
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