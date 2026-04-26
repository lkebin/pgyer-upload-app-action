/*
 * PGYER App Uploader - Using Axios for better compatibility with Node.js v24
 */

const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

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
      uploadOptions.log && console.log(LOG_TAG + ' Check API Key ... Please Wait ...');

      const tokenResponse = await axios.post('https://www.pgyer.com/apiv2/app/getCOSToken',
        { ...uploadOptions, _api_key: apiKey },
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 30000 // 30 seconds timeout for token request
        }
      );

      if (tokenResponse.data.code !== 0) {
        callback(new Error(LOG_TAG + ' Service down: ' + tokenResponse.data.code + ': ' + tokenResponse.data.message), null);
        return;
      }

      const uploadData = tokenResponse.data;

      // Step 2: Upload file to COS bucket
      uploadOptions.log && console.log(LOG_TAG + ' Uploading app ... Please Wait ...');

      if (!fs.existsSync(uploadOptions.filePath)) {
        callback(new Error(LOG_TAG + ' filePath: file not exist'), null);
        return;
      }

      const statResult = fs.statSync(uploadOptions.filePath);
      if (!statResult || !statResult.isFile()) {
        callback(new Error(LOG_TAG + ' filePath: path not a file'), null);
        return;
      }

      // Create form data with file stream
      const form = new FormData();
      form.append('signature', uploadData.data.params.signature);
      form.append('x-cos-security-token', uploadData.data.params['x-cos-security-token']);
      form.append('key', uploadData.data.params.key);
      form.append('file', fs.createReadStream(uploadOptions.filePath));

      const uploadResponse = await axios.post(uploadData.data.endpoint, form, {
        headers: {
          ...form.getHeaders()
        },
        timeout: 300000, // 5 minutes timeout for file upload
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        // Handle stream errors properly
        validateStatus: (status) => status === 204
      });

      if (uploadResponse.status !== 204) {
        callback(new Error(LOG_TAG + ' Upload Error! Status: ' + uploadResponse.status), null);
        return;
      }

      // Step 3: Get upload result (with polling)
      await new Promise(resolve => setTimeout(resolve, 1000));
      await getUploadResult(uploadData, callback);

    } catch (error) {
      callback(new Error(LOG_TAG + ' ' + (error.message || 'Unknown error')), null);
    }
  }

  async function getUploadResult(uploadData, callback) {
    try {
      const resultResponse = await axios.post(
        `https://www.pgyer.com/apiv2/app/buildInfo?_api_key=${apiKey}&buildKey=${uploadData.data.key}`,
        {},
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 30000
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

      callback(null, responseInfo);
    } catch (error) {
      callback(new Error(LOG_TAG + ' ' + error.message), null);
    }
  }
}
