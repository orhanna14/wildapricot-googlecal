# Wild Apricot to Google Calendar Sync

This script synchronizes events from a Wild Apricot organization to a Google Calendar. It's designed to run daily to keep calendars in sync.

## Setup

1. **Clone the repository**
   ```bash
   git clone [your-repo-url]
   cd [repo-name]
   ```

2. **Create and activate virtual environment**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   python -m pip install -r requirements.txt
   ```

4. **Set up credentials**
   - Create a `.env` file in the root directory with:
     ```
     WILD_APRICOT_API_KEY=your_api_key
     WILD_APRICOT_ACCOUNT_ID=your_account_id
     GOOGLE_CALENDAR_ID=your_calendar_id
     ```
   - Get Google Calendar credentials:
     1. Go to Google Cloud Console
     2. Create a project and enable Google Calendar API
     3. Create OAuth 2.0 credentials
     4. Download as `credentials.json` and place in project root

5. **First run**
   ```bash
   python calendar_sync.py
   ```
   - Follow the Google OAuth flow in your browser
   - This will create `token.pickle` for future authentication

## Running Daily Sync

### Linux/Mac
Add to crontab:
```bash
0 0 cd /path/to/project && /path/to/venv/bin/python calendar_sync.py
```

### Windows
Use Task Scheduler to run daily at midnight:
- Program: `C:\Path\To\venv\Scripts\python.exe`
- Arguments: `C:\Path\To\calendar_sync.py`

## Files
- `calendar_sync.py`: Main script
- `.env`: Environment variables (not in git)
- `credentials.json`: Google OAuth credentials (not in git)
- `token.pickle`: Google OAuth token (not in git)

## Notes
- You may need to modify the script will clear all events and resync to avoid duplicates
- Runs once daily by default
- Logs sync results to console