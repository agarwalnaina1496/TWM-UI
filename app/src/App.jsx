import { Routes, Route } from 'react-router-dom';
import Header from './components/Header.jsx';
import GetStarted from './pages/GetStarted.jsx';

function NotBuiltYet({ name }) {
  return (
    <div className="wrap" style={{ paddingTop: 60, textAlign: 'center', color: 'var(--ts)' }}>
      <p>{name} — not built yet.</p>
    </div>
  );
}

export default function App() {
  return (
    <>
      <Header />
      <Routes>
        <Route path="/" element={<GetStarted />} />
        <Route path="/trip-details" element={<NotBuiltYet name="Trip details" />} />
        <Route path="/my-trips" element={<NotBuiltYet name="My Trips" />} />
      </Routes>
    </>
  );
}
