import { Routes, Route, Navigate } from 'react-router-dom';
import { Provider, Shell, useApp } from './core.jsx';
import { Login } from './modules/auth.jsx';
import { CitizenHome, Services, Apply, Applications, ApplicationDetail, Appointments, Notifications, About } from './modules/citizen.jsx';
import { Queue, Review, StaffAppointments } from './modules/staff.jsx';
import { Lookup, Register } from './modules/officer.jsx';
import { AdminHome, Users, Audit, AccessRules } from './modules/admin.jsx';
import { Departments, DepartmentDetail } from './modules/departments.jsx';

const Guard = () => {
  const { user } = useApp();
  return user ? <Shell /> : <Navigate to="/login" replace />;
};

const Only = ({ role, children }) => {
  const { user } = useApp();
  return user.role === role ? children : <Navigate to="/app" replace />;
};

const Home = () => {
  const { user } = useApp();
  return {
    citizen: <CitizenHome />,
    staff: <Queue />,
    officer: <Lookup />,
    admin: <AdminHome />,
  }[user.role];
};

const Appts = () => {
  const { user } = useApp();
  return user.role === 'citizen' ? <Appointments />
    : user.role === 'staff' ? <StaffAppointments />
      : <Navigate to="/app" replace />;
};

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
          <Route path="appointments" element={<Appts />} />
          <Route path="notifications" element={C(<Notifications />)} />
          <Route path="about" element={C(<About />)} />
          <Route path="review/:id" element={<Only role="staff"><Review /></Only>} />
          <Route path="register" element={<Only role="officer"><Register /></Only>} />
          <Route path="users" element={<Only role="admin"><Users /></Only>} />
          <Route path="audit" element={<Only role="admin"><Audit /></Only>} />
          <Route path="access" element={<Only role="admin"><AccessRules /></Only>} />
          <Route path="departments" element={<Departments />} />
          <Route path="departments/:code" element={<DepartmentDetail />} />
        </Route>
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Routes>
    </Provider>
  );
}