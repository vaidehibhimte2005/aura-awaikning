/**
 * Sample marketplace courses. Idempotent — safe to run any number of times:
 * everything is upserted by slug / (course, lesson title), never duplicated.
 *
 *   npm run seed:demo
 *
 * Content is flagged `isDemo: true` and stays editable through the normal
 * course management screens. Prices are illustrative, not market rates.
 * No trainer accounts or credentials are created here: courses attach to an
 * existing seeded trainer when one exists (development), otherwise to none.
 */
import mongoose from 'mongoose';
import { pathToFileURL } from 'url';
import { connectDB } from '../config/db.js';
import { Category, Course, Lesson, Trainer, User } from '../models/index.js';
import { recalcCourseStats } from '../services/learningService.js';

const DEMO_VIDEO = 'inpok4MKVLM'; // placeholder video — replace from the trainer panel

export const DEMO_COURSES = [
  {
    slug: 'mindfulness-for-beginners', title: 'Mindfulness for Beginners', category: 'Meditation', level: 'beginner', hours: 2, price: 499,
    short: 'Learn the foundations of mindfulness with simple, everyday practices.',
    lessons: ['What is mindfulness?', 'Anchoring attention in the breath', 'Mindful moments in daily life', 'Building a sustainable practice'],
  },
  {
    slug: 'guided-meditation-for-inner-peace', title: 'Guided Meditation for Inner Peace', category: 'Meditation', level: 'beginner', hours: 3, price: 799,
    short: 'A series of guided sessions to quiet the mind and settle into stillness.',
    lessons: ['Preparing your space', 'Settling the body', 'Releasing the noise of the day', 'Resting in stillness', 'Closing and carrying it with you'],
  },
  {
    slug: 'yoga-and-breathwork-foundations', title: 'Yoga and Breathwork Foundations', category: 'Yoga & Breathwork', level: 'beginner', hours: 4, price: 999,
    short: 'Gentle yoga postures joined with foundational breathing techniques.',
    lessons: ['Posture and alignment basics', 'Three-part breath', 'Sun salutations, slowly', 'Breath and movement together', 'A short daily flow'],
  },
  {
    slug: 'emotional-wellness-essentials', title: 'Emotional Wellness Essentials', category: 'Emotional Wellness', level: 'beginner', hours: 3, price: 699,
    short: 'Understand, name and work with emotions in a grounded, compassionate way.',
    lessons: ['Naming what you feel', 'The body keeps the score', 'Responding, not reacting', 'Self-compassion practice'],
  },
  {
    slug: 'discover-your-personal-growth-journey', title: 'Discover Your Personal Growth Journey', category: 'Personal Growth', level: 'beginner', hours: 5, price: 1299,
    short: 'Clarify your values, set meaningful intentions and build habits that last.',
    lessons: ['Where am I now?', 'Values and purpose', 'Intentions that stick', 'Habits and rituals', 'Reflection and review'],
  },
  {
    slug: 'introduction-to-spiritual-awareness', title: 'Introduction to Spiritual Awareness', category: 'Spiritual Awareness', level: 'beginner', hours: 3, price: 899,
    short: 'A gentle, non-dogmatic introduction to inner awareness and contemplative practice.',
    lessons: ['What awareness means', 'Silence and contemplation', 'Living with presence', 'Questions worth sitting with'],
  },
];

const slugify = (s) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export async function seedDemoCourses({ log = console.log } = {}) {
  const trainer = await Trainer.findOne({ isPublished: true }).sort({ order: 1 });
  const owner = await User.findOne({ role: 'admin' }).select('_id');
  let created = 0;

  for (const d of DEMO_COURSES) {
    // eslint-disable-next-line no-await-in-loop
    const cat = await Category.findOneAndUpdate(
      { slug: slugify(d.category) },
      { $setOnInsert: { name: d.category, slug: slugify(d.category), order: 10 } },
      { upsert: true, new: true },
    );
    // eslint-disable-next-line no-await-in-loop
    const exists = await Course.exists({ slug: d.slug });
    // eslint-disable-next-line no-await-in-loop
    const course = await Course.findOneAndUpdate(
      { slug: d.slug },
      {
        $setOnInsert: {
          title: d.title,
          slug: d.slug,
          shortDescription: d.short,
          description: `${d.short}\n\nThis is sample course content for demonstration. Replace the description, lessons and videos from the course management screens.`,
          category: cat._id,
          level: d.level,
          price: d.price,
          currency: 'INR',
          trainers: trainer ? [trainer._id] : [],
          outcomes: ['Understand the core ideas', 'Practise with guided exercises', 'Build a routine you can keep'],
          requirements: ['No prior experience needed'],
          targetAudience: 'Anyone beginning their wellness journey',
          refundPolicy: 'Refunds follow the platform refund policy.',
          status: 'published',
          publishedAt: new Date(),
          isDemo: true,
          createdBy: owner?._id,
          statusHistory: [{ from: 'draft', to: 'published', reason: 'Demo seed', at: new Date() }],
        },
      },
      { upsert: true, new: true },
    );
    if (!exists) created += 1;

    for (const [i, title] of d.lessons.entries()) {
      // eslint-disable-next-line no-await-in-loop
      await Lesson.updateOne(
        { course: course._id, title },
        {
          $setOnInsert: {
            course: course._id,
            title,
            section: 'Lessons',
            description: 'Sample lesson.',
            youtubeId: DEMO_VIDEO,
            youtubeUrl: `https://www.youtube.com/watch?v=${DEMO_VIDEO}`,
            durationMinutes: Math.round((d.hours * 60) / d.lessons.length),
            order: i + 1,
            isPreview: i === 0,
            isPublished: true,
          },
        },
        { upsert: true },
      );
    }
    // Keep the displayed lesson count / duration in step with the lessons.
    // eslint-disable-next-line no-await-in-loop
    await recalcCourseStats(course._id);
  }
  log(`✓ Demo courses ready (${created} new, ${DEMO_COURSES.length - created} already present)`);
  return { created, total: DEMO_COURSES.length };
}

// Run directly: `node src/seed/demoCourses.js`
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  connectDB()
    .then(() => seedDemoCourses())
    .catch((e) => {
      console.error('✖ Demo seed failed:', e);
      process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
}
