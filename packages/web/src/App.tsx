import { Routes, Route } from 'react-router-dom';

function Placeholder({ name }: { name: string }) {
  return <div className="p-8 text-center text-gray-500">{name} — coming soon</div>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Placeholder name="Home" />} />
      <Route path="/jobs/:id" element={<Placeholder name="Job" />} />
      <Route path="/dashboard" element={<Placeholder name="Dashboard" />} />
      <Route path="/login" element={<Placeholder name="Login" />} />
    </Routes>
  );
}
