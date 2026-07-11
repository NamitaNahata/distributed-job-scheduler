import axios from 'axios';

const API_BASE = 'http://localhost:4000';

const client = axios.create({ baseURL: API_BASE });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handles both response shapes: a plain array, or { data: [...] }
function unwrapList(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
}

export const login = (email, password) =>
  client.post('/auth/login', { email, password }).then((r) => r.data);

export const register = (email, password, organizationName) =>
  client.post('/auth/register', { email, password, organizationName }).then((r) => r.data);

export const getProjects = () => client.get('/projects').then((r) => unwrapList(r.data));
export const getQueues = (projectId) =>
  client.get(`/queues?projectId=${projectId}`).then((r) => unwrapList(r.data));
export const getJobs = (queueId, status) =>
  client
    .get(`/queues/${queueId}/jobs${status ? `?status=${status}` : ''}`)
    .then((r) => unwrapList(r.data));
export const getJob = (jobId) => client.get(`/jobs/${jobId}`).then((r) => r.data);
export const createJob = (queueId, data) => client.post(`/queues/${queueId}/jobs`, data).then((r) => r.data);
export const cancelJob = (jobId) => client.patch(`/jobs/${jobId}`, {}).then((r) => r.data);
export const createProject = (name) => client.post('/projects', { name }).then((r) => r.data);
export const createQueue = (projectId, data) => client.post('/queues', { projectId, ...data }).then((r) => r.data);

export default client;