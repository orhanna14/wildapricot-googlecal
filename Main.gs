// Add these properties to your script properties
const SYNC_STATE_KEY = 'CALENDAR_SYNC_STATE';
const SYNC_PROGRESS_KEY = 'CALENDAR_SYNC_PROGRESS';
const BATCH_SIZE = 20; // Number of events to process per run

function sendEmailNotification(subject, body) {
  try {
    const email = Session.getActiveUser().getEmail();
    MailApp.sendEmail({
      to: email,
      subject: subject,
      body: body,
      htmlBody: body.replace(/\n/g, '<br>')
    });
    console.log(`Email notification sent: ${subject}`);
  } catch (error) {
    console.error('Failed to send email notification:', error);
    // Don't throw the error, just log it
  }
}

function clearCalendar() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const calendarId = scriptProperties.getProperty('GOOGLE_CALENDAR_ID');
  const calendar = CalendarApp.getCalendarById(calendarId);
  
  console.log("Fetching events to delete...");
  
  // Fetch all events
  const events = calendar.getEvents(new Date(0), new Date(2100, 0, 1));
  
  for (const event of events) {
    console.log(`Deleting event: ${event.getTitle()}`);
    event.deleteEvent();
    Utilities.sleep(1000); // Add delay between deletions
  }
  
  console.log("All events deleted.");
}

function main() {
  const startTime = new Date();
  console.log(`\n=== Sync Started at ${startTime.toLocaleString()} ===`);
  
  const scriptProperties = PropertiesService.getScriptProperties();
  const CALENDAR_SYNC_STATE = 'CALENDAR_SYNC_STATE';
  const CALENDAR_PROGRESS_KEY = 'CALENDAR_PROGRESS_KEY';
  
  try {
    // Get API credentials and initialize
    const waApi = getWildApricotAPI();
    const accountId = getAccountId(waApi);
    const calendarId = scriptProperties.getProperty('GOOGLE_CALENDAR_ID');
    
    if (!calendarId) {
      throw new Error('Calendar ID not set in script properties');
    }
    
    // Initialize sync state
    console.log('Fetching events from WildApricot...');
    
    const response = UrlFetchApp.fetch(`${waApi.apiUrl}/accounts/${accountId}/Events?$async=false`, {
      headers: {
        'Authorization': 'Bearer ' + waApi.accessToken
      }
    });
    
    const responseData = JSON.parse(response.getContentText());
    const allEvents = responseData.Events;
    
    // Filter events to only include those from the last 7 days and future
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const filteredEvents = allEvents.filter(event => {
      const eventStartDate = new Date(event.StartDate);
      return eventStartDate >= sevenDaysAgo;
    });
    
    console.log(`Found ${allEvents.length} total events`);
    console.log(`Filtered to ${filteredEvents.length} events (last 7 days and future)`);
    
    // Reset sync state with filtered events count
    const syncState = {
      processedCount: 0,
      totalEvents: filteredEvents.length
    };
    
    // Reset progress
    const progress = {
      lastProcessedIndex: -1
    };
    
    // Store the filtered events for processing
    scriptProperties.setProperty('FILTERED_EVENTS', JSON.stringify(filteredEvents));
    scriptProperties.setProperty(CALENDAR_SYNC_STATE, JSON.stringify(syncState));
    scriptProperties.setProperty(CALENDAR_PROGRESS_KEY, JSON.stringify(progress));
    
    console.log('Sync state initialized.');
    console.log(`Ready to process ${filteredEvents.length} events.`);
    console.log('Run processBatch() to start processing events.');
    
    sendEmailNotification(
      'Calendar Sync Started',
      `Calendar sync initialized successfully.
Found ${allEvents.length} total events.
Filtered to ${filteredEvents.length} events (last 7 days and future).
Run processBatch() to begin processing events.`
    );
    
  } catch (error) {
    console.error('Error during initialization:', error);
    console.error('Stack trace:', error.stack);
    
    sendEmailNotification(
      'Calendar Sync Initialization Error',
      `Failed to initialize calendar sync:
Error: ${error.message}
Stack trace: ${error.stack}`
    );
  }
}

