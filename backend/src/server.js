// Load environment variables first
require('dotenv').config();

const express = require('express');
const { CSAAgent } = require('./csa_agent');
const app = express();
const port = process.env.PORT || 8080;

// Enable CORS for frontend communication
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.use(express.json());

// Initialize the CSAAgent. It will be initialized asynchronously.
let agent;
let agentInitializationError = null;

async function initializeAgent() {
    try {
        console.log("[Server] Initializing CSAAgent...");
        agent = new CSAAgent();
        // If CSAAgent had an async initialization method, it would be called here:
        // await agent.init(); 
        console.log("[Server] CSAAgent initialized successfully.");
    } catch (error) {
        agentInitializationError = error;
        console.error("[Server] Failed to initialize CSAAgent:", error);
    }
}

// Middleware to ensure agent is ready before handling requests
const ensureAgentInitialized = (req, res, next) => {
    if (agentInitializationError) {
        return res.status(503).json({ error: "Service Unavailable: Agent failed to initialize." });
    }
    if (!agent) {
        return res.status(503).json({ error: "Service Unavailable: Agent is initializing." });
    }
    next();
};

app.get('/', (req, res) => {
    res.send('CSA Agent API is running!');
});

// Add a GET endpoint for /api/chat to provide usage information
app.get('/api/chat', (req, res) => {
    res.json({
        message: "CSA Agent Chat API",
        usage: "This endpoint accepts POST requests only",
        example: {
            method: "POST",
            url: "/api/chat",
            headers: {
                "Content-Type": "application/json"
            },
            body: {
                message: "Hello, I need help",
                thread_id: "your-thread-id"
            }
        },
        frontend_url: "Open frontend/index.html in your browser to use the chat interface"
    });
});

// Standard health check endpoint
app.get('/health', (req, res) => {
    if (agentInitializationError) {
        return res.status(503).json({ status: 'UNHEALTHY', error: 'Agent initialization failed' });
    }
    if (!agent) {
        return res.status(503).json({ status: 'INITIALIZING' });
    }
    res.status(200).json({ status: 'OK' });
});

/**
 * Main endpoint for the Python wrapper agent to call.
 * This secures the core agent logic behind a single entry point.
 */
app.post('/invoke-agent', ensureAgentInitialized, async (req, res) => {
    const { userInput, threadId } = req.body;

    if (!userInput || !threadId) {
        return res.status(400).json({ 
            error: 'Bad Request: Both "userInput" and "threadId" are required.' 
        });
    }

    try {
        console.log(`[Server] Invoking agent for threadId: ${threadId}`);
        const agentResponse = await agent.processMessage(userInput, threadId);

        if (!agentResponse || !agentResponse.final_response) {
            console.error("[Server] Agent did not return a final response for threadId:", threadId);
            return res.status(500).json({ error: "Agent processed the request but returned no response." });
        }
        
        console.log(`[Server] Agent returned final response for threadId: ${threadId}`);
        res.status(200).json({ final_response: agentResponse.final_response });

    } catch (error) {
        console.error(`[Server] Error processing message for threadId ${threadId}:`, error);
        res.status(500).json({ 
            error: 'An internal error occurred while processing your request.',
            details: error.message 
        });
    }
});

/**
 * Deprecated chat endpoint - to be removed after migration.
 * This ensures backward compatibility during the transition.
 */
app.post('/api/chat', (req, res, next) => {
    console.warn("DEPRECATION WARNING: The /api/chat endpoint is deprecated and will be removed. Use /invoke-agent instead.");
    
    const { message, conversationId, thread_id } = req.body;
    const effectiveUserInput = message;
    const effectiveThreadId = conversationId || thread_id; // Support both old and new key names

    if (!effectiveUserInput || !effectiveThreadId) {
        return res.status(400).json({ error: 'Message and conversationId (or thread_id) are required' });
    }

    // Rewrite the request body and URL to forward it to the new endpoint
    req.body = { userInput: effectiveUserInput, threadId: effectiveThreadId };
    req.url = '/invoke-agent';

    // Call the router to handle the rewritten request
    return app._router.handle(req, res, next);
});

// Start the server after initializing the agent
initializeAgent().then(() => {
    if (!agentInitializationError) {
        app.listen(port, () => {
            console.log(`Server is running on port ${port}`);
            console.log(`Health endpoint available at http://localhost:${port}/health`);
            console.log(`Agent endpoint available at http://localhost:${port}/invoke-agent`);
        });
    } else {
        console.error("Server will not start because agent initialization failed.");
        // In a real production environment, this should trigger an alert.
    }
});

module.exports = app; 