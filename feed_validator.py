import feedparser
from datetime import datetime
import dateutil.parser
import requests

def check_feed(url):
    """Check if the RSS feed is accessible and contains event data"""
    print(f"Attempting to read feed from: {url}")
    
    try:
        # First try to get the raw content with requests to handle encoding
        response = requests.get(url)
        response.raise_for_status()  # Raise an exception for bad status codes
        
        # Force UTF-8 encoding
        feed = feedparser.parse(response.content.decode('utf-8', errors='ignore'))
        
        if not feed.entries:
            print("Feed contains no entries")
            return False
            
        print("\nFeed looks valid! Here's a sample of the data:")
        print(f"Feed title: {feed.feed.title if 'title' in feed.feed else 'No title found'}")
        print(f"Number of entries: {len(feed.entries)}")
        
        if feed.entries:
            first_entry = feed.entries[0]
            print("\nFirst entry details:")
            print(f"Title: {first_entry.title if 'title' in first_entry else 'No title'}")
            print(f"Published: {first_entry.published if 'published' in first_entry else 'No date'}")
            print(f"Link: {first_entry.link if 'link' in first_entry else 'No link'}")
            
            # Try to parse the date to make sure it's in a format we can use
            if 'published' in first_entry:
                try:
                    date = dateutil.parser.parse(first_entry.published)
                    print(f"Parsed date: {date}")
                except Exception as e:
                    print(f"Warning: Could not parse the date format: {str(e)}")
        
        return True
        
    except requests.exceptions.RequestException as e:
        print(f"Error accessing the feed: {str(e)}")
        return False
    except Exception as e:
        print(f"Error processing feed: {str(e)}")
        return False

if __name__ == "__main__":
    url = "http://ggtc.org/page-7741/EventModule/4246793/RSS"
    check_feed(url)