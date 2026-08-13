import { useState, useEffect } from 'react';
import { api } from './api.js';
import AuthForm from './components/AuthForm.jsx';
import ProjectList from './components/ProjectList.jsx';
import ProjectDetail from './components/ProjectDetail.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [booting, setBooting] = useState(true);

  // On mount, try to restore session via cookie
  useEffect(() => {
    api.restoreSession()
      .then(data => {
        setUser(data.user);
        setProjects(data.projects ?? []);
      })
      .catch(() => {
        // 401 — not signed in, show auth form
      })
      .finally(() => setBooting(false));
  }, []);

  function handleSignIn(newUser, initialProjects) {
    setUser(newUser);
    setProjects(initialProjects);
  }

  async function handleSignOut() {
    try { await api.signOut(); } catch { /* ignore */ }
    setUser(null);
    setProjects([]);
    setActiveProjectId(null);
  }

  function handleProjectCreated(project) {
    setProjects((prev) => [project, ...prev]);
  }

  function handleProjectDeleted(projectId) {
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    if (activeProjectId === projectId) {
      setActiveProjectId(null);
    }
  }

  function handleSelectProject(id) {
    setActiveProjectId(id);
  }

  function handleBack() {
    setActiveProjectId(null);
    // Refresh project list
    api.listProjects()
      .then(data => setProjects(data.projects ?? []))
      .catch(() => {});
  }

  if (booting) {
    return (
      <div className="page-loading">
        <span className="spinner lg" />
        Loading…
      </div>
    );
  }

  if (!user) {
    return <AuthForm onSignIn={handleSignIn} />;
  }

  if (activeProjectId) {
    return (
      <ProjectDetail
        projectId={activeProjectId}
        onBack={handleBack}
      />
    );
  }

  return (
    <ProjectList
      user={user}
      projects={projects}
      onSelectProject={handleSelectProject}
      onProjectCreated={handleProjectCreated}
      onProjectDeleted={handleProjectDeleted}
      onSignOut={handleSignOut}
    />
  );
}
