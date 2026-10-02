import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { SiteProvider } from './context/SiteContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { SiteLayout } from './components/Layout.jsx';
import { Navbar } from './components/Navbar.jsx';
import { GuestOnly, ProtectedRoute } from './components/ProtectedRoute.jsx';
import { Loader } from './components/States.jsx';
import Home from './pages/Home.jsx';

// Route-level code splitting keeps the public site light.
const Courses = lazy(() => import('./pages/Courses.jsx'));
const CourseDetails = lazy(() => import('./pages/CourseDetails.jsx'));
const LessonPlayer = lazy(() => import('./pages/LessonPlayer.jsx'));
const Checkout = lazy(() => import('./pages/Checkout.jsx'));
const CertificateView = lazy(() => import('./pages/Certificate.jsx'));
const named = (loader, name) => lazy(() => loader().then((m) => ({ default: m[name] })));
const CheckoutReturn = named(() => import('./pages/Checkout.jsx'), 'CheckoutReturn');
const CheckoutSuccess = named(() => import('./pages/Checkout.jsx'), 'CheckoutSuccess');
const Trainers = named(() => import('./pages/Trainers.jsx'), 'Trainers');
const TrainerDetail = named(() => import('./pages/Trainers.jsx'), 'TrainerDetail');
const SessionList = named(() => import('./pages/LiveSessions.jsx'), 'SessionList');
const SessionDetail = named(() => import('./pages/LiveSessions.jsx'), 'SessionDetail');
const About = named(() => import('./pages/Content.jsx'), 'About');
const Articles = named(() => import('./pages/Content.jsx'), 'Articles');
const ArticleDetail = named(() => import('./pages/Content.jsx'), 'ArticleDetail');
const Faq = named(() => import('./pages/Content.jsx'), 'Faq');
const Contact = named(() => import('./pages/Content.jsx'), 'Contact');
const Legal = named(() => import('./pages/Content.jsx'), 'Legal');
const NotFound = named(() => import('./pages/Content.jsx'), 'NotFound');
const Login = named(() => import('./pages/Auth.jsx'), 'Login');
const Register = named(() => import('./pages/Auth.jsx'), 'Register');

const PanelLayout = named(() => import('./panel/PanelLayout.jsx'), 'PanelLayout');
const CurriculumEditor = lazy(() => import('./panel/CurriculumEditor.jsx'));
const SiteContent = lazy(() => import('./admin/SiteContent.jsx'));
const L = (name) => named(() => import('./dashboard/Learner.jsx'), name);
const S = (name) => named(() => import('./admin/Screens.jsx'), name);
const LearnerOverview = L('LearnerOverview');
const MyCourses = L('MyCourses');
const MySessions = L('MySessions');
const MyCertificates = L('MyCertificates');
const MyPayments = L('MyPayments');
const Notifications = L('Notifications');
const Profile = L('Profile');
const AdminDashboard = S('AdminDashboard');
const TrainerDashboard = S('TrainerDashboard');
const ManagerDashboard = S('ManagerDashboard');
const CoursesScreen = S('CoursesScreen');
const SessionsScreen = S('SessionsScreen');
const ArticlesScreen = S('ArticlesScreen');
const FaqsScreen = S('FaqsScreen');
const TestimonialsScreen = S('TestimonialsScreen');
const AnnouncementsScreen = S('AnnouncementsScreen');
const CategoriesScreen = S('CategoriesScreen');
const MessagesScreen = S('MessagesScreen');
const UsersScreen = S('UsersScreen');
const TrainersScreen = S('TrainersScreen');
const TrainerProfileScreen = S('TrainerProfileScreen');
const TrainerLearners = S('TrainerLearners');
const PaymentsScreen = S('PaymentsScreen');
const OrdersScreen = S('OrdersScreen');
const EnrollmentsScreen = S('EnrollmentsScreen');
const CertificatesScreen = S('CertificatesScreen');

function PlayerLayout() {
  return (
    <>
      <Navbar />
      <main id="main"><Outlet /></main>
    </>
  );
}

function contentRoutes(base) {
  return (
    <>
      <Route path="live-sessions" element={<SessionsScreen base={base} kind="session" />} />
      <Route path="events" element={<SessionsScreen base={base} kind="event" />} />
      <Route path="courses" element={<CoursesScreen base={base} />} />
      <Route path="articles" element={<ArticlesScreen />} />
      <Route path="faqs" element={<FaqsScreen />} />
      <Route path="testimonials" element={<TestimonialsScreen />} />
      <Route path="announcements" element={<AnnouncementsScreen />} />
      <Route path="messages" element={<MessagesScreen />} />
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <SiteProvider>
            <Suspense fallback={<Loader page />}>
              <Routes>
                {/* Public website */}
                <Route element={<SiteLayout />}>
                  <Route index element={<Home />} />
                  <Route path="about" element={<About />} />
                  <Route path="courses" element={<Courses />} />
                  <Route path="courses/:slug" element={<CourseDetails />} />
                  <Route path="trainers" element={<Trainers />} />
                  <Route path="trainers/:slug" element={<TrainerDetail />} />
                  <Route path="live-sessions" element={<SessionList kind="session" />} />
                  <Route path="live-sessions/:slug" element={<SessionDetail />} />
                  <Route path="events" element={<SessionList kind="event" />} />
                  <Route path="events/:slug" element={<SessionDetail />} />
                  <Route path="articles" element={<Articles />} />
                  <Route path="articles/:slug" element={<ArticleDetail />} />
                  <Route path="faq" element={<Faq />} />
                  <Route path="contact" element={<Contact />} />
                  <Route path="privacy-policy" element={<Legal kind="privacy" />} />
                  <Route path="terms" element={<Legal kind="terms" />} />
                  <Route path="refund-policy" element={<Legal kind="refund" />} />
                  <Route path="certificates/:number" element={<CertificateView />} />
                  <Route element={<ProtectedRoute />}>
                    <Route path="checkout/success" element={<CheckoutSuccess />} />
                    <Route path="checkout/return" element={<CheckoutReturn />} />
                    <Route path="checkout/:slug" element={<Checkout />} />
                  </Route>
                  <Route path="*" element={<NotFound />} />
                </Route>

                <Route path="login" element={<GuestOnly><Login /></GuestOnly>} />
                <Route path="register" element={<GuestOnly><Register /></GuestOnly>} />

                {/* Learning player */}
                <Route element={<ProtectedRoute><PlayerLayout /></ProtectedRoute>}>
                  <Route path="learn/:slug" element={<LessonPlayer />} />
                  <Route path="learn/:slug/:lessonId" element={<LessonPlayer />} />
                </Route>

                {/* Learner dashboard (every role has one — one shared account) */}
                <Route path="dashboard" element={<ProtectedRoute><PanelLayout area="learner" /></ProtectedRoute>}>
                  <Route index element={<LearnerOverview />} />
                  <Route path="courses" element={<MyCourses />} />
                  <Route path="sessions" element={<MySessions />} />
                  <Route path="certificates" element={<MyCertificates />} />
                  <Route path="payments" element={<MyPayments />} />
                  <Route path="notifications" element={<Notifications />} />
                  <Route path="profile" element={<Profile />} />
                </Route>

                {/* Admin */}
                <Route path="admin" element={<ProtectedRoute roles={['admin']}><PanelLayout area="admin" /></ProtectedRoute>}>
                  <Route index element={<AdminDashboard />} />
                  <Route path="users" element={<UsersScreen />} />
                  <Route path="managers" element={<UsersScreen role="manager" title="Managers" />} />
                  <Route path="trainers" element={<TrainersScreen />} />
                  <Route path="categories" element={<CategoriesScreen />} />
                  <Route path="courses/:courseId/curriculum" element={<CurriculumEditor base="admin" />} />
                  <Route path="enrollments" element={<EnrollmentsScreen />} />
                  <Route path="certificates" element={<CertificatesScreen />} />
                  <Route path="payments" element={<PaymentsScreen />} />
                  <Route path="orders" element={<OrdersScreen />} />
                  <Route path="content" element={<SiteContent isAdmin />} />
                  <Route path="settings" element={<SiteContent settingsOnly isAdmin />} />
                  {contentRoutes('admin')}
                </Route>

                {/* Content & Live Manager */}
                <Route path="manager" element={<ProtectedRoute roles={['manager', 'admin']}><PanelLayout area="manager" /></ProtectedRoute>}>
                  <Route index element={<ManagerDashboard />} />
                  <Route path="content" element={<SiteContent />} />
                  {contentRoutes('manager')}
                </Route>

                {/* Trainer */}
                <Route path="trainer" element={<ProtectedRoute roles={['trainer']}><PanelLayout area="trainer" /></ProtectedRoute>}>
                  <Route index element={<TrainerDashboard />} />
                  <Route path="courses" element={<CoursesScreen base="trainer" />} />
                  <Route path="courses/:courseId/curriculum" element={<CurriculumEditor base="trainer" />} />
                  <Route path="live-sessions" element={<SessionsScreen base="trainer" kind="session" />} />
                  <Route path="learners" element={<TrainerLearners />} />
                  <Route path="profile" element={<TrainerProfileScreen />} />
                </Route>

                <Route path="home" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </SiteProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
