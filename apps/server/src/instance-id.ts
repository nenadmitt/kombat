import { hostname } from 'os';

/** Identifies this process in logs and probe responses, so a multi-instance
 *  deployment can be told apart from a single one. */
export const INSTANCE_ID = `${hostname()}-${process.pid}`;
