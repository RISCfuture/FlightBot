import axios, { AxiosInstance, AxiosError } from 'axios';
import { ApiUsageTracker } from './apiUsageTracker.js';
import type {
  NormalizedFlight,
  FlightAwareFlight,
  AirportInfo,
  SlackBlock,
  ApiUsageStatus,
} from '../types.js';

export class FlightService {
  private apiKey: string | undefined;
  private baseUrl: string;
  private usageTracker: ApiUsageTracker;
  private api: AxiosInstance;

  constructor() {
    this.apiKey = process.env.FLIGHTAWARE_API_KEY;
    this.baseUrl = 'https://aeroapi.flightaware.com/aeroapi';
    this.usageTracker = new ApiUsageTracker();

    this.api = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'x-apikey': this.apiKey ?? '',
        Accept: 'application/json',
      },
    });
  }

  async getFlightData(identifier: string): Promise<NormalizedFlight | null> {
    try {
      if (!identifier || identifier.length < 2) {
        throw new Error('Flight identifier too short');
      }

      if (!this.usageTracker.canMakeRequest()) {
        const status = this.usageTracker.getUsageStatus();
        throw new Error(
          `API usage limit reached (${String(status.used)}/${String(status.limit)}). Resets on ${status.resetsOn}.`
        );
      }

      const cleanIdentifier = identifier.replace(/[^A-Z0-9]/gi, '');

      if (cleanIdentifier.length < 2) {
        throw new Error('Invalid flight identifier format');
      }

      const isFlightNum = this.isFlightNumber(cleanIdentifier);
      const isTailNum = this.isTailNumber(cleanIdentifier);

      if (!isFlightNum && !isTailNum) {
        throw new Error('Invalid flight identifier format');
      }

      let flight: NormalizedFlight | null = null;

      if (isFlightNum) {
        flight = await this.getFlightByNumber(cleanIdentifier);
      } else if (isTailNum) {
        flight = await this.getFlightByTailNumber(cleanIdentifier);
      }

      return flight;
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.response?.status === 401) {
        throw new Error('API authentication failed');
      }
      if (axiosError.response?.status === 429) {
        throw new Error('API rate limit exceeded');
      }
      console.error('Error fetching flight data:', (error as Error).message);
      throw error;
    }
  }

  private async getFlightByNumber(flightNumber: string): Promise<NormalizedFlight | null> {
    try {
      const response = await this.api.get<{ flights: FlightAwareFlight[] }>(
        `/flights/${flightNumber}`
      );

      this.usageTracker.recordRequest('flight_lookup', flightNumber);

      if (response.data.flights.length > 0) {
        const flight = response.data.flights[0];
        return this.normalizeFlightData(flight, 'flight_number');
      }

      return null;
    } catch (error) {
      const axiosError = error as AxiosError;
      console.error(
        `Error fetching flight ${flightNumber}:`,
        axiosError.response?.data ?? (error as Error).message
      );
      throw error;
    }
  }

  private async getFlightByTailNumber(tailNumber: string): Promise<NormalizedFlight | null> {
    try {
      let response;
      try {
        response = await this.api.get<{ flights: FlightAwareFlight[] }>(`/flights/${tailNumber}`);
      } catch (error) {
        const axiosError = error as AxiosError;
        if (axiosError.response?.status === 400) {
          response = await this.api.get<{ flights: FlightAwareFlight[] }>(
            `/aircraft/${tailNumber}/flights`
          );
        } else {
          throw error;
        }
      }

      this.usageTracker.recordRequest('tail_lookup', tailNumber);

      if (response.data.flights.length > 0) {
        const flight = response.data.flights[0];
        return this.normalizeFlightData(flight, 'tail_number');
      }

      return null;
    } catch (error) {
      const axiosError = error as AxiosError;
      console.error(
        `Error fetching flights for ${tailNumber}:`,
        axiosError.response?.data ?? (error as Error).message
      );
      throw error;
    }
  }

  private normalizeFlightData(flight: FlightAwareFlight, searchType: string): NormalizedFlight {
    return {
      flight: {
        iata: flight.ident_iata,
        icao: flight.ident_icao,
        number: flight.ident,
        flight_number: flight.flight_number,
      },
      flight_status: this.mapFlightAwareStatus(flight.status),
      airline: {
        name: flight.operator ?? 'Unknown Airline',
        iata: flight.operator_iata,
        icao: flight.operator_icao,
      },
      departure: {
        airport: flight.origin?.name ?? flight.origin?.code_iata ?? 'Unknown',
        iata: flight.origin?.code_iata,
        icao: flight.origin?.code_icao,
        scheduled: flight.scheduled_out,
        estimated: flight.estimated_out,
        actual: flight.actual_out,
        gate: flight.gate_origin,
        terminal: flight.terminal_origin,
      },
      arrival: {
        airport: flight.destination?.name ?? flight.destination?.code_iata ?? 'Unknown',
        iata: flight.destination?.code_iata,
        icao: flight.destination?.code_icao,
        scheduled: flight.scheduled_in,
        estimated: flight.estimated_in,
        actual: flight.actual_in,
        gate: flight.gate_destination,
        terminal: flight.terminal_destination,
      },
      aircraft: {
        registration: flight.registration,
        type: flight.aircraft_type,
      },
      progress_percent: flight.progress_percent,
      route: flight.route,
      cancelled: flight.cancelled,
      diverted: flight.diverted,
      searchType: searchType,
      faFlightId: flight.fa_flight_id,
    };
  }

  private mapFlightAwareStatus(status: string | undefined): string {
    const statusMap: Record<string, string> = {
      Scheduled: 'scheduled',
      Active: 'active',
      Completed: 'landed',
      Cancelled: 'cancelled',
      Diverted: 'diverted',
    };

    return statusMap[status ?? ''] ?? (status ?? 'unknown').toLowerCase();
  }

  isFlightNumber(identifier: string): boolean {
    return /^[A-Z]{2,3}[0-9]{1,4}[A-Z]?$/i.test(identifier);
  }

  isTailNumber(identifier: string): boolean {
    return (
      /^[A-Z]-?[A-Z0-9]{1,5}$/i.test(identifier) || /^N[0-9]{1,5}[A-Z]{0,2}$/i.test(identifier)
    );
  }

  formatFlightMessage(
    flight: NormalizedFlight,
    searchedIdentifier: string | null = null
  ): SlackBlock[] {
    const flightNumber =
      flight.flight.iata ?? flight.flight.icao ?? flight.flight.number ?? 'Unknown';
    const airline = flight.airline?.name;
    const isPrivateAviation = !airline || airline === 'Unknown Airline';
    const isSearchedByTail = searchedIdentifier && this.isTailNumber(searchedIdentifier);

    let displayTitle: string;
    if (isPrivateAviation && flight.aircraft?.registration) {
      displayTitle = flight.aircraft.registration;
    } else if (isPrivateAviation && isSearchedByTail) {
      displayTitle = searchedIdentifier.toUpperCase();
    } else if (isPrivateAviation) {
      displayTitle = flightNumber;
    } else {
      displayTitle = `Flight ${flightNumber}`;
    }

    const status =
      this.getStatusEmoji(flight.flight_status) + ' ' + this.formatStatus(flight.flight_status);

    let headerText = `*${displayTitle}*`;
    if (!isPrivateAviation) {
      headerText += ` - ${airline}`;
    }
    headerText += `\n${status}`;

    const departure = this.formatAirportInfo(flight.departure);
    const arrival = this.formatAirportInfo(flight.arrival);

    const departureTime = this.formatFlightTime(flight.departure);
    const arrivalTime = this.formatFlightTime(flight.arrival);

    const isGrounded =
      flight.flight_status === 'result unknown' ||
      flight.flight_status === 'unknown' ||
      (departure === 'Unknown' && arrival === 'Unknown');

    const linkIdentifier = flight.aircraft?.registration ?? searchedIdentifier ?? flightNumber;
    const flightAwareLink = `https://flightaware.com/live/flight/${linkIdentifier}`;
    const fr24Link = `https://www.flightradar24.com/data/flights/${linkIdentifier.toLowerCase()}`;

    const blocks: SlackBlock[] = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: headerText,
        },
      },
    ];

    if (!isGrounded) {
      blocks.push({
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Departure:*\n${departure}\n*Time:* ${departureTime}`,
          },
          {
            type: 'mrkdwn',
            text: `*Arrival:*\n${arrival}\n*Time:* ${arrivalTime}`,
          },
        ],
      });
    } else {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Status:* Aircraft is currently not in flight\n\n_Check the tracking links below for flight history and future scheduled flights._`,
        },
      });
    }

    const aircraftInfo = this.formatAircraftInfo(flight, searchedIdentifier);
    if (aircraftInfo) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: aircraftInfo,
        },
      });
    }

    if (flight.route) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Route:* ${flight.route}`,
        },
      });
    }

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Track on <${flightAwareLink}|FlightAware> | <${fr24Link}|Flightradar24>`,
      },
    });

    return blocks;
  }

  private formatAirportInfo(airportData: AirportInfo | undefined): string {
    if (!airportData) return 'Unknown';

    const name = airportData.airport ?? 'Unknown Airport';
    const icao = airportData.icao;
    const iata = airportData.iata;

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

  private formatFlightTime(timeData: AirportInfo | undefined): string {
    if (!timeData) return 'Unknown';

    const time = timeData.actual ?? timeData.estimated ?? timeData.scheduled;
    if (!time) return 'Unknown';

    const date = new Date(time);
    const timeString = date.toLocaleString();

    if (timeData.actual) {
      return `${timeString} (Actual)`;
    } else if (timeData.estimated) {
      return `${timeString} (Est)`;
    } else {
      return `${timeString} (Sched)`;
    }
  }

  private formatAircraftInfo(
    flight: NormalizedFlight,
    searchedIdentifier: string | null
  ): string | null {
    const parts: string[] = [];

    if (flight.aircraft?.registration) {
      let aircraftText = `*Aircraft:* ${flight.aircraft.registration}`;
      if (flight.aircraft.type) {
        aircraftText += ` (${flight.aircraft.type})`;
      }
      parts.push(aircraftText);
    } else if (
      searchedIdentifier &&
      this.isTailNumber(searchedIdentifier) &&
      flight.aircraft?.type
    ) {
      parts.push(`*Aircraft:* ${searchedIdentifier.toUpperCase()} (${flight.aircraft.type})`);
    }

    if (flight.progress_percent && flight.progress_percent > 0) {
      parts.push(`*Progress:* ${String(flight.progress_percent)}%`);
    }

    const statusIndicators: string[] = [];
    if (flight.cancelled) statusIndicators.push('Cancelled');
    if (flight.diverted) statusIndicators.push('Diverted');

    if (statusIndicators.length > 0) {
      parts.push(statusIndicators.join(' - '));
    }

    return parts.length > 0 ? parts.join('\n') : null;
  }

  private getStatusEmoji(status: string): string {
    const statusMap: Record<string, string> = {
      scheduled: '',
      active: '',
      landed: '',
      cancelled: '',
      incident: '',
      diverted: '',
      'result unknown': '',
      unknown: '',
    };
    return statusMap[status] || '';
  }

  private formatStatus(status: string): string {
    const statusMap: Record<string, string> = {
      scheduled: 'Scheduled',
      active: 'In Flight',
      landed: 'Landed',
      cancelled: 'Cancelled',
      incident: 'Incident',
      diverted: 'Diverted',
      'result unknown': 'Not Currently Flying',
      unknown: 'Status Unknown',
    };
    return statusMap[status] || status;
  }

  shouldSendUpdate(currentStatus: string, previousStatus: string): boolean {
    const updateTriggers = ['scheduled', 'active', 'landed', 'cancelled', 'incident', 'diverted'];

    return currentStatus !== previousStatus && updateTriggers.includes(currentStatus);
  }

  getUpdateMessage(flight: NormalizedFlight, updateType: string): string {
    const flightNumber =
      flight.flight.iata ?? flight.flight.icao ?? flight.flight.number ?? 'Unknown';
    const airline = flight.airline?.name;
    const isPrivateAviation = !airline || airline === 'Unknown Airline';
    const status =
      this.getStatusEmoji(flight.flight_status) + ' ' + this.formatStatus(flight.flight_status);

    let displayName: string;
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
        message = `*${displayName}* is now airborne!`;
        break;
      case 'landed':
        message = `*${displayName}* has landed safely.`;
        break;
      case 'cancelled':
        message = `*${displayName}* has been cancelled.`;
        break;
      case 'diverted':
        message = `*${displayName}* has been diverted.`;
        break;
      case 'incident':
        message = `*${displayName}* has reported an incident.`;
        break;
      default:
        message = `*${displayName}* status update: ${status}`;
    }

    return message;
  }

  getApiUsageStatus(): ApiUsageStatus {
    return this.usageTracker.getUsageStatus();
  }

  getApiUsageMessage(): string {
    return this.usageTracker.getUsageMessage();
  }

  shouldLimitTracking(): boolean {
    return this.usageTracker.shouldLimitTracking();
  }

  canMakeRequest(): boolean {
    return this.usageTracker.canMakeRequest();
  }
}
