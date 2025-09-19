// API endpoints
export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/api/auth/login',
    REGISTER: '/api/users/register', // Sửa từ '/api/auth/register' thành '/api/users/register'
    LOGOUT: '/api/auth/logout',
    REFRESH: '/api/auth/refresh',
    ME: '/api/users/profile' // Endpoint từ backend
  },
  USERS: {
    LIST: '/api/users',
    CREATE: '/api/users',
    DETAIL: (id: number) => `/api/users/${id}`,
    UPDATE: (id: number) => `/api/users/${id}`,
    DELETE: (id: number) => `/api/users/${id}`,
    PENDING: '/api/users/pending',
    APPROVE: (id: number) => `/api/users/${id}/approve`,
    REJECT: (id: number) => `/api/users/${id}/reject`,
    REGISTER: '/api/users/register', // Thêm endpoint register vào USERS section
    CHANGE_PASSWORD: '/api/users/profile/change-password'
  },
  MOPS: {
    LIST: '/api/mops',
    CREATE: '/api/mops',
    DETAIL: (id: string) => `/api/mops/${id}`,
    SUBMIT: '/api/mops/submit',
    VALIDATE: '/api/mops/validate',
    PENDING: '/api/mops/pending',
    REVIEW: '/api/mops/review',
    UPLOAD: '/api/mops/upload',
  },
  ASSESSMENTS: {
    RISK: '/api/assessments/risk',
    HANDOVER: '/api/assessments/handover',
    RISK_TEST_CONNECTION: '/api/assessments/risk/test-connection',
    RISK_START: '/api/assessments/risk/start',
    RISK_JOB_STATUS: (jobId: string) => `/api/assessments/risk/job-status/${jobId}`,
    RISK_RESULTS: (assessmentId: number) => `/api/assessments/risk/results/${assessmentId}`,
    PERIODIC: '/api/assessments/periodic',
    PERIODIC_DETAIL: (periodicId: number) => `/api/assessments/periodic/${periodicId}`,
    PERIODIC_EXECUTIONS: (periodicId: number) => `/api/assessments/periodic/${periodicId}/executions`,
    RISK_DOWNLOAD: (assessmentId: number) => `/api/assessments/risk/download/${assessmentId}`,
    HANDOVER_TEST_CONNECTION: '/api/assessments/handover/test-connection',
    HANDOVER_START: '/api/assessments/handover/start',
    HANDOVER_JOB_STATUS: (jobId: string) => `/api/assessments/handover/job-status/${jobId}`,
    HANDOVER_RESULTS: (assessmentId: number) => `/api/assessments/handover/results/${assessmentId}`,
    HANDOVER_DOWNLOAD: (assessmentId: number) => `/api/assessments/handover/download/${assessmentId}`,
    TEMPLATE_DOWNLOAD: '/api/assessments/template/download',
    RISK_RECENT_SERVERS: '/api/assessments/risk/recent-servers',
    HANDOVER_RECENT_SERVERS: '/api/assessments/handover/recent-servers',
    SERVER_UPLOADS: '/api/assessments/servers/uploads',
    HISTORY: '/api/assessments/history',
  },
  EXECUTIONS: {
    LIST: '/api/executions',
    HISTORY: '/api/executions/history',
    DETAIL: (id: number) => `/api/executions/${id}/detail`,
    CANCEL: (id: number) => `/api/executions/${id}/cancel`,
    EXPORT: '/api/export',
    EXPORT_BY_ID: (id: number) => `/api/export/execution/${id}`,
  },
  COMMANDS: {
    VALIDATE: '/api/commands/validate',
    RUN: '/api/commands/run',
    STATUS: (jobId: string) => `/api/commands/status/${jobId}`,
    RESULTS: (jobId: string) => `/api/commands/results/${jobId}`,
  },
  DASHBOARD: {
    STATS: '/api/dashboard/stats',
    RECENT_MOPS: '/api/dashboard/recent-mops',
    RECENT_EXECUTIONS: '/api/dashboard/recent-executions',
  },
  SERVERS: {
    LIST: '/api/servers',
    TEST_CONNECTION: '/api/servers/test-connection',
    VALIDATE: '/api/servers/validate',
    ADD: '/api/servers/add',
    UPLOAD: '/api/upload/servers',
  },
  TEMPLATES: {
    DOWNLOAD: '/api/template/download',
    MOP_APPENDIX: '/api/template/mop-appendix',
    COMMANDS: '/api/templates/commands',
  },
  LOGS: {
    DOWNLOAD: (jobId: string) => `/api/logs/${jobId}/download`,
    SYSTEM: '/api/logs/system',
    SYSTEM_CONTENT: (logType: string) => `/api/logs/system/${logType}`,
    SYSTEM_EXPORT: (logType: string) => `/api/logs/system/${logType}/export`,
    ASSESSMENTS: '/api/logs/assessments',
    ASSESSMENT_CONTENT: (logDir: string, filename: string) => `/api/logs/assessments/${logDir}/${filename}`,
    ASSESSMENT_DOWNLOAD: (logDir: string, filename: string) => `/api/logs/assessments/${logDir}/${filename}/download`,
    ASSESSMENT_DOWNLOAD_ALL: (logDir: string) => `/api/logs/assessments/${logDir}/download-all`,
  },
  RISK_REPORTS: {
    LIST: '/api/risk-reports',
    DOWNLOAD: (reportId: number, fileType: string) => `/api/risk-reports/${reportId}/download/${fileType}`,
  },
  HEALTH: '/api/health',
  AUDIT: {
    LOGS: '/api/audit/logs',
    MOP_ACTIONS: '/api/audit/mop-actions',
    USER_ACTIONS: '/api/audit/user-actions',
    STATS: '/api/audit/stats',
    CLEANUP: '/api/audit/cleanup',
  },
};

