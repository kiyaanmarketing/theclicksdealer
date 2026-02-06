const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();


const filePath = path.join(__dirname, '../trackingUrls.json');


router.get('/tracking-urls', (req, res) => {
  fs.readFile(filePath, 'utf-8', (err, data) => {
    if (err) {
      return res.status(500).json({ message: 'Error reading tracking URLs' });
    }
    const trackingUrls = JSON.parse(data);
    res.json(trackingUrls);
  });
});


router.post('/add-url', (req, res) => {
  const { hostname, url } = req.body;

  fs.readFile(filePath, 'utf-8', (err, data) => {
    if (err) {
      return res.status(500).json({ message: 'Error reading tracking URLs' });
    }

    const trackingUrls = JSON.parse(data);
    trackingUrls[hostname] = url;

    fs.writeFile(filePath, JSON.stringify(trackingUrls, null, 2), (err) => {
      if (err) {
        return res.status(500).json({ message: 'Error updating tracking URLs' });
      }
      res.json({ message: 'URL added/updated successfully' });
    });
  });
});

router.post('/edit-url', (req, res) => {
  const {editHostname, hostname, url } = req.body;

  fs.readFile(filePath, 'utf-8', (err, data) => {
    if (err) {
      return res.status(500).json({ message: 'Error reading tracking URLs' });
    }

    const trackingUrls = JSON.parse(data);

     if (!trackingUrls[editHostname]) {
        return res.status(404).json({ message: 'Hostname not found' });
      }
      
    if (editHostname === hostname && trackingUrls[editHostname] === url) {
        return res.status(400).json({ message: 'No changes made' });
      }

      if (editHostname === hostname && trackingUrls[editHostname] !== url) {
        trackingUrls[editHostname] = url;
      }

     
     if (editHostname !== hostname && trackingUrls[editHostname] === url) {
       
        if (trackingUrls[hostname]) {
          return res.status(400).json({ message: 'New hostname already exists' });
        }
        trackingUrls[hostname] = trackingUrls[editHostname]; 
        delete trackingUrls[editHostname]; 
      }
    
      if (editHostname !== hostname && trackingUrls[editHostname] !== url) {
      
        if (trackingUrls[hostname]) {
          return res.status(400).json({ message: 'New hostname already exists' });
        }
        trackingUrls[hostname] = url; 
        delete trackingUrls[editHostname]; 
      }

    fs.writeFile(filePath, JSON.stringify(trackingUrls, null, 2), (err) => {
      if (err) {
        return res.status(500).json({ message: 'Error updating tracking URLs' });
      }
      res.json({ message: 'URL updated successfully' });
    });
  });
});

router.delete('/delete-url/:hostname', (req, res) => {
  const hostname = req.params.hostname;

  fs.readFile(filePath, 'utf-8', (err, data) => {
    if (err) {
      return res.status(500).json({ message: 'Error reading tracking URLs' });
    }

    const trackingUrls = JSON.parse(data);
    delete trackingUrls[hostname];

    fs.writeFile(filePath, JSON.stringify(trackingUrls, null, 2), (err) => {
      if (err) {
        return res.status(500).json({ message: 'Error updating tracking URLs' });
      }
      res.json({ message: 'URL deleted successfully' });
    });
  });
});

module.exports = router;
