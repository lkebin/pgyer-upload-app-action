const core = require('@actions/core');
const github = require('@actions/github');
const PGYERAppUploader = require('./PGYERAppUploader');

try {
  const uploadOptions = {
    log: true,
  }

  // Debug: Print environment variables related to proxy
  core.info('[DEBUG] Environment variables:');
  core.info(`[DEBUG] HTTPS_PROXY: ${process.env.HTTPS_PROXY || '(not set)'}`);
  core.info(`[DEBUG] https_proxy: ${process.env.https_proxy || '(not set)'}`);
  core.info(`[DEBUG] HTTP_PROXY: ${process.env.HTTP_PROXY || '(not set)'}`);
  core.info(`[DEBUG] http_proxy: ${process.env.http_proxy || '(not set)'}`);
  core.info(`[DEBUG] NODE_TLS_REJECT_UNAUTHORIZED: ${process.env.NODE_TLS_REJECT_UNAUTHORIZED || '(not set)'}`);
  core.info(`[DEBUG] ALL_PROXY: ${process.env.ALL_PROXY || '(not set)'}`);
  core.info(`[DEBUG] all_proxy: ${process.env.all_proxy || '(not set)'}`);
  core.info(`[DEBUG] no_proxy: ${process.env.no_proxy || '(not set)'}`);

  const apiKey = core.getInput('_api_key', { required: true });
  if (!apiKey) {
    core.warning('apiKey was not set');
  }

  const appFilePath = core.getInput('appFilePath', { required: true });
  if (!appFilePath) {
    core.warning('appFilePath was not set');
  }
  uploadOptions.filePath = appFilePath;

  const otherParams = [
    "buildInstallType",
    "buildPassword",
    "buildUpdateDescription",
    "buildInstallDate",
    "buildInstallStartDate",
    "buildInstallEndDate",
    "buildChannelShortcut"
  ];

  otherParams.forEach(name => {
    let value = core.getInput(name);
    if (value) {
      uploadOptions[[name]] = value;
      core.info(`set ${name}: ${value}`);
    }
  });

  const ext = appFilePath.split('.').pop().toLowerCase();
  if (ext == 'ipa') {
    uploadOptions.buildType = 'ios';
  } else if (ext == 'apk') {
    uploadOptions.buildType = 'android';
  } else {
    core.warning(`Unsupported file type: ${ext}`);
  }

  core.info(`filePath: ${appFilePath}`);
  core.info(`buildType: ${uploadOptions.buildType}`);

  const uploader = new PGYERAppUploader(apiKey);
  uploader.upload(uploadOptions).then(function (info) {
    core.info(`upload success. app info:`);
    core.info(JSON.stringify(info));
  }).catch(function(error) {
    core.setFailed(error.message);
  });

} catch (error) {
  core.setFailed(error.message);
}
