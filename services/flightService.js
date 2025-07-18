const axios = require('axios');

class FlightService {
  constructor() {
    this.apiKey = process.env.AVIATIONSTACK_API_KEY;
    this.baseUrl = 'http://api.aviationstack.com/v1';
  }

  async getFlightData(identifier) {
    try {
      if (!identifier || identifier.length < 2) {
        throw new Error('Flight identifier too short');
      }

      const cleanIdentifier = identifier.replace(/[^A-Z0-9]/gi, '');
      
      if (cleanIdentifier.length < 2) {
        throw new Error('Invalid flight identifier format');
      }

      const isFlightNumber = this.isFlightNumber(cleanIdentifier);
      const isTailNumber = this.isTailNumber(cleanIdentifier);

      if (!isFlightNumber && !isTailNumber) {
        throw new Error('Invalid flight identifier format');
      }

      let params = {
        access_key: this.apiKey,
        limit: 1
      };

      if (isFlightNumber) {
        params.flight_iata = cleanIdentifier.toUpperCase();
      } else if (isTailNumber) {
        params.aircraft_icao = cleanIdentifier.toUpperCase();
      }

      const response = await axios.get(`${this.baseUrl}/flights`, { params });
      
      if (response.data.error) {
        throw new Error(response.data.error.message || 'API Error');
      }
      
      if (response.data.data && response.data.data.length > 0) {
        return response.data.data[0];
      }
      
      return null;
    } catch (error) {
      if (error.response && error.response.status === 401) {
        throw new Error('API authentication failed');
      }
      if (error.response && error.response.status === 429) {
        throw new Error('API rate limit exceeded');
      }
      console.error('Error fetching flight data:', error.message);
      throw error;
    }
  }

  isFlightNumber(identifier) {
    return /^[A-Z]{2,3}[0-9]{1,4}[A-Z]?$/i.test(identifier);
  }

  isTailNumber(identifier) {
    return /^[A-Z]-?[A-Z0-9]{1,5}$/i.test(identifier) || /^N[0-9]{1,5}[A-Z]{0,2}$/i.test(identifier);
  }

  formatFlightMessage(flight) {
    const flightNumber = flight.flight.iata || flight.flight.icao || 'Unknown';
    const airline = flight.airline?.name || 'Unknown Airline';
    const departure = flight.departure?.airport || 'Unknown';
    const arrival = flight.arrival?.airport || 'Unknown';
    const status = this.getStatusEmoji(flight.flight_status) + ' ' + this.formatStatus(flight.flight_status);
    
    const departureTime = flight.departure?.scheduled ? new Date(flight.departure.scheduled).toLocaleString() : 'Unknown';
    const arrivalTime = flight.arrival?.scheduled ? new Date(flight.arrival.scheduled).toLocaleString() : 'Unknown';
    
    const flightAwareLink = `https://flightaware.com/live/flight/${flightNumber}`;
    const fr24Link = `https://www.flightradar24.com/data/flights/${flightNumber.toLowerCase()}`;

    return [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Flight ${flightNumber}* - ${airline}\n${status}`
        }
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*From:*\n${departure}\n*Departure:* ${departureTime}`
          },
          {
            type: 'mrkdwn',
            text: `*To:*\n${arrival}\n*Arrival:* ${arrivalTime}`
          }
        ]
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🔗 Track on <${flightAwareLink}|FlightAware> | <${fr24Link}|Flightradar24>`
        }
      }
    ];
  }

  getStatusEmoji(status) {
    const statusMap = {
      'scheduled': '🕐',
      'active': '✈️',
      'landed': '🛬',
      'cancelled': '❌',
      'incident': '⚠️',
      'diverted': '🔄'
    };
    return statusMap[status] || '❓';
  }

  formatStatus(status) {
    const statusMap = {
      'scheduled': 'Scheduled',
      'active': 'In Flight',
      'landed': 'Landed',
      'cancelled': 'Cancelled',
      'incident': 'Incident',
      'diverted': 'Diverted'
    };
    return statusMap[status] || status;
  }

  shouldSendUpdate(currentStatus, previousStatus) {
    const updateTriggers = [
      'scheduled',
      'active',
      'landed',
      'cancelled',
      'incident',
      'diverted'
    ];
    
    return currentStatus !== previousStatus && updateTriggers.includes(currentStatus);
  }

  getUpdateMessage(flight, updateType) {
    const flightNumber = flight.flight.iata || flight.flight.icao || 'Unknown';
    const status = this.getStatusEmoji(flight.flight_status) + ' ' + this.formatStatus(flight.flight_status);
    
    let message = '';
    
    switch (updateType) {
      case 'active':
        message = `✈️ *Flight ${flightNumber}* is now airborne!`;
        break;
      case 'landed':
        message = `🛬 *Flight ${flightNumber}* has landed safely.`;
        break;
      case 'cancelled':
        message = `❌ *Flight ${flightNumber}* has been cancelled.`;
        break;
      case 'diverted':
        message = `🔄 *Flight ${flightNumber}* has been diverted.`;
        break;
      case 'incident':
        message = `⚠️ *Flight ${flightNumber}* has reported an incident.`;
        break;
      default:
        message = `📡 *Flight ${flightNumber}* status update: ${status}`;
    }
    
    return message;
  }
}

module.exports = FlightService;