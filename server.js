const express = require("express");
const bodyParser = require("body-parser");
const { PutCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const dynamoDb = require("./aws-config");
require("dotenv").config();
const path = require("path");
const fs = require("fs");
const trackingRoutes = require('./routes/tracking');
const { connectDB, getDB } = require('./mongo-config');
const { ObjectId } = require('mongodb');
const JavaScriptObfuscator = require('javascript-obfuscator');
const geoip = require('geoip-lite');
const UAParser = require('ua-parser-js');

const app = express();
const port = process.env.PORT || 5010;

app.set('trust proxy', true);
app.use(bodyParser.json());

const jsonFilePath = path.join(__dirname, 'trackingUrls.json');

app.use(express.static(path.join(__dirname, "public")));

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ============================================================
// Existing Helper Functions
// ============================================================

const readTrackingUrls = () => {
  const fileContent = fs.readFileSync(jsonFilePath, 'utf8');
  return JSON.parse(fileContent);
};


const getAffiliateUrlByHostNameFind = async (hostname, collectionName) => {
  const db = getDB();
  try {
    const result = await db.collection(collectionName).findOne({ hostname });
    return result ? result.affiliateUrl : '';
  } catch (error) {
    console.error('MongoDB Error:', error);
    return '';
  }
};

const getAffiliateUrlByHostNameFindActive = async (hostname, collectionName) => {
  const db = getDB();
  try {
    const result = await db.collection(collectionName)
      .findOne({ hostname: hostname, status: "active" });
    return result ? result.affiliateUrl : '';
  } catch (error) {
    console.error('MongoDB Error:', error);
    return '';
  }
};

async function canTrackToday(hostname, limit = 1000) {
  console.log("➡️ canTrackToday CALLED with:", hostname);
  if (!hostname) { console.error("❌ Hostname missing"); return false; }

  const db = getDB();
  if (!db) { console.error("❌ DB not initialized"); return false; }

  hostname = hostname.replace(/^www\./, "");
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  console.log("➡️ Tracking key:", hostname, today);

  const result = await db.collection("dailyClickLimits").findOneAndUpdate(
    { hostname, date: today },
    { $inc: { count: 1 }, $setOnInsert: { hostname, date: today } },
    { upsert: true, returnDocument: "after" }
  );
  console.log("➡️ Current result:", result);
  const count = result?.count;
  console.log("➡️ Current count:", count);
  return count <= limit;
}

// ============================================================
// ✅ Obfuscated Core JS — Setup
// ============================================================

let obfuscatedCore = null;

function getObfuscatedCore() {
  if (obfuscatedCore) return obfuscatedCore;

  const coreFilePath = path.join(__dirname, 'private', 'core-logic.js');
  if (!fs.existsSync(coreFilePath)) {
    console.error("❌ private/core-logic.js file nahi mili!");
    return '// Core not found';
  }

  const rawCode = fs.readFileSync(coreFilePath, 'utf8');

  const result = JavaScriptObfuscator.obfuscate(rawCode, {
    compact: true,
    stringArray: true,
    stringArrayEncoding: ['rc4'],
    stringArrayThreshold: 0.75,
    rotateStringArray: true,
    selfDefending: true,
    controlFlowFlattening: true,
  });

  obfuscatedCore = result.getObfuscatedCode();
  console.log("✅ core-logic.js obfuscated and cached");
  return obfuscatedCore;
}

// ============================================================
// Existing Routes
// ============================================================

app.post('/update-url', (req, res) => {
  const { hostname, url } = req.body;
  if (!hostname || !url) {
    return res.status(400).json({ message: 'Hostname and URL are required' });
  }
  const trackingUrls = readTrackingUrls();
  trackingUrls[hostname] = url;
  fs.writeFile(jsonFilePath, JSON.stringify(trackingUrls, null, 2), (err) => {
    if (err) {
      console.error('Error writing to file:', err);
      return res.status(500).json({ message: 'Internal Server Error' });
    }
    return res.status(200).json({ message: 'URL updated successfully' });
  });
});

app.post("/api/save-client-data", async (req, res) => {
  const { clientId, referrer, utmSource, utmMedium, utmCampaign } = req.body;
  const params = {
    TableName: "ClientData",
    Item: { clientId, referrer, utmSource, utmMedium, utmCampaign },
  };
  try {
    await dynamoDb.send(new PutCommand(params));
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error saving data to DynamoDB:", error);
    res.status(500).json({ success: false, error: "Failed to save data" });
  }
});

app.get("/api/get-client-data", async (req, res) => {
  try {
    const params = { TableName: "ClientData" };
    const data = await dynamoDb.send(new ScanCommand(params));
    res.status(200).json(data.Items);
  } catch (error) {
    console.error("Error fetching data from DynamoDB:", error);
    res.status(500).json({ success: false, error: "Failed to fetch data" });
  }
});

app.post("/api/scriptdata", async (req, res) => {
  const { url, referrer, coo, origin } = req.body;
  try {
    const responseUrl = await getAffiliateUrlByHostNameFind(origin, 'HostName');
    console.log('Affiliate URL:', responseUrl);
    res.json({ url: responseUrl });
  } catch (err) {
    console.error("Error saving tracking data:", err);
    res.status(500).json({ error: "Failed to save tracking data" });
  }
});

app.post("/api/track-users", async (req, res) => {
  const { url, referrer, unique_id, origin, payload } = req.body;
  console.log("line => 12.");
  if (!origin || !unique_id) {
    return res.status(400).json({ success: false, reason: "line 29" });
  }
  try {
    console.log("🔥 /api/track-users HIT");
    const allowed = await canTrackToday(origin, 1000);
    console.log("line =136 => ", allowed);
    if (!allowed) {
      return res.json({ success: false, blocked: true, reason: "DAILY_LIMIT_REACHED" });
    }
    const db = getDB();
    if (payload) {
      await db.collection("click_logs").insertOne({
        timestamp: new Date(), origin, url, referrer, unique_id, payload
      });
    }
    const affiliateUrl = await getAffiliateUrlByHostNameFindActive(origin, 'AffiliateUrlsN');
    if (!affiliateUrl) {
      return res.json({ success: false, reason: "affliateUrl not found line 61" });
    }
    res.json({ success: true, affiliate_url: affiliateUrl });
  } catch (err) {
    console.error("Tracking error:", err);
    res.status(500).json({ success: false });
  }
});

app.get('/api/trackdata/err.js', (req, res) => {
  const id = (req.query.id || '').replace(/[^a-zA-Z0-9\-_]/g, '');
  res.type('application/javascript');
  res.send(`console.log("Error ID: ${id}");`);
});

app.get('/api/track_event', (req, res) => {
  const { site_id, user_id, event } = req.query;
  console.log(`Event: ${event}, Site ID: ${site_id}, User ID: ${user_id}`);
  res.setHeader('Content-Type', 'image/gif');
  res.send(Buffer.from('R0lGODlhAQABAPAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64'));
});





app.post('/api/track-user', async (req, res) => {
  const { url, referrer, unique_id, origin } = req.body;
  console.log("Request Data:", req.body);
  if (!url || !unique_id) {
    console.log("Missing Data Error:", { url, unique_id });
    return res.status(400).json({ success: false, error: 'Invalid request data' });
  }
  try {
    const affiliateUrl = await getAffiliateUrlByHostNameFindActive(origin, 'AffiliateUrlsN');
    console.log("🔍 Raw Affiliate URL from DB:", affiliateUrl);
    if (!affiliateUrl) {
      console.log("No affiliate URL found");
      return res.json({ success: false, affiliate_url: "" });
    }
    let finalUrl = affiliateUrl
      .replaceAll('{replace_it}', unique_id)
      .replace('{1}', unique_id)
      .replace('{21}', unique_id);
    console.log("✅ Final URL:", finalUrl);
    res.json({ success: true, affiliate_url: finalUrl });
  } catch (error) {
    console.error("Error in API:", error.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

app.get('/api/fallback-pixel', (req, res) => {
  try {
    const id = req.query.id || 'unknown';
    console.log(`[Fallback Pixel Triggered] ID: ${id}, IP: ${req.ip}`);
    const pixel = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAtUB9oVm0hkAAAAASUVORK5CYII=",
      "base64"
    );
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.status(200).end(pixel);
  } catch (err) {
    console.error("Fallback Pixel Error:", err);
    res.status(500).send("Fallback pixel error");
  }
});


app.get('/getTrackingUrl', async (req, res) => {
  const hostname = req.hostname;
  try {
    const trackingUrl = await getAffiliateUrlByHostNameFind(hostname, 'HostName');
    res.json({ trackingUrl });
  } catch (error) {
    console.error(error);
  }
});


app.get('/api/remarketing.js', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'remarketing.js');
  res.sendFile(filePath);
});

// ============================================================
// ✅ ALLOWED DOMAINS — MongoDB CRUD Functions
// ============================================================

const getAllowedDomains = async () => {
  const db = getDB();
  return await db.collection('AllowedDomains').find({}).toArray();
};

// ============================================================
// ✅ ALLOWED DOMAINS — API Routes
// ============================================================

// GET — Sabhi domains fetch karo
app.get('/api/domains', async (req, res) => {
  try {
    const domains = await getAllowedDomains();
    res.json({ success: true, data: domains });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST — Naya domain add karo (always + cartExtra ke saath)
app.post('/api/domains', async (req, res) => {
  const { domain, always = false, cartExtra = false } = req.body;
  if (!domain) return res.status(400).json({ success: false, error: 'Domain required' });

  try {
    const db = getDB();
    const exists = await db.collection('AllowedDomains').findOne({ domain });
    if (exists) return res.status(400).json({ success: false, error: 'Domain already exists' });

    await db.collection('AllowedDomains').insertOne({
      domain,
      status: 'active',
      always,
      cartExtra,
      createdAt: new Date()
    });
    res.json({ success: true, message: 'Domain added' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH — Domain update karo (status / always / cartExtra — kuch bhi)
app.patch('/api/domains/:id', async (req, res) => {
  const { status, always, cartExtra } = req.body;

  const updateFields = { updatedAt: new Date() };
  if (status !== undefined) {
    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Status active ya inactive hona chahiye' });
    }
    updateFields.status = status;
  }
  if (always !== undefined) updateFields.always = always;
  if (cartExtra !== undefined) updateFields.cartExtra = cartExtra;

  try {
    const db = getDB();
    await db.collection('AllowedDomains').updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: updateFields }
    );
    res.json({ success: true, message: 'Domain updated' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE — Domain permanently delete karo
app.delete('/api/domains/:id', async (req, res) => {
  try {
    const db = getDB();
    await db.collection('AllowedDomains').deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ success: true, message: 'Domain deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});



app.get('/api/domain-config', async (req, res) => {

  const domain = (req.query.d || '')
    .replace(/^www\./, '')
    .toLowerCase()
    .trim();

  try {

    const db = getDB();

    const result = await db.collection('AllowedDomains').findOne({
      domain: domain,
      status: 'active'
    });

    if (!result) {
      return res.json({ success: false });
    }

    res.json({
      success: true,
      config: {
        always: result.always ?? false,
        cartExtra: result.cartExtra ?? false
      }
    });

  } catch (err) {

    console.error(err);

    res.json({ success: false });

  }

});


app.get('/api/core.js', async (req, res) => {

  // ==============================
  // DOMAIN NORMALIZATION
  // ==============================

  const requestedDomain = (req.query.d || '')
    .replace(/^www\./, '')
    .toLowerCase()
    .trim();

  // ==============================
  // REFERER NORMALIZATION
  // ==============================

  const referer = (req.headers.referer || '')
    .toLowerCase()
    .trim();

  try {

    const db = getDB();

    // ==============================
    // DOMAIN VALIDATION
    // ==============================

    const domainAllowed = await db.collection('AllowedDomains').findOne({
      domain: requestedDomain,
      status: 'active'
    });

    // Domain not allowed
    if (!domainAllowed) {

      console.log('❌ Domain not allowed:', requestedDomain);

      res.type('application/javascript');

      return res.send('// Not authorized');
    }

    // ==============================
    // REFERER VALIDATION
    // ==============================

    const validReferer =
      referer.includes(requestedDomain);

    if (!validReferer) {

      console.log('❌ Invalid referer:', referer);

      res.type('application/javascript');

      return res.send('// Invalid referer');
    }

    // ==============================
    // SERVE OBFUSCATED CORE
    // ==============================

    console.log('✅ core.js served for:', requestedDomain);

    res.type('application/javascript');

    res.setHeader('Cache-Control', 'no-store');

    res.setHeader('X-Content-Type-Options', 'nosniff');

    res.send(getObfuscatedCore());

  } catch (err) {

    console.error('❌ core.js serve error:', err);

    res.type('application/javascript');

    res.send('// Error');

  }

});
// ============================================================
// ✅ TRACK CLICK — Clone of track-user with logging
// ============================================================

app.post('/api/track-click', async (req, res) => {
  const { url, referrer, unique_id, origin } = req.body;
  if (!url || !unique_id) {
    return res.status(400).json({ success: false, error: 'Invalid request data' });
  }
  try {
    const affiliateUrl = await getAffiliateUrlByHostNameFindActive(origin, 'AffiliateUrlsN');
    const db = getDB();

    const rawIp = req.headers['cf-connecting-ip'] ||
      req.headers['x-real-ip'] ||
      (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      req.ip || '';
    const ip = rawIp.replace(/^::ffff:/, '').trim();
    const geo = geoip.lookup(ip);
    const ua = new UAParser(req.headers['user-agent']);
    const device = ua.getDevice().type || 'desktop';
    const browser = ua.getBrowser().name || '';
    const os = ua.getOS().name || '';
    const country = geo ? geo.country : '';
    const city = geo ? geo.city : '';

    const logBase = {
      timestamp: new Date(),
      origin: origin || '',
      url,
      referrer: referrer || '',
      unique_id,
      ip,
      country,
      city,
      device,
      browser,
      os
    };

    if (!affiliateUrl) {
      await db.collection('click_logs').insertOne({ ...logBase, affiliate_url: '', success: false });
      return res.json({ success: false, affiliate_url: "" });
    }

    let finalUrl = affiliateUrl
      .replaceAll('{replace_it}', unique_id)
      .replace('{1}', unique_id)
      .replace('{21}', unique_id);

    await db.collection('click_logs').insertOne({ ...logBase, affiliate_url: finalUrl, success: true });

    res.json({ success: true, affiliate_url: finalUrl });
  } catch (error) {
    console.error("Error in track-click:", error.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// ============================================================
// ✅ CLICK STATS — Per site analytics
// ============================================================

app.get('/api/click-stats', async (req, res) => {
  try {
    const db = getDB();
    const { date, site } = req.query;

    const matchStage = {};

    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      matchStage.timestamp = { $gte: start, $lte: end };
    }

    if (site) {
      matchStage.origin = site;
    }

    const perSite = await db.collection('click_logs').aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$origin',
          total: { $sum: 1 },
          success: { $sum: { $cond: ['$success', 1, 0] } },
          failed: { $sum: { $cond: ['$success', 0, 1] } },
          lastClick: { $max: '$timestamp' }
        }
      },
      { $sort: { total: -1 } }
    ]).toArray();

    const byCountry = await db.collection('click_logs').aggregate([
      { $match: { ...matchStage, country: { $ne: '' } } },
      { $group: { _id: '$country', total: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $limit: 10 }
    ]).toArray();

    const byDevice = await db.collection('click_logs').aggregate([
      { $match: matchStage },
      { $group: { _id: '$device', total: { $sum: 1 } } },
      { $sort: { total: -1 } }
    ]).toArray();

    const total = perSite.reduce((acc, s) => acc + s.total, 0);

    res.json({ success: true, total, sites: perSite, byCountry, byDevice });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/click-stats/detail', async (req, res) => {
  try {
    const db = getDB();
    const { site, date, limit = 100 } = req.query;

    const match = {};
    if (site) match.origin = site;
    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      match.timestamp = { $gte: start, $lte: end };
    }

    const logs = await db.collection('click_logs')
      .find(match)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .toArray();

    res.json({ success: true, logs });
  } catch (err) {
    console.error('Detail stats error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// ✅ MANAGE DOMAINS — Admin UI Page
// ============================================================

app.get('/manage-domains', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'manage-domains.html'));
});

app.get('/click-dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'click-dashboard.html'));
});

// ============================================================
// App Routes + Server Start
// ============================================================

app.use('/api', trackingRoutes);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

connectDB()
  .then(() => {
    app.listen(port, () => {
      console.log(`🚀 Server is running on port ${port}`);
    });
  })
  .catch((err) => {
    console.error("❌ Failed to connect to MongoDB:", err);
  });
