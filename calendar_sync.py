import os
import time
import json
from datetime import datetime, timedelta
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
import pickle
import requests
import base64
from bs4 import BeautifulSoup

SCOPES = ['https://www.googleapis.com/auth/calendar']
WILD_APRICOT_API_URL = "https://api.wildapricot.org/v2.2"

def clean_description(html_description):
    """Clean the HTML description while preserving bold formatting and removing images."""
    soup = BeautifulSoup(html_description, 'html.parser')
    
    # Remove <img> tags (including base64-encoded images)
    for img in soup.find_all('img'):
        img.decompose()  # Remove the <img> tag
    
    # Remove unwanted tags or attributes (optional)
    for tag in soup(['script', 'style']):  # Remove <script> and <style> tags
        tag.decompose()
    
    # Return the cleaned HTML
    return str(soup)
    

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

    def get_events(self, account_id, cache_file='events_cache.json'):
        """Get all upcoming events with full details, using a cache."""
        if not self.access_token:
            raise Exception("Not authenticated")
            
        headers = {
            "Authorization": f"Bearer {self.access_token}",
            "Accept": "application/json",
            "Content-Type": "application/json"
        }
        
        # Load cached events if the file exists
        if os.path.exists(cache_file):
            with open(cache_file, 'r') as f:
                cached_events = json.load(f)
        else:
            cached_events = {}
        
        # Get events starting from today
        today = datetime.now().strftime("%Y-%m-%d")
        url = f"{WILD_APRICOT_API_URL}/accounts/{account_id}/events?$filter=StartDate ge {today}"
        
        response = requests.get(url, headers=headers)
        if response.status_code != 200:
            raise Exception(f"Failed to get events: {response.text}")
        
        events = response.json()['Events']
        
        # Split events into chunks of 5 for batch requests
        chunk_size = 5
        event_chunks = [events[i:i + chunk_size] for i in range(0, len(events), chunk_size)]
        
        detailed_events = []
        for chunk in event_chunks:
            # Prepare batch request for this chunk
            batch_requests = []
            for i, event in enumerate(chunk):
                event_id = event['Id']
                
                # Use cached event details if available
                if str(event_id) in cached_events:
                    detailed_events.append(cached_events[str(event_id)])
                    continue
                    
                batch_requests.append({
                    "Id": f"event_{event_id}",
                    "Order": i,
                    "PathAndQuery": f"/v2.2/accounts/{account_id}/events/{event_id}",
                    "Method": "GET"
                })
            
            # Send batch request with exponential backoff
            retry_delay = 2  # Initial delay in seconds
            max_retries = 5  # Maximum number of retries
            for attempt in range(max_retries):
                batch_url = f"{WILD_APRICOT_API_URL}/batch"
                batch_response = requests.post(batch_url, headers=headers, json=batch_requests)
                
                if batch_response.status_code == 429:
                    print(f"Rate limit exceeded. Waiting for {retry_delay} seconds before retrying...")
                    time.sleep(retry_delay)
                    retry_delay *= 2  # Double the delay for the next retry
                    continue
                elif batch_response.status_code != 200:
                    raise Exception(f"Failed to process batch request: {batch_response.text}")
                else:
                    break  # Exit the retry loop if the request succeeds
            
            if batch_response.status_code != 200:
                print(f"Failed to fetch details after {max_retries} retries.")
                continue
            
            # Parse batch response
            batch_results = batch_response.json()
            for result in batch_results:
                response_data = result.get('ResponseData')
                if response_data:
                    try:
                        # Parse the JSON-encoded string into a dictionary
                        event_details = json.loads(response_data)
                        detailed_events.append(event_details)
                        cached_events[str(event_details['Id'])] = event_details  # Cache the details
                    except json.JSONDecodeError:
                        print(f"Failed to parse ResponseData for event: {result.get('RequestId', 'Unknown')}")
                else:
                    print(f"Failed to fetch details for event: {result.get('RequestId', 'Unknown')}")
                    print(f"HTTP Status: {result.get('HttpStatusCode')}, Reason: {result.get('HttpReasonPhrase')}")
            
            # Add a delay between batch requests to avoid rate limiting
            time.sleep(4)  # 4-second delay (15 requests per minute)
        
        # Save the updated cache
        with open(cache_file, 'w') as f:
            json.dump(cached_events, f)
        
        return detailed_events

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
    """Sync Wild Apricot events to Google Calendar."""
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
    
    # Create a dictionary of existing events for easy lookup
    existing_event_dict = {
        (event['summary'], event['start'].get('dateTime', event['start'].get('date'))): event['id']
        for event in existing_events.get('items', [])
    }
    
    events_added = 0
    events_updated = 0
    events_skipped = 0
    
    for event in wa_events:
        if not isinstance(event, dict):  # Ensure event is a dictionary
            print(f"Skipping invalid event: {event}")
            continue
            
        title = event.get('Name', 'Untitled Event')
        start_time = event.get('StartDate')
        
        # Apply keyword filter if specified
        if filter_keywords and not any(kw.lower() in title.lower() for kw in filter_keywords):
            events_skipped += 1
            continue
            
        # Extract the event description
        description = event.get('Details', {}).get('DescriptionHtml', 'No description available.')
        print(f"Raw description for '{title}': {description}")  # Debug: Print raw description
        
        if description:
            description = clean_description(description)
            print(f"Cleaned description for '{title}': {description}")  # Debug: Print cleaned description
        
        # Fix the original event link
        event_id = event.get('Id')
        original_event_url = f"https://ggtc.org/event-{event_id}"
        
        # Create Google Calendar event
        calendar_event = {
            'summary': title,
            'description': f"{description}\n\n<b>Original event:</b> <a href='{original_event_url}'>{original_event_url}</a>",
            'start': {
                'dateTime': start_time,
                'timeZone': 'America/Los_Angeles',
            },
            'end': {
                'dateTime': event.get('EndDate'),
                'timeZone': 'America/Los_Angeles',
            },
            'location': event.get('Location', ''),  # Add location if available
            'attendees': [
                {'email': attendee['Email']} for attendee in event.get('Registrants', [])
            ],  # Add attendees if available
            'source': {
                'url': original_event_url,
                'title': 'Wild Apricot - GGTC'
            }
        }
        
        # Check if the event already exists
        event_key = (title, start_time)
        if event_key in existing_event_dict:
            # Update the existing event
            event_id = existing_event_dict[event_key]
            google_service.events().update(
                calendarId=calendar_id,
                eventId=event_id,
                body=calendar_event
            ).execute()
            events_updated += 1
            print(f"Updated event: {title}")
        else:
            # Insert new event
            google_service.events().insert(
                calendarId=calendar_id,
                body=calendar_event
            ).execute()
            events_added += 1
            print(f"Added event: {title}")
    
    return events_added, events_updated, events_skipped

def clear_calendar(google_service, calendar_id):
    """Delete all events from the specified Google Calendar."""
    print("Fetching events to delete...")
    
    # Fetch all events
    page_token = None
    while True:
        events = google_service.events().list(
            calendarId=calendar_id,
            pageToken=page_token
        ).execute()
        
        for event in events.get('items', []):
            event_id = event['id']
            print(f"Deleting event: {event['summary']} (ID: {event_id})")
            google_service.events().delete(
                calendarId=calendar_id,
                eventId=event_id
            ).execute()
        
        page_token = events.get('nextPageToken')
        if not page_token:
            break
    
    print("All events deleted.")

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
    
    # Clear the calendar before syncing
    clear_calendar(google_service, CALENDAR_ID)
    
    # Sync events
    added, updated, skipped = sync_events(wa_api, google_service, CALENDAR_ID, ACCOUNT_ID, FILTER_KEYWORDS)
    print(f"\nSync complete!")
    print(f"  Added: {added} events")
    print(f"  Updated: {updated} events")
    print(f"  Skipped: {skipped} events")

if __name__ == '__main__':
    main()