// User roles
export const USER_ROLES = {
  ADMIN: 'admin',
  USER: 'user',
  VIEWER: 'viewer',
} as const;

// User statuses
export const USER_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
} as const;

// MOP statuses
export const MOP_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
} as const;

// Execution statuses
export const EXECUTION_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
} as const;

// Execution types
export const EXECUTION_TYPE = {
  RISK_ASSESSMENT: 'risk_assessment',
  HANDOVER_ASSESSMENT: 'handover_assessment',
} as const;

// Status colors for badges
export const MOP_STATUS_COLORS = {
  [MOP_STATUS.PENDING]: 'warning',
  [MOP_STATUS.APPROVED]: 'success',
} as const;

export const USER_STATUS_COLORS = {
  [USER_STATUS.PENDING]: 'warning',
  [USER_STATUS.ACTIVE]: 'success',
} as const;

export const EXECUTION_STATUS_COLORS = {
  [EXECUTION_STATUS.PENDING]: 'secondary',
  [EXECUTION_STATUS.RUNNING]: 'info',
  [EXECUTION_STATUS.COMPLETED]: 'success',
  [EXECUTION_STATUS.FAILED]: 'danger',
} as const;

// Local storage keys
export const STORAGE_KEYS = {
  TOKEN: 'token',
  USER: 'user',
  THEME: 'theme',
} as const;

// Pagination
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 10,
  PAGE_SIZE_OPTIONS: [10, 25, 50, 100],
} as const;

// File upload
export const FILE_UPLOAD = {
  MAX_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_TYPES: ['.xlsx', '.xls', '.csv'],
} as const;

// Routes
export const ROUTES = {
  LOGIN: '/login',
  REGISTER: '/register',
  DASHBOARD: '/',
  RISK_ASSESSMENT: '/risk-assessment',
  HANDOVER_ASSESSMENT: '/handover-assessment',
  EXECUTION_HISTORY: '/execution-history',
  MOP_EXECUTION_HISTORY: '/execution-history/mop-executions',
  MOP_ACTION_HISTORY: '/execution-history/mop-actions',
  MOP_SUBMISSION: '/mop-submission',
  MOP_MANAGEMENT: '/mop-management',
  MOP_EDIT: '/mop-edit',
  MOP_REVIEW: '/mop-review',
  USER_MANAGEMENT: '/user-management',
} as const;