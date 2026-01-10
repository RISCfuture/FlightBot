import type { App } from '@slack/bolt';

export interface FlightIdentifier {
  iata?: string;
  icao?: string;
  number?: string;
  flight_number?: string;
}

export interface AirlineInfo {
  name?: string;
  iata?: string;
  icao?: string;
}

export interface AirportInfo {
  airport?: string;
  iata?: string;
  icao?: string;
  scheduled?: string;
  estimated?: string;
  actual?: string;
  gate?: string;
  terminal?: string;
}

export interface AircraftInfo {
  registration?: string;
  type?: string;
}

export interface NormalizedFlight {
  flight: FlightIdentifier;
  flight_status: string;
  airline?: AirlineInfo;
  departure?: AirportInfo;
  arrival?: AirportInfo;
  aircraft?: AircraftInfo;
  progress_percent?: number;
  route?: string;
  cancelled?: boolean;
  diverted?: boolean;
  searchType?: string;
  faFlightId?: string;
}

export interface FlightAwareFlight {
  ident_iata?: string;
  ident_icao?: string;
  ident?: string;
  flight_number?: string;
  status?: string;
  operator?: string;
  operator_iata?: string;
  operator_icao?: string;
  origin?: {
    name?: string;
    code_iata?: string;
    code_icao?: string;
  };
  destination?: {
    name?: string;
    code_iata?: string;
    code_icao?: string;
  };
  scheduled_out?: string;
  estimated_out?: string;
  actual_out?: string;
  scheduled_in?: string;
  estimated_in?: string;
  actual_in?: string;
  gate_origin?: string;
  terminal_origin?: string;
  gate_destination?: string;
  terminal_destination?: string;
  registration?: string;
  aircraft_type?: string;
  progress_percent?: number;
  route?: string;
  cancelled?: boolean;
  diverted?: boolean;
  fa_flight_id?: string;
}

export interface TrackingInfo {
  flight: NormalizedFlight;
  channelId: string;
  userId: string;
  identifier: string;
}

export interface TrackedFlight extends TrackingInfo {
  lastStatus: string;
  lastUpdated: Date;
  updateCount: number;
  hasLanded: boolean;
}

export interface ApiUsageStatus {
  status: 'healthy' | 'warning' | 'critical';
  emoji: string;
  used: number;
  remaining: number;
  limit: number;
  percentage: number;
  resetsOn: string;
}

export interface UsageData {
  month: number;
  year: number;
  count: number;
  requests: ApiRequest[];
  lastReset: string;
}

export interface ApiRequest {
  timestamp: string;
  type: string;
  flightId: string | null;
}

export interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
  };
  fields?: {
    type: string;
    text: string;
  }[];
}

export type SlackApp = App;
