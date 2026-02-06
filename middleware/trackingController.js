// Controller for handling tracking data
exports.handleTracking = (req, res) => {
    const { url, referrer, uuid, c: campaignId } = req.body;

    console.log("Tracking Data Received:", { url, referrer, uuid, campaignId });

    if (!campaignId || !uuid) {
        return res.status(400).json({ error: "Invalid data" });
    }

    // Simulate storing the tracking data
    const trackingData = {
        campaignId,
        uuid,
        url,
        referrer,
        timestamp: new Date().toISOString(),
    };

    console.log("Tracking Data Stored:", trackingData);

    // Generate dynamic content
    const dynamicContent = `
        <script>
            console.log("Tracking script executed for campaign ${campaignId}");
        </script>
        <img src="https://example.com/track.gif?uuid=${uuid}&campaign=${campaignId}" alt="Tracking Image" style="width:0;height:0;display:none;">
        <iframe src="https://example.com/tracker?campaign=${campaignId}" style="display:none;"></iframe>
    `;

    // Send the dynamic content back to the client
    return res.json({
        error: "success",
        data: dynamicContent
    });
};
