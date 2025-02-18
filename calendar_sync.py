import feedparser
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
import pickle
import os
from datetime import datetime, timedelta
import dateutil.parser
import requests

SCOPES = ['https://www.googleapis.com/auth/calendar']

def get_google_calendar_service():
    """Sets up and returns the Google Calendar service."""
    creds = None
    if os.path.exists('token.pickle'):
        with open('token.pickle', 'rb') as token:
            creds = pickle.load(token)
    
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(
                'credentials.json', SCOPES)
            creds = flow.run_local_server(port=0)
        with open('token.pickle', 'wb') as token:
            pickle.dump(creds, token)
    
    return build('calendar', 'v3', credentials=creds)

def create_or_get_shared_calendar(service, calendar_name="GGTC Events"):
    """Creates a new shared calendar or gets existing one."""
    # List all calendars to check if ours exists
    calendar_list = service.calendarList().list().execute()
    for calendar_item in calendar_list['items']:
        if calendar_item['summary'] == calendar_name:
            return calendar_item['id']
    
    # If calendar doesn't exist, create it
    calendar = {
        'summary': calendar_name,
        'description': 'Golden Gate Triathlon Club Events',
        'timeZone': 'America/Los_Angeles'
    }
    
    created_calendar = service.calendars().insert(body=calendar).execute()
    calendar_id = created_calendar['id']
    
    print(f"\nCalendar created!")
    print(f"Calendar ID: {calendar_id}")
    print("\nTo share this calendar with others:")
    print("1. Go to Google Calendar in your browser")
    print("2. Find 'GGTC Events' in your calendar list")
    print("3. Click the three dots next to it")
    print("4. Select 'Settings and sharing'")
    print("5. Under 'Share with specific people', click 'Add people'")
    print("6. Enter the email addresses of people you want to share with")
    
    return calendar_id

def sync_wild_apricot_to_google(rss_feed_url, service, calendar_id):
    """
    Syncs events from Wild Apricot RSS feed to Google Calendar.
    
    Args:
        rss_feed_url (str): URL of the Wild Apricot RSS feed
        service: Google Calendar service instance
        calendar_id (str): ID of the Google Calendar to sync to
    """
    # Get the feed content with proper encoding
    response = requests.get(rss_feed_url)
    feed = feedparser.parse(response.content.decode('utf-8', errors='ignore'))
    
    # Get existing events from Google Calendar
    now = datetime.utcnow().isoformat() + 'Z'
    existing_events = service.events().list(
        calendarId=calendar_id,
        timeMin=now,
        singleEvents=True,
        orderBy='startTime'
    ).execute()
    
    # Create a set of existing event titles for deduplication
    existing_titles = {event['summary'] for event in existing_events.get('items', [])}
    
    events_added = 0
    for entry in feed.entries:
        # Skip if event already exists
        if entry.title in existing_titles:
            continue
            
        try:
            # Parse event details
            start_time = dateutil.parser.parse(entry.published)
            
            # Create event object
            event = {
                'summary': entry.title,
                'description': f"{entry.description if 'description' in entry else ''}\n\nOriginal event: {entry.link}",
                'start': {
                    'dateTime': start_time.isoformat(),
                    'timeZone': 'America/Los_Angeles',
                },
                'end': {
                    'dateTime': (start_time + timedelta(hours=2)).isoformat(),
                    'timeZone': 'America/Los_Angeles',
                },
                'source': {
                    'url': entry.link,
                    'title': 'Wild Apricot - GGTC'
                }
            }
            
            # Insert event into Google Calendar
            service.events().insert(calendarId=calendar_id, body=event).execute()
            events_added += 1
            print(f"Added event: {entry.title}")
            
        except Exception as e:
            print(f"Error processing event {entry.title}: {str(e)}")
    
    print(f"\nSync complete! Added {events_added} new events.")

def main():
    RSS_FEED_URL = 'http://ggtc.org/page-7741/EventModule/4246793/RSS'
    
    # Get Google Calendar service
    service = get_google_calendar_service()
    
    # Create or get shared calendar
    calendar_id = create_or_get_shared_calendar(service)
    
    # Sync events
    sync_wild_apricot_to_google(RSS_FEED_URL, service, calendar_id)

if __name__ == '__main__':
    main()