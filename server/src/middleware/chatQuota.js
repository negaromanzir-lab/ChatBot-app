import config from '../config/env.js';
import { createUsageService } from '../modules/usage/usage.service.js';
import ApiError from '../utils/ApiError.js';

export function createChatQuotaMiddleware({
  usageService,
  dailyLimit = config.usage.dailyChatQuota,
} = {}) {
  let service = usageService;

  return async function enforceChatQuota(req, res, next) {
    if (!req.user?.id) {
      throw ApiError.unauthorized('AUTH_REQUIRED', 'Sign in to use the chat service.');
    }

    service ??= createUsageService({ dailyLimit });
    const quota = await service.consumeChatRequest(req.user.id);
    res.setHeader('X-Chat-Quota-Limit', String(quota.limit));
    res.setHeader('X-Chat-Quota-Remaining', String(quota.remaining));
    res.setHeader('X-Chat-Quota-Reset', String(Math.floor(quota.resetsAt.getTime() / 1000)));

    if (!quota.allowed) {
      res.setHeader(
        'Retry-After',
        String(Math.max(1, Math.ceil((quota.resetsAt.getTime() - Date.now()) / 1000))),
      );
      return next(ApiError.tooManyRequests(
        'CHAT_QUOTA_EXCEEDED',
        'Your daily chat limit has been reached. Please try again after the quota resets.',
      ));
    }

    return next();
  };
}

export default createChatQuotaMiddleware;
