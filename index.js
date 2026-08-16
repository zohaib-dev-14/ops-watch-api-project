require('dotenv').config();

const Sentry = require('@sentry/node');

const PORT = process.env.PORT || 3000;
const SENTRY_DSN = process.env.SENTRY_DSN || 'https://6cfc105aa6f691661aa86478e2dac860@o4511876441309184.ingest.us.sentry.io/4511876587913216';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'YOUR_GEMINI_API_KEY_HERE';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_MODELS = [
  GEMINI_MODEL,
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
];

// ============================================================
// 1) SENTRY.IO INTEGRATION (init before express)
// ============================================================
Sentry.init({
  dsn: SENTRY_DSN,
  integrations: [Sentry.httpIntegration(), Sentry.expressIntegration()],
  tracesSampleRate: 1.0,
  environment: process.env.NODE_ENV || 'development',
});

const express = require('express');
const cors = require('cors');
const { GoogleGenAI } = require('@google/genai');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const app = express();

// ============================================================
// CORS MIDDLEWARE (for Swagger UI frontend access)
// ============================================================
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:8080', 'https://ops-watch-api-project.vercel.app'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  credentials: true,
  optionsSuccessStatus: 200
}));

app.use(express.json());

// ============================================================
// 2) GEMINI AI INTEGRATION
// ============================================================
const geminiEnabled =
  GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY_HERE' && GEMINI_API_KEY.length > 10;

const ai = geminiEnabled ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

const getGeminiErrorDetails = (err) => {
  const payload = err && err.response && err.response.data ? err.response.data : err;
  const message =
    payload && payload.error && payload.error.message
      ? payload.error.message
      : err && err.message
        ? err.message
        : 'Gemini API request failed';

  const status =
    payload && payload.error && payload.error.code ? Number(payload.error.code) : err && err.status ? Number(err.status) : 500;

  return { message, status };
};

const formatUptime = (uptimeSec) => {
  const hrs = String(Math.floor(uptimeSec / 3600)).padStart(2, '0');
  const mins = String(Math.floor((uptimeSec % 3600) / 60)).padStart(2, '0');
  const secs = String(Math.floor(uptimeSec % 60)).padStart(2, '0');
  return {
    seconds: Number(uptimeSec.toFixed(2)),
    formatted: `${hrs}h ${mins}m ${secs}s`,
  };
};

// ============================================================
// 3) SWAGGER UI DOCUMENTATION at /docs
// ============================================================
const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'OpsWatch API',
      version: '1.0.0',
      description:
        'DevOps server monitoring and error-tracking backend. Tracks health metrics, captures errors via Sentry, analyzes logs with Gemini AI, and exposes interactive API docs.',
    },
    servers: [{ url: `http://localhost:${PORT}`, description: 'Local development server' }],
    tags: [
      { name: 'General', description: 'Welcome and system status' },
      { name: 'Monitoring', description: 'Health metrics and Sentry debug' },
      { name: 'AI', description: 'Gemini-powered log analysis' },
    ],
    components: {
      schemas: {
        WelcomeResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Welcome to OpsWatch API' },
            name: { type: 'string', example: 'OpsWatch API' },
            version: { type: 'string', example: '1.0.0' },
            status: { type: 'string', example: 'running' },
            uptime: {
              type: 'object',
              properties: {
                seconds: { type: 'number', example: 42.5 },
                formatted: { type: 'string', example: '00h 00m 42s' },
              },
            },
            documentation: { type: 'string', example: '/docs' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
        StatusResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            status: { type: 'string', example: 'healthy' },
            uptime: {
              type: 'object',
              properties: {
                seconds: { type: 'number' },
                formatted: { type: 'string' },
              },
            },
            memory: {
              type: 'object',
              properties: {
                rss: { type: 'integer' },
                heapTotal: { type: 'integer' },
                heapUsed: { type: 'integer' },
                external: { type: 'integer' },
                rssMB: { type: 'number' },
                heapUsedMB: { type: 'number' },
              },
            },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
        AnalyzeLogsRequest: {
          type: 'object',
          required: ['logs'],
          properties: {
            logs: {
              type: 'string',
              description: 'Raw server log text to analyze',
              example:
                'ERROR [2026-08-08] Connection timeout on port 5432\nWARN Disk usage at 92%',
            },
          },
        },
        AnalyzeLogsResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            model: { type: 'string', example: 'gemini-2.5-flash' },
            summary: {
              type: 'string',
              example:
                'The logs show a database connection timeout and high disk usage. Restart the DB service and free disk space on the affected volume.',
            },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string' },
            eventId: { type: 'string' },
            note: { type: 'string' },
          },
        },
      },
    },
  },
  apis: ['./index.js'],
});

