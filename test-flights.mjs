#!/usr/bin/env node
/**
 * SafeZone Flight Tracking Tests — 12 flights
 *
 * Tests with mocked API responses to validate:
 * 1. normalizeCallsign correctness
 * 2. Callsign validation rejects wrong flights
 * 3. Callsign validation accepts correct flights (IATA + ICAO forms)
 * 4. Merge logic uses only validated sources
 * 5. Scheduled route fallback activates when both sources fail
 * 6. Edge cases (whitespace, dashes, unknown prefixes, ICAO-only input)
 */

// ── Extracted from index.html ──────────────────────────────────
const IATA_TO_ICAO_AIRLINE = {
  'EK':'UAE','QR':'QTR','EY':'ETD','WY':'OMS','FZ':'FDB','G9':'ABY','SV':'SVA',
  'MS':'MSR','ME':'MEA','RJ':'RJA','IA':'IAW','IR':'IRA','W5':'IRM',
  'SQ':'SIA','MH':'MAS','TG':'THA','AI':'AIC','9W':'JAI','6E':'IGO',
  'CX':'CPA','KA':'HDA','NH':'ANA','JL':'JAL','OZ':'AAR','KE':'KAL',
  'BA':'BAW','VS':'VIR','LH':'DLH','LX':'SWR','OS':'AUA','KL':'KLM',
  'AF':'AFR','IB':'IBE','AZ':'ITY','TK':'THY','PC':'PGT','U2':'EZY',
  'AA':'AAL','UA':'UAL','DL':'DAL','WN':'SWA','B6':'JBU','AS':'ASA',
  'AC':'ACA','WS':'WJA','QF':'QFA','VA':'VOZ','JQ':'JST',
  'MU':'CES','CA':'CCA','CZ':'CSN','HU':'CHH','3U':'CSC',
  'SU':'AFL','S7':'SBI','UT':'UTA',
};

function normalizeCallsign(raw) {
  const cs = raw.replace(/\s+|-/g, '').toUpperCase().trim();
  if (!cs) return [];
  const m = cs.match(/^([A-Z][A-Z0-9])(\d+[A-Z]?)$/);
  if (m) {
    const prefix = m[1], num = m[2];
    const icaoPrefix = IATA_TO_ICAO_AIRLINE[prefix];
    return icaoPrefix ? [cs, icaoPrefix + num] : [cs];
  }
  return [cs];
}

// Simulate the validation logic from trackFlightNumber
function simulateTrackFlight({ raw, record, adsbAc }) {
  const variants = normalizeCallsign(raw);

  const recordCs = record ? (record.callsign || '').trim().toUpperCase() : '';
  const adsbCs   = adsbAc ? (adsbAc.flight || '').trim().toUpperCase() : '';
  const recordOk = record && variants.includes(recordCs);
  const adsbOk   = adsbAc && variants.includes(adsbCs);

  const validRecord = recordOk ? record : null;
  const validAdsb   = adsbOk   ? adsbAc : null;

  let routeOnly = false;
  let oIcao = validRecord?.estDepartureAirport || validAdsb?.from_icao || null;
  let dIcao = validRecord?.estArrivalAirport   || validAdsb?.to_icao   || null;
  let csFound = (validRecord?.callsign || validAdsb?.flight || raw).trim().toUpperCase();
  let icao24 = validRecord?.icao24 || validAdsb?.hex || null;

  if (!validRecord && !validAdsb) {
    routeOnly = true;
    // In real code, fetchScheduledRoute would fire here
    csFound = variants[0] || raw.toUpperCase();
  }

  const isAirborne = !!(validAdsb && validAdsb.lat != null);

  return { variants, recordOk, adsbOk, validRecord, validAdsb, routeOnly, oIcao, dIcao, csFound, icao24, isAirborne };
}

