import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { RegisterPage } from './pages/RegisterPage';
import { JudgePage } from './pages/JudgePage';
import { AdminPage } from './pages/AdminPage';
import { ScoreboardPage } from './pages/ScoreboardPage';

export default function App() {
  return (
    <div className="min-h-screen bg-brand-cream text-slate-900">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
          <h1 className="text-lg font-bold text-brand-navy">Family Fun Day Olympics</h1>
          <nav className="flex gap-3 text-sm font-semibold">
            <Link className="rounded px-2 py-1 hover:bg-slate-100" to="/register">Register</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/judge" element={<JudgePage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/scoreboard" element={<ScoreboardPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
