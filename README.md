# FlightBot - Slack Flight Tracker

A Slack bot that provides real-time flight tracking updates using the AviationStack API. Users can track flights by flight number or aircraft tail number and receive automated updates about flight status changes.

## Features

- **Real-time Flight Tracking**: Track flights by flight number (e.g., `UA400`) or tail number (e.g., `N300DG`)
- **Automated Updates**: Receive notifications for key flight events:
  - Flight becomes active (takeoff)
  - Flight lands
  - Flight diversions
  - Flight cancellations
  - Flight incidents
- **Rich Formatting**: Updates include flight details, times, and links to FlightAware and Flightradar24
- **Error Handling**: Graceful handling of invalid flight numbers and API issues
- **Multi-channel Support**: Track different flights in different channels simultaneously

## Setup

### Prerequisites

- Node.js 18.0.0 or higher
- A Slack workspace with admin privileges
- AviationStack API key (free tier available)

### Environment Variables

Copy `.env.example` to `.env` and fill in the required values:

```env
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
SLACK_SIGNING_SECRET=your-signing-secret-here
SLACK_APP_TOKEN=xapp-your-app-token-here
AVIATIONSTACK_API_KEY=your-aviationstack-api-key-here
PORT=3000
```

### Slack App Setup

1. Go to [Slack API](https://api.slack.com/apps) and create a new app
2. Enable Socket Mode and generate an App Token
3. Add the following Bot Token Scopes:
   - `app_mentions:read`
   - `chat:write`
   - `commands`
4. Create a slash command:
   - Command: `/flightbot`
   - Description: "Track flights by flight number or tail number"
   - Usage Hint: "UA400 or N300DG"
5. Install the app to your workspace

### AviationStack API Setup

1. Sign up at [AviationStack](https://aviationstack.com/)
2. Get your free API key (100 requests/month)
3. Add the API key to your environment variables

## Installation

```bash
npm install
```

## Running the Bot

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

## Usage

In any Slack channel where the bot is installed, use:

```
/flightbot UA400
/flightbot N300DG
/flightbot delta1234
```

The bot will:
1. Validate the flight identifier
2. Fetch current flight information
3. Start monitoring the flight for status changes
4. Send updates to the channel when flight status changes
5. Stop monitoring once the flight has concluded

## Deployment on Render.com

1. Fork this repository
2. Connect your GitHub account to Render.com
3. Create a new Web Service
4. Select your forked repository
5. Use the following settings:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment: `Node`
6. Add your environment variables in the Render dashboard
7. Deploy

The `render.yaml` file is included for easy deployment configuration.

## API Rate Limits

- AviationStack Free Tier: 100 requests/month
- Bot checks for flight updates every 5 minutes
- Each tracked flight uses ~1 request per update check
- Plan accordingly based on your usage

## File Structure

```
flightbot/
├── server.js              # Main application server
├── services/
│   ├── flightService.js   # Flight API integration
│   └── flightMonitor.js   # Flight tracking logic
├── package.json           # Dependencies and scripts
├── render.yaml           # Render.com deployment config
├── .env.example          # Environment variables template
└── README.md            # This file
```

## Error Handling

The bot handles various error scenarios:
- Invalid flight number formats
- Flight not found
- API authentication failures
- API rate limit exceeded
- Network connectivity issues

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details.