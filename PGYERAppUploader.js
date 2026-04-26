/*
 * PGYER App Uploader - Using Axios with Buffer for Node.js v24 compatibility
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

module.exports = function (apiKey) {
  const LOG_TAG = '[PGYER APP UPLOADER]';
  let uploadOptions = '';

  this.upload = function (options, callback) {
    if (
      options &&
      ['ios', 'android'].includes(options.buildType) &&
      typeof options.filePath === 'string'
    ) {
      uploadOptions = options;
      if (typeof callback === 'function') {
        uploadToPGYER(callback);
        return null;
      } else {
        return new Promise(function(resolve, reject) {
          uploadToPGYER(function (error, data) {
            if (error === null) {
              return resolve(data);
            }
            return reject(error);
          });
        });
      }
    }

    throw new Error('filePath must be a string');
  }

  async function uploadToPGYER(callback) {
    try {
      // Step 1: Get upload token
      uploadOptions.log && console.log(LOG_TAG + ' [Step 1] Check API Key ... Please Wait ...');
      uploadOptions.log && console.log(LOG_TAG + ' [Step 1] Current time: ' + new Date().toISOString());

      const params = new URLSearchParams();
      params.append('_api_key', apiKey);
      params.append('buildType', uploadOptions.buildType);

      uploadOptions.log && console.log(LOG_TAG + ' [Step 1] Sending token request to pgyer.com...');
      const tokenResponse = await axios.post('https://www.pgyer.com/apiv2/app/getCOSToken',
        params.toString(),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 30000,
          proxy: false // Disable proxy explicitly
        }
      );
      uploadOptions.log && console.log(LOG_TAG + ' [Step 1] Token received, code: ' + tokenResponse.data.code);

      if (tokenResponse.data.code !== 0) {
        callback(new Error(LOG_TAG + ' Service down: ' + tokenResponse.data.code + ': ' + tokenResponse.data.message), null);
        return;
      }

      const uploadData = tokenResponse.data;
      uploadOptions.log && console.log(LOG_TAG + ' [Step 1] Upload endpoint: ' + uploadData.data.endpoint);

      // Step 2: Upload file to COS bucket
      uploadOptions.log && console.log(LOG_TAG + ' [Step 2] Uploading app ... Please Wait ...');
      uploadOptions.log && console.log(LOG_TAG + ' [Step 2] Current time: ' + new Date().toISOString());

      if (!fs.existsSync(uploadOptions.filePath)) {
        callback(new Error(LOG_TAG + ' filePath: file not exist'), null);
        return;
      }

      const statResult = fs.statSync(uploadOptions.filePath);
      if (!statResult || !statResult.isFile()) {
        callback(new Error(LOG_TAG + ' filePath: path not a file'), null);
        return;
      }

      uploadOptions.log && console.log(LOG_TAG + ' [Step 2] File size: ' + statResult.size + ' bytes');

      // Read file into buffer to avoid stream issues
      uploadOptions.log && console.log(LOG_TAG + ' [Step 2] Reading file into buffer...');
      const fileBuffer = fs.readFileSync(uploadOptions.filePath);
      const fileName = path.basename(uploadOptions.filePath);
      uploadOptions.log && console.log(LOG_TAG + ' [Step 2] File loaded: ' + fileBuffer.length + ' bytes');

      const boundary = '----PGYERBoundary' + Date.now();

      // Build multipart body manually
      const fields = {
        'signature': uploadData.data.params.signature,
        'x-cos-security-token': uploadData.data.params['x-cos-security-token'],
        'key': uploadData.data.params.key
      };

      const chunks = [];

      // Add fields
      for (const [key, value] of Object.entries(fields)) {
        chunks.push(Buffer.from(`--${boundary}\r\n`));
        chunks.push(Buffer.from(`Content-Disposition: form-data; name="${key}"\r\n\r\n`));
        chunks.push(Buffer.from(value + '\r\n'));
      }

      // Add file
      chunks.push(Buffer.from(`--${boundary}\r\n`));
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`));
      chunks.push(Buffer.from('Content-Type: application/octet-stream\r\n\r\n'));
      chunks.push(fileBuffer);
      chunks.push(Buffer.from('\r\n'));

      // End boundary
      chunks.push(Buffer.from(`--${boundary}--\r\n`));

      const body = Buffer.concat(chunks);
      uploadOptions.log && console.log(LOG_TAG + ' [Step 2] Request body size: ' + body.length + ' bytes');

      uploadOptions.log && console.log(LOG_TAG + ' [Step 2] Sending POST request to COS endpoint...');
      uploadOptions.log && console.log(LOG_TAG + ' [Step 2] Request start time: ' + new Date().toISOString());
      const uploadResponse = await axios.post(uploadData.data.endpoint, body, {
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length
        },
        timeout: 300000, // 5 minutes
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        validateStatus: (status) => status === 204,
        proxy: false // Disable proxy explicitly
      });
      uploadOptions.log && console.log(LOG_TAG + ' [Step 2] Request completed at: ' + new Date().toISOString());
      uploadOptions.log && console.log(LOG_TAG + ' [Step 2] Response status: ' + uploadResponse.status);

      if (uploadResponse.status !== 204) {
        callback(new Error(LOG_TAG + ' Upload Error! Status: ' + uploadResponse.status), null);
        return;
      }

      // Step 3: Get upload result (with polling)
      uploadOptions.log && console.log(LOG_TAG + ' [Step 3] Getting upload result...');
      uploadOptions.log && console.log(LOG_TAG + ' [Step 3] Current time: ' + new Date().toISOString());
      await new Promise(resolve => setTimeout(resolve, 1000));
      await getUploadResult(uploadData, callback);

    } catch (error) {
      callback(new Error(LOG_TAG + ' ' + (error.message || 'Unknown error')), null);
    }
  }

  async function getUploadResult(uploadData, callback) {
    try {
      uploadOptions.log && console.log(LOG_TAG + ' [Step 3] Checking build info...');
      const resultResponse = await axios.post(
        `https://www.pgyer.com/apiv2/app/buildInfo?_api_key=${apiKey}&buildKey=${uploadData.data.key}`,
        '',
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 30000,
          proxy: false // Disable proxy explicitly
        }
      );

      const responseInfo = resultResponse.data;

      if (responseInfo.code === 1247) {
        uploadOptions.log && console.log(LOG_TAG + ' Parsing App Data ... Please Wait ...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        await getUploadResult(uploadData, callback);
        return;
      }

      if (responseInfo.code !== 0) {
        callback(new Error(LOG_TAG + ' Service down: ' + responseInfo.code + ': ' + responseInfo.message), null);
        return;
      }

      uploadOptions.log && console.log(LOG_TAG + ' [Step 3] Upload completed successfully!');
      uploadOptions.log && console.log(LOG_TAG + ' [Step 3] End time: ' + new Date().toISOString());
      callback(null, responseInfo);
    } catch (error) {
      callback(new Error(LOG_TAG + ' ' + error.message), null);
    }
  }
}