// Simulate ADS-B callsign validation from _fetchAdsbApi
function validateAdsbResponse(acList, validCallsigns) {
  if (!Array.isArray(acList) || acList.length === 0) return { error: 'no aircraft' };
  if (validCallsigns && validCallsigns.length) {
    const match = acList.find(a => {
      if (a.lat == null || a.lon == null) return false;
      const cs = (a.flight || '').trim().toUpperCase();
      return validCallsigns.includes(cs);
    });
    if (!match) return { error: 'callsign mismatch: got ' + (acList[0]?.flight || 'none').trim() };
    return { match };
  }
  return { match: acList[0] };
}

// Simulate OpenSky _tryWindow callsign validation
function validateOpenSkyResponse(data, validCallsigns) {
  if (!Array.isArray(data) || data.length === 0) return { error: 'empty' };
  if (validCallsigns && validCallsigns.length) {
    const match = data.slice().reverse().find(f => {
      const cs = (f.callsign || '').trim().toUpperCase();
      return validCallsigns.includes(cs);
    });
    if (!match) return { error: 'callsign mismatch' };
    return { match };
  }
  return { match: data[data.length - 1] };
}

// ── Test infrastructure ────────────────────────────────────────
let passed = 0, failed = 0;
function ok(label) { passed++; console.log(`  ✅ ${label}`); }
function fail(label) { failed++; console.log(`  ❌ ${label}`); }

// ── 12 test flights ────────────────────────────────────────────
const FLIGHTS = [
  { input: 'SQ308',  icao: 'SIA308',  airline: 'Singapore Airlines', from: 'WSSS', to: 'EGLL' },
  { input: 'EK215',  icao: 'UAE215',  airline: 'Emirates',           from: 'OMDB', to: 'KLAX' },
  { input: 'QR920',  icao: 'QTR920',  airline: 'Qatar Airways',      from: 'OTHH', to: 'VABB' },
  { input: 'BA117',  icao: 'BAW117',  airline: 'British Airways',    from: 'EGLL', to: 'KJFK' },
  { input: 'LH400',  icao: 'DLH400',  airline: 'Lufthansa',          from: 'EDDF', to: 'KJFK' },
  { input: 'AA100',  icao: 'AAL100',  airline: 'American Airlines',  from: 'KJFK', to: 'EGLL' },
  { input: 'UA900',  icao: 'UAL900',  airline: 'United Airlines',    from: 'KSFO', to: 'RJTT' },
  { input: 'DL1',    icao: 'DAL1',    airline: 'Delta',              from: 'KJFK', to: 'EGLL' },
  { input: 'AF1',    icao: 'AFR1',    airline: 'Air France',         from: 'LFPG', to: 'KJFK' },
  { input: 'TK1',    icao: 'THY1',    airline: 'Turkish Airlines',   from: 'LTFM', to: 'EDDF' },
  { input: 'QF1',    icao: 'QFA1',    airline: 'Qantas',             from: 'YSSY', to: 'EGLL' },
  { input: 'CX888',  icao: 'CPA888',  airline: 'Cathay Pacific',     from: 'VHHH', to: 'CYVR' },
];

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║   SafeZone Flight Tracking — 12-Flight Validation Suite    ║');
console.log('╚══════════════════════════════════════════════════════════════╝');

// ═══════════════════════════════════════════════════════════════
// TEST GROUP 1: normalizeCallsign for all 12 flights
// ═══════════════════════════════════════════════════════════════
console.log('\n┌─── TEST GROUP 1: normalizeCallsign ───────────────────────┐');
for (const f of FLIGHTS) {
  const v = normalizeCallsign(f.input);
  if (v.length === 2 && v[0] === f.input.toUpperCase() && v[1] === f.icao) {
    ok(`${f.input} → [${v.join(', ')}]`);
  } else {
    fail(`${f.input}: expected [${f.input.toUpperCase()}, ${f.icao}], got [${v.join(', ')}]`);
  }
}

