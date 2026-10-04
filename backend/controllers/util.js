// What services need to know about the caller
export const ctx = (req) => ({ user: req.user, ip: req.ip });
