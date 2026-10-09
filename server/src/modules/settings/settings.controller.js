import { createSettingsService } from './settings.service.js';

export function createSettingsController({ settingsService } = {}) {
  let service = settingsService;
  function getService() {
    service ??= createSettingsService();
    return service;
  }

  async function get(req, res) {
    const settings = await getService().get(req.user.id);
    res.status(200).json({ settings });
  }

  async function update(req, res) {
    const settings = await getService().update(req.user.id, req.body);
    res.status(200).json({ settings });
  }

  return { get, update };
}

export default createSettingsController;
