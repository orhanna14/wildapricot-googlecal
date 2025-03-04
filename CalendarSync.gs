function cleanDescription(htmlDescription) {
  return htmlDescription
    // Remove white text styling
    .replace(/color:\s*#ffffff/gi, '')
    .replace(/color:\s*white/gi, '')
    .replace(/color:\s*rgb\(255,\s*255,\s*255\)/gi, '')
    .replace(/<font[^>]*color=['"]?#ffffff['"]?[^>]*>/gi, '')
    .replace(/<font[^>]*color=['"]?white['"]?[^>]*>/gi, '')
    .replace(/style=["'][^"']*color:\s*#ffffff[^"']*["']/gi, '')
    .replace(/style=["'][^"']*color:\s*white[^"']*["']/gi, '')
    // Clean up HTML elements
    .replace(/<img[^>]*>/g, '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    // Handle line breaks and paragraphs
    .replace(/<br\s*\/?>\s*<br\s*\/?>/gi, '\n') // Convert double breaks to single newline
    .replace(/<br\s*\/?>/gi, '\n') // Convert single breaks to newline
    .replace(/<p>\s*<\/p>/gi, '') // Remove empty paragraphs
    .replace(/<p[^>]*>/gi, '') // Remove opening p tags
    .replace(/<\/p>/gi, '\n') // Convert closing p tags to single newline
    .replace(/<div[^>]*>/gi, '') // Remove div openings
    .replace(/<\/div>/gi, '\n') // Convert div closings to newline
    // Remove other formatting
    .replace(/<font[^>]*>/gi, '')
    .replace(/<\/font>/gi, '')
    // Clean up whitespace
    .replace(/\n\s*\n\s*\n/g, '\n\n') // Replace triple+ newlines with double
    .replace(/[ \t]+/g, ' ') // Replace multiple spaces/tabs with single space
    .replace(/^\s+|\s+$/gm, '') // Trim each line
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
      
      // Fetch detailed event information
      console.log(`Fetching details for event ID: ${event.Id}`);
      const eventDetailsResponse = UrlFetchApp.fetch(`${waApi.apiUrl}/accounts/${accountId}/Events/${event.Id}`, {
        headers: {
          'Authorization': 'Bearer ' + waApi.accessToken
        }
      });
      
      // Add delay after API call
      Utilities.sleep(100);
      
      const eventDetails = JSON.parse(eventDetailsResponse.getContentText());
      
      // Parse dates using the full ISO string
      const startTime = new Date(event.StartDate);
      const endTime = new Date(event.EndDate);
      
      console.log(`Start time: ${startTime.toISOString()}`);
      console.log(`End time: ${endTime.toISOString()}`);
      
      // Extract and clean the event description
      const description = eventDetails.Details?.DescriptionHtml || 'No description available.';
      const cleanedDescription = cleanDescription(description);
      
      // Create the original event link
      const eventId = event.Id;
      const originalEventUrl = `https://ggtc.org/event-${eventId}`;
      
      // Format registration information
      let registrationInfo = '';
      if (eventDetails.RegistrationEnabled) {
        registrationInfo = `\n\nRegistration Information:`;
        if (eventDetails.RegistrationsLimit) {
          registrationInfo += `\nCapacity: ${eventDetails.RegistrationsLimit}`;
        }
        registrationInfo += `\nConfirmed Registrations: ${eventDetails.ConfirmedRegistrationsCount}`;
        if (eventDetails.WaitListEnabled) {
          registrationInfo += `\nWaitlist: ${eventDetails.WaitListRegistrationCount}`;
        }
      }
      
      // Check if it's a training program
      const isTrainingProgram = title.toLowerCase().includes('training');
      
      // Create event options with enhanced description
      const eventOptions = {
        description: `${cleanedDescription}${registrationInfo}\n\n<b>Original event:</b> <a href='${originalEventUrl}'>${originalEventUrl}</a>`,
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