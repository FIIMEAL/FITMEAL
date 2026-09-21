export class HttpError extends Error {
  constructor(status, message, details = undefined) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

export function sendError(res, error) {
  const status = error.status || 500;
  const body = { error: error.message || 'Internal server error' };
  if (error.details !== undefined) body.details = error.details;
  return res.status(status).json(body);
}
