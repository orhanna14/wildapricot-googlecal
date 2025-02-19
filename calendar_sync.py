import os
from datetime import datetime, timedelta
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
import pickle
import requests
import base64

SCOPES = ['https://www.googleapis.com/auth/calendar']
WILD_APRICOT_API_URL = "https://api.wildapricot.org/v2.2"

class WildApricotAPI:
    def __init__(self, api_key):
        self.api_key = base64.b64encode(f"APIKEY:{api_key}".encode()).decode()
        self.access_token = None
        
    def authenticate(self):
        """Authenticate with Wild Apricot API"""
        auth_url = "https://oauth.wildapricot.org/auth/token"
        headers = {
            "Authorization": f"Basic {self.api_key}",
            "Content-Type": "application/x-www-form-urlencoded",
        }
        data = "grant_type=client_credentials&scope=auto"
        
        response = requests.post(auth_url, headers=headers, data=data)
        if response.status_code == 200:
            self.access_token = response.json()['access_token']
            return True
        return False
        
    def get_events(self, account_id):
        """Get all upcoming events"""
        if not self.access_token:
            raise Exception("Not authenticated")
            
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Accept": "application/json"
        }
        
        # Get events starting from today
        today = datetime.now().strftime("%Y-%m-%d")
        url = f"{WILD_APRICOT_API_URL}/accounts/{account_id}/events?$filter=StartDate ge {today}"
        
        response = requests.get(url, headers=headers)
        if response.status_code == 200:
            return response.json()['Events']
        raise Exception(f"Failed to get events: {response.text}")

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

def sync_events(wa_api, google_service, calendar_id, account_id, filter_keywords=None):
    """Sync Wild Apricot events to Google Calendar"""
    # Get Wild Apricot events
    wa_events = wa_api.get_events(account_id)
    
    # Get existing Google Calendar events
    now = datetime.utcnow().isoformat() + 'Z'
    existing_events = google_service.events().list(
        calendarId=calendar_id,
        timeMin=now,
        singleEvents=True,
        orderBy='startTime'
    ).execute()
    
    # Create a set of tuples containing (title, start_time) for existing events
    existing_event_keys = {
        (event['summary'], event['start'].get('dateTime', event['start'].get('date')))
        for event in existing_events.get('items', [])
    }
    
    events_added = 0
    events_skipped = 0
    
    for event in wa_events:
        title = event['Name']
        start_time = event['StartDate']
        
        # Apply keyword filter if specified
        if filter_keywords and not any(kw.lower() in title.lower() for kw in filter_keywords):
            events_skipped += 1
            continue
            
        # Skip if event already exists (checking both title and start time)
        if (title, start_time) in existing_event_keys:
            events_skipped += 1
            continue
            
        # Create Google Calendar event
        calendar_event = {
            'summary': title,
            'description': f"{event.get('Description', '')}\n\nOriginal event: {event.get('Url', '')}",
            'start': {
                'dateTime': event['StartDate'],
                'timeZone': 'America/Los_Angeles',
            },
            'end': {
                'dateTime': event['EndDate'],
                'timeZone': 'America/Los_Angeles',
            },
            'source': {
                'url': event.get('Url', ''),
                'title': 'Wild Apricot - GGTC'
            }
        }
        
        google_service.events().insert(calendarId=calendar_id, body=calendar_event).execute()
        events_added += 1
        print(f"Added event: {title}")
    
    return events_added, events_skipped

def main():
    # Wild Apricot credentials
    API_KEY = os.getenv("WILD_APRICOT_API_KEY")  # Get this from Wild Apricot
    ACCOUNT_ID = os.getenv("WILD_APRICOT_ACCOUNT_ID")  # Get this from Wild Apricot
    
    # Optional: Filter for specific events
    FILTER_KEYWORDS = None  # Set to list of keywords to filter events
    
    # Initialize Wild Apricot API
    wa_api = WildApricotAPI(API_KEY)
    if not wa_api.authenticate():
        print("Failed to authenticate with Wild Apricot")
        return
        
    # Get Google Calendar service
    google_service = get_google_calendar_service()
    
    # Use your existing calendar ID or create new one
    CALENDAR_ID = os.getenv("GOOGLE_CALENDAR_ID")
    
    # Sync events
    added, skipped = sync_events(wa_api, google_service, CALENDAR_ID, ACCOUNT_ID, FILTER_KEYWORDS)
    print(f"\nSync complete!")
    print(f"  Added: {added} events")
    print(f"  Skipped: {skipped} events")

if __name__ == '__main__':
    main()