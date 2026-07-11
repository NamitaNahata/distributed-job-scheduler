import { useEffect, useState, useCallback } from 'react';
import {
  getProjects,
  getQueues,
  getJobs,
  createJob,
  cancelJob,
  createProject,
  createQueue,
} from '../api';

const STATUS_COLORS = {
  QUEUED: 'var(--status-queued)',
  CLAIMED: 'var(--status-claimed)',
  RUNNING: 'var(--status-running)',
  COMPLETED: 'var(--status-completed)',
  FAILED: 'var(--status-failed)',
  DEAD_LETTER: 'var(--status-dead)',
};

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] || 'var(--text-faint)';
  return (
    <span className="status-badge" style={{ background: `${color}22`, color }}>
      <span className="lamp" style={{ background: color }} />
      {status}
    </span>
  );
}

export default function Dashboard({ user, onLogout }) {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [queues, setQueues] = useState([]);
  const [selectedQueue, setSelectedQueue] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [newProjectName, setNewProjectName] = useState('');
  const [newQueueName, setNewQueueName] = useState('');

  const [jobType, setJobType] = useState('IMMEDIATE');
  const [jobPayload, setJobPayload] = useState('{}');
  const [error, setError] = useState('');

  useEffect(() => {
    getProjects()
      .then((data) => {
        setProjects(data);
        if (data.length && !selectedProject) setSelectedProject(data[0].id);
      })
      .catch((err) => setError(readErr(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedProject) return;
    getQueues(selectedProject)
      .then((data) => {
        setQueues(data);
        setSelectedQueue(data.length ? data[0].id : null);
      })
      .catch((err) => setError(readErr(err)));
  }, [selectedProject]);

  const loadJobs = useCallback(() => {
    if (!selectedQueue) {
      setJobs([]);
      return;
    }
    getJobs(selectedQueue)
      .then(setJobs)
      .catch((err) => setError(readErr(err)));
  }, [selectedQueue]);

  useEffect(() => {
    loadJobs();
    const interval = setInterval(loadJobs, 3000);
    return () => clearInterval(interval);
  }, [loadJobs]);

  function readErr(err) {
    return err?.response?.data?.error?.message || err?.response?.data?.error || 'Request failed';
  }

  async function handleCreateProject(e) {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    try {
      const p = await createProject(newProjectName.trim());
      setProjects((prev) => [...prev, p]);
      setNewProjectName('');
      setSelectedProject(p.id);
    } catch (err) {
      setError(readErr(err));
    }
  }

  async function handleCreateQueue(e) {
    e.preventDefault();
    if (!newQueueName.trim() || !selectedProject) return;
    try {
      const q = await createQueue(selectedProject, {
        name: newQueueName.trim(),
        priority: 0,
        concurrencyLimit: 3,
      });
      setQueues((prev) => [...prev, q]);
      setNewQueueName('');
      setSelectedQueue(q.id);
    } catch (err) {
      setError(readErr(err));
    }
  }

  async function handleCreateJob(e) {
    e.preventDefault();
    if (!selectedQueue) return;
    let payload;
    try {
      payload = JSON.parse(jobPayload || '{}');
    } catch {
      setError('Payload must be valid JSON');
      return;
    }
    try {
      await createJob(selectedQueue, { type: jobType, payload });
      loadJobs();
    } catch (err) {
      setError(readErr(err));
    }
  }

  async function handleCancel(jobId) {
    try {
      await cancelJob(jobId);
      loadJobs();
    } catch (err) {
      setError(readErr(err));
    }
  }

  return (
    <div className="console">
      <header className="console-header">
        <h1>Job Scheduler // Ops Console</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span className="live-indicator">
            <span className="live-dot" /> live &middot; polling 3s
          </span>
          <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{user?.email}</span>
          <button className="logout-btn" onClick={onLogout}>Sign out</button>
        </div>
      </header>

      <div className="console-body">
        <div className="rail">
          <h2>Projects</h2>
          {projects.map((p) => (
            <div
              key={p.id}
              className={`rail-item ${selectedProject === p.id ? 'active' : ''}`}
              onClick={() => setSelectedProject(p.id)}
            >
              {p.name}
            </div>
          ))}
          <form className="inline-create" onSubmit={handleCreateProject}>
            <input
              placeholder="New project"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
            />
            <button type="submit">+</button>
          </form>
        </div>

        <div className="rail">
          <h2>Queues</h2>
          {queues.map((q) => (
            <div
              key={q.id}
              className={`rail-item ${selectedQueue === q.id ? 'active' : ''}`}
              onClick={() => setSelectedQueue(q.id)}
            >
              <span>{q.name}</span>
              {q.isPaused && <span className="paused-tag">paused</span>}
            </div>
          ))}
          {selectedProject && (
            <form className="inline-create" onSubmit={handleCreateQueue}>
              <input
                placeholder="New queue"
                value={newQueueName}
                onChange={(e) => setNewQueueName(e.target.value)}
              />
              <button type="submit">+</button>
            </form>
          )}
        </div>

        <div className="main-panel">
          <div className="legend">
            {Object.entries(STATUS_COLORS).map(([status, color]) => (
              <span key={status} className="legend-item">
                <span className="lamp" style={{ background: color }} />
                {status}
              </span>
            ))}
          </div>

          {error && <div className="auth-error" style={{ marginBottom: 14 }}>{error}</div>}

          {selectedQueue ? (
            <>
              <form className="job-form" onSubmit={handleCreateJob}>
                <select value={jobType} onChange={(e) => setJobType(e.target.value)}>
                  <option value="IMMEDIATE">IMMEDIATE</option>
                  <option value="DELAYED">DELAYED</option>
                  <option value="SCHEDULED">SCHEDULED</option>
                  <option value="RECURRING">RECURRING</option>
                  <option value="BATCH">BATCH</option>
                </select>
                <input
                  type="text"
                  placeholder='payload JSON e.g. {"to":"a@b.com"}'
                  value={jobPayload}
                  onChange={(e) => setJobPayload(e.target.value)}
                />
                <button type="submit">Enqueue job</button>
              </form>

              <table className="job-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Attempts</th>
                    <th>Claimed by</th>
                    <th>Updated</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job.id}>
                      <td className="job-id">{job.id.slice(0, 8)}</td>
                      <td>{job.type}</td>
                      <td><StatusBadge status={job.status} /></td>
                      <td>{job.attemptCount}/{job.maxAttempts}</td>
                      <td className="job-id">{job.claimedBy || '—'}</td>
                      <td>{new Date(job.updatedAt).toLocaleTimeString()}</td>
                      <td>
                        <button
                          className="cancel-btn"
                          disabled={['RUNNING', 'COMPLETED', 'DEAD_LETTER'].includes(job.status)}
                          onClick={() => handleCancel(job.id)}
                        >
                          Cancel
                        </button>
                      </td>
                    </tr>
                  ))}
                  {jobs.length === 0 && (
                    <tr><td colSpan={7} className="empty-state">No jobs in this queue yet.</td></tr>
                  )}
                </tbody>
              </table>
            </>
          ) : (
            <div className="empty-state">Select or create a queue to see its jobs.</div>
          )}
        </div>
      </div>
    </div>
  );
}