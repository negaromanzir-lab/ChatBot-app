/**
 * Operational (expected) error carrying an HTTP status and a stable machine
 * readable code.
 *
 * Distinguishing this from a programming bug matters: the error middleware only
 * returns `message` to the client for `ApiError`, and hides the details of
 * anything else. That keeps stack traces and internal provider messages out of
 * responses while still letting a caller branch on `code`.
 */
export class ApiError extends Error {
  constructor(statusCode, code, message, { details, cause } = {}) {
    super(message, { cause });
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace?.(this, ApiError);
  }

  static badRequest(code, message, details) {
    return new ApiError(400, code, message, { details });
  }

  static unauthorized(code, message) {
    return new ApiError(401, code, message);
  }

  static forbidden(code, message) {
    return new ApiError(403, code, message);
  }

  static notFound(code, message) {
    return new ApiError(404, code, message);
  }

  static payloadTooLarge(code, message) {
    return new ApiError(413, code, message);
  }

  static tooManyRequests(code, message) {
    return new ApiError(429, code, message);
  }

  static badGateway(code, message, options) {
    return new ApiError(502, code, message, options);
  }

  static serviceUnavailable(code, message, options) {
    return new ApiError(503, code, message, options);
  }

  static gatewayTimeout(code, message, options) {
    return new ApiError(504, code, message, options);
  }

  static internal(code, message, options) {
    return new ApiError(500, code, message, options);
  }
}

export default ApiError;