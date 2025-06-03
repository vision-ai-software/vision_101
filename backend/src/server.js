const express = require('express');
const { CSAAgent } = require('./csa_agent'); // Assuming csa_agent.js is in the same directory

const app = express();
const port = process.env.PORT || 3000;

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
        // The response from processMessage is the full state. 
        // You might want to extract specific parts, e.g., the latest AI message.
        // For now, returning the last message from conversation_history if it's an AIMessage.
        let lastMessageContent = "No response generated.";
        if (agentResponse && agentResponse.conversation_history && agentResponse.conversation_history.length > 0) {
            const lastMsg = agentResponse.conversation_history[agentResponse.conversation_history.length - 1];
            if (lastMsg && lastMsg.constructor.name === 'AIMessage') { // Check if it's an AIMessage
                 lastMessageContent = lastMsg.content;
            } else if (lastMsg) {
                lastMessageContent = "Agent processed input, but last message was not from AI."
            }
        }
        
        console.log(`[Server] Sending response for thread ${thread_id}:`, lastMessageContent);
        res.json({ 
            reply: lastMessageContent, 
            thread_id: thread_id,
            full_state: agentResponse // Optionally return the full state for debugging
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