import axios from 'axios';

const api = axios.create({ baseURL: '/api', timeout: 30000 });

// Auth
export const getAuthStatus = (userId) => api.get(`/auth/status/${userId}`);
export const importCookies = (userId, data) => api.post(`/auth/cookies/${userId}`, data);
export const validateAuth = (userId) => api.post(`/auth/validate/${userId}`, { platform: 'x' });
export const disconnectAuth = (userId) => api.post(`/auth/disconnect/${userId}`);

// Voice
export const uploadVoice = (userId, audioBlob) => {
  const form = new FormData();
  form.append('userId', userId);
  form.append('audio', audioBlob, 'recording.webm');
  return api.post('/voice/upload', form);
};
export const getVoiceProfile = (userId) => api.get(`/voice/profile/${userId}`);
export const updateVoiceProfile = (userId, updates) => api.put(`/voice/profile/${userId}`, updates);
export const confirmVoiceProfile = (userId) => api.post(`/voice/confirm/${userId}`);

// Persona
export const generatePersona = (userId, options) => api.post(`/persona/generate/${userId}`, options);
export const getPersona = (userId) => api.get(`/persona/${userId}`);
export const getSchedule = (userId, date) => api.get(`/persona/schedule/${userId}`, { params: { date } });
export const getCircadian = (userId) => api.get(`/persona/circadian/${userId}`);

// Observer
export const getObserverStats = () => api.get('/observer/stats');
export const getObserverSessions = (limit = 20) => api.get('/observer/sessions', { params: { limit } });
export const getObservedTweets = (userId) => api.get(`/observer/tweets/${userId}`);
export const triggerObservation = (userId) => api.post(`/observer/trigger/${userId}`);

// Opportunities
export const getOpportunities = (userId, status) => api.get(`/opportunities/${userId}`, { params: { status } });
export const getOpportunityStats = (userId) => api.get(`/opportunities/${userId}/stats`);
export const skipOpportunity = (id) => api.post(`/opportunities/${id}/skip`);

// Drafts
export const getDrafts = (userId) => api.get(`/drafts/${userId}`);
export const approveDraft = (id) => api.post(`/drafts/${id}/approve`);
export const rejectDraft = (id) => api.post(`/drafts/${id}/reject`);
export const editDraft = (id, editedText) => api.post(`/drafts/${id}/edit`, { editedText });
export const regenerateDraft = (id) => api.post(`/drafts/${id}/regenerate`);

// Posting
export const queueDraftForPosting = (userId, draftId) => api.post('/posting/queue', { userId, draftId });
export const getPosted = (userId) => api.get(`/posted/${userId}`);
export const getPostingStats = (userId) => api.get(`/posted/${userId}/stats`);
export const getPostingQueueStats = () => api.get('/posting/queue/stats');
export const getPostEngagement = (userId, postId) => api.get(`/posted/${userId}/engagement/${postId}`);

// Simulation
export const getSimulationResults = (userId) => api.get(`/simulation/${userId}`);
export const runSimulation = (userId) => api.post(`/simulation/${userId}/run`);

// Tracked Profiles
export const getTrackedProfiles = (userId) => api.get(`/tracked-profiles/${userId}`);
export const addTrackedProfile = (userId, data) => api.post(`/tracked-profiles/${userId}`, data);
export const removeTrackedProfile = (id) => api.delete(`/tracked-profiles/${id}`);
export const scanTrackedProfile = (id) => api.post(`/tracked-profiles/${id}/scan`);

// Cookie Import (Sprint 12.5)
export const validateCookieImport = (auth_token, ct0) => api.post('/cookie-import/validate', { auth_token, ct0 });
export const getCookieImportStatus = () => api.get('/cookie-import/status');
export const disconnectCookieImport = () => api.post('/cookie-import/disconnect');

// Voice reset
export const resetVoiceProfile = () => api.delete('/voice-profile/reset');

// Health
export const getHealth = () => api.get('/health');

export default api;
