import { hostname } from 'os';

export const INSTANCE_ID = `${hostname()}-${process.pid}`;