// Serve Swagger UI using CDN for better Vercel compatibility
app.get('/docs', (req, res) => {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>OpsWatch API — Swagger UI</title>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@3/swagger-ui.css">
      <style>
        .topbar { display: none; }
        body { margin: 0; padding: 0; }
      </style>
    </head>
    <body>
      <div id="swagger-ui"></div>
      <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@3/swagger-ui-bundle.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@3/swagger-ui-standalone-preset.js"></script>
      <script>
        window.onload = function() {
          SwaggerUIBundle({
            url: '/api/swagger-json',
            dom_id: '#swagger-ui',
            presets: [
              SwaggerUIBundle.presets.apis,
              SwaggerUIStandalonePreset
            ],
            layout: 'StandaloneLayout',
            explorer: true
          });
        };
      </script>
    </body>
    </html>
  `;
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// Serve Swagger JSON spec
app.get('/api/swagger-json', (req, res) => {
  res.json(swaggerSpec);
});

// ============================================================
// 4) ROUTES
// ============================================================

/**
 * @swagger
 * /:
 *   get:
 *     tags: [General]
 *     summary: Welcome message and system status
 *     description: Returns a welcome message along with current system uptime and running status.
 *     responses:
 *       200:
 *         description: Welcome payload with system status
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/WelcomeResponse'
 */
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Welcome to OpsWatch API',
    name: 'OpsWatch API',
    version: '1.0.0',
    status: 'running',
    uptime: formatUptime(process.uptime()),
    documentation: '/docs',
    timestamp: new Date().toISOString(),
  });
});

/**
 * @swagger
 * /api/status:
 *   get:
 *     tags: [Monitoring]
 *     summary: Operational health metrics
 *     description: Returns server health status, uptime, memory usage, and timestamp.
 *     responses:
 *       200:
 *         description: Healthy system metrics
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StatusResponse'
 */
app.get('/api/status', (req, res) => {
  const mem = process.memoryUsage();

  res.json({
    success: true,
    status: 'healthy',
    uptime: formatUptime(process.uptime()),
    memory: {
      rss: mem.rss,
      heapTotal: mem.heapTotal,
      heapUsed: mem.heapUsed,
      external: mem.external,
      rssMB: Number((mem.rss / 1024 / 1024).toFixed(2)),
      heapUsedMB: Number((mem.heapUsed / 1024 / 1024).toFixed(2)),
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * @swagger
 * /api/debug-error:
 *   get:
 *     tags: [Monitoring]
 *     summary: Trigger a Sentry test error
 *     description: Intentionally throws an error to verify Sentry.io error logging is working.
 *     responses:
 *       500:
 *         description: Test error captured by Sentry
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
app.get('/api/debug-error', (req, res) => {
  throw new Error('OpsWatch Sentry Test Error');
});

/**
 * @swagger
 * /api/analyze-logs:
 *   post:
 *     tags: [AI]
 *     summary: Gemini AI log analysis
 *     description: Accepts server log text and returns a concise 2-sentence AI summary of the issue and recommended fix using gemini-2.5-flash.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AnalyzeLogsRequest'
 *     responses:
 *       200:
 *         description: AI-generated log summary
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AnalyzeLogsResponse'
 *       400:
 *         description: Missing or invalid logs field
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       503:
 *         description: Gemini API key not configured
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
app.post('/api/analyze-logs', async (req, res, next) => {
  try {
    const { logs } = req.body;

    if (!logs || typeof logs !== 'string' || !logs.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Request body must include a non-empty "logs" string',
      });
    }

    if (!geminiEnabled || !ai) {
      return res.status(503).json({
        success: false,
        error: 'Gemini API key not configured',
        note: 'Set GEMINI_API_KEY in .env (see .env.example)',
      });
    }

    const prompt = [
      'You are a DevOps engineer analyzing server logs for OpsWatch.',
      'Respond with exactly 2 concise sentences:',
      'Sentence 1 — describe the main issue found in the logs.',
      'Sentence 2 — recommend a specific fix or next step.',
      '',
      'Logs:',
      logs.trim(),
    ].join('\n');

    let lastError = null;
    let finalModel = null;
    let finalSummary = null;

    for (const modelName of GEMINI_MODELS) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
        });

        finalModel = modelName;
        finalSummary = response.text;
        break;
      } catch (err) {
        lastError = err;
        console.warn(`Gemini model ${modelName} unavailable: ${err.message || 'unknown error'}`);
      }
    }

    if (!finalModel || !finalSummary) {
      Sentry.captureException(lastError || new Error('Gemini model unavailable'));
      const { message, status } = getGeminiErrorDetails(lastError || new Error('Gemini model unavailable'));

      return res.status(status === 404 || status === 429 ? 503 : status || 500).json({
        success: false,
        error: 'Gemini API is currently unavailable. Please check the API key, billing/quota, and model availability.',
        details: message,
        model: GEMINI_MODEL,
        note: 'Gemini request failed; Sentry captured the event for investigation.',
      });
    }

    return res.json({
      success: true,
      model: finalModel,
      summary: finalSummary,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// 5) SENTRY ERROR HANDLER + 404
// ============================================================
Sentry.setupExpressErrorHandler(app);

app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path} — ${err.message}`);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error',
    eventId: res.sentry || undefined,
    note: 'Error captured by Sentry.io',
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    availableRoutes: ['GET /', 'GET /api/status', 'GET /api/debug-error', 'POST /api/analyze-logs', 'GET /docs'],
  });
});

// ============================================================
// 6) START SERVER
// ============================================================
app.listen(PORT, () => {
  const serverUrl = `http://localhost:${PORT}`;
  const docsUrl = `${serverUrl}/docs`;

  console.log('\n================================================');
  console.log('  OpsWatch API — DevOps Monitoring Backend');
  console.log('================================================');
  console.log(`  Server URL:        ${serverUrl}`);
  console.log(`  Swagger UI Docs:   ${docsUrl}`);
  console.log('------------------------------------------------');
  console.log(`  Health:            ${serverUrl}/api/status`);
  console.log(`  Analyze Logs:      POST ${serverUrl}/api/analyze-logs`);
  console.log(`  Sentry Test:       ${serverUrl}/api/debug-error`);
  console.log('================================================\n');
});
