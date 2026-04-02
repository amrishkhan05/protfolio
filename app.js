/** @format */

const express = require('express');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const app = express();
const port = process.env.PORT || 3333;
const hasKvConfig = Boolean(
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN,
);
const kvBaseUrl = process.env.KV_REST_API_URL;
const kvToken = process.env.KV_REST_API_TOKEN;
const kvViewsKey = 'sheikhstack:portfolio:views';
const kvUpdatedAtKey = 'sheikhstack:portfolio:updatedAt';

const metricsDir = process.env.VERCEL
  ? path.join(os.tmpdir(), 'sheikstack-metrics')
  : path.join(__dirname, '.data');
const metricsFilePath = path.join(metricsDir, 'portfolio-views.json');
let memoryMetrics = { views: 0, updatedAt: null };
let useMemoryFallback = false;
let writeQueue = Promise.resolve();

app.use(express.static(path.join(__dirname, 'public')));

const kvGet = async (key) => {
  const response = await fetch(`${kvBaseUrl}/get/${encodeURIComponent(key)}`, {
    headers: {
      Authorization: `Bearer ${kvToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`KV GET failed for ${key}: ${response.status}`);
  }

  const payload = await response.json();
  return payload.result;
};

const kvSet = async (key, value) => {
  const response = await fetch(
    `${kvBaseUrl}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`,
    {
      headers: {
        Authorization: `Bearer ${kvToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`KV SET failed for ${key}: ${response.status}`);
  }
};

const kvIncrement = async (key) => {
  const response = await fetch(`${kvBaseUrl}/incr/${encodeURIComponent(key)}`, {
    headers: {
      Authorization: `Bearer ${kvToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`KV INCR failed for ${key}: ${response.status}`);
  }

  const payload = await response.json();
  return Number(payload.result);
};

const getKvMetrics = async () => {
  const [viewsRaw, updatedAtRaw] = await Promise.all([
    kvGet(kvViewsKey),
    kvGet(kvUpdatedAtKey),
  ]);
  return {
    views: Number.isFinite(Number(viewsRaw)) ? Number(viewsRaw) : 0,
    updatedAt: typeof updatedAtRaw === 'string' ? updatedAtRaw : null,
  };
};

const incrementKvMetrics = async () => {
  const nextViews = await kvIncrement(kvViewsKey);
  const updatedAt = new Date().toISOString();
  await kvSet(kvUpdatedAtKey, updatedAt);

  return {
    views: Number.isFinite(nextViews) ? nextViews : 0,
    updatedAt,
  };
};

const readMetrics = async () => {
  if (useMemoryFallback) {
    return memoryMetrics;
  }

  try {
    const fileBuffer = await fs.readFile(metricsFilePath, 'utf8');
    const parsed = JSON.parse(fileBuffer);
    return {
      views: Number.isFinite(parsed.views) ? parsed.views : 0,
      updatedAt: parsed.updatedAt || null,
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { views: 0, updatedAt: null };
    }

    useMemoryFallback = true;
    return memoryMetrics;
  }
};

const saveMetrics = async (metrics) => {
  memoryMetrics = metrics;

  if (useMemoryFallback) {
    return;
  }

  try {
    await fs.mkdir(metricsDir, { recursive: true });
    await fs.writeFile(metricsFilePath, JSON.stringify(metrics), 'utf8');
  } catch (error) {
    console.error('Could not persist portfolio view metrics:', error);
    useMemoryFallback = true;
  }
};

const getViewStats = async () => {
  if (hasKvConfig) {
    try {
      const metrics = await getKvMetrics();
      memoryMetrics = metrics;
      return { ...metrics, storage: 'kv' };
    } catch (error) {
      console.error('Could not read portfolio view metrics from KV:', error);
    }
  }

  const metrics = await readMetrics();
  memoryMetrics = metrics;
  return { ...metrics, storage: useMemoryFallback ? 'memory' : 'file' };
};

const incrementViewStats = async () => {
  if (hasKvConfig) {
    try {
      const metrics = await incrementKvMetrics();
      memoryMetrics = metrics;
      return { ...metrics, storage: 'kv' };
    } catch (error) {
      console.error('Could not write portfolio view metrics to KV:', error);
    }
  }

  writeQueue = writeQueue.then(async () => {
    const current = await getViewStats();
    const next = {
      views: current.views + 1,
      updatedAt: new Date().toISOString(),
    };
    await saveMetrics(next);
    return { ...next, storage: useMemoryFallback ? 'memory' : 'file' };
  });

  return writeQueue;
};

app.get('/api/views', async (_req, res) => {
  res.set(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate',
  );
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  const metrics = await getViewStats();
  res.json({
    totalViews: metrics.views,
    updatedAt: metrics.updatedAt,
    storage: metrics.storage,
  });
});

app.post('/api/views', async (_req, res) => {
  res.set(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate',
  );
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  const metrics = await incrementViewStats();
  res.json({
    totalViews: metrics.views,
    updatedAt: metrics.updatedAt,
    storage: metrics.storage,
  });
});

app.get('/api/one', (req, res) => {
  console.log(req.query.name);

  if (
    req.query.name === undefined ||
    req.query.name === '' ||
    req.query.name === 'null'
  ) {
    return res
      .status(400)
      .json({
        error: {
          code: 'TST1012',
          message: 'Name query parameter is required.',
        },
      });
  }
  if (req.query.name === 'forbidden') {
    return res
      .status(403)
      .json({
        error: { code: 'TST1013', message: 'Access Forbidden for this name.' },
      });
  }
  if (req.query.name === 'notfound') {
    return res
      .status(404)
      .json({ error: { code: 'TST1014', message: 'Name not found.' } });
  }
  if (req.query.name === 'servererror') {
    return res
      .status(500)
      .json({ error: { code: 'TST1015', message: 'Internal server error.' } });
  }
  if (req.query.name === 'badrequest') {
    return res
      .status(400)
      .json({
        error: { code: 'TST1016', message: 'Bad Request for this name.' },
      });
  }
  if (req.query.name === 'blank') {
    return res.status(200).json({});
  }
  if (req.query.name === 'customobject') {
    return res.status(422).json({
      errors: [
        {
          code: 'TST1010',
          title: 'Custom object error.',
          message: 'Invalid custom object',
        },
      ],
    });
  }

  if (req.query.name === 'customobjectnested') {
    return res.status(422).json({
      errors: [
        [
          {
            code: 'TST1010',
            title: 'Custom object error.',
            message: 'Invalid custom object',
          },
        ],
      ],
    });
  }
  res.json({
    message: 'Hello from API One!',
    warning: [{ message: 'This is a warning message from API One!' }],
  });
});

app.get('/api/two', (req, res) => {
  console.log(req.query.name);

  if (req.query.name === 'null') {
    return res
      .status(400)
      .json({
        error: {
          code: 'TST1001',
          message: 'Name query parameter is required.',
        },
      });
  }
  if (req.query.name === 'forbidden') {
    return res
      .status(403)
      .json({
        error: { code: 'TST1002', message: 'Access Forbidden for this name.' },
      });
  }
  if (req.query.name === 'notfound') {
    return res
      .status(404)
      .json({ error: { code: 'TST1003', message: 'Name not found.' } });
  }
  if (req.query.name === 'servererror') {
    return res
      .status(500)
      .json({ error: { code: 'TST1004', message: 'Internal server error.' } });
  }
  if (req.query.name === 'badrequest') {
    return res
      .status(400)
      .json({
        error: { code: 'TST1005', message: 'Bad Request for this name.' },
      });
  }
  if (req.query.name === 'abc1') {
    return res.status(422).json({
      errors: [
        {
          code: 'TST1006',
          title: 'Custom object error.',
          message: 'Invalid custom object',
        },
      ],
    });
  }
  res.json({
    message: 'Hello from API One!',
    warning: [{ message: 'This is a warning message from API One!' }],
  });
});

app.get('/api/one-journey', (req, res) => {
  res.json({
    data: {
      acceptance: {
        checkedInJourneyElements: [
          {
            id: '600795C5000382F4',
          },
        ],
        isAccepted: false,
        isPartial: true,
        isVoluntaryDeniedBoarding: false,
        notCheckedInJourneyElements: [
          {
            id: '600795C5000382F3',
          },
        ],
      },
      acceptanceEligibility: {
        eligibilityWindow: {
          closingDateAndTime: '2026-01-13T01:45:00+04:00',
          openingDateAndTime: '2026-01-11T20:45:00+04:00',
        },
        status: 'eligible',
      },
      contacts: [
        {
          address: 'AKJ@ETIHAD.AE',
          category: 'personal',
          contactType: 'Email',
          id: '610855C500031222_5fd04664',
          purpose: 'notification',
          travelerIds: ['610855C500031222'],
        },
        {
          category: 'personal',
          contactType: 'Phone',
          countryPhoneExtension: '971',
          id: '610855C500031222_c772d13a',
          number: '583923222',
          purpose: 'notification',
          travelerIds: ['610855C500031222'],
        },
        {
          address: 'SVARMY@GMAIL.COM',
          category: 'personal',
          contactType: 'Email',
          id: '610855C5000312CE_35526d01',
          purpose: 'notification',
          travelerIds: ['610855C5000312CE'],
        },
        {
          category: 'personal',
          contactType: 'Phone',
          countryPhoneExtension: '971',
          id: '610855C5000312CE_6b90a91c',
          number: '567800220',
          purpose: 'notification',
          travelerIds: ['610855C5000312CE'],
        },
      ],
      flights: [
        {
          id: 'EY-61-20260113',
        },
      ],
      id: '854F8E09C7348555C8580BCB97CD3FECA38197751768372544',
      isGroupBooking: false,
      journeyElements: [
        {
          id: '600795C5000382F4',
        },
        {
          id: '600795C5000382F3',
        },
      ],
      travelers: [
        {
          dateOfBirth: '1986-12-30',
          gender: 'male',
          id: '610855C500031222',
          isPilgrimConfirmationProvided: false,
          names: [
            {
              firstName: 'GAY',
              lastName: 'BAYER',
              nameType: 'universal',
              title: 'LORD',
            },
          ],
          passengerTypeCode: 'ADT',
        },
        {
          dateOfBirth: '2014-02-12',
          gender: 'male',
          id: '610855C5000312CE',
          isPilgrimConfirmationProvided: false,
          names: [
            {
              firstName: 'SILAS',
              lastName: 'BAYER',
              nameType: 'universal',
              title: '',
            },
          ],
          passengerTypeCode: 'CHD',
        },
      ],
      type: 'standalone',
    },
    dictionaries: {
      aircraft: {
        388: 'AIRBUS A380-800',
      },
      airline: {
        EY: 'ETIHAD AIRWAYS',
      },
      country: {
        AE: 'UNITED ARAB EMIRATES',
        GB: 'UNITED KINGDOM',
      },
      flight: {
        'EY-61-20260113': {
          acceptanceStatus: 'opened',
          aircraftCode: '388',
          arrival: {
            dateTime: '2026-01-13T06:40:00+00:00',
            locationCode: 'LHR',
            terminal: '4',
          },
          departure: {
            dateTime: '2026-01-13T02:45:00+04:00',
            locationCode: 'AUH',
            terminal: 'A',
          },
          duration: 28500,
          id: 'EY-61-20260113',
          isIATCI: false,
          isPilgrimConfirmationRequired: false,
          marketingAirlineCode: 'EY',
          marketingFlightNumber: '61',
          operatingAirlineCode: 'EY',
          operatingAirlineFlightNumber: '61',
          operatingAirlineName: 'ETIHAD AIRWAYS',
          operatingFlightNumber: '61',
          status: 'scheduled',
        },
      },
      journeyElement: {
        '600795C5000382F3': {
          acceptanceEligibility: {
            eligibilityWindow: {
              closingDateAndTime: '2026-01-13T01:45:00+04:00',
              openingDateAndTime: '2026-01-11T20:45:00+04:00',
            },
            status: 'eligible',
          },
          boardingPassEligibility: {
            reasons: ['passengerNotAccepted'],
            status: 'ineligible',
          },
          boardingPassPrintStatus: 'notPrinted',
          boardingStatus: 'notBoarded',
          cabin: 'J',
          checkInStatus: 'notAccepted',
          fareFamily: {
            code: 'EY-JCOMFORT',
          },
          flightId: 'EY-61-20260113',
          id: '600795C5000382F3',
          orderId: '7OHQUF',
          regulatoryProgramsCheckStatuses: [
            {
              isOverallSuccess: true,
              regulatoryProgram: {
                countryCode: 'GBR',
              },
              statuses: [
                {
                  humanReadableDescription: 'OK to Board',
                  isSuccessful: true,
                  statusCode: '0',
                  statusType: 'SECURITY',
                },
                {
                  humanReadableDescription: 'Manual Check For Visa Nationals',
                  isSuccessful: true,
                  statusCode: 'Z',
                  statusType: 'IMMIGRATION',
                },
              ],
            },
            {
              regulatoryProgram: {
                name: 'ADC',
              },
              statuses: [
                {
                  statusCode: 'O',
                },
              ],
            },
          ],
          seatmapEligibility: {
            status: 'eligible',
          },
          travelerId: '610855C5000312CE',
        },
        '600795C5000382F4': {
          acceptanceEligibility: {
            eligibilityWindow: {
              closingDateAndTime: '2026-01-13T01:45:00+04:00',
              openingDateAndTime: '2026-01-11T20:45:00+04:00',
            },
            status: 'eligible',
          },
          boardingPassEligibility: {
            status: 'eligible',
          },
          boardingPassPrintStatus: 'printed',
          boardingStatus: 'notBoarded',
          cabin: 'J',
          checkInStatus: 'accepted',
          fareFamily: {
            code: 'EY-JCOMFORT',
          },
          flightId: 'EY-61-20260113',
          id: '600795C5000382F4',
          orderId: '7OHQUF',
          regulatoryProgramsCheckStatuses: [
            {
              isOverallSuccess: true,
              regulatoryProgram: {
                countryCode: 'ARE',
              },
              statuses: [
                {
                  humanReadableDescription: 'OK to Board if documents are OK',
                  isSuccessful: true,
                  statusCode: '',
                  statusType: 'SECURITY',
                },
              ],
            },
            {
              isOverallSuccess: true,
              regulatoryProgram: {
                countryCode: 'GBR',
              },
              statuses: [
                {
                  humanReadableDescription: 'OK to Board',
                  isSuccessful: true,
                  statusCode: '0',
                  statusType: 'SECURITY',
                },
                {
                  humanReadableDescription: 'Manual Check For Visa Nationals',
                  isSuccessful: true,
                  statusCode: 'Z',
                  statusType: 'IMMIGRATION',
                },
              ],
            },
            {
              regulatoryProgram: {
                name: 'ADC',
              },
              statuses: [
                {
                  statusCode: 'O',
                },
              ],
            },
          ],
          seat: {
            cabin: 'J',
            isInfantAloneOnSeat: false,
            isInfantOnSeat: false,
            seatAvailabilityStatus: 'occupied',
            seatCharacteristicsCodes: ['9', 'BC', 'N', 'UP'],
            seatNumber: '22F',
          },
          seatmapEligibility: {
            status: 'eligible',
          },
          travelerId: '610855C500031222',
        },
      },
      location: {
        AUH: {
          airportName: 'ABU DHABI ZAYED INTERNATION',
          cityCode: 'AUH',
          cityName: 'ABU DHABI',
          countryCode: 'AE',
          stateCode: '',
          type: 'airport',
        },
        LHR: {
          airportName: 'LONDON HEATHROW',
          cityCode: 'LON',
          cityName: 'LONDON',
          countryCode: 'GB',
          stateCode: '',
          type: 'airport',
        },
      },
      traveler: {
        '610855C500031222': {
          dateOfBirth: '1986-12-30',
          gender: 'male',
          id: '610855C500031222',
          isPilgrimConfirmationProvided: false,
          names: [
            {
              firstName: 'GAY',
              lastName: 'BAYER',
              nameType: 'universal',
              title: 'LORD',
            },
          ],
          passengerTypeCode: 'ADT',
        },
        '610855C5000312CE': {
          dateOfBirth: '2014-02-12',
          gender: 'male',
          id: '610855C5000312CE',
          isPilgrimConfirmationProvided: false,
          names: [
            {
              firstName: 'SILAS',
              lastName: 'BAYER',
              nameType: 'universal',
              title: '',
            },
          ],
          passengerTypeCode: 'CHD',
        },
      },
    },
  });
});

app.post('/api/one', (req, res) => {
  if (req.query.name === 'null') {
    return res
      .status(400)
      .json({
        error: {
          code: 'TST1001',
          message: 'Name query parameter is required.',
        },
      });
  }
  if (req.query.name === 'forbidden') {
    return res
      .status(403)
      .json({
        error: { code: 'TST1002', message: 'Access Forbidden for this name.' },
      });
  }
  if (req.query.name === 'notfound') {
    return res
      .status(404)
      .json({ error: { code: 'TST1003', message: 'Name not found.' } });
  }
  if (req.query.name === 'servererror') {
    return res
      .status(500)
      .json({ error: { code: 'TST1004', message: 'Internal server error.' } });
  }
  if (req.query.name === 'badrequest') {
    return res
      .status(400)
      .json({
        error: { code: 'TST1005', message: 'Bad Request for this name.' },
      });
  } else {
    return res.json({
      type: 'amadeusOAuth2Token',
      username:
        'GuiQHWUFVsdoCulnjnScqNp0046Fe7rbqesJrrhXwk@pkCxWvL21e3YJbycvvgBcKwrVRGQS5qhnsfItA2elY.com',
      application_name: '9WRw9aPX06cMDGzAveyWywFtLHkHHTMJ2IhQr2x4E',
      client_id: 'GYWAAGQgQaPdZvSla8HDexJnzrkLBq2b',
      token_type: 'Bearer',
      access_token: 'CMfRelgV6ShxU83nvGaeyMUAmMQd',
      expires_in: 1799,
      state: 'approved',
      scope: '',
      guest_office_id: '',
    });
  }
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
  });
}

module.exports = app;
