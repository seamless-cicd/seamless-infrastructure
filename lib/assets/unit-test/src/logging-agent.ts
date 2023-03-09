import dotenv from 'dotenv';
dotenv.config();

import { ulid, decodeTime } from 'ulidx';
import fetch from 'node-fetch';

const { STAGE_ID, LOG_SUBSCRIBER_URL } = process.env;

// Send a POST request with the log data, to the endpoint
export async function emitLog(
  logText: string,
  logToConsole = true,
  logType = 'stdout',
) {
  // Assemble log
  const newUlid = ulid();
  const timeValue = decodeTime(newUlid);
  const logObj = {
    id: newUlid,
    stageId: STAGE_ID,
    log: logText,
    timestamp: new Date(timeValue).toISOString(),
    score: timeValue,
    type: logType,
  };

  // Send log to remote log receiver
  await fetch(LOG_SUBSCRIBER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(logObj),
  });

  // Optionally log to console, for debugging
  if (logToConsole) {
    console.log(logText);
  }
}
