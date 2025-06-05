require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { CSAAgent } = require('./csa_agent');

async function testRAGWorkflow() {
    console.log("=== Testing Advanced RAG Workflow ===\n");

    // Ensure GOOGLE_APPLICATION_CREDENTIALS is set in your .env or environment
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        console.warn("⚠️ WARNING: GOOGLE_APPLICATION_CREDENTIALS is not set. Google Cloud services (Language, Gemini) may not work.");
    }

    const agent = new CSAAgent();
    const threadId = "test-rag-conversation-" + Date.now();
    const userQuery = "how can you help me to assist my problem?";

    console.log(`User Query: "${userQuery}"`);
    console.log("-----------------------------------------------------");

    try {
        const response = await agent.processMessage(userQuery, threadId);
        console.log("-----------------------------------------------------");
        console.log("Agent's Final Response:");
        console.log(response);
    } catch (error) {
        console.error("Error during RAG workflow test:", error);
    }

    console.log("\n=== Test Complete ===");
    console.log("Review the logs above, especially [CSAAgent KB] messages, to see context generation.");
}

testRAGWorkflow().catch(console.error); 