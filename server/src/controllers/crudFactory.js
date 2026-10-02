import { ApiError, asyncHandler, created, escapeRegex, getPagination, ok, pageMeta } from '../utils/http.js';
import { uniqueSlug } from '../utils/slugify.js';

/**
 * Generic list/get/create/update/delete handlers for simple content models
 * (articles, FAQs, testimonials, announcements, categories, messages).
 * Keeps those controllers consistent and avoids copy-pasted CRUD code.
 *
 * options:
 *  - searchFields: fields matched by ?q=
 *  - filterFields: query params copied into the filter as-is (e.g. status, category)
 *  - publicFilter: filter applied when the caller is not a content editor
 *  - isEditor(req): whether the caller can see unpublished items
 *  - slugFrom: field to build a unique slug from
 *  - defaultSort, populate
 *  - beforeCreate(req, data), afterCreate(req, doc)
 */
export function crudFactory(Model, options = {}) {
  const {
    searchFields = [],
    filterFields = [],
    publicFilter = {},
    isEditor = () => false,
    slugFrom,
    defaultSort = { createdAt: -1 },
    populate,
    beforeCreate,
    afterCreate,
    idField = '_id',
  } = options;

  const buildFilter = (req) => {
    const filter = isEditor(req) ? {} : { ...publicFilter };
    filterFields.forEach((f) => {
      if (req.query[f] !== undefined && req.query[f] !== '') filter[f] = String(req.query[f]);
    });
    if (req.query.q && searchFields.length) {
      const rx = new RegExp(escapeRegex(String(req.query.q).slice(0, 80)), 'i');
      filter.$or = searchFields.map((f) => ({ [f]: rx }));
    }
    return filter;
  };

  const findOne = (req) => {
    const key = req.params.id;
    const byId = /^[a-f\d]{24}$/i.test(key);
    const q = byId ? { _id: key } : { [idField === '_id' ? 'slug' : idField]: key };
    return { ...q, ...(isEditor(req) ? {} : publicFilter) };
  };

  return {
    list: asyncHandler(async (req, res) => {
      const pg = getPagination(req.query, { defaultLimit: 20 });
      const filter = buildFilter(req);
      let query = Model.find(filter).sort(defaultSort).skip(pg.skip).limit(pg.limit);
      if (populate) query = query.populate(populate);
      const [items, total] = await Promise.all([query.lean(), Model.countDocuments(filter)]);
      ok(res, items, 200, pageMeta(total, pg));
    }),

    get: asyncHandler(async (req, res) => {
      let query = Model.findOne(findOne(req));
      if (populate) query = query.populate(populate);
      const doc = await query;
      if (!doc) throw ApiError.notFound();
      ok(res, doc);
    }),

    create: asyncHandler(async (req, res) => {
      const data = { ...req.body };
      if (slugFrom) data.slug = await uniqueSlug(Model, data.slug || data[slugFrom]);
      if (beforeCreate) await beforeCreate(req, data);
      const doc = await Model.create(data);
      if (afterCreate) await afterCreate(req, doc);
      created(res, doc);
    }),

    update: asyncHandler(async (req, res) => {
      const doc = await Model.findById(req.params.id);
      if (!doc) throw ApiError.notFound();
      const data = { ...req.body };
      if (slugFrom && data.slug !== undefined) data.slug = await uniqueSlug(Model, data.slug || data[slugFrom] || doc[slugFrom], doc._id);
      doc.set(data);
      await doc.save();
      ok(res, doc);
    }),

    remove: asyncHandler(async (req, res) => {
      const doc = await Model.findByIdAndDelete(req.params.id);
      if (!doc) throw ApiError.notFound();
      ok(res, { id: doc.id });
    }),
  };
}