function scheduleNextBatch() {
  try {
    console.log('Setting up next batch trigger...');
    
    // Delete any existing triggers
    const triggers = ScriptApp.getProjectTriggers();
    console.log(`Found ${triggers.length} existing triggers`);
    triggers.forEach(trigger => {
      console.log(`Deleting trigger: ${trigger.getHandlerFunction()}`);
      ScriptApp.deleteTrigger(trigger);
    });
    
    // Create a new trigger to run every minute
    const trigger = ScriptApp.newTrigger('main')
      .timeBased()
      .everyMinutes(1)
      .create();
    
    console.log('Successfully created new trigger');
    const nextRunTime = new Date(Date.now() + 60000);
    console.log(`Next batch should run at: ${nextRunTime.toLocaleString()}`);
    
    // Store the trigger ID in script properties
    const triggerProperties = {
      triggerId: trigger.getUniqueId(),
      createdAt: new Date().toISOString()
    };
    PropertiesService.getScriptProperties().setProperty('SYNC_TRIGGER', JSON.stringify(triggerProperties));
    
    // Send a notification
    sendEmailNotification(
      'Calendar Sync - Next Batch Scheduled',
      `Current batch completed. Next batch should run at ${nextRunTime.toLocaleString()}`
    );
    
  } catch (error) {
    console.error('Failed to schedule next batch:', error);
    console.error('Stack trace:', error.stack);
    sendEmailNotification(
      'Calendar Sync - Scheduling Error',
      `Failed to schedule next batch: ${error.message}`
    );
  }
}

// Add this function to help manage triggers
function clearAllTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => ScriptApp.deleteTrigger(trigger));
  PropertiesService.getScriptProperties().deleteProperty('SYNC_TRIGGER');
  console.log('All triggers cleared');
}

function checkTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  console.log('\nCurrent Triggers:');
  if (triggers.length === 0) {
    console.log('No triggers found');
  } else {
    triggers.forEach(trigger => {
      console.log(`- Function: ${trigger.getHandlerFunction()}`);
      console.log(`  Type: ${trigger.getEventType()}`);
    });
  }
}

function testCalendarAccess() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const calendarId = scriptProperties.getProperty('GOOGLE_CALENDAR_ID');
  
  try {
    const calendar = CalendarApp.getCalendarById(calendarId);
    console.log('Successfully accessed calendar');
    
    // Try to create a test event
    const now = new Date();
    const testEvent = calendar.createEvent(
      'Test Event',
      now,
      new Date(now.getTime() + 60 * 60 * 1000), // 1 hour later
      {
        description: 'This is a test event',
        location: 'Test Location'
      }
    );
    
    console.log('Successfully created test event');
    testEvent.deleteEvent();
    console.log('Successfully deleted test event');
    
    return true;
  } catch (error) {
    console.error('Calendar access test failed:', error);
    return false;
  }
}

function testEventData() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const apiKey = scriptProperties.getProperty('WILD_APRICOT_API_KEY');
  const accountId = scriptProperties.getProperty('WILD_APRICOT_ACCOUNT_ID');
  
  console.log('Testing WildApricot API connection...');
  
  const waApi = new WildApricotAPI(apiKey);
  if (!waApi.authenticate()) {
    console.error("Failed to authenticate with Wild Apricot");
    return;
  }
  
  console.log('Successfully authenticated with WildApricot');
  
  try {
    const events = waApi.getEvents(accountId);
    if (events && events.length > 0) {
      console.log('Found ' + events.length + ' events');
      console.log('\nSample event data:');
      console.log(JSON.stringify(events[0], null, 2));
      
      // Test date parsing
      const sampleEvent = events[0];
      const startDate = new Date(sampleEvent.StartDate);
      const endDate = new Date(sampleEvent.EndDate);
      
      console.log('\nDate parsing test:');
      console.log('Start date:', startDate);
      console.log('End date:', endDate);
      console.log('Start date valid:', !isNaN(startDate.getTime()));
      console.log('End date valid:', !isNaN(endDate.getTime()));
    } else {
      console.log('No events found');
    }
  } catch (error) {
    console.error('Error fetching events:', error);
    console.error('Stack trace:', error.stack);
  }
}

function resetSyncState() {
  const scriptProperties = PropertiesService.getScriptProperties();
  
  // Reset sync state
  scriptProperties.setProperty('CALENDAR_SYNC_STATE', JSON.stringify({
    processedCount: 0,
    totalEvents: 0
  }));
  
  // Reset progress
  scriptProperties.setProperty('CALENDAR_PROGRESS_KEY', JSON.stringify({
    lastProcessedIndex: -1
  }));
  
  console.log('Sync state reset successfully');
}

