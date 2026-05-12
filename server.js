const express = require("express");
const bodyParser = require("body-parser");
const { PutCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const dynamoDb = require("./aws-config");
const cors = require("cors");
const session = require('express-session');
require("dotenv").config();
const corsMiddleware = require("./middleware/corsMiddleware");
const path = require("path");
const fs = require("fs");
const trackingRoutes = require('./routes/tracking');
const { connectDB, getDB } = require('./mongo-config');
const { ObjectId } = require('mongodb');
const JavaScriptObfuscator = require('javascript-obfuscator');

const app = express();
const port = process.env.PORT || 5010;

app.use(corsMiddleware);
app.use(bodyParser.json());
app.use(cors());

const jsonFilePath = path.join(__dirname, 'trackingUrls.json');

app.use(express.static(path.join(__dirname, "public")));

app.use((req, res, next) => {
  res.removeHeader("X-Frame-Options");
  res.setHeader("X-Frame-Options", "ALLOWALL");
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

// ============================================================
// Existing Helper Functions
// ============================================================

const readTrackingUrls = () => {
  const fileContent = fs.readFileSync(jsonFilePath, 'utf8');
  return JSON.parse(fileContent);
};

function getCurrentDateTime() {
  const options = {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
    hour: "numeric", minute: "numeric", second: "numeric",
    timeZone: "Asia/Kolkata",
  };
  return new Date().toLocaleDateString("en-IN", options);
}

const currentDateTime = getCurrentDateTime();

const getAllHostName = async (collectionName) => {
  const db = getDB();
  try {
    return await db.collection(collectionName).find({}).toArray();
  } catch (err) {
    console.error('MongoDB Error:', err);
    return [];
  }
};

const getAffiliateUrlByHostNameFind = async (hostname, TableName) => {
  try {
    const allHostNames = await getAllHostName(TableName);
    const matchedEntry = allHostNames.find((item) => item.hostname === hostname);
    console.log("matchedEntry => ", matchedEntry);
    return matchedEntry ? matchedEntry.affiliateUrl : '';
  } catch (error) {
    console.error('Error finding affiliate URL:', error);
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

const trackingUrls = {};

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
  const id = req.query.id;
  res.type('application/javascript');
  res.send(`console.log("Error ID: ${id}");`);
});

app.get('/api/track_event', (req, res) => {
  const { site_id, user_id, event } = req.query;
  console.log(`Event: ${event}, Site ID: ${site_id}, User ID: ${user_id}`);
  res.setHeader('Content-Type', 'image/gif');
  res.send(Buffer.from('R0lGODlhAQABAPAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64'));
});

app.post("/api/scriptdataredirect", async (req, res) => {
  const { url, referrer, coo, origin } = req.body;
  const responseUrl = trackingUrls[origin] || "";
  try {
    res.redirect(302, responseUrl);
  } catch (err) {
    console.error("Error saving tracking data:", err);
    res.status(500).json({ error: "Failed to save tracking data" });
  }
});

app.post("/api/datascript", async (req, res) => {
  const { url, referrer, coo, origin } = req.body;
  try {
    const affiliateData = await getAffiliateUrlByHostNameFind(origin, 'HostName');
    console.log('Affiliate URL:', affiliateData);
    res.json({ name: 'optimistix', url: affiliateData });
  } catch (err) {
    console.error("Error saving tracking data:", err);
    res.status(500).json({ error: "Failed to save tracking data" });
  }
});

app.use(
  session({
    secret: "tracktraffics",
    resave: false,
    saveUninitialized: true,
    cookie: { secure: true },
  })
);

function checkIframeExecution(req, res, next) {
  if (!req.session.iframeExecuted) {
    req.session.iframeExecuted = true;
    next();
  } else {
    res.send("<html><body><h1>Nothing to display</h1></body></html>");
  }
}

app.post("/api/collect", checkIframeExecution, async (req, res) => {
  console.log("Collected Data:", req.body);
  const { uniqueID, pageURL, referrerURL, userAgent, deviceType } = req.body;
  const trackingData = {
    TableName: "Retargeting",
    Item: { id: uniqueID, url: pageURL, referrer: referrerURL, userAgent, deviceType, timestamp: currentDateTime },
  };
  try {
    await dynamoDb.send(new PutCommand(trackingData));
    res.send(`<html><body>
      <iframe src="" style="width:0;height:0;border:none;position:absolute;top:-9999px;left:-9999px;" sandbox="allow-scripts allow-same-origin"></iframe>
      <script>window.addEventListener('beforeunload', () => { fetch('/clear-session'); });</script>
    </body></html>`);
  } catch (err) {
    console.error("Error saving tracking data:", err);
    return res.status(500).json({ error: "Failed to save tracking data" });
  }
});

app.get("/clear-session", (req, res) => {
  req.session.iframeExecuted = false;
  res.sendStatus(200);
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
    const finalUrl = affiliateUrl.includes('{replace_it}')
      ? affiliateUrl.replaceAll('{replace_it}', unique_id)
      : affiliateUrl + `&aff_click_id=${unique_id}&sub_aff_id=${unique_id}`;
    console.log("✅ Final URL:", finalUrl);
    res.json({ success: true, affiliate_url: affiliateUrl });
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

app.post('/api/userData', async (req, res) => {
  const { url, referrer, unique_id, origin } = req.body;
  if (!url || !unique_id) {
    return res.status(400).json({ success: false, error: 'Invalid request data' });
  }
  try {
    const affiliateData = await getAffiliateUrlByHostNameFind(origin, 'HostName');
    res.json({ success: true, tracking_link: affiliateData });
  } catch (error) {
    console.error(error);
  }
});

app.post('/api/proxy', async (req, res) => {
  try {
    const targetUrl = 'https://nomadz.gotrackier.com/click?campaign_id=3010&pub_id=47';
    const proxyResponse = await fetch(targetUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    const proxyData = await proxyResponse.json();
    console.log("proxyData => ", proxyData);
    res.json({ url: proxyData.redirectUrl });
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).send('Proxy server error');
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

app.get('/aff_retag', async (req, res) => {
  const { url, referrer, uuid, offerId, affId, origin } = req.body;
  console.log("Tracking Data Received:", { url, referrer, uuid, offerId, affId });
  if (!offerId || !uuid) {
    return res.status(400).json({ error: "Invalid data" });
  }
  try {
    const trackingUrl = await getAffiliateUrlByHostNameFind(origin, 'HostName');
    const dynamicContent = `
      <script>console.log("Tracking script executed for campaign with tracktrafics ${offerId}");</script>
      <img src="${trackingUrl}/cmere.gif" alt="Tracking Image" style="width:0;height:0;display:none;">
      <iframe src="${trackingUrl}" style="display:none;"></iframe>`;
    return res.json({ error: "success", data: dynamicContent });
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

// ============================================================
// ✅ DOMAIN CONFIG — core-logic.js ke liye (always + cartExtra)
// ============================================================

app.get('/api/domain-config', async (req, res) => {
  const domain = req.query.d || '';
  try {
    const db = getDB();
    const result = await db.collection('AllowedDomains').findOne({
      domain: domain,
      status: 'active'
    });
    if (!result) return res.json({ success: false });
    res.json({
      success: true,
      config: {
        always: result.always ?? false,
        cartExtra: result.cartExtra ?? false
      }
    });
  } catch (err) {
    res.json({ success: false });
  }
});

// ============================================================
// ✅ CORE.JS — Protected + Obfuscated Script Serving
// ============================================================

app.get('/api/core.js', async (req, res) => {
  const requestedDomain = req.query.d || '';

  try {
    const db = getDB();
    const domainAllowed = await db.collection('AllowedDomains').findOne({
      domain: requestedDomain,
      status: 'active'
    });

    if (!domainAllowed) {
      res.type('application/javascript');
      return res.send('// Not authorized');
    }

    res.type('application/javascript');
    res.setHeader('Cache-Control', 'no-store');
    res.send(getObfuscatedCore());

  } catch (err) {
    console.error("core.js serve error:", err);
    res.type('application/javascript');
    res.send('// Error');
  }
});

// ============================================================
// ✅ MANAGE DOMAINS — Admin UI Page
// ============================================================

app.get('/manage-domains', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'manage-domains.html'));
});

// ============================================================
// App Routes + Server Start
// ============================================================

app.use('/api', trackingRoutes);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

connectDB()
  .then(async () => {
    const allHostNames = await getAllHostName('AffiliateUrlsN');
    console.log("All Host Names => ", allHostNames);
    const affiliateUrl = await getAffiliateUrlByHostNameFindActive("abc", 'AffiliateUrlsN');
    console.log("Affiliate URL:======>>>", affiliateUrl);

    app.listen(port, () => {
      console.log(`🚀 Server is running on port ${port}`);
    });
  })
  .catch((err) => {
    console.error("❌ Failed to connect to MongoDB:", err);
  });
