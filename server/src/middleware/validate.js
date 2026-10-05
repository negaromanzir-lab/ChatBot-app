import ApiError from '../utils/ApiError.js';

/**
 * Validates and replaces `req.body` with the parsed result.
 *
 * Using the parsed output (not the raw input) means downstream code only ever
 * sees values that matched the schema — unknown keys are stripped and defaults
 * applied. Field paths are mapped to dotted names so the client gets an
 * actionable error instead of a generic "invalid request".
 */
export function validate({ body: bodySchema }) {
  return function validateRequest(req, _res, next) {
    const result = bodySchema.safeParse(req.body);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || '(root)',
        message: issue.message,
      }));

      return next(
        ApiError.badRequest(
          'VALIDATION_ERROR',
          'The request body is invalid.',
          details,
        ),
      );
    }

    req.body = result.data;
    return next();
  };
}

export default validate;