function getWildApricotAPI() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const apiKey = scriptProperties.getProperty('WILD_APRICOT_API_KEY');
  
  if (!apiKey) {
    throw new Error('WILD_APRICOT_API_KEY not set in script properties');
  }
  
  const apiUrl = 'https://api.wildapricot.org/v2.2';
  const authUrl = 'https://oauth.wildapricot.org/auth/token';
  
  // Get access token
  const response = UrlFetchApp.fetch(authUrl, {
    method: 'post',
    headers: {
      'Authorization': 'Basic ' + Utilities.base64Encode('APIKEY:' + apiKey)
    },
    payload: 'grant_type=client_credentials&scope=auto'
  });
  
  const authResult = JSON.parse(response.getContentText());
  const accessToken = authResult.access_token;
  
  console.log('Successfully authenticated with WildApricot API');
  
  return {
    apiUrl: apiUrl,
    accessToken: accessToken
  };
}

function getAccountId(waApi) {
  const response = UrlFetchApp.fetch(waApi.apiUrl + '/accounts', {
    headers: {
      'Authorization': 'Bearer ' + waApi.accessToken
    }
  });
  
  const accounts = JSON.parse(response.getContentText());
  if (accounts.length === 0) {
    throw new Error('No WildApricot accounts found');
  }
  
  console.log('Successfully retrieved account ID');
  return accounts[0].Id;
}

function processBatch() {
  const startTime = new Date();
  console.log(`\n=== Batch Started at ${startTime.toLocaleString()} ===`);
  
  const scriptProperties = PropertiesService.getScriptProperties();
  const CALENDAR_SYNC_STATE = 'CALENDAR_SYNC_STATE';
  const CALENDAR_PROGRESS_KEY = 'CALENDAR_PROGRESS_KEY';
  
  const syncState = JSON.parse(scriptProperties.getProperty(CALENDAR_SYNC_STATE) || '{"processedCount":0, "totalEvents":0}');
  const progress = JSON.parse(scriptProperties.getProperty(CALENDAR_PROGRESS_KEY) || '{"lastProcessedIndex":-1}');
  // Get the filtered events we stored in main()
  const filteredEvents = JSON.parse(scriptProperties.getProperty('FILTERED_EVENTS') || '[]');
  
  try {
    // Get API credentials
    const waApi = getWildApricotAPI();
    const accountId = getAccountId(waApi);
    const calendarId = scriptProperties.getProperty('GOOGLE_CALENDAR_ID');
    
    if (!calendarId) {
      throw new Error('Calendar ID not set in script properties');
    }
    
    console.log(`Current progress: ${syncState.processedCount}/${syncState.totalEvents} events processed`);
    console.log(`Last processed index: ${progress.lastProcessedIndex}`);
    
    // Process the next batch
    console.log('\nProcessing next batch of events...');
    // Pass the filteredEvents to syncEvents
    const results = syncEvents(waApi, calendarId, accountId, filteredEvents, progress.lastProcessedIndex + 1);
    
    // Update sync state
    syncState.processedCount += results.eventsProcessed;
    progress.lastProcessedIndex = results.lastProcessedIndex;
    
    scriptProperties.setProperty(CALENDAR_SYNC_STATE, JSON.stringify(syncState));
    scriptProperties.setProperty(CALENDAR_PROGRESS_KEY, JSON.stringify(progress));
    
    const progressMessage = `\nBatch Results:
Processed: ${results.eventsProcessed} events
Added: ${results.eventsAdded} events
Updated: ${results.eventsUpdated} events
Skipped: ${results.eventsSkipped} events
Progress: ${syncState.processedCount}/${syncState.totalEvents} events
Time Elapsed: ${Math.round((new Date() - startTime) / 1000)} seconds`;
    
    console.log(progressMessage);
    
    if (syncState.processedCount < syncState.totalEvents) {
      const remainingEvents = syncState.totalEvents - syncState.processedCount;
      console.log(`\nBatch complete. ${remainingEvents} events remaining to process.`);
      console.log('Run processBatch() again to continue processing.');
      
      sendEmailNotification(
        'Calendar Sync Progress',
        `Batch complete.${progressMessage}\n\n${remainingEvents} events remaining to process.`
      );
    } else {
      console.log('\nAll events processed successfully!');
      sendEmailNotification(
        'Calendar Sync Complete',
        `Calendar sync completed successfully!\n\n${progressMessage}`
      );
    }
    
  } catch (error) {
    console.error('\nError during sync:', error);
    console.error('Stack trace:', error.stack);
    
    sendEmailNotification(
      'Calendar Sync Error',
      `An error occurred during calendar sync:
Error: ${error.message}
Stack trace: ${error.stack}`
    );
  }
}

