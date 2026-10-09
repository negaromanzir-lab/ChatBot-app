import config from '../../config/env.js';
import { createUsageRepository } from './usage.repository.js';

export function createUsageService({
  repository,
  dailyLimit = config.usage.dailyChatQuota,
  clock = () => new Date(),
} = {}) {
  let resolvedRepository = repository;

  function getRepository() {
    resolvedRepository ??= createUsageRepository();
    return resolvedRepository;
  }

  async function consumeChatRequest(userId) {
    const now = clock();
    const usageDate = now.toISOString().slice(0, 10);
    const requestCount = await getRepository().consumeChatRequest(
      userId,
      usageDate,
      dailyLimit,
    );
    const resetsAt = new Date(`${usageDate}T00:00:00.000Z`);
    resetsAt.setUTCDate(resetsAt.getUTCDate() + 1);
    return {
      allowed: requestCount !== null,
      limit: dailyLimit,
      remaining: requestCount === null ? 0 : dailyLimit - requestCount,
      resetsAt,
    };
  }

  return { consumeChatRequest };
}

export default createUsageService;
