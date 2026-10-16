/**
 * Seeds demo content. Safe by default: refuses to run on a database that
 * already has courses unless `--reset` is passed (which wipes demo collections).
 *
 *   npm run seed         # first-time setup
 *   npm run seed:reset   # wipe & reseed (development only)
 */
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { connectDB } from '../config/db.js';
import {
  Announcement,
  Article,
  Category,
  Certificate,
  ContactMessage,
  Course,
  Enrollment,
  FAQ,
  Lesson,
  LessonProgress,
  LiveSession,
  Notification,
  Order,
  Payment,
  SiteSetting,
  Testimonial,
  Trainer,
  TrainerApplication,
  ActivityLog,
  AttendanceEvent,
  Booking,
  Earning,
  Package,
  Slot,
  Subscription,
  TrainingConfig,
  UsageRecord,
  User,
} from '../models/index.js';
import { recalcCourseStats, enrollUser, recomputeProgress } from '../services/learningService.js';
import { DEFAULT_SETTINGS } from './defaultSettings.js';
import { seedDemoCourses } from './demoCourses.js';
import { seedDefaultPackages } from './defaultPackages.js';
import { zonedToUtc } from '../utils/time.js';

// Demo video — replace with your own lesson videos from the admin/trainer panel.
const DEMO_VIDEO = 'inpok4MKVLM';
const reset = process.argv.includes('--reset');

const hours = (h) => new Date(Date.now() + h * 3600000);

