import { Routes, Route, Navigate } from 'react-router-dom';
import { Provider, Shell, useApp } from './core.jsx';
import { Login } from './modules/auth.jsx';
import { CitizenHome, Services, Apply, Applications, ApplicationDetail, Appointments, Notifications } from './modules/citizen.jsx';
import { Queue, Review } from './modules/staff.jsx';
import { AdminHome, Users, Audit, AccessRules } from './modules/admin.jsx';

const Guard = () => (useApp().user ? <Shell /> : <Navigate to="/login" replace />);
const Only = ({ role, children }) => (useApp().user.role === role ? children : <Navigate to="/app" replace />);
const Home = () => { const { user } = useApp(); return user.role === 'citizen' ? <CitizenHome /> : user.role === 'staff' ? <Queue /> : <AdminHome />; };
const C = (el) => <Only role="citizen">{el}</Only>;

export default function App() {
  return (
    <Provider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/app" element={<Guard />}>
          <Route index element={<Home />} />
          <Route path="services" element={C(<Services />)} />
          <Route path="apply/:id" element={C(<Apply />)} />
          <Route path="applications" element={C(<Applications />)} />
          <Route path="applications/:id" element={C(<ApplicationDetail />)} />
          <Route path="appointments" element={C(<Appointments />)} />
          <Route path="notifications" element={C(<Notifications />)} />
          <Route path="review/:id" element={<Only role="staff"><Review /></Only>} />
          <Route path="users" element={<Only role="admin"><Users /></Only>} />
          <Route path="audit" element={<Only role="admin"><Audit /></Only>} />
          <Route path="access" element={<Only role="admin"><AccessRules /></Only>} />
        </Route>
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </Provider>
  );
}