/**
 * Wraps an async route handler so a rejected promise is forwarded to Express'
 * error pipeline.
 *
 * Express 5 already forwards rejected promises from async handlers, so this is
 * not strictly required today. It is kept because it makes the guarantee
 * explicit at every call site and keeps the routes working unchanged if the
 * server is ever pinned back to Express 4, where an unhandled rejection in an
 * async handler hangs the request instead of erroring it.
 */
export function asyncHandler(handler) {
  return function wrapped(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export default asyncHandler;