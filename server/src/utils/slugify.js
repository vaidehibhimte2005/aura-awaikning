export function slugify(text = '') {
  return String(text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

/** Returns a slug that is unique for the given model (appends -2, -3…). */
export async function uniqueSlug(Model, base, excludeId) {
  const root = slugify(base) || 'item';
  let slug = root;
  let n = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await Model.exists({ slug, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })) {
    n += 1;
    slug = `${root}-${n}`;
  }
  return slug;
}
