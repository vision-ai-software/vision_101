// Load environment variables first
require('dotenv').config();

const express = require('express');
const { CSAAgent } = require('./csa_agent'); // Assuming csa_agent.js is in the same directory

const app = express();
const port = process.env.PORT || 3000;

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

let agent;

async function initializeAgent() {
    try {
        agent = new CSAAgent();
        console.log("CSAAgent initialized successfully.");
        // You might want to do a warm-up call or check connections here
    } catch (error) {
        console.error("Failed to initialize CSAAgent:", error);
        // Prevent server from starting if agent fails to initialize
        process.exit(1); 
    }
}

// Middleware to ensure agent is initialized
const ensureAgentInitialized = (req, res, next) => {
    if (!agent) {
        return res.status(503).json({ error: "Service Unavailable: Agent not initialized." });
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

app.post('/api/chat', ensureAgentInitialized, async (req, res) => {
    const { message, thread_id } = req.body;

    if (!message) {
        return res.status(400).json({ error: "Missing 'message' in request body" });
    }
    if (!thread_id) {
        return res.status(400).json({ error: "Missing 'thread_id' in request body" });
    }

    console.log(`[Server] Received message for thread ${thread_id}: ${message}`);

    try {
        const agentResponse = await agent.processMessage(message, thread_id);
        // The response from processMessage is already a string (final_response)
        console.log(`[Server] Sending response for thread ${thread_id}:`, agentResponse);
        res.json({ 
            reply: agentResponse, 
            thread_id: thread_id,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error(`[Server] Error processing message for thread ${thread_id}:`, error);
        res.status(500).json({ error: "Failed to process message", details: error.message });
    }
});

// Initialize agent and start server
initializeAgent().then(() => {
    app.listen(port, () => {
        console.log(`CSA Agent API server listening on port ${port}`);
        console.log(`Try: curl -X POST http://localhost:${port}/api/chat -H "Content-Type: application/json" -d '{"message": "Hello", "thread_id": "test-thread-123"}'`);
    });
}).catch(error => {
    console.error("Server failed to start due to agent initialization issues:", error);
});

// Basic health check endpoint
app.get('/health', (req, res) => {
    if (agent) {
        res.status(200).send('OK');
    } else {
        res.status(503).send('Agent not initialized');
    }
}); 