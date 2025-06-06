// Test script to isolate the message processing binding error
require('dotenv').config();

async function testMessageProcessing() {
    console.log("=== Message Processing Test ===");
    
    try {
        const { CSAAgent } = require('./csa_agent');
        console.log("✅ CSAAgent imported");
        
        const agent = new CSAAgent();
        console.log("✅ CSA Agent created");
        
        console.log("\nTesting message processing...");
        const testMessage = "Hello, I need help";
        const testThreadId = "test-thread-123";
        
        console.log(`Sending message: "${testMessage}" with thread ID: "${testThreadId}"`);
        
        const response = await agent.processMessage(testMessage, testThreadId);
        console.log("✅ Message processed successfully");
        console.log("Response:", response);
        
    } catch (error) {
        console.error("❌ Message processing failed:", error.message);
        console.error("Full error:", error);
        console.error("Stack trace:", error.stack);
    }
}

testMessageProcessing(); 