function syncEvents(waApi, calendarId, accountId, filteredEvents, startIndex) {
  console.log(`Processing events starting from index ${startIndex}`);
  
  const batchSize = 10;  // Number of events to process per batch
  const endIndex = Math.min(startIndex + batchSize, filteredEvents.length);
  
  let results = {
    eventsProcessed: 0,
    eventsAdded: 0,
    eventsUpdated: 0,
    eventsSkipped: 0,
    lastProcessedIndex: startIndex - 1
  };
  
  const calendar = CalendarApp.getCalendarById(calendarId);
  if (!calendar) {
    throw new Error('Could not find calendar with ID: ' + calendarId);
  }
  
  // Process events in the current batch
  for (let i = startIndex; i < endIndex; i++) {
    const event = filteredEvents[i];
    console.log(`Processing event ${i + 1}/${filteredEvents.length}: ${event.Name}`);
    
    try {
      // Create event details
      const eventDetails = {
        summary: event.Name,
        location: event.Location || '',
        description: `WildApricot Event: ${event.Url}\n\nRegistrations: ${event.ConfirmedRegistrationsCount} confirmed`,
        start: new Date(event.StartDate),
        end: new Date(event.EndDate)
      };
      
      // Search for existing event
      const existingEvents = calendar.getEvents(
        new Date(event.StartDate),
        new Date(event.EndDate),
        {search: event.Name}
      );
      
      if (existingEvents.length > 0) {
        // Update existing event
        const existingEvent = existingEvents[0];
        existingEvent.setTitle(eventDetails.summary);
        existingEvent.setDescription(eventDetails.description);
        existingEvent.setLocation(eventDetails.location);
        existingEvent.setTime(eventDetails.start, eventDetails.end);
        results.eventsUpdated++;
      } else {
        // Create new event
        calendar.createEvent(
          eventDetails.summary,
          eventDetails.start,
          eventDetails.end,
          {
            description: eventDetails.description,
            location: eventDetails.location
          }
        );
        results.eventsAdded++;
      }
      
      results.eventsProcessed++;
      results.lastProcessedIndex = i;
      
      // Add a small delay to avoid hitting rate limits
      Utilities.sleep(100);
      
    } catch (error) {
      console.error(`Error processing event ${event.Name}:`, error);
      results.eventsSkipped++;
      continue;
    }
  }
  
  return results;
}

function createDailyTrigger() {
  try {
    // Delete any existing triggers first
    console.log('Checking for existing triggers...');
    const triggers = ScriptApp.getProjectTriggers();
    if (triggers.length > 0) {
      console.log(`Found ${triggers.length} existing trigger(s). Removing...`);
      triggers.forEach(trigger => ScriptApp.deleteTrigger(trigger));
    }
    
    // Create a new trigger to run daily
    console.log('Creating new daily trigger...');
    ScriptApp.newTrigger('main')
      .timeBased()
      .everyDays(1)
      .atHour(1)     // Run at 1 AM
      .create();
    
    console.log('Daily sync trigger created successfully');
    
    // Verify the trigger
    const newTriggers = ScriptApp.getProjectTriggers();
    console.log(`\nVerifying trigger setup:`);
    console.log(`Created ${newTriggers.length} trigger(s):`);
    newTriggers.forEach(trigger => {
      console.log(`- Function: ${trigger.getHandlerFunction()}`);
      console.log(`  Type: ${trigger.getEventType()}`);
      console.log(`  Time: Daily at 1 AM`);
    });
    
    // Send confirmation email
    sendEmailNotification(
      'Calendar Sync - Daily Trigger Setup',
      `The Wild Apricot calendar sync has been scheduled to run daily at 1 AM.
      
You will receive email notifications when:
- The daily sync starts
- Each batch of events is processed
- The sync completes
- Any errors occur

No manual intervention is needed unless you receive an error notification.`
    );
    
  } catch (error) {
    console.error('Error setting up trigger:', error);
    console.error('Stack trace:', error.stack);
    
    sendEmailNotification(
      'Calendar Sync - Trigger Setup Error',
      `Failed to set up daily trigger:
Error: ${error.message}
Stack trace: ${error.stack}

Please try running createDailyTrigger() again.`
    );
  }
} 