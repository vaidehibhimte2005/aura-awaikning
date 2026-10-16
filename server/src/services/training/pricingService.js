import { Package } from '../../models/index.js';
import { getConfig } from './configService.js';

const money = (n) => Math.round(n * 100) / 100;

/**
 * price = dailyRate × trainingDays − discount. Always computed from the CURRENT
 * admin settings; the client never supplies or influences any amount.
 */
export function computePrice(pkg, cfg) {
  const baseAmount = money(cfg.dailyRate * pkg.trainingDays);
  let discount = pkg.discountType === 'amount' ? pkg.discountValue : (baseAmount * pkg.discountValue) / 100;
  discount = money(Math.min(Math.max(discount, 0), baseAmount));
  const amount = money(baseAmount - discount);
  return {
    dailyRate: cfg.dailyRate,
    trainingDays: pkg.trainingDays,
    validityDays: pkg.validityDays,
    baseAmount,
    discount,
    discountPct: baseAmount ? money((discount / baseAmount) * 100) : 0,
    amount,
    savings: discount,
    currency: cfg.currency,
  };
}

export function presentPackage(pkg, cfg) {
  const o = pkg.toObject ? pkg.toObject() : pkg;
  return { ...o, price: computePrice(o, cfg) };
}

export async function listPricedPackages({ includeInactive = false } = {}) {
  const cfg = await getConfig();
  const packages = await Package.find(includeInactive ? {} : { isActive: true }).sort({ order: 1, trainingDays: 1 });
  return { config: { currency: cfg.currency, dailyRate: cfg.dailyRate }, packages: packages.map((p) => presentPackage(p, cfg)) };
}
