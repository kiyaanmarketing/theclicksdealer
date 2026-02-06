const express = require('express');
const router = express.Router();
const { handleTracking } = require('../middleware/trackingController');

// Define POST route to handle tracking data
router.post('/', handleTracking);

module.exports = router;
