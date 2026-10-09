import { Router } from 'express';
import { z } from 'zod';
import validate from '../../middleware/validate.js';
import asyncHandler from '../../utils/asyncHandler.js';
import { createSettingsController } from './settings.controller.js';

export const settingsPatchSchema = z.object({
  theme: z.enum(['system', 'light', 'dark']).optional(),
  displayName: z.string().trim().min(1).max(40).optional(),
  selectedModelId: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/).nullable().optional(),
}).refine((patch) => Object.keys(patch).length > 0, {
  message: 'At least one setting must be provided.',
});

export function createSettingsRouter({ settingsController, settingsService } = {}) {
  const router = Router();
  const controller = settingsController ?? createSettingsController({ settingsService });

  router.get('/', asyncHandler(controller.get));
  router.patch('/', validate({ body: settingsPatchSchema }), asyncHandler(controller.update));
  return router;
}

export default createSettingsRouter;
