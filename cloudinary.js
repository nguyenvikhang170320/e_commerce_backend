const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: 'tech-shop',
  api_key: '182388884349315',
  api_secret: 'zopdOK1P-6NvgLbvmKD5_FUgHKQ',
});

module.exports = cloudinary;