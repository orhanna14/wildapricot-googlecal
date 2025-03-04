function cleanDescription(htmlDescription) {
  // Since Apps Script doesn't have BeautifulSoup, we'll use a simpler approach
  // Remove basic HTML tags but preserve formatting
  return htmlDescription
    .replace(/<img[^>]*>/g, '') // Remove img tags
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '') // Remove style tags
    .replace(/<br\s*\/?>/gi, '\n') // Convert <br> to newlines
    .replace(/<p>/gi, '') // Remove opening p tags
    .replace(/<\/p>/gi, '\n') // Convert closing p tags to newlines
    .trim();
}

function syncEvents(waApi, calendarId, accountId, filteredEvents, startIndex = 0) {
  if (!filteredEvents) {
    throw new Error('No events provided to sync');
  }
  
  // Get existing Google Calendar events
  const calendar = CalendarApp.getCalendarById(calendarId);
  const now = new Date();
  const existingEvents = calendar.getEvents(now, new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000));
  
  // Create a map of existing events
  const existingEventMap = new Map(
    existingEvents.map(event => [
      `${event.getTitle()}_${event.getStartTime().toISOString()}`,
      event
    ])
  );
  
  let eventsAdded = 0;
  let eventsUpdated = 0;
  let eventsSkipped = 0;
  let eventsProcessed = 0;
  let lastProcessedIndex = startIndex - 1;
  
  const startTime = new Date();
  
  // Process events starting from the last processed index
  for (let i = startIndex; i < filteredEvents.length; i++) {
    try {
      const event = filteredEvents[i];
      eventsProcessed++;
      lastProcessedIndex = i;
      
      const title = event.Name || 'Untitled Event';
      console.log(`Processing event: ${title}`);
      
      // Parse dates using the full ISO string
      const startTime = new Date(event.StartDate);
      const endTime = new Date(event.EndDate);
      
      console.log(`Start time: ${startTime.toISOString()}`);
      console.log(`End time: ${endTime.toISOString()}`);
      
      // Extract and clean the event description
      const description = event.Details?.DescriptionHtml || 'No description available.';
      const cleanedDescription = cleanDescription(description);
      
      // Create the original event link
      const eventId = event.Id;
      const originalEventUrl = `https://ggtc.org/event-${eventId}`;
      
      // Check if it's a training program
      const isTrainingProgram = title.toLowerCase().includes('training');
      
      // Create event options
      const eventOptions = {
        description: `${cleanedDescription}\n\n<b>Original event:</b> <a href='${originalEventUrl}'>${originalEventUrl}</a>`,
        location: event.Location || ''
      };
      
      // Check if event exists
      const eventKey = `${title}_${startTime.toISOString()}`;
      const existingEvent = existingEventMap.get(eventKey);
      
      if (existingEvent) {
        // Update existing event
        existingEvent.setDescription(eventOptions.description);
        Utilities.sleep(1000);
        
        existingEvent.setLocation(eventOptions.location);
        Utilities.sleep(1000);
        
        if (isTrainingProgram) {
          existingEvent.setShowAsBusy(false);
          Utilities.sleep(1000);
        }
        
        eventsUpdated++;
        console.log(`Updated event: ${title}`);
      } else {
        // Create new event with minimal parameters first
        const newEvent = calendar.createEvent(
          title,
          startTime,
          endTime
        );
        Utilities.sleep(1000);
        
        // Then set additional properties
        newEvent.setDescription(eventOptions.description);
        Utilities.sleep(1000);
        
        newEvent.setLocation(eventOptions.location);
        Utilities.sleep(1000);
        
        if (isTrainingProgram) {
          newEvent.setTransparency(CalendarApp.EventTransparency.TRANSPARENT);
          Utilities.sleep(1000);
        }
        
        eventsAdded++;
        console.log(`Added event: ${title}`);
      }
      
      // Check if we're approaching the time limit
      if (eventsProcessed % 5 === 0) { // Check every 5 events
        const executionTime = new Date().getTime() - startTime.getTime();
        if (executionTime > 300000) { // If we've been running for more than 5 minutes
          console.log('Approaching time limit, stopping here');
          break;
        }
      }
      
    } catch (error) {
      console.error(`Error processing event: ${event?.Name || 'Unknown'}`);
      console.error(`Error details: ${error.message}`);
      console.error(`Stack trace: ${error.stack}`);
      console.error('Event data:', JSON.stringify(event, null, 2));
      eventsSkipped++;
    }
  }
  
  return { 
    eventsAdded, 
    eventsUpdated, 
    eventsSkipped, 
    eventsProcessed,
    lastProcessedIndex 
  };
} 