import nock, { type Scope } from 'nock';

export const AERO_API_BASE = 'https://aeroapi.flightaware.com';
export const AERO_API_PATH_PREFIX = '/aeroapi';

export function fakeAeroApi(): Scope {
  return nock(AERO_API_BASE).matchHeader('x-apikey', /.+/);
}
