require('dotenv').config();
const axios = require('axios');

const EMAIL = process.env.EMAIL;
const SECRET = process.env.SECRET;

async function testEndpoint() {
  console.log('Testing local endpoint...\n');
  
  // Test with demo URL
  const payload = {
    email: EMAIL,
    secret: SECRET,
    url: 'https://tds-llm-analysis.s-anand.net/demo'
  };
  
  try {
    console.log('Sending request to http://localhost:3000/solve');
    console.log('Payload:', JSON.stringify(payload, null, 2));
    
    const response = await axios.post('http://localhost:3000/solve', payload, {
      headers: { 'Content-Type': 'application/json' }
    });
    
    console.log('\n✓ Response received:');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('\nCheck server console for quiz solving progress...');
  } catch (error) {
    console.error('✗ Error:', error.response?.data || error.message);
  }
}

async function testInvalidSecret() {
  console.log('\nTesting invalid secret...\n');
  
  const payload = {
    email: EMAIL,
    secret: 'wrong-secret',
    url: 'https://example.com/quiz'
  };
  
  try {
    await axios.post('http://localhost:3000/solve', payload);
  } catch (error) {
    if (error.response?.status === 403) {
      console.log('✓ Correctly rejected invalid secret (403)');
    } else {
      console.log('✗ Unexpected response:', error.response?.status);
    }
  }
}

async function testInvalidJSON() {
  console.log('\nTesting invalid JSON...\n');
  
  try {
    await axios.post('http://localhost:3000/solve', 'invalid json string', {
      headers: { 'Content-Type': 'text/plain' },
      validateStatus: () => true // Don't throw on any status
    });
  } catch (error) {
    // This catches network errors, not HTTP errors
  }
  
  // Try another invalid JSON test
  try {
    const response = await axios.post('http://localhost:3000/solve', '', {
      headers: { 'Content-Type': 'application/json' },
      validateStatus: () => true
    });
    
    if (response.status === 400) {
      console.log('✓ Correctly rejected invalid JSON (400)');
    } else {
      console.log('Response status:', response.status);
    }
  } catch (error) {
    console.log('✓ Server rejected invalid JSON');
  }
}

async function runAllTests() {
  await testEndpoint();
  await new Promise(resolve => setTimeout(resolve, 2000));
  await testInvalidSecret();
  await testInvalidJSON();
  console.log('\n=== Tests complete ===');
}

runAllTests();