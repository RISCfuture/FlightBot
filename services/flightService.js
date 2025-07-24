const axios = require('axios');
const ApiUsageTracker = require('./apiUsageTracker');

class FlightService {
  constructor() {
    this.apiKey = process.env.FLIGHTAWARE_API_KEY;
    this.baseUrl = 'https://aeroapi.flightaware.com/aeroapi';
    this.usageTracker = new ApiUsageTracker();
    
    // Set up axios instance with auth
    this.api = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'x-apikey': this.apiKey,
        'Accept': 'application/json'
      }
    });
  }

  async getFlightData(identifier) {
    try {
      if (!identifier || identifier.length < 2) {
        throw new Error('Flight identifier too short');
      }

      // Check API usage before making request
      if (!this.usageTracker.canMakeRequest()) {
        const status = this.usageTracker.getUsageStatus();
        throw new Error(`API usage limit reached (${status.used}/${status.limit}). Resets on ${status.resetsOn}.`);
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

      let flight = null;

      if (isFlightNumber) {
        flight = await this.getFlightByNumber(cleanIdentifier);
      } else if (isTailNumber) {
        flight = await this.getFlightByTailNumber(cleanIdentifier);
      }

      return flight;
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

  async getFlightByNumber(flightNumber) {
    try {
      // AeroAPI v4 endpoint for flight search
      const response = await this.api.get(`/flights/${flightNumber}`);

      this.usageTracker.recordRequest('flight_lookup', flightNumber);

      if (response.data && response.data.flights && response.data.flights.length > 0) {
        // Get the most recent flight
        const flight = response.data.flights[0];
        return this.normalizeFlightData(flight, 'flight_number');
      }

      return null;
    } catch (error) {
      console.error(`Error fetching flight ${flightNumber}:`, error.response?.data || error.message);
      throw error;
    }
  }

  async getFlightByTailNumber(tailNumber) {
    try {
      // AeroAPI v4 endpoint for aircraft search - try both registration and flights endpoint
      let response;
      try {
        // Try flights endpoint first
        response = await this.api.get(`/flights/${tailNumber}`);
      } catch (error) {
        // If that fails, try aircraft registration endpoint
        if (error.response?.status === 400) {
          response = await this.api.get(`/aircraft/${tailNumber}/flights`);
        } else {
          throw error;
        }
      }

      this.usageTracker.recordRequest('tail_lookup', tailNumber);

      if (response.data && response.data.flights && response.data.flights.length > 0) {
        // Get the most recent flight for this aircraft
        const flight = response.data.flights[0];
        return this.normalizeFlightData(flight, 'tail_number');
      }

      return null;
    } catch (error) {
      console.error(`Error fetching flights for ${tailNumber}:`, error.response?.data || error.message);
      throw error;
    }
  }

  normalizeFlightData(flight, searchType) {
    // Normalize FlightAware data to our expected format
    return {
      flight: {
        iata: flight.ident_iata,
        icao: flight.ident_icao,
        number: flight.ident,
        flight_number: flight.flight_number
      },
      flight_status: this.mapFlightAwareStatus(flight.status),
      airline: {
        name: flight.operator || 'Unknown Airline',
        iata: flight.operator_iata,
        icao: flight.operator_icao
      },
      departure: {
        airport: flight.origin?.name || flight.origin?.code_iata || 'Unknown',
        iata: flight.origin?.code_iata,
        icao: flight.origin?.code_icao,
        scheduled: flight.scheduled_out,
        estimated: flight.estimated_out,
        actual: flight.actual_out,
        gate: flight.gate_origin,
        terminal: flight.terminal_origin
      },
      arrival: {
        airport: flight.destination?.name || flight.destination?.code_iata || 'Unknown',
        iata: flight.destination?.code_iata,
        icao: flight.destination?.code_icao,
        scheduled: flight.scheduled_in,
        estimated: flight.estimated_in,
        actual: flight.actual_in,
        gate: flight.gate_destination,
        terminal: flight.terminal_destination
      },
      aircraft: {
        registration: flight.registration,
        type: flight.aircraft_type
      },
      progress_percent: flight.progress_percent,
      route: flight.route,
      cancelled: flight.cancelled,
      diverted: flight.diverted,
      searchType: searchType,
      faFlightId: flight.fa_flight_id
    };
  }

  mapFlightAwareStatus(status) {
    // Map FlightAware statuses to our standard format
    const statusMap = {
      'Scheduled': 'scheduled',
      'Active': 'active',
      'Completed': 'landed',
      'Cancelled': 'cancelled',
      'Diverted': 'diverted'
    };
    
    return statusMap[status] || status.toLowerCase();
  }

  isFlightNumber(identifier) {
    return /^[A-Z]{2,3}[0-9]{1,4}[A-Z]?$/i.test(identifier);
  }

  isTailNumber(identifier) {
    return /^[A-Z]-?[A-Z0-9]{1,5}$/i.test(identifier) || /^N[0-9]{1,5}[A-Z]{0,2}$/i.test(identifier);
  }

  formatFlightMessage(flight, searchedIdentifier = null) {
    const flightNumber = flight.flight.iata || flight.flight.icao || flight.flight.number || 'Unknown';
    const airline = flight.airline?.name;
    const isPrivateAviation = !airline || airline === 'Unknown Airline';
    const isSearchedByTail = searchedIdentifier && this.isTailNumber(searchedIdentifier);
    
    // For private aviation, use tail number or callsign instead of "Flight"
    let displayTitle;
    if (isPrivateAviation && flight.aircraft?.registration) {
      displayTitle = flight.aircraft.registration;
    } else if (isPrivateAviation && isSearchedByTail) {
      displayTitle = searchedIdentifier.toUpperCase();
    } else if (isPrivateAviation) {
      displayTitle = flightNumber;
    } else {
      displayTitle = `Flight ${flightNumber}`;
    }
    
    const status = this.getStatusEmoji(flight.flight_status) + ' ' + this.formatStatus(flight.flight_status);
    
    // Build header - only show airline for commercial flights
    let headerText = `*${displayTitle}*`;
    if (!isPrivateAviation) {
      headerText += ` - ${airline}`;
    }
    headerText += `\n${status}`;
    
    // Enhanced airport information for pilots
    const departure = this.formatAirportInfo(flight.departure);
    const arrival = this.formatAirportInfo(flight.arrival);
    
    const departureTime = this.formatFlightTime(flight.departure);
    const arrivalTime = this.formatFlightTime(flight.arrival);
    
    // Check if this is a grounded/unknown status flight
    const isGrounded = flight.flight_status === 'result unknown' || 
                      flight.flight_status === 'unknown' ||
                      (departure === 'Unknown' && arrival === 'Unknown');
    
    // Use the registration/tail number for links when available
    const linkIdentifier = flight.aircraft?.registration || searchedIdentifier || flightNumber;
    const flightAwareLink = `https://flightaware.com/live/flight/${linkIdentifier}`;
    const fr24Link = `https://www.flightradar24.com/data/flights/${linkIdentifier.toLowerCase()}`;

    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: headerText
        }
      }
    ];
    
    // Only show departure/arrival for active flights
    if (!isGrounded) {
      blocks.push({
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Departure:*\n${departure}\n*Time:* ${departureTime}`
          },
          {
            type: 'mrkdwn',
            text: `*Arrival:*\n${arrival}\n*Time:* ${arrivalTime}`
          }
        ]
      });
    } else {
      // For grounded aircraft, show helpful message
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `📍 *Status:* Aircraft is currently not in flight\n\n_Check the tracking links below for flight history and future scheduled flights._`
        }
      });
    }

    // Aircraft and flight details section
    const aircraftInfo = this.formatAircraftInfo(flight, searchedIdentifier);
    if (aircraftInfo) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: aircraftInfo
        }
      });
    }

    // Add route information if available
    if (flight.route) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🗺️ *Route:* ${flight.route}`
        }
      });
    }

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🔗 Track on <${flightAwareLink}|FlightAware> | <${fr24Link}|Flightradar24>`
      }
    });

    return blocks;
  }

  formatAirportInfo(airportData) {
    if (!airportData) return 'Unknown';
    
    const name = airportData.airport || 'Unknown Airport';
    const icao = airportData.icao;
    const iata = airportData.iata;
    
    // Show ICAO first (pilot preference), then IATA if different
    let codes = '';
    if (icao) {
      codes = icao;
      if (iata && iata !== icao) {
        codes += ` / ${iata}`;
      }
    } else if (iata) {
      codes = iata;
    }
    
    return codes ? `${name} (${codes})` : name;
  }

  formatFlightTime(timeData) {
    if (!timeData) return 'Unknown';
    
    // Prefer actual > estimated > scheduled
    const time = timeData.actual || timeData.estimated || timeData.scheduled;
    if (!time) return 'Unknown';
    
    const date = new Date(time);
    const timeString = date.toLocaleString();
    
    // Add time type indicator for pilots
    if (timeData.actual) {
      return `${timeString} (Actual)`;
    } else if (timeData.estimated) {
      return `${timeString} (Est)`;
    } else {
      return `${timeString} (Sched)`;
    }
  }

  formatAircraftInfo(flight, searchedIdentifier) {
    const parts = [];
    
    // Aircraft registration and type
    if (flight.aircraft?.registration) {
      let aircraftText = `✈️ *Aircraft:* ${flight.aircraft.registration}`;
      if (flight.aircraft.type) {
        aircraftText += ` (${flight.aircraft.type})`;
      }
      parts.push(aircraftText);
    } else if (searchedIdentifier && this.isTailNumber(searchedIdentifier) && flight.aircraft?.type) {
      parts.push(`✈️ *Aircraft:* ${searchedIdentifier.toUpperCase()} (${flight.aircraft.type})`);
    }
    
    // Progress information
    if (flight.progress_percent && flight.progress_percent > 0) {
      parts.push(`📊 *Progress:* ${flight.progress_percent}%`);
    }
    
    // Flight status indicators
    const statusIndicators = [];
    if (flight.cancelled) statusIndicators.push('❌ Cancelled');
    if (flight.diverted) statusIndicators.push('🔄 Diverted');
    
    if (statusIndicators.length > 0) {
      parts.push(statusIndicators.join(' • '));
    }
    
    return parts.length > 0 ? parts.join('\n') : null;
  }

  getStatusEmoji(status) {
    const statusMap = {
      'scheduled': '🕐',
      'active': '✈️',
      'landed': '🛬',
      'cancelled': '❌',
      'incident': '⚠️',
      'diverted': '🔄',
      'result unknown': '🛩️',
      'unknown': '🛩️'
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
      'diverted': 'Diverted',
      'result unknown': 'Not Currently Flying',
      'unknown': 'Status Unknown'
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
    const flightNumber = flight.flight.iata || flight.flight.icao || flight.flight.number || 'Unknown';
    const airline = flight.airline?.name;
    const isPrivateAviation = !airline || airline === 'Unknown Airline';
    const status = this.getStatusEmoji(flight.flight_status) + ' ' + this.formatStatus(flight.flight_status);
    
    // Use appropriate identifier for private vs commercial aviation
    let displayName;
    if (isPrivateAviation && flight.aircraft?.registration) {
      displayName = flight.aircraft.registration;
    } else if (isPrivateAviation) {
      displayName = flightNumber;
    } else {
      displayName = `Flight ${flightNumber}`;
    }
    
    let message = '';
    
    switch (updateType) {
      case 'active':
        message = `✈️ *${displayName}* is now airborne!`;
        break;
      case 'landed':
        message = `🛬 *${displayName}* has landed safely.`;
        break;
      case 'cancelled':
        message = `❌ *${displayName}* has been cancelled.`;
        break;
      case 'diverted':
        message = `🔄 *${displayName}* has been diverted.`;
        break;
      case 'incident':
        message = `⚠️ *${displayName}* has reported an incident.`;
        break;
      default:
        message = `📡 *${displayName}* status update: ${status}`;
    }
    
    return message;
  }

  getApiUsageStatus() {
    return this.usageTracker.getUsageStatus();
  }

  getApiUsageMessage() {
    return this.usageTracker.getUsageMessage();
  }

  shouldLimitTracking() {
    return this.usageTracker.shouldLimitTracking();
  }

  canMakeRequest() {
    return this.usageTracker.canMakeRequest();
  }
}

module.exports = FlightService;