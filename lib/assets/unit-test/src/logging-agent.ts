import { ulid } from 'ulidx';
import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
const { STAGE_ID, LOG_SUBSCRIBER_URL } = process.env;

// Sends a POST request with the log data, to the endpoint
export async function emitLog(logText: string, logToConsole = true) {
  // Assemble log
  const logObj = {
    id: ulid(),
    stageId: STAGE_ID,
    log: logText,
    timestamp: new Date(),
  };

  // Send log to remote log receiver
  await axios.post(LOG_SUBSCRIBER_URL, logObj);

  // Optionally log to console, for debugging
  if (logToConsole) {
    console.log(logText);
  }
}