async function run() {
  await connectDB();
  if (reset) {
    if (env.isProd) throw new Error('Refusing to reset in production');
    const models = [Announcement, Article, Category, Certificate, ContactMessage, Course, Enrollment, FAQ, Lesson, LessonProgress, LiveSession, Notification, Order, Payment, SiteSetting, Testimonial, Trainer, TrainerApplication, ActivityLog, AttendanceEvent, Booking, Earning, Package, Slot, Subscription, TrainingConfig, UsageRecord, User];
    await Promise.all(models.map((m) => m.deleteMany({})));
    console.log('• Cleared existing data');
  } else if (await Course.exists({})) {
    console.log('Database already has data. Run `npm run seed:reset` to wipe and reseed (dev only).');
    return;
  }

  const password = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe@123';
  const admin = await User.create({ name: 'Aura Admin', email: process.env.SEED_ADMIN_EMAIL || 'admin@auraawakening.com', password, role: 'admin', emailVerified: true });
  const learner = await User.create({ name: 'Arjun Learner', email: 'learner@auraawakening.com', password, role: 'learner' });

  const trainerData = [
    { name: 'Ananya Rao', email: 'ananya@auraawakening.com', title: 'Meditation & Breathwork Guide', specialties: ['Breathwork', 'Vipassana', 'Yoga Nidra'], experienceYears: 12, shortBio: 'Ananya has guided meditation for over a decade, blending breath, stillness and gentle inquiry.' },
    { name: 'Dev Malhotra', email: 'dev@auraawakening.com', title: 'Mindfulness Coach', specialties: ['Mindfulness', 'Stress', 'Focus'], experienceYears: 9, shortBio: 'Dev brings mindfulness into workplaces and homes with warmth, humour and practical tools.' },
    { name: 'Sara Iyer', email: 'sara@auraawakening.com', title: 'Energy & Somatic Practitioner', specialties: ['Somatics', 'Chakra Balancing', 'Sound'], experienceYears: 7, shortBio: 'Sara works with the body as a teacher — through movement, sound and subtle energy practice.' },
  ];
  const trainers = [];
  for (const [i, t] of trainerData.entries()) {
    // eslint-disable-next-line no-await-in-loop
    const user = await User.create({ name: t.name, email: t.email, password, role: 'trainer', emailVerified: true }); // admin-created style: active, no application state
    // eslint-disable-next-line no-await-in-loop
    trainers.push(await Trainer.create({
      user: user._id,
      displayName: t.name,
      slug: t.name.toLowerCase().replace(/\s+/g, '-'),
      title: t.title,
      shortBio: t.shortBio,
      bio: `${t.shortBio}\n\nTheir sessions are known for being calm, clear and deeply practical — a space where beginners feel welcome and experienced practitioners find new depth.`,
      specialties: t.specialties,
      experienceYears: t.experienceYears,
      order: i,
    }));
  }

  const cats = await Category.insertMany([
    { name: 'Meditation', slug: 'meditation', order: 1 },
    { name: 'Mindfulness', slug: 'mindfulness', order: 2 },
    { name: 'Energy & Healing', slug: 'energy-healing', order: 3 },
    { name: 'Personal Growth', slug: 'personal-growth', order: 4 },
  ]);
  const cat = Object.fromEntries(cats.map((c) => [c.slug, c._id]));

  const courseData = [
    { title: 'Awaken Within', slug: 'awaken-within', category: cat.meditation, level: 'beginner', price: 0, trainers: [trainers[0]._id], isFeatured: true, shortDescription: 'A gentle 7-day foundation in meditation, breath and present-moment awareness.' },
    { title: 'Mindful Energy', slug: 'mindful-energy', category: cat['energy-healing'], level: 'intermediate', price: 2999, compareAtPrice: 3999, trainers: [trainers[2]._id], isFeatured: true, shortDescription: 'Understand and balance your subtle energy through breath, sound and somatic practice.' },
    { title: 'The Calm Mind', slug: 'the-calm-mind', category: cat.mindfulness, level: 'all', price: 1999, trainers: [trainers[1]._id], isFeatured: true, shortDescription: 'Practical mindfulness for stress, sleep and focus in everyday life.' },
    { title: 'Yoga Nidra: The Art of Rest', slug: 'yoga-nidra-art-of-rest', category: cat.meditation, level: 'beginner', price: 1499, trainers: [trainers[0]._id], shortDescription: 'Deep guided relaxation practices to restore the nervous system.' },
    { title: 'Inner Compass', slug: 'inner-compass', category: cat['personal-growth'], level: 'advanced', price: 4999, trainers: [trainers[1]._id, trainers[0]._id], shortDescription: 'A reflective journey into values, purpose and conscious living.' },
  ];

  const sections = [
    ['Arriving', ['Welcome & intention', 'Finding your posture', 'The anchor of breath']],
    ['Practice', ['Body scan', 'Noticing thoughts', 'Working with emotions']],
    ['Integration', ['Daily ritual design', 'Closing reflection']],
  ];

  const courses = [];
  for (const c of courseData) {
    // eslint-disable-next-line no-await-in-loop
    const course = await Course.create({
      ...c,
      description: `${c.shortDescription}\n\nThis program combines short teachings, guided practice and reflection prompts. Each lesson is designed to fit into a busy day, and builds gently on the one before.\n\nYou can learn at your own pace, return to lessons whenever you need them, and join our weekly live circles for questions and shared practice.`,
      currency: 'INR',
      status: 'published',
      requirements: ['A quiet space where you can sit or lie down comfortably', 'Headphones are recommended', 'No previous experience needed'],
      outcomes: ['A steady daily practice you can rely on', 'Tools to calm the nervous system', 'Greater clarity in thoughts and emotions', 'A kinder relationship with yourself'],
      tags: ['meditation', 'awareness'],
      previewVideo: { youtubeId: DEMO_VIDEO, videoType: 'video', durationMinutes: 5 },
      createdBy: admin._id,
    });
    let order = 1;
    for (const [section, titles] of sections) {
      for (const title of titles) {
        // eslint-disable-next-line no-await-in-loop
        await Lesson.create({
          course: course._id,
          section,
          title,
          description: `In this lesson we explore “${title.toLowerCase()}” through a short teaching and a guided practice.`,
          notes: 'Take a few minutes after the practice to journal one thing you noticed.',
          youtubeId: DEMO_VIDEO,
          durationMinutes: 8 + (order % 4) * 3,
          order,
          isPreview: order <= 2,
          resources: order === 1 ? [{ title: 'Practice journal (PDF)', url: 'https://example.com/journal.pdf', kind: 'pdf' }] : [],
        });
        order += 1;
      }
    }
    // eslint-disable-next-line no-await-in-loop
    await recalcCourseStats(course._id);
    courses.push(course);
  }

  // Demo learner: enrolled in the free course with some progress.
  await enrollUser({ userId: learner._id, courseId: courses[0]._id, source: 'free' });
  const firstLessons = await Lesson.find({ course: courses[0]._id }).sort({ order: 1 }).limit(5);
  await LessonProgress.insertMany(firstLessons.map((l) => ({ user: learner._id, course: courses[0]._id, lesson: l._id, completed: true, completedAt: new Date() })));
  await recomputeProgress(learner._id, courses[0]._id);
  await Enrollment.updateOne({ user: learner._id, course: courses[0]._id }, { lastLesson: firstLessons[4]._id, lastAccessedAt: new Date() });

  await LiveSession.insertMany([
    { kind: 'session', title: 'Morning Stillness Circle', slug: 'morning-stillness-circle', description: 'A 45-minute guided sitting with breath awareness and a short reflection.', trainer: trainers[0]._id, startAt: hours(2), endAt: hours(2.75), youtubeId: DEMO_VIDEO, youtubeUrl: `https://www.youtube.com/watch?v=${DEMO_VIDEO}`, isPublished: true },
    { kind: 'session', title: 'Live: Breath & Balance', slug: 'live-breath-balance', description: 'Breathwork for a steady nervous system — happening now.', trainer: trainers[2]._id, startAt: hours(-0.25), endAt: hours(0.75), youtubeId: DEMO_VIDEO, youtubeUrl: `https://www.youtube.com/watch?v=${DEMO_VIDEO}`, isPublished: true },
    { kind: 'session', title: 'Mindful Evenings: Letting Go', slug: 'mindful-evenings-letting-go', description: 'Release the day with gentle awareness and Yoga Nidra.', trainer: trainers[1]._id, startAt: hours(50), endAt: hours(51), youtubeId: DEMO_VIDEO, youtubeUrl: `https://www.youtube.com/watch?v=${DEMO_VIDEO}`, isPublished: true, requiresRegistration: true, accessLevel: 'registered' },
    { kind: 'session', title: 'Q&A: Building a Daily Practice', slug: 'qa-building-daily-practice', description: 'Recording of our community Q&A.', trainer: trainers[1]._id, startAt: hours(-72), endAt: hours(-71), recordingId: DEMO_VIDEO, recordingUrl: `https://www.youtube.com/watch?v=${DEMO_VIDEO}`, isPublished: true },
    { kind: 'event', title: 'Silent Day Retreat — Rishikesh', slug: 'silent-day-retreat-rishikesh', description: 'A full day of silent practice by the Ganga: sitting, walking and mindful meals.', trainer: trainers[0]._id, startAt: hours(24 * 21), endAt: hours(24 * 21 + 8), mode: 'in_person', venue: 'Aura Awakening Sanctuary, Rishikesh', isPublished: true, requiresRegistration: true, capacity: 40 },
    { kind: 'event', title: 'Sound Healing Evening', slug: 'sound-healing-evening', description: 'Singing bowls, gongs and guided rest — online and in person.', trainer: trainers[2]._id, startAt: hours(24 * 10), endAt: hours(24 * 10 + 2), mode: 'hybrid', venue: 'Bengaluru Studio & YouTube Live', isPublished: true, requiresRegistration: true },
  ]);

  await Article.insertMany([
    { title: 'Five Minutes That Change the Day', slug: 'five-minutes-that-change-the-day', excerpt: 'Why the smallest morning practice can shape everything that follows.', body: 'Most of us begin the day already reacting...\n\n## Start with the breath\n\nBefore you reach for your phone, take five slow breaths. Feel the air enter and leave.\n\n## Name one intention\n\nAsk: *how do I want to meet today?* Let one word arise.\n\n## Return, gently\n\nWhen the day pulls you away, return to that word. That return is the practice.', category: 'Practice', authorName: 'Ananya Rao', status: 'published', publishedAt: hours(-24 * 3), readMinutes: 4 },
    { title: 'Understanding Your Energy Body', slug: 'understanding-your-energy-body', excerpt: 'A grounded introduction to subtle energy, without the mystique.', body: 'Energy practice begins with sensation...\n\n## What we mean by energy\n\nWarmth, tingling, heaviness, ease — these are the language of the energy body.\n\n## A simple practice\n\nRest your hands on your belly and notice what moves.', category: 'Energy', authorName: 'Sara Iyer', status: 'published', publishedAt: hours(-24 * 8), readMinutes: 6 },
    { title: 'Mindfulness at Work: A Practical Guide', slug: 'mindfulness-at-work', excerpt: 'Three micro-practices for meetings, inboxes and deadlines.', body: 'Work is where awareness is tested most...\n\n## The pause before reply\n\nOne breath before every email.\n\n## Single-tasking\n\nOne window, one task, one breath at a time.', category: 'Mindfulness', authorName: 'Dev Malhotra', status: 'published', publishedAt: hours(-24 * 14), readMinutes: 5 },
  ]);

  await FAQ.insertMany([
    { question: 'Do I need any experience to begin?', answer: 'Not at all. Our beginner programs assume no prior experience — just curiosity and a few minutes a day.', category: 'Getting started', order: 1 },
    { question: 'How do live sessions work?', answer: 'Live sessions stream on YouTube Live and are embedded on our site. Join from the Live Sessions page when the session begins; recordings are added afterwards.', category: 'Live sessions', order: 2 },
    { question: 'Can I access courses on my phone?', answer: 'Yes. Your account works on every device — progress syncs automatically.', category: 'Getting started', order: 3 },
    { question: 'What is your refund policy?', answer: 'If a program is not right for you, request a refund within 7 days of purchase, provided less than 30% of the lessons have been completed.', category: 'Payments', order: 4 },
    { question: 'Will I receive a certificate?', answer: 'Yes — complete every lesson in a program to receive a verifiable Aura Awakening certificate.', category: 'Courses', order: 5 },
  ]);

  await Testimonial.insertMany([
    { name: 'Priya S.', role: 'Learner, Mumbai', quote: 'Awaken Within gave me a practice I actually keep. Ten minutes in the morning and my whole day feels different.', order: 1 },
    { name: 'Rahul K.', role: 'Software engineer, Pune', quote: 'The live circles are the highlight of my week. Calm, grounded and never preachy.', order: 2 },
    { name: 'Meera J.', role: 'Teacher, Delhi', quote: 'Beautifully taught. I finally understand what mindfulness means in real life.', order: 3 },
  ]);

  await Announcement.create({ title: 'New: Mindful Energy program', message: 'Our new 8-lesson energy program is now open for enrollment.', link: '/courses/mindful-energy', linkLabel: 'Explore', showAsBanner: true, createdBy: admin._id });
  await SiteSetting.insertMany(Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value })));

  await seedDemoCourses();

  // ── Training platform demo data (packages are priced from the admin's daily rate) ──
  await TrainingConfig.create({ key: 'default' });
  await seedDefaultPackages();
  const tz = 'Asia/Kolkata';
  const dayStr = (offset) => new Date(Date.now() + offset * 86400000 + 5.5 * 3600000).toISOString().slice(0, 10);
  const slotDocs = [];
  for (const t of trainers) {
    for (let d = 1; d <= 7; d += 1) {
      for (const h of ['07:00', '08:00', '17:00', '18:00']) {
        const start = zonedToUtc(dayStr(d), h, tz);
        slotDocs.push({ trainer: t.user, start, end: new Date(start.getTime() + 3600000), durationMin: 60 });
      }
    }
  }
  await Slot.insertMany(slotDocs);
  console.log(`• Published ${slotDocs.length} demo training slots`);

  console.log('\n✓ Seed complete\n');
  console.log('  Logins (password for all:', password, ')');
  console.log('  admin    →', admin.email);
  console.log('  trainer  →', trainerData[0].email);
  console.log('  learner  →', learner.email, '\n');
}

run()
  .catch((e) => {
    console.error('✖ Seed failed:', e);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
