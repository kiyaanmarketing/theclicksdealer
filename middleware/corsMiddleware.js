const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();

const allowedOrigins = process.env.ALLOWED_ORIGINS.split(',');

const corsOptionsDelegate = (req, callback) => {
  let corsOptions;
  const origin = req.header('Origin');

  if (allowedOrigins.indexOf(origin) !== -1) {
    corsOptions = { origin: true };
  } else {
    corsOptions = { origin: false };
  }
  callback(null, corsOptions);
};

module.exports = cors(corsOptionsDelegate);
