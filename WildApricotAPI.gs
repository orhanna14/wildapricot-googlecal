class WildApricotAPI {
  constructor(apiKey) {
    this.apiKey = Utilities.base64Encode(`APIKEY:${apiKey}`);
    this.accessToken = null;
    this.baseUrl = "https://api.wildapricot.org/v2.2";
    this.lastRequestTime = 0;
    this.minRequestInterval = 5000; // 5 seconds between requests
  }

  authenticate() {
    const authUrl = "https://oauth.wildapricot.org/auth/token";
    const headers = {
      "Authorization": `Basic ${this.apiKey}`,
      "Content-Type": "application/x-www-form-urlencoded"
    };
    
    const options = {
      method: "post",
      headers: headers,
      payload: "grant_type=client_credentials&scope=auto",
      muteHttpExceptions: true
    };

    const response = UrlFetchApp.fetch(authUrl, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    if (responseCode === 200) {
      const data = JSON.parse(responseText);
      this.accessToken = data.access_token;
      return true;
    }
    
    console.error(`Authentication failed: ${responseCode} - ${responseText}`);
    return false;
  }

  getEventDetails(accountId, event, headers) {
    const url = `${this.baseUrl}/accounts/${accountId}/events/${event.Id}`;
    const options = {
      method: "get",
      headers: headers,
      muteHttpExceptions: true
    };

    // Ensure minimum time between requests
    const now = new Date().getTime();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      Utilities.sleep(this.minRequestInterval - timeSinceLastRequest);
    }
    
    const response = UrlFetchApp.fetch(url, options);
    this.lastRequestTime = new Date().getTime();
    
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    if (responseCode === 429) {
      console.log(`Rate limit exceeded. Waiting for 30 seconds before retrying...`);
      Utilities.sleep(30000); // Wait 30 seconds
      return this.getEventDetails(accountId, event, headers); // Retry once
    } else if (responseCode !== 200) {
      console.error(`Failed to fetch event details: ${responseText}`);
      return null;
    }

    try {
      return JSON.parse(responseText);
    } catch (e) {
      console.error(`Failed to parse event details: ${e.message}`);
      return null;
    }
  }

  getEvents(accountId, cache_file='events_cache.json') {
    if (!this.accessToken) {
      throw new Error("Not authenticated");
    }
    
    const headers = {
      "Authorization": `Bearer ${this.accessToken}`,
      "Accept": "application/json",
      "Content-Type": "application/json"
    };
    
    // Get events starting from 7 days ago to catch recently started programs
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const formattedDate = Utilities.formatDate(sevenDaysAgo, "UTC", "yyyy-MM-dd");
    
    const url = `${this.baseUrl}/accounts/${accountId}/events?$filter=StartDate ge ${formattedDate}`;
    
    const options = {
      method: "get",
      headers: headers,
      muteHttpExceptions: true
    };

    // Ensure minimum time between requests
    const now = new Date().getTime();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      Utilities.sleep(this.minRequestInterval - timeSinceLastRequest);
    }
    
    const response = UrlFetchApp.fetch(url, options);
    this.lastRequestTime = new Date().getTime();
    
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    if (responseCode !== 200) {
      throw new Error(`Failed to get events: ${responseText}`);
    }

    const data = JSON.parse(responseText);
    const events = data.Events;
    
    // Process events one at a time
    const detailedEvents = [];
    for (const event of events) {
      console.log(`Fetching details for event: ${event.Name || 'Unknown'}`);
      const eventDetails = this.getEventDetails(accountId, event, headers);
      if (eventDetails) {
        detailedEvents.push(eventDetails);
      }
      
      // Add a longer delay between events
      Utilities.sleep(10000); // 10-second delay between events
    }
    
    return detailedEvents;
  }
} 