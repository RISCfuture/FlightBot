#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');

console.log('🚀 Starting FlightBot Test Suite');
console.log('==================================');

// Set test environment
process.env.NODE_ENV = 'test';

try {
  // Run all tests
  console.log('\n📋 Running all tests...');
  execSync('npm test', { stdio: 'inherit', cwd: process.cwd() });
  
  console.log('\n✅ All tests passed!');
  console.log('\n📊 Running test coverage...');
  execSync('npm run test:coverage', { stdio: 'inherit', cwd: process.cwd() });
  
  console.log('\n🎉 Test suite completed successfully!');
  
} catch (error) {
  console.error('\n❌ Test suite failed!');
  console.error('Error:', error.message);
  process.exit(1);
}