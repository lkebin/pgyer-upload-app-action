/*
 * PGYER App Uploader - Using native https to avoid Node.js v24 issues
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

function makeRequest(url, options, postData) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const reqOptions = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'POST',
      headers: {
        ...options.headers,
        'Connection': 'close' // Force connection close after request
      },
      // Disable keep-alive at agent level
      agent: false
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, data: data });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    if (postData) {
      if (Buffer.isBuffer(postData)) {
        req.write(postData);
      } else {
        req.write(postData);
      }
    }

    req.end();
  });
}

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
      const tokenResponse = await makeRequest(
        'https://www.pgyer.com/apiv2/app/getCOSToken',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        },
        params.toString()
      );

      uploadOptions.log && console.log(LOG_TAG + ' [Step 1] Token response status: ' + tokenResponse.statusCode);
      const tokenData = JSON.parse(tokenResponse.data);

      if (tokenData.code !== 0) {
        callback(new Error(LOG_TAG + ' Service down: ' + tokenData.code + ': ' + tokenData.message), null);
        return;
      }

      uploadOptions.log && console.log(LOG_TAG + ' [Step 1] Upload endpoint: ' + tokenData.data.endpoint);

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

      // Read file into buffer
      uploadOptions.log && console.log(LOG_TAG + ' [Step 2] Reading file into buffer...');
      const fileBuffer = fs.readFileSync(uploadOptions.filePath);
      const fileName = path.basename(uploadOptions.filePath);
      uploadOptions.log && console.log(LOG_TAG + ' [Step 2] File loaded: ' + fileBuffer.length + ' bytes');

      const boundary = '----PGYERBoundary' + Date.now();

      // Build multipart body
      const fields = {
        'signature': tokenData.data.params.signature,
        'x-cos-security-token': tokenData.data.params['x-cos-security-token'],
        'key': tokenData.data.params.key
      };

      const chunks = [];
      for (const [key, value] of Object.entries(fields)) {
        chunks.push(Buffer.from(`--${boundary}\r\n`));
        chunks.push(Buffer.from(`Content-Disposition: form-data; name="${key}"\r\n\r\n`));
        chunks.push(Buffer.from(value + '\r\n'));
      }

      chunks.push(Buffer.from(`--${boundary}\r\n`));
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="file"; filename="${fileName}"\r\n`));
      chunks.push(Buffer.from('Content-Type: application/octet-stream\r\n\r\n'));
      chunks.push(fileBuffer);
      chunks.push(Buffer.from('\r\n'));
      chunks.push(Buffer.from(`--${boundary}--\r\n`));

      const body = Buffer.concat(chunks);
      uploadOptions.log && console.log(LOG_TAG + ' [Step 2] Request body size: ' + body.length + ' bytes');

      uploadOptions.log && console.log(LOG_TAG + ' [Step 2] Sending POST request to COS endpoint...');
      uploadOptions.log && console.log(LOG_TAG + ' [Step 2] Request start time: ' + new Date().toISOString());

      const uploadResponse = await makeRequest(
        tokenData.data.endpoint,
        {
          method: 'POST',
          headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': body.length
          }
        },
        body
      );

      uploadOptions.log && console.log(LOG_TAG + ' [Step 2] Request completed at: ' + new Date().toISOString());
      uploadOptions.log && console.log(LOG_TAG + ' [Step 2] Response status: ' + uploadResponse.statusCode);

      if (uploadResponse.statusCode !== 204) {
        callback(new Error(LOG_TAG + ' Upload Error! Status: ' + uploadResponse.statusCode), null);
        return;
      }

      // Step 3: Get upload result (with polling)
      uploadOptions.log && console.log(LOG_TAG + ' [Step 3] Getting upload result...');
      uploadOptions.log && console.log(LOG_TAG + ' [Step 3] Current time: ' + new Date().toISOString());
      await new Promise(resolve => setTimeout(resolve, 1000));
      await getUploadResult(tokenData, callback);

    } catch (error) {
      callback(new Error(LOG_TAG + ' ' + (error.message || 'Unknown error')), null);
    }
  }

  async function getUploadResult(uploadData, callback) {
    try {
      uploadOptions.log && console.log(LOG_TAG + ' [Step 3] Checking build info...');

      const resultResponse = await makeRequest(
        `https://www.pgyer.com/apiv2/app/buildInfo?_api_key=${apiKey}&buildKey=${uploadData.data.key}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': '0'
          }
        },
        ''
      );

      const responseInfo = JSON.parse(resultResponse.data);

      if (responseInfo.code === 1247) {
        uploadOptions.log && console.log(LOG_TAG + ' Parsing App Data ... Please Wait ...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        return await getUploadResult(uploadData, callback);
      }

      if (responseInfo.code !== 0) {
        return callback(new Error(LOG_TAG + ' Service down: ' + responseInfo.code + ': ' + responseInfo.message), null);
      }

      uploadOptions.log && console.log(LOG_TAG + ' [Step 3] Upload completed successfully!');
      uploadOptions.log && console.log(LOG_TAG + ' [Step 3] End time: ' + new Date().toISOString());
      return callback(null, responseInfo);
    } catch (error) {
      return callback(new Error(LOG_TAG + ' ' + error.message), null);
    }
  }
}
