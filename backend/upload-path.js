const fs = require('fs');
const path = require('path');

function getUploadBaseDir() {
  if (process.env.VERCEL) {
    return path.join('/tmp', 'uploads');
  }

  if (process.env.NODE_ENV === 'production' && fs.existsSync('/app/data')) {
    return '/app/data/uploads';
  }

  return path.join(__dirname, '..', 'uploads');
}

function ensureUploadBaseDir() {
  const uploadBaseDir = getUploadBaseDir();

  if (!fs.existsSync(uploadBaseDir)) {
    fs.mkdirSync(uploadBaseDir, { recursive: true });
  }

  return uploadBaseDir;
}

module.exports = {
  getUploadBaseDir,
  ensureUploadBaseDir,
};
