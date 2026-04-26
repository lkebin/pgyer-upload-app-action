// Test script for PGYERAppUploader
const PGYERAppUploader = require('./PGYERAppUploader');

// Test with a mock scenario
const apiKey = process.env.PGYER_API_KEY || 'test-api-key';
const testFilePath = process.env.TEST_FILE_PATH;

if (!testFilePath) {
  console.log('Usage: PGYER_API_KEY=xxx TEST_FILE_PATH=/path/to/file node test-upload.js');
  console.log('Skipping test - no TEST_FILE_PATH provided');
  process.exit(0);
}

console.log('Testing PGYER upload with file:', testFilePath);

const uploader = new PGYERAppUploader(apiKey);
uploader.upload({
  buildType: 'android',
  filePath: testFilePath,
  log: true
}).then(function(info) {
  console.log('Success:', info);
}).catch(function(error) {
  console.error('Error:', error.message);
  process.exit(1);
});
