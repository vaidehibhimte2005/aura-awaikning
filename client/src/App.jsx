import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { SiteProvider } from './context/SiteContext.jsx';
import { ToastProvider } from './context/ToastContext.jsx';
import { SiteLayout } from './components/Layout.jsx';
import { Navbar } from './components/Navbar.jsx';
import { GuestOnly, ProtectedRoute } from './components/ProtectedRoute.jsx';
import { Loader } from './components/States.jsx';
import Home from './pages/Home.jsx';

// Route-level code splitting keeps the public site light.
const named = (loader, name) => lazy(() => loader().then((m) => ({ default: m[name] })));
const CheckoutReturn = named(() => import('./pages/Checkout.jsx'), 'CheckoutReturn');
const Trainers = named(() => import('./pages/Trainers.jsx'), 'Trainers');
const TrainerDetail = named(() => import('./pages/Trainers.jsx'), 'TrainerDetail');
const Faq = named(() => import('./pages/Content.jsx'), 'Faq');
const Contact = named(() => import('./pages/Content.jsx'), 'Contact');
const Legal = named(() => import('./pages/Content.jsx'), 'Legal');
const NotFound = named(() => import('./pages/Content.jsx'), 'NotFound');
const Login = named(() => import('./pages/Auth.jsx'), 'Login');
const ForgotPassword = named(() => import('./pages/Auth.jsx'), 'ForgotPassword');
const ResetPassword = named(() => import('./pages/Auth.jsx'), 'ResetPassword');
const VerifyEmail = named(() => import('./pages/Auth.jsx'), 'VerifyEmail');
const Register = named(() => import('./pages/Register.jsx'), 'Register');
const TrainersDirectory = named(() => import('./training/TrainersDirectory.jsx'), 'TrainersDirectory');
const SessionRoom = lazy(() => import('./training/SessionRoom.jsx'));

const PanelLayout = named(() => import('./panel/PanelLayout.jsx'), 'PanelLayout');
const L = (name) => named(() => import('./training/Learner.jsx'), name);
const T = (name) => named(() => import('./training/Trainer.jsx'), name);
const AP = (name) => named(() => import('./training/AdminPeople.jsx'), name);
const AO = (name) => named(() => import('./training/AdminOps.jsx'), name);
const Shared = (name) => named(() => import('./dashboard/Learner.jsx'), name);
const S = (name) => named(() => import('./admin/Screens.jsx'), name);

const LearnerOverview = L('LearnerOverview');
const PlansPage = L('PlansPage');
const BookSession = L('BookSession');
const MyBookings = L('MyBookings');
const TrainingHistory = L('TrainingHistory');
const MyPayments = Shared('MyPayments');
const Notifications = Shared('Notifications');
const Profile = Shared('Profile');

const TrainerHome = T('TrainerHome');
const TrainerSlots = T('TrainerSlots');
const TrainerBookings = T('TrainerBookings');
const TrainerEarnings = T('TrainerEarnings');
const TrainerProfile = T('TrainerProfile');

const AdminOverview = AP('AdminOverview');
const AdminTrainers = AP('AdminTrainers');
const AdminLearners = AP('AdminLearners');
const AdminPackages = AO('AdminPackages');
const AdminSettings = AO('AdminSettings');
const AdminSubscriptions = AO('AdminSubscriptions');
const AdminPayments = AO('AdminPayments');
const AdminBookings = AO('AdminBookings');
const AdminReport = AO('AdminReport');
const AdminPayouts = AO('AdminPayouts');
const AdminBroadcast = AO('AdminBroadcast');
const AdminFeedback = AO('AdminFeedback');
const ActivityLogScreen = named(() => import('./admin/Approvals.jsx'), 'ActivityLogScreen');
const FaqsScreen = S('FaqsScreen');
const TestimonialsScreen = S('TestimonialsScreen');
const MessagesScreen = S('MessagesScreen');

function PlayerLayout() {
  return (
    <>
      <Navbar />
      <main id="main"><Outlet /></main>
    </>
  );
}

