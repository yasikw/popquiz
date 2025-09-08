#!/usr/bin/env node

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function runSecurityTests() {
  console.log('🚀 Starting Security Test Suite');
  console.log('================================\n');

  const tests = [
    {
      name: 'Authentication & Authorization Tests',
      file: 'tests/security/auth.test.ts',
      emoji: '🔐'
    },
    {
      name: 'Injection Attack Tests', 
      file: 'tests/security/injection.test.ts',
      emoji: '🛡️'
    },
    {
      name: 'File Upload Security Tests',
      file: 'tests/security/upload.test.ts', 
      emoji: '📤'
    },
    {
      name: 'DoS Resistance Tests',
      file: 'tests/security/dos.test.ts',
      emoji: '⚡'
    }
  ];

  let totalPassed = 0;
  let totalFailed = 0;

  for (const test of tests) {
    console.log(`${test.emoji} Running ${test.name}...`);
    
    try {
      const { stdout, stderr } = await execAsync(`npx jest ${test.file} --verbose --silent`);
      
      if (stdout.includes('PASS')) {
        console.log(`✅ ${test.name} - PASSED`);
        totalPassed++;
      } else {
        console.log(`❌ ${test.name} - FAILED`);
        console.log(`Error: ${stderr}`);
        totalFailed++;
      }
    } catch (error) {
      console.log(`❌ ${test.name} - ERROR`);
      console.log(`Error: ${error.message}`);
      totalFailed++;
    }
    
    console.log('');
  }

  console.log('================================');
  console.log('🏁 Security Test Suite Complete');
  console.log(`✅ Passed: ${totalPassed}`);
  console.log(`❌ Failed: ${totalFailed}`);
  console.log(`📊 Total: ${totalPassed + totalFailed}`);

  if (totalFailed === 0) {
    console.log('🎉 All security tests passed!');
    return 0;
  } else {
    console.log('⚠️ Some security tests failed. Review the output above.');
    return 1;
  }
}

runSecurityTests()
  .then(code => process.exit(code))
  .catch(error => {
    console.error('Test runner error:', error);
    process.exit(1);
  });