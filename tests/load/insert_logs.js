import { check, sleep } from 'k6';
import http from 'k6/http';

const URL =
  'https://30zdo3pwkc.execute-api.us-east-1.amazonaws.com/internal/log-updates?stage_id=d8583d1c-ce63-4e0c-bd55-2088409bc7e3';

export const options = {
  // Key configurations for Stress in this section
  stages: [
    { duration: '10m', target: 1000 }, // traffic ramp-up from 1 to a higher 200 users over 10 minutes.
    { duration: '30m', target: 1000 }, // stay at higher 200 users for 10 minutes
    { duration: '5m', target: 0 }, // ramp-down to 0 users
  ],
};

export default function () {
  const data = {
    id: 'd8583d13-ce63-4e0c-bd55-2088409bc7e9',
    message: 'example log',
    timestamp: '2020-01-01T00:00:00Z',
    score: 10,
    type: 'stdout',
    stageId: 'd8583d1c-ce63-4e0c-bd55-2088409bc7e3',
  };

  let res = http.post(URL, JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });

  check(res, { 'success insertion': (r) => r.status === 200 });

  sleep(1);
}
