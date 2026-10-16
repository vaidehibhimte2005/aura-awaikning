import { TrainingConfig, Trainer } from '../../models/index.js';

let cache = null;
let cachedAt = 0;
const TTL = 5000;

/** Current admin settings (created with defaults on first use). Cached for a few seconds. */
export async function getConfig({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cachedAt < TTL) return cache;
  let cfg = await TrainingConfig.findOne({ key: 'default' }).lean();
  if (!cfg) {
    try {
      cfg = (await TrainingConfig.create({ key: 'default' })).toObject();
    } catch (err) {
      if (err.code !== 11000) throw err;
      cfg = await TrainingConfig.findOne({ key: 'default' }).lean();
    }
  }
  cache = cfg;
  cachedAt = Date.now();
  return cfg;
}

export async function updateConfig(patch) {
  await getConfig({ fresh: true });
  // Flatten nested objects into dotted $set paths so partial updates never wipe sibling settings.
  const $set = {};
  const walk = (obj, prefix = '') => {
    for (const [k, v] of Object.entries(obj)) {
      const path = prefix + k;
      if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, `${path}.`);
      else $set[path] = v;
    }
  };
  walk(patch);
  const cfg = await TrainingConfig.findOneAndUpdate({ key: 'default' }, { $set }, { new: true, runValidators: true }).lean();
  cache = cfg;
  cachedAt = Date.now();
  return cfg;
}

/** Payout for one eligible session of this trainer: their own rate, else the global default. */
export async function payoutFor(trainerUserId, cfg) {
  const config = cfg || (await getConfig());
  const t = await Trainer.findOne({ user: trainerUserId }).select('payoutPerSession').lean();
  return t?.payoutPerSession ?? config.trainerPayoutPerSession;
}

export const invalidateConfigCache = () => {
  cache = null;
};
