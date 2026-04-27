import type { TrackedFlight } from '../../../src/types.js';

export interface AeroFlightOverrides {
  ident_iata?: string;
  ident?: string;
  status?: string;
  registration?: string;
}

export function aeroFlightResponse(overrides: AeroFlightOverrides = {}): unknown {
  return {
    flights: [
      {
        ident_iata: overrides.ident_iata ?? 'UA400',
        ident_icao: 'UAL400',
        ident: overrides.ident ?? 'UAL400',
        status: overrides.status ?? 'Scheduled',
        operator: 'United Airlines',
        operator_iata: 'UA',
        origin: { name: 'San Francisco Intl', code_iata: 'SFO', code_icao: 'KSFO' },
        destination: { name: 'New York JFK', code_iata: 'JFK', code_icao: 'KJFK' },
        scheduled_out: '2026-04-27T15:00:00Z',
        scheduled_in: '2026-04-27T23:30:00Z',
        registration: overrides.registration,
        aircraft_type: 'B789',
        progress_percent: 0,
        cancelled: false,
        diverted: false,
        fa_flight_id: 'UAL400-faflight-id',
      },
    ],
  };
}

export function makeTrackedFlight(
  opts: {
    identifier?: string;
    channelId?: string;
    userId?: string;
    status?: string;
    lastStatus?: string;
    lastUpdatedMinutesAgo?: number;
    updateCount?: number;
    hasLanded?: boolean;
  } = {}
): TrackedFlight {
  const identifier = opts.identifier ?? 'UA400';
  const channelId = opts.channelId ?? 'C_CHAN';
  const userId = opts.userId ?? 'U_USER';
  const status = opts.status ?? 'scheduled';
  const lastStatus = opts.lastStatus ?? status;
  const minutesAgo = opts.lastUpdatedMinutesAgo ?? 0;
  return {
    identifier,
    channelId,
    userId,
    flight: {
      flight: { iata: identifier, icao: 'UAL400' },
      flight_status: status,
      airline: { name: 'United Airlines', iata: 'UA' },
      departure: { airport: 'San Francisco Intl', iata: 'SFO', icao: 'KSFO' },
      arrival: { airport: 'New York JFK', iata: 'JFK', icao: 'KJFK' },
      aircraft: { type: 'B789' },
      progress_percent: 0,
      cancelled: false,
      diverted: false,
      faFlightId: 'UAL400-faflight-id',
    },
    lastStatus,
    lastUpdated: new Date(Date.now() - minutesAgo * 60_000),
    updateCount: opts.updateCount ?? 0,
    hasLanded: opts.hasLanded ?? false,
  };
}
