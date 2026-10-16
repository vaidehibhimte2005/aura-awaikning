import { Package } from '../models/index.js';

/**
 * First-run defaults only: Daily / Weekly / Monthly. Prices are not stored — they derive from the
 * admin's base daily rate (default ₹1,000) and each package's discount below. Existing packages are never touched.
 */
export const DEFAULT_PACKAGES = [
  {
    code: 'daily', name: 'Daily', kind: 'daily', order: 1, trainingDays: 1, validityDays: 1,
    discountType: 'percent', discountValue: 0,
    description: 'One live 1:1 session with a trainer. Perfect for trying Aura Awakening.',
    features: ['1 live trainer-led session', 'Choose any published slot', 'Valid for 1 day'],
  },
  {
    code: 'weekly', name: 'Weekly', kind: 'weekly', order: 2, trainingDays: 7, validityDays: 7, isFeatured: false,
    discountType: 'percent', discountValue: 10,
    description: 'Seven training days within a week — train on the days that suit you.',
    features: ['Up to 7 training days', 'Pay only for sessions completed', 'Valid for 7 days'],
  },
  {
    code: 'monthly', name: 'Monthly', kind: 'monthly', order: 3, trainingDays: 30, validityDays: 30, isFeatured: true,
    discountType: 'percent', discountValue: 20,
    description: 'The best value for a steady practice: up to 30 training days over 30 days.',
    features: ['Up to 30 training days', 'Skip days freely — only completed sessions count', 'Valid for 30 days', 'Best value'],
  },
];

export async function seedDefaultPackages() {
  if (await Package.estimatedDocumentCount()) return 0;
  await Package.insertMany(DEFAULT_PACKAGES);
  return DEFAULT_PACKAGES.length;
}
