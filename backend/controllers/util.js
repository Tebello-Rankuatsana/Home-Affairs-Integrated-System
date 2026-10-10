// What services need to know about the caller
import { z } from 'zod';

export const ctx = (req) => ({ user: req.user, ip: req.ip });

// All primary keys are BigInt autoincrement, serialised as numeric strings
// (e.g. "1", "42") — never UUIDs. Use this for every :id / *Id param.
export const dbId = z.string().regex(/^\d+$/, 'Expected a numeric id');
