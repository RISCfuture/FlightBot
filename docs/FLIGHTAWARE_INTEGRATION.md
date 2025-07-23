# FlightAware AeroAPI Integration

FlightBot now uses FlightAware's AeroAPI v4 for superior flight tracking data quality and reliability.

## Why FlightAware?

- **Higher Data Quality**: More accurate and reliable flight information
- **Better Coverage**: Comprehensive US and international flight data
- **Real-time Updates**: Faster status updates and position data
- **Rich Metadata**: Aircraft types, gates, terminals, progress percentages
- **Professional Grade**: Used by airlines and aviation professionals

## API Configuration

### Environment Variables
```env
FLIGHTAWARE_API_KEY=your-api-key-here
API_MONTHLY_LIMIT=1000
```

### API Limits
- Default: 1000 requests/month (configurable)
- Can be adjusted based on your FlightAware plan
- Professional plans offer much higher limits

## Supported Flight Searches

### Flight Numbers
```
/flightbot UA400
/flightbot DL1234
/flightbot AA123
```

### Aircraft Tail Numbers
```
/flightbot N300DG
/flightbot N123AB
/flightbot G-ABCD
```

## Enhanced Data Features

### Rich Flight Information
- **Aircraft Details**: Registration, type (e.g., B38M, A320)
- **Gate Information**: Departure and arrival gates
- **Terminal Data**: Terminal assignments
- **Progress Tracking**: Flight progress percentage
- **Route Information**: Filed flight route
- **Timing Data**: Scheduled, estimated, and actual times

### Example Response
```json
{
  "flight": {
    "iata": "UA400",
    "icao": "UAL400", 
    "number": "UAL400",
    "flight_number": "400"
  },
  "flight_status": "scheduled",
  "airline": {
    "name": "UAL",
    "iata": "UA",
    "icao": "UAL"
  },
  "departure": {
    "airport": "Denver Intl",
    "iata": "DEN",
    "icao": "KDEN",
    "scheduled": "2025-07-26T01:00:00Z",
    "gate": "B23",
    "terminal": "A"
  },
  "arrival": {
    "airport": "Anchorage Intl", 
    "iata": "ANC",
    "icao": "PANC",
    "scheduled": "2025-07-26T06:34:00Z",
    "gate": "C12",
    "terminal": "C"
  },
  "aircraft": {
    "registration": "N12345",
    "type": "B38M"
  },
  "progress_percent": 0,
  "cancelled": false,
  "diverted": false
}
```

## Status Mapping

FlightAware uses different status values than other APIs:

| FlightAware Status | FlightBot Status | Description |
|-------------------|------------------|-------------|
| Scheduled         | scheduled        | Flight is scheduled |
| Active            | active           | Flight is airborne |
| Completed         | landed           | Flight has landed |
| Cancelled         | cancelled        | Flight cancelled |
| Diverted          | diverted         | Flight diverted |

## API Endpoints Used

### Flight Search
- **Endpoint**: `/flights/{flight_number}`
- **Example**: `/flights/UA400`
- **Returns**: Multiple flights for that identifier

### Aircraft Search  
- **Primary**: `/flights/{tail_number}`
- **Fallback**: `/aircraft/{tail_number}/flights`
- **Example**: `/flights/N300DG`

## Error Handling

### Authentication Errors
```
❌ API authentication failed
```

### Rate Limiting
```
❌ API rate limit exceeded
```

### Invalid Flight Format
```
❌ Invalid format. Please use a flight number (e.g., "UA400") or tail number (e.g., "N300DG").
```

### Flight Not Found
```
❌ Flight "ZZ9999" not found. Please check the flight number or tail number and try again.
```

## Usage Tracking

The bot tracks API usage to prevent exceeding your FlightAware plan limits:

- **Warning at 80%**: Shows usage warnings
- **Critical at 95%**: Limits tracking to 2 most recent flights
- **Exhausted at 100%**: Stops all API requests

## Message Formatting

### Enhanced Display
- **Aircraft Information**: Shows registration and type for tail number searches
- **Gate/Terminal Data**: Displays when available
- **Progress Updates**: Shows flight progress percentage
- **FlightAware Links**: Direct links to detailed tracking

### Example Slack Message
```
✈️ Flight UA400 - UAL
🕐 Scheduled

From:
Denver Intl
Departure: 7/25/2025, 7:00:00 PM

To: 
Anchorage Intl
Arrival: 7/25/2025, 10:34:00 PM

✈️ Aircraft: N12345 (B38M)

🔗 Track on FlightAware | Flightradar24
```

## Advantages Over Previous API

1. **Better Data Quality**: No more incorrect aircraft/flight associations
2. **Richer Metadata**: Gates, terminals, aircraft types, progress
3. **Professional Grade**: Used by industry professionals
4. **Better Error Handling**: Clear API responses and error codes
5. **More Reliable**: Higher uptime and data accuracy

## Testing

Run the test suite to verify FlightAware integration:

```bash
npm test
```

The tests include:
- Real API calls with your FlightAware key
- Flight number validation
- Tail number searches
- Error handling scenarios
- Data normalization verification

FlightAware AeroAPI provides a much more reliable and comprehensive flight tracking experience for your Slack bot users!