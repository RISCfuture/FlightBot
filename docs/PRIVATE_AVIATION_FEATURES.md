# Private Aviation Features

FlightBot has been specifically tailored for private aviation and pilot-focused Slack groups with enhanced formatting and relevant information display.

## Key Features for Private Aviation

### 1. **Smart Aircraft Identification**

- **Private aircraft**: Shows tail number (e.g., "N123AB") instead of "Flight N123AB"
- **Commercial flights**: Still shows "Flight UA400" format
- **Automatic detection**: Based on airline information presence

### 2. **Pilot-Friendly Airport Information**

- **ICAO codes first**: Shows KJFK instead of just JFK (pilot preference)
- **Dual codes**: Displays "KJFK / JFK" when both available
- **Full airport names**: "John F Kennedy Intl (KJFK / JFK)"

### 3. **Enhanced Time Information**

- **Time type indicators**: (Actual), (Est), or (Sched)
- **Priority display**: Actual > Estimated > Scheduled
- **Pilot-relevant**: Shows the most current time information

### 4. **Aircraft Details**

- **Registration and type**: "N123AB (C172)"
- **Progress tracking**: Flight progress percentage when available
- **Route information**: Filed flight route when available

## Message Format Examples

### Private Aircraft (Tail Number Search)

```text
*N123AB*
🕐 Scheduled

Departure:
Santa Monica Municipal (KSMO)
Time: 7/25/2025, 2:00:00 PM (Sched)

Arrival:
San Francisco Intl (KSFO / SFO)
Time: 7/25/2025, 3:30:00 PM (Sched)

✈️ Aircraft: N123AB (C172)

🔗 Track on FlightAware | Flightradar24
```

### Commercial Flight (Flight Number Search)

```text
*Flight UA400* - United Airlines
✈️ In Flight

Departure:
Denver Intl (KDEN / DEN)
Time: 7/25/2025, 7:00:00 PM (Actual)

Arrival:
Anchorage Intl (PANC / ANC)
Time: 7/25/2025, 10:34:00 PM (Est)

✈️ Aircraft: N12345 (B38M)
📊 Progress: 45%

🔗 Track on FlightAware | Flightradar24
```

### Private Corporate Flight

```text
*N500XY*
✈️ In Flight

Departure:
Teterboro (KTEB)
Time: 7/25/2025, 9:15:00 AM (Actual)

Arrival:
Nantucket Memorial (KACK)
Time: 7/25/2025, 10:45:00 AM (Est)

✈️ Aircraft: N500XY (G650)
📊 Progress: 67%

🗺️ Route: KTEB DIXIE4 LGA J121 BOTON KACK

🔗 Track on FlightAware | Flightradar24
```

## Update Messages

### Private Aviation Updates

```text
✈️ N123AB is now airborne!
🛬 N500XY has landed safely.
❌ N789CD has been cancelled.
```

### Commercial Aviation Updates  

```text
✈️ Flight UA400 is now airborne!
🛬 Flight DL1234 has landed safely.
❌ Flight AA567 has been cancelled.
```

## Enhanced Information Display

### Airport Codes Priority

1. **ICAO code shown first** (pilot standard)
2. **IATA code added** if different (passenger reference)
3. **Full airport name** for clarity

### Time Display Logic

1. **Actual time** - when aircraft has actually departed/arrived
2. **Estimated time** - updated predictions from ATC
3. **Scheduled time** - original flight plan timing

### Aircraft Information

- **Registration**: N-number or international registration
- **Aircraft type**: ICAO aircraft type code (C172, B38M, G650)
- **Progress**: Real-time flight progress percentage
- **Route**: Filed IFR route when available

## Commands Optimized for Private Aviation

### Tail Number Searches

```text
/flightbot N123AB
/flightbot N500XY  
/flightbot G-ABCD
/flightbot D-EFGH
```

### Flight Number Searches (Commercial)

```text
/flightbot UA400
/flightbot DL1234
/flightbot BA123
```

## Status Indicators

### Flight Status

- 🕐 **Scheduled** - Flight planned but not yet active
- ✈️ **In Flight** - Aircraft is airborne
- 🛬 **Landed** - Flight completed successfully
- ❌ **Cancelled** - Flight cancelled
- 🔄 **Diverted** - Flight diverted to alternate airport

### Special Indicators

- 📊 **Progress** - Shows completion percentage for active flights
- 🗺️ **Route** - Displays filed flight route
- ⚠️ **Incidents** - Any reported flight incidents

## Benefits for Private Aviation Groups

1. **Clean Display**: No airline clutter for private flights
2. **Pilot-Relevant Info**: ICAO codes, aircraft types, routes
3. **Tail Number Focus**: Easy identification of specific aircraft
4. **Time Accuracy**: Shows actual vs. estimated vs. scheduled times
5. **Progress Tracking**: Real-time flight progress updates

## Technical Implementation

The bot automatically detects flight type based on:

- **Airline presence**: Commercial flights have airline data
- **Search method**: Tail number vs. flight number search
- **Aircraft registration**: Matches the searched identifier

This ensures the most relevant information is displayed for each flight type, making the bot valuable for both private aviation operations and commercial flight tracking.
