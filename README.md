# Wild Apricot to Google Calendar Sync

Automatically synchronizes events from Wild Apricot to Google Calendar using Google Apps Script.

## Features
- Syncs events from Wild Apricot to Google Calendar
- Filters for events from the last 7 days and future
- Includes full event descriptions and registration information
- Handles HTML formatting and cleanup
- Batch processing to work within Apps Script limits
- Email notifications for sync progress

## Setup
1. Create a new Google Apps Script project
2. Set up the following script properties:
   - `WILD_APRICOT_API_KEY`: Your Wild Apricot API key
   - `GOOGLE_CALENDAR_ID`: The ID of your target Google Calendar
3. Copy the contents of `Main.gs` and `CalendarSync.gs` to your project
4. Enable the necessary Google Apps Script services:
   - Calendar API
   - Gmail API

## Usage
1. Run `main()` to initialize the sync
2. Run `processBatch()` multiple times to process all events
3. Monitor progress through logs and email notifications

## Functions
- `main()`: Initializes the sync process
- `processBatch()`: Processes a batch of events
- `clearCalendar()`: Clears all events from the calendar
- `resetSyncState()`: Resets the sync state
- `checkTriggers()`: Checks current trigger status

## Contributing
Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License
[MIT](https://choosealicense.com/licenses/mit/)