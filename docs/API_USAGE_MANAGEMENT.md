# API Usage Management

FlightBot includes comprehensive API usage tracking to manage the AviationStack free tier limit of 100 requests per month.

## Features

### 📊 **Usage Tracking**
- Tracks API requests per month
- Automatically resets on the 1st of each month
- Stores usage data in `data/api_usage.json`
- Logs usage milestones (80% warning, 95% critical)

### 🚨 **Graceful Degradation**
- **80% Usage (Warning)**: Shows usage warnings in flight updates
- **95% Usage (Critical)**: Limits tracking to 2 most recent flights
- **100% Usage (Exhausted)**: Stops all API requests until reset

### 💬 **User Communication**
- Clear error messages when API limit is reached
- Proactive warnings in flight updates
- Status command for administrators

## Usage Scenarios

### ✅ **Normal Operation** (< 80% usage)
```
/flightbot UA400
✈️ Now tracking flight UA400
[Flight details with tracking links]
```

### ⚠️ **Warning Level** (80-95% usage)
```
/flightbot UA400
✈️ Now tracking flight UA400
[Flight details]
⚠️ API Usage Warning: 85/100 requests (85%). Monitoring may be reduced to preserve API quota.
```

### 🚨 **Critical Level** (95-100% usage)
```
/flightbot UA400
✈️ Now tracking flight UA400
[Flight details]
🚨 API Usage Critical: 97/100 requests (97%). Flight tracking may be limited.
```

### ❌ **Exhausted** (100% usage)
```
/flightbot UA400
🚨 Monthly API limit reached (100/100 requests used).

Flight tracking is temporarily unavailable. Usage resets on 2025-02-01.
```

## Smart Tracking Behavior

### **Normal Mode**
- Checks all tracked flights every 5 minutes
- No restrictions on new flight tracking

### **Critical Mode** (95%+ usage)
- Only checks 2 most recently tracked flights
- Prioritizes newer flights over older ones
- Logs conservation efforts

### **Exhausted Mode** (100% usage)
- Stops all API requests immediately
- Continues tracking existing flights with cached data
- Provides clear reset date to users

## Admin Commands

### `/flightbot-status` (Admin Only)
Shows detailed usage statistics:
```
📊 FlightBot Status

✅ API Usage: 45/100 requests used (45%). 55 requests remaining.

✈️ Currently tracking: 3 flights
```

### Server Status Endpoint
Visit `https://your-app.onrender.com/` for JSON status:
```json
{
  "status": "FlightBot is running!",
  "trackedFlights": 3,
  "uptime": 1234.5,
  "apiUsage": {
    "used": 45,
    "remaining": 55,
    "limit": 100,
    "percentage": 45,
    "status": "healthy",
    "resetsOn": "2025-02-01"
  }
}
```

## Best Practices

### **For Users**
- Use flight tracking sparingly when warnings appear
- Avoid tracking multiple flights simultaneously near month-end
- Check flight status manually on FlightAware/FR24 if API is exhausted

### **For Administrators**
- Monitor usage via `/flightbot-status` command
- Watch server logs for usage warnings
- Consider upgrading to paid AviationStack plan for heavy usage

## Technical Details

### **Usage Tracking**
- File: `services/apiUsageTracker.js`
- Storage: `data/api_usage.json` (gitignored)
- Resets: Automatic on month change
- Thresholds: 80% warning, 95% critical

### **Request Conservation**
- Pre-flight checks prevent unnecessary API calls
- Smart prioritization in critical mode
- Caching of existing flight data

### **Error Handling**
- Graceful degradation without crashes
- Clear user communication
- Automatic recovery on reset

## Example Usage Patterns

### **Light Usage** (< 50 requests/month)
- Perfect for casual flight tracking
- No restrictions or warnings
- Full functionality available

### **Heavy Usage** (50-80 requests/month)
- Some proactive warnings
- Full functionality maintained
- Monitor usage more closely

### **Critical Usage** (80-100 requests/month)
- Active usage warnings
- Reduced tracking frequency
- Clear communication to users

This system ensures FlightBot remains functional and user-friendly even with strict API limits, providing transparency and graceful degradation when needed.