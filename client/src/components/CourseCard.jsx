import { Link } from 'react-router-dom';
import { LuArrowRight, LuBookOpen } from 'react-icons/lu';
import { CoverArt } from './Brand.jsx';
import { formatPrice, initials, LEVEL_LABEL } from '../utils/format.js';
import { SkeletonCards, EmptyState } from './States.jsx';

export function CourseCard({ course }) {
  const trainer = course.trainers?.[0];
  const free = !course.price;
  return (
    <article className="card course-card">
      <div className="cover">
        {course.isFeatured && <span className="badge badge-gold">Featured</span>}
        {course.coverImage ? (
          <img src={course.coverImage} alt="" loading="lazy" />
        ) : (
          <CoverArt seed={course.slug} label={course.category?.name} />
        )}
      </div>
      <div className="course-card-body">
        <div className="course-meta">
          <span>{course.category?.name || 'Program'}</span>
          <span className="dot" aria-hidden />
          <span>{LEVEL_LABEL[course.level] || 'All levels'}</span>
        </div>
        <h3><Link to={`/courses/${course.slug}`}>{course.title}</Link></h3>
        <p>{course.shortDescription}</p>
        {trainer && (
          <div className="course-trainer">
            <span className="avatar" aria-hidden>{trainer.photo ? <img src={trainer.photo} alt="" /> : initials(trainer.displayName)}</span>
            <span>with {trainer.displayName}</span>
          </div>
        )}
      </div>
      <div className="course-foot">
        <div>
          <div className={`price${free ? ' price-free' : ''}`}>
            {formatPrice(course.price, course.currency)}
            {!!course.compareAtPrice && course.compareAtPrice > course.price && <s>{formatPrice(course.compareAtPrice, course.currency)}</s>}
          </div>
          <span className="lessons"><LuBookOpen size={14} aria-hidden /> {course.lessonCount || 0} lessons</span>
        </div>
        <span className="cta" aria-hidden>{free ? 'Start Free' : 'View Program'} <LuArrowRight size={14} /></span>
      </div>
    </article>
  );
}

export function CourseGrid({ courses, loading, columns = 3, emptyMessage }) {
  if (loading && !courses?.length) return <SkeletonCards count={columns} />;
  if (!courses?.length) return <EmptyState title="No programs found" message={emptyMessage || 'Try adjusting your filters or search.'} />;
  return (
    <div className={`grid grid-${columns}`}>
      {courses.map((c) => <CourseCard key={c._id} course={c} />)}
    </div>
  );
}