// ═══════════════════════════════════════════════════════════════
// TEST GROUP 2: ADS-B validation rejects wrong callsigns
// ═══════════════════════════════════════════════════════════════
console.log('\n┌─── TEST GROUP 2: ADS-B rejects wrong callsigns ──────────┐');
const WRONG_FLIGHTS = [
  { flight: 'ARE4064 ', lat: 4.7,  lon: -74.1 },
  { flight: 'RYR123  ', lat: 51.5, lon: -0.1  },
  { flight: 'WRONG999', lat: 40.0, lon: -73.0 },
];

for (const f of FLIGHTS) {
  const variants = normalizeCallsign(f.input);
  for (const wrong of WRONG_FLIGHTS) {
    const result = validateAdsbResponse([wrong], variants);
    if (result.error && result.error.includes('mismatch')) {
      ok(`${f.input}: rejected "${wrong.flight.trim()}" ✓`);
    } else {
      fail(`${f.input}: ACCEPTED wrong callsign "${wrong.flight.trim()}"!`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// TEST GROUP 3: ADS-B validation accepts correct callsigns
// (both IATA and ICAO forms, with various padding)
// ═══════════════════════════════════════════════════════════════
console.log('\n┌─── TEST GROUP 3: ADS-B accepts correct callsigns ────────┐');
for (const f of FLIGHTS) {
  const variants = normalizeCallsign(f.input);

  // Test IATA form (padded to 8 chars, as ADS-B APIs return)
  const iataAc = { flight: f.input.toUpperCase().padEnd(8), lat: 35.0, lon: 50.0 };
  const r1 = validateAdsbResponse([iataAc], variants);
  if (r1.match) {
    ok(`${f.input}: accepted IATA "${iataAc.flight.trim()}"`);
  } else {
    fail(`${f.input}: rejected valid IATA "${iataAc.flight.trim()}": ${r1.error}`);
  }

  // Test ICAO form (padded)
  const icaoAc = { flight: f.icao.padEnd(8), lat: 35.0, lon: 50.0 };
  const r2 = validateAdsbResponse([icaoAc], variants);
  if (r2.match) {
    ok(`${f.input}: accepted ICAO "${icaoAc.flight.trim()}"`);
  } else {
    fail(`${f.input}: rejected valid ICAO "${icaoAc.flight.trim()}": ${r2.error}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// TEST GROUP 4: OpenSky _tryWindow validation
// ═══════════════════════════════════════════════════════════════
console.log('\n┌─── TEST GROUP 4: OpenSky record validation ──────────────┐');
for (const f of FLIGHTS) {
  const variants = normalizeCallsign(f.input);

  // Correct record
  const goodData = [
    { callsign: f.icao.padEnd(8), icao24: 'abc123', estDepartureAirport: f.from, estArrivalAirport: f.to }
  ];
  const r1 = validateOpenSkyResponse(goodData, variants);
  if (r1.match) {
    ok(`${f.input}: OpenSky accepted correct record (cs=${f.icao})`);
  } else {
    fail(`${f.input}: OpenSky rejected correct record: ${r1.error}`);
  }

  // Wrong record
  const badData = [
    { callsign: 'ARE4064 ', icao24: 'xyz789', estDepartureAirport: 'SKBO', estArrivalAirport: 'SKCL' }
  ];
  const r2 = validateOpenSkyResponse(badData, variants);
  if (r2.error) {
    ok(`${f.input}: OpenSky rejected wrong record (cs=ARE4064)`);
  } else {
    fail(`${f.input}: OpenSky ACCEPTED wrong record!`);
  }

  // Mixed: wrong + correct in same response
  const mixedData = [
    { callsign: 'ARE4064 ', icao24: 'xyz789', estDepartureAirport: 'SKBO', estArrivalAirport: 'SKCL' },
    { callsign: f.icao.padEnd(8), icao24: 'abc123', estDepartureAirport: f.from, estArrivalAirport: f.to },
  ];
  const r3 = validateOpenSkyResponse(mixedData, variants);
  if (r3.match && (r3.match.callsign || '').trim().toUpperCase() === f.icao) {
    ok(`${f.input}: OpenSky picked correct entry from mixed response`);
  } else {
    fail(`${f.input}: OpenSky failed on mixed response`);
  }
}

// ═══════════════════════════════════════════════════════════════
// TEST GROUP 5: Full merge logic — correct flight airborne
// ═══════════════════════════════════════════════════════════════
console.log('\n┌─── TEST GROUP 5: Full merge — correct flight airborne ───┐');
for (const f of FLIGHTS) {
  const result = simulateTrackFlight({
    raw: f.input,
    record: { callsign: f.icao.padEnd(8), icao24: 'abc123', estDepartureAirport: f.from, estArrivalAirport: f.to, lastSeen: Date.now()/1000 },
    adsbAc: { flight: f.icao.padEnd(8), hex: 'abc123', lat: 35.0, lon: 50.0, alt_baro: 35000, gs: 450, track: 90 },
  });

  if (result.recordOk && result.adsbOk && !result.routeOnly && result.isAirborne
      && result.oIcao === f.from && result.dIcao === f.to) {
    ok(`${f.input}: airborne, route ${f.from}→${f.to}, callsign ${result.csFound}`);
  } else {
    fail(`${f.input}: merge failed — recordOk=${result.recordOk}, adsbOk=${result.adsbOk}, routeOnly=${result.routeOnly}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// TEST GROUP 6: Full merge — wrong flight rejected, triggers fallback
// ═══════════════════════════════════════════════════════════════
console.log('\n┌─── TEST GROUP 6: Wrong flight rejected → fallback ───────┐');
for (const f of FLIGHTS) {
  const result = simulateTrackFlight({
    raw: f.input,
    record: { callsign: 'ARE4064 ', icao24: 'wrong1', estDepartureAirport: 'SKBO', estArrivalAirport: 'SKCL' },
    adsbAc: { flight: 'ARE4064 ', hex: 'wrong1', lat: 4.7, lon: -74.1 },
  });

  if (!result.recordOk && !result.adsbOk && result.routeOnly) {
    ok(`${f.input}: ARE4064 rejected, routeOnly=true (fallback triggered)`);
  } else {
    fail(`${f.input}: wrong flight NOT rejected! recordOk=${result.recordOk}, adsbOk=${result.adsbOk}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// TEST GROUP 7: Partial data — only record OR adsb is valid
// ═══════════════════════════════════════════════════════════════
console.log('\n┌─── TEST GROUP 7: Partial data — one source valid ────────┐');
for (const f of FLIGHTS) {
  // Only OpenSky record is valid, ADS-B returns wrong flight
  const r1 = simulateTrackFlight({
    raw: f.input,
    record: { callsign: f.icao.padEnd(8), icao24: 'abc123', estDepartureAirport: f.from, estArrivalAirport: f.to },
    adsbAc: { flight: 'WRONG999', hex: 'xyz789', lat: 10, lon: 20 },
  });
  if (r1.recordOk && !r1.adsbOk && !r1.routeOnly && r1.oIcao === f.from && r1.dIcao === f.to) {
    ok(`${f.input}: only record valid → route from record, adsb ignored`);
  } else {
    fail(`${f.input}: partial merge (record only) failed`);
  }

  // Only ADS-B is valid, OpenSky returns wrong flight
  const r2 = simulateTrackFlight({
    raw: f.input,
    record: { callsign: 'WRONG999', icao24: 'xyz789', estDepartureAirport: 'XXXX', estArrivalAirport: 'YYYY' },
    adsbAc: { flight: f.icao.padEnd(8), hex: 'abc123', lat: 35.0, lon: 50.0, from_icao: f.from, to_icao: f.to },
  });
  if (!r2.recordOk && r2.adsbOk && !r2.routeOnly && r2.isAirborne) {
    ok(`${f.input}: only adsb valid → live position used, record ignored`);
  } else {
    fail(`${f.input}: partial merge (adsb only) failed`);
  }
}

// ═══════════════════════════════════════════════════════════════
// TEST GROUP 8: Both sources null → fallback
// ═══════════════════════════════════════════════════════════════
console.log('\n┌─── TEST GROUP 8: Both sources null → scheduled fallback ─┐');
for (const f of FLIGHTS) {
  const result = simulateTrackFlight({ raw: f.input, record: null, adsbAc: null });
  if (result.routeOnly && !result.isAirborne) {
    ok(`${f.input}: both null → routeOnly=true, scheduled route fallback activated`);
  } else {
    fail(`${f.input}: both null but routeOnly=${result.routeOnly}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// TEST GROUP 9: ADS-B multi-aircraft — picks correct one
// ═══════════════════════════════════════════════════════════════
console.log('\n┌─── TEST GROUP 9: Multi-aircraft ADS-B — picks correct ───┐');
for (const f of FLIGHTS) {
  const variants = normalizeCallsign(f.input);
  const acList = [
    { flight: 'ARE4064 ', lat: 4.7, lon: -74.1, hex: 'wrong1' },
    { flight: 'RYR456  ', lat: 51.5, lon: -0.1, hex: 'wrong2' },
    { flight: f.icao.padEnd(8), lat: 35.0, lon: 50.0, hex: 'correct' },
    { flight: 'DAL999  ', lat: 40.0, lon: -73.0, hex: 'wrong3' },
  ];
  const result = validateAdsbResponse(acList, variants);
  if (result.match && result.match.hex === 'correct') {
    ok(`${f.input}: picked correct aircraft from 4 results`);
  } else {
    fail(`${f.input}: picked wrong aircraft from multi-result: ${JSON.stringify(result)}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// TEST GROUP 10: Edge cases
// ═══════════════════════════════════════════════════════════════
console.log('\n┌─── TEST GROUP 10: Edge cases ─────────────────────────────┐');

// Empty input
const e1 = normalizeCallsign('');
if (e1.length === 0) ok('Empty input → []');
else fail(`Empty input → [${e1.join(',')}]`);

// Whitespace
const e2 = normalizeCallsign('  SQ 308  ');
if (e2[0] === 'SQ308' && e2[1] === 'SIA308') ok('"  SQ 308  " → [SQ308, SIA308]');
else fail(`"  SQ 308  " → [${e2.join(',')}]`);

// Dashes
const e3 = normalizeCallsign('EK-215');
if (e3[0] === 'EK215' && e3[1] === 'UAE215') ok('"EK-215" → [EK215, UAE215]');
else fail(`"EK-215" → [${e3.join(',')}]`);

// Lowercase
const e4 = normalizeCallsign('ba117');
if (e4[0] === 'BA117' && e4[1] === 'BAW117') ok('"ba117" → [BA117, BAW117]');
else fail(`"ba117" → [${e4.join(',')}]`);

// Already ICAO 3-letter prefix
const e5 = normalizeCallsign('BAW117');
if (e5.length === 1 && e5[0] === 'BAW117') ok('"BAW117" → [BAW117] (no double conversion)');
else fail(`"BAW117" → [${e5.join(',')}]`);

// Unknown prefix
const e6 = normalizeCallsign('ZZ999');
if (e6.length === 1 && e6[0] === 'ZZ999') ok('"ZZ999" → [ZZ999] (unknown prefix, no ICAO)');
else fail(`"ZZ999" → [${e6.join(',')}]`);

// Suffix with letter
const e7 = normalizeCallsign('DL1A');
if (e7[0] === 'DL1A' && e7[1] === 'DAL1A') ok('"DL1A" → [DL1A, DAL1A]');
else fail(`"DL1A" → [${e7.join(',')}]`);

// Pure numeric (not a valid callsign pattern)
const e8 = normalizeCallsign('12345');
if (e8.length === 1 && e8[0] === '12345') ok('"12345" → [12345] (no prefix match)');
else fail(`"12345" → [${e8.join(',')}]`);

// Callsign with trailing spaces (as received from API)
const variants = normalizeCallsign('SQ308');
const paddedCs = 'SIA308  ';
if (variants.includes(paddedCs.trim().toUpperCase())) {
  ok('Padded "SIA308  " trimmed and matched correctly');
} else {
  fail('Padded "SIA308  " not matched after trimming');
}

// The original bug scenario: SQ308 search returning ARE4064
const bugResult = simulateTrackFlight({
  raw: 'SQ308',
  record: null,
  adsbAc: { flight: 'ARE4064 ', hex: 'abc123', lat: 4.7, lon: -74.1, from_icao: 'SKBO', to_icao: 'SKCL' },
});
if (bugResult.routeOnly && !bugResult.isAirborne && bugResult.oIcao === null) {
  ok('BUG REPRO: SQ308→ARE4064 correctly rejected, fallback triggered');
} else {
  fail(`BUG REPRO: SQ308→ARE4064 not properly handled: routeOnly=${bugResult.routeOnly}, adsbOk=${bugResult.adsbOk}`);
}

// ═══════════════════════════════════════════════════════════════
// TEST GROUP 11: Known-routes local fallback
// ═══════════════════════════════════════════════════════════════
console.log('\n┌─── TEST GROUP 11: Known-routes local fallback ────────────┐');

const KNOWN_ROUTES = {
  EK509:  { from:'OMDB', to:'VABB' }, EK215:  { from:'OMDB', to:'KJFK' },
  SQ308:  { from:'WSSS', to:'EGLL' }, SQ22:   { from:'WSSS', to:'KJFK' },
  QR920:  { from:'OTHH', to:'OPKC' }, QR001:  { from:'OTHH', to:'EGLL' },
  BA117:  { from:'EGLL', to:'KJFK' }, BA015:  { from:'EGLL', to:'WSSS' },
  LH400:  { from:'EDDF', to:'KJFK' }, AA100:  { from:'KJFK', to:'EGLL' },
  UA900:  { from:'KSFO', to:'RJAA' }, DL1:    { from:'KJFK', to:'KLAX' },
  AF1:    { from:'LFPG', to:'EGLL' }, TK1:    { from:'LTBA', to:'LGAV' },
  QF1:    { from:'YSSY', to:'WSSS' }, CX888:  { from:'VHHH', to:'KLAX' },
};

// Simulate localStorage cache (in-memory for tests)
let _mockCache = {};

function cacheRoute(rawCallsign, fromIcao, toIcao) {
  if (!fromIcao || !toIcao) return;
  const variants = normalizeCallsign(rawCallsign);
  const key = variants[0];
  if (!key) return;
  _mockCache[key] = { from: fromIcao, to: toIcao, ts: Date.now() };
}

function lookupKnownRoute(rawCallsign) {
  const variants = normalizeCallsign(rawCallsign);
  // 1. Check cache first
  for (const cs of variants) {
    const cached = _mockCache[cs];
    if (cached && cached.from && cached.to) return { oIcao: cached.from, dIcao: cached.to };
  }
  // 2. Fall back to hardcoded
  for (const cs of variants) {
    const r = KNOWN_ROUTES[cs];
    if (r) return { oIcao: r.from, dIcao: r.to };
  }
  return null;
}

// Test: all 12 test flights should have a known route
const knownRouteFlights = ['SQ308','EK215','QR920','BA117','LH400','AA100','UA900','DL1','AF1','TK1','QF1','CX888'];
for (const input of knownRouteFlights) {
  const kr = lookupKnownRoute(input);
  if (kr && kr.oIcao && kr.dIcao) {
    ok(`${input} → known route ${kr.oIcao} → ${kr.dIcao}`);
  } else {
    fail(`${input} → no known route found`);
  }
}

// Test: unknown flight returns null
const unknownKr = lookupKnownRoute('XX999');
if (unknownKr === null) ok('XX999 → null (no known route, expected)');
else fail('XX999 → should return null for unknown flight');

// Test: full fallback chain — both APIs fail, known route provides the route
console.log('\n┌─── TEST GROUP 12: Full fallback to known route ───────────┐');
for (const input of knownRouteFlights) {
  const result = simulateTrackFlight({ raw: input, record: null, adsbAc: null });
  // Both APIs failed, so routeOnly=true and no oIcao/dIcao from APIs
  // In the real code, fetchScheduledRoute fires, and if that also fails, lookupKnownRoute fires
  // Here we simulate: both APIs null → routeOnly=true, then known-route provides airports
  if (result.routeOnly) {
    const kr = lookupKnownRoute(input);
    if (kr && kr.oIcao && kr.dIcao) {
      ok(`${input} → APIs failed → known route fallback: ${kr.oIcao} → ${kr.dIcao}`);
    } else {
      fail(`${input} → APIs failed but no known route either`);
    }
  } else {
    fail(`${input} → should trigger routeOnly when both APIs return null`);
  }
}

// ═══════════════════════════════════════════════════════════════
// TEST GROUP 13: Auto-cache from successful lookups
// ═══════════════════════════════════════════════════════════════
console.log('\n┌─── TEST GROUP 13: Auto-cache from successful lookups ─────┐');

// Reset cache
_mockCache = {};

// Simulate a successful API lookup for SQ308 → cache the result
cacheRoute('SQ308', 'WSSS', 'EGLL');
const cachedSQ = lookupKnownRoute('SQ308');
if (cachedSQ && cachedSQ.oIcao === 'WSSS' && cachedSQ.dIcao === 'EGLL') {
  ok('SQ308: cached route retrieved correctly (WSSS → EGLL)');
} else {
  fail('SQ308: cached route not found after cacheRoute()');
}

// Cache overwrites hardcoded: cache a different route for EK215
cacheRoute('EK215', 'OMDB', 'YSSY'); // different from hardcoded OMDB→KJFK
const cachedEK = lookupKnownRoute('EK215');
if (cachedEK && cachedEK.oIcao === 'OMDB' && cachedEK.dIcao === 'YSSY') {
  ok('EK215: cached route overrides hardcoded (OMDB → YSSY, not KJFK)');
} else {
  fail('EK215: cache should take priority over hardcoded');
}

// Unknown flight not in cache or hardcoded → null
_mockCache = {};
const noCacheUnknown = lookupKnownRoute('ZZ123');
if (noCacheUnknown === null) ok('ZZ123: not in cache or hardcoded → null');
else fail('ZZ123: should be null when not cached or hardcoded');

// Flight not in cache falls through to hardcoded
_mockCache = {};
const fallToHardcoded = lookupKnownRoute('BA117');
if (fallToHardcoded && fallToHardcoded.oIcao === 'EGLL' && fallToHardcoded.dIcao === 'KJFK') {
  ok('BA117: not in cache → falls through to hardcoded (EGLL → KJFK)');
} else {
  fail('BA117: should fall through to hardcoded when cache empty');
}

// cacheRoute ignores invalid input (no from/to)
const before = { ..._mockCache };
cacheRoute('AA100', null, 'EGLL');
cacheRoute('AA100', 'KJFK', null);
cacheRoute('', 'KJFK', 'EGLL');
if (JSON.stringify(_mockCache) === JSON.stringify(before)) {
  ok('cacheRoute ignores invalid input (null from/to, empty callsign)');
} else {
  fail('cacheRoute should not cache with null from, null to, or empty callsign');
}

// ═══════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════
console.log('\n' + '═'.repeat(62));
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(62));

if (failed > 0) {
  console.log('\n⛔ FAILURES DETECTED');
  process.exit(1);
} else {
  console.log('\n✅ All tests passed!');
  process.exit(0);
}
