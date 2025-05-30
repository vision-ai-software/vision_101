const { CSAAgent } = require('./csa_agent');

// Mock environment variables for testing
process.env.N8N_WEBHOOK_USER = 'test_user';
process.env.N8N_WEBHOOK_PASSWORD = 'test_password';

async function testCSAAgent() {
    console.log("=== Testing CSA Agent Implementation ===\n");
    
    try {
        // Initialize the agent
        console.log("1. Initializing CSA Agent...");
        const agent = new CSAAgent();
        console.log("✅ CSA Agent initialized successfully\n");
        
        // Test 1: Basic question (should trigger knowledge workflow)
        console.log("2. Testing basic question flow...");
        const threadId1 = "test-thread-" + Date.now();
        
        const response1 = await agent.processMessage("What are your business hours?", threadId1);
        console.log("User: What are your business hours?");
        console.log("Agent:", response1);
        console.log("✅ Basic question flow completed\n");
        
        // Test 2: Order status query (should trigger action workflow)
        console.log("3. Testing order status query...");
        const threadId2 = "test-thread-" + (Date.now() + 1);
        
        const response2 = await agent.processMessage("Where is my order? My order ID is 12345", threadId2);
        console.log("User: Where is my order? My order ID is 12345");
        console.log("Agent:", response2);
        console.log("✅ Order status query completed\n");
        
        // Test 3: Escalation request (should trigger HubSpot ticket creation)
        console.log("4. Testing escalation flow with HubSpot ticket creation...");
        const threadId3 = "test-thread-" + (Date.now() + 2);
        
        // First establish some conversation history
        await agent.processMessage("Hi, I'm having trouble with my account", threadId3);
        
        // Now request escalation
        const response3 = await agent.processMessage("I need to speak to a human agent please", threadId3);
        console.log("User: I need to speak to a human agent please");
        console.log("Agent:", response3);
        console.log("✅ Escalation flow completed\n");
        
        // Test 4: Test sentiment analysis with negative sentiment
        console.log("5. Testing negative sentiment escalation...");
        const threadId4 = "test-thread-" + (Date.now() + 3);
        
        const response4 = await agent.processMessage("This is terrible! I'm very frustrated and need help from a real person!", threadId4);
        console.log("User: This is terrible! I'm very frustrated and need help from a real person!");
        console.log("Agent:", response4);
        console.log("✅ Negative sentiment escalation completed\n");
        
        // Test 5: Test direct tool invocation
        console.log("6. Testing direct HubSpot tool invocation...");
        const ticketResult = await agent.tools.hubspot_ticket.invoke({
            title: "Test Ticket from Agent",
            description: "This is a test ticket created during agent testing",
            customer_email: "test@example.com",
            priority: "low",
            conversation_summary: "Test conversation summary"
        });
        console.log("Direct tool result:", JSON.stringify(ticketResult, null, 2));
        console.log("✅ Direct tool invocation completed\n");
        
        console.log("=== All Tests Completed Successfully! ===");
        
    } catch (error) {
        console.error("❌ Test failed with error:", error);
        console.error("Stack trace:", error.stack);
        
        // More specific error handling
        if (error.message.includes('GOOGLE_APPLICATION_CREDENTIALS')) {
            console.log("\n🔧 Note: Google Cloud authentication may not be set up for this test environment.");
            console.log("   For full testing, ensure GOOGLE_APPLICATION_CREDENTIALS is configured.");
        }
        
        if (error.message.includes('database')) {
            console.log("\n🔧 Note: Database connection may not be available for this test environment.");
            console.log("   Some knowledge base features may not work without proper DB setup.");
        }
    }
}

// Test helper function to verify individual components
async function testIndividualComponents() {
    console.log("\n=== Testing Individual Components ===\n");
    
    try {
        const agent = new CSAAgent();
        
        // Test NLU component with mock state
        console.log("Testing NLU workflow...");
        const nluState = {
            user_input: "I want to escalate this to a human",
            conversation_history: []
        };
        
        const nluResult = await agent._nluWorkflow(nluState);
        console.log("NLU Result:", {
            intent: nluResult.intent,
            sentiment: nluResult.sentiment,
            entities_count: nluResult.entities?.length || 0
        });
        
        // Test routing logic
        console.log("\nTesting routing logic...");
        const routeResult = await agent._routeAfterNlu(nluResult);
        console.log("Route decision:", routeResult);
        
        console.log("✅ Individual component tests completed");
        
    } catch (error) {
        console.error("❌ Component test failed:", error.message);
    }
}

// Run tests
async function runAllTests() {
    await testCSAAgent();
    await testIndividualComponents();
}

// Execute if run directly
if (require.main === module) {
    runAllTests().catch(console.error);
}

module.exports = { testCSAAgent, testIndividualComponents }; 