/** Lets "/#plans" style links scroll to their section after navigation. */
function ScrollToHash() {
  const { hash, pathname } = useLocation();
  useEffect(() => {
    if (hash) {
      const t = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
      return () => clearTimeout(t);
    }
    window.scrollTo(0, 0);
    return undefined;
  }, [hash, pathname]);
  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <SiteProvider>
            <ScrollToHash />
            <Suspense fallback={<Loader page />}>
              <Routes>
                {/* Public website */}
                <Route element={<SiteLayout />}>
                  <Route index element={<Home />} />
                  <Route path="trainers" element={<Trainers />} />
                  <Route path="trainers/:slug" element={<TrainerDetail />} />
                  <Route path="faq" element={<Faq />} />
                  <Route path="contact" element={<Contact />} />
                  <Route path="privacy-policy" element={<Legal kind="privacy" />} />
                  <Route path="terms" element={<Legal kind="terms" />} />
                  <Route path="refund-policy" element={<Legal kind="refund" />} />
                  <Route element={<ProtectedRoute />}>
                    <Route path="checkout/return" element={<CheckoutReturn />} />
                  </Route>
                  <Route path="*" element={<NotFound />} />
                </Route>

                <Route path="login" element={<GuestOnly><Login /></GuestOnly>} />
                <Route path="register" element={<GuestOnly><Register /></GuestOnly>} />
                {/* Trainer accounts are created by administrators — there is no trainer sign-up. */}
                <Route path="register/learner" element={<Navigate to="/register" replace />} />
                <Route path="forgot-password" element={<GuestOnly><ForgotPassword /></GuestOnly>} />
                <Route path="reset-password" element={<ResetPassword />} />
                <Route path="verify-email" element={<VerifyEmail />} />

                {/* Session room / meeting details (participants + admin; the API enforces access) */}
                <Route element={<ProtectedRoute><PlayerLayout /></ProtectedRoute>}>
                  <Route path="session/:id" element={<SessionRoom />} />
                </Route>

                {/* Learner */}
                <Route path="dashboard" element={<ProtectedRoute roles={['learner']}><PanelLayout area="learner" /></ProtectedRoute>}>
                  <Route index element={<LearnerOverview />} />
                  <Route path="plans" element={<PlansPage />} />
                  <Route path="trainers" element={<TrainersDirectory />} />
                  <Route path="book" element={<BookSession />} />
                  <Route path="bookings" element={<MyBookings />} />
                  <Route path="history" element={<TrainingHistory />} />
                  <Route path="payments" element={<MyPayments />} />
                  <Route path="notifications" element={<Notifications />} />
                  <Route path="profile" element={<Profile />} />
                </Route>

                {/* Trainer */}
                <Route path="trainer" element={<ProtectedRoute roles={['trainer']}><PanelLayout area="trainer" /></ProtectedRoute>}>
                  <Route index element={<TrainerHome />} />
                  <Route path="slots" element={<TrainerSlots />} />
                  <Route path="bookings" element={<TrainerBookings />} />
                  <Route path="earnings" element={<TrainerEarnings />} />
                  <Route path="notifications" element={<Notifications />} />
                  <Route path="profile" element={<TrainerProfile />} />
                </Route>

                {/* Admin */}
                <Route path="admin" element={<ProtectedRoute roles={['admin']}><PanelLayout area="admin" /></ProtectedRoute>}>
                  <Route index element={<AdminOverview />} />
                  <Route path="trainers" element={<AdminTrainers />} />
                  <Route path="learners" element={<AdminLearners />} />
                  <Route path="packages" element={<AdminPackages />} />
                  <Route path="subscriptions" element={<AdminSubscriptions />} />
                  <Route path="payments" element={<AdminPayments />} />
                  <Route path="bookings" element={<AdminBookings />} />
                  <Route path="reports" element={<AdminReport />} />
                  <Route path="payouts" element={<AdminPayouts />} />
                  <Route path="feedback" element={<AdminFeedback />} />
                  <Route path="faqs" element={<FaqsScreen />} />
                  <Route path="testimonials" element={<TestimonialsScreen />} />
                  <Route path="messages" element={<MessagesScreen />} />
                  <Route path="notifications" element={<Notifications />} />
                  <Route path="broadcast" element={<AdminBroadcast />} />
                  <Route path="activity" element={<ActivityLogScreen />} />
                  <Route path="settings" element={<AdminSettings />} />
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
