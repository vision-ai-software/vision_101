require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
// Test HubSpot webhook with real environment credentials
const fetch = require('node-fetch');

async function testWebhookWithEnvCredentials() {
    console.log("=== Testing HubSpot Webhook with Environment Credentials ===\n");
    
    // Check if environment variables are set
    const username = process.env.N8N_WEBHOOK_USER;
    const password = process.env.N8N_WEBHOOK_PASSWORD;
    
    console.log("Environment variables check:");
    console.log("N8N_WEBHOOK_USER:", username ? "✅ Set" : "❌ Not set");
    console.log("N8N_WEBHOOK_PASSWORD:", password ? "✅ Set" : "❌ Not set");
    console.log();
    
    if (!username || !password) {
        console.error("❌ Missing environment variables. Please set:");
        console.error("   N8N_WEBHOOK_USER=your_username");
        console.error("   N8N_WEBHOOK_PASSWORD=your_password");
        return;
    }
    
    try {
        const webhookUrl = "https://aman11.app.n8n.cloud/webhook/bef6ec76-5744-4160-acb3-3f3a38350b64";
        
        // Test data for ticket creation
        const testTicketData = {
            title: "Test Escalation from CSA Agent",
            description: "User requested escalation: I'm having trouble with my account and need human assistance",
            customer_email: "test.customer@example.com",
            priority: "medium",
            source: "AI Agent",
            conversation_summary: "User: I'm having trouble with my account\nAgent: I understand you're having account issues. Let me help you with that.\nUser: I need to speak to a human agent please\nIntent: escalate_to_human\nSentiment: neutral"
        };
        
        // Create basic auth header
        const basicAuth = Buffer.from(`${username}:${password}`).toString('base64');
        
        console.log("1. Sending test ticket to HubSpot...");
        console.log("Webhook URL:", webhookUrl);
        console.log("Ticket data:", JSON.stringify(testTicketData, null, 2));
        console.log();
        
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${basicAuth}`
            },
            body: JSON.stringify(testTicketData)
        });
        
        console.log("Response status:", response.status);
        console.log("Response status text:", response.statusText);
        console.log();
        
        if (response.ok) {
            const responseData = await response.json();
            console.log("✅ Webhook call successful!");
            console.log("Response data:", JSON.stringify(responseData, null, 2));
            
            // Extract ticket information if available
            if (responseData.ticket_id || responseData.id) {
                console.log("\n🎟️ Ticket created successfully!");
                console.log("Ticket ID:", responseData.ticket_id || responseData.id);
            }
            
        } else {
            const errorText = await response.text();
            console.log("❌ Webhook call failed");
            console.log("Error response:", errorText);
            
            if (response.status === 403) {
                console.log("\n💡 Troubleshooting tips:");
                console.log("   - Verify the credentials are correct");
                console.log("   - Check if the n8n workflow is active");
                console.log("   - Ensure the webhook URL is correct");
            }
        }
        
    } catch (error) {
        console.error("❌ Test failed with error:", error.message);
        console.error("Full error:", error);
    }
}

// Test the CSA Agent's HubSpot tool directly
async function testCSAAgentTool() {
    console.log("\n=== Testing CSA Agent HubSpot Tool ===\n");
    
    try {
        // Import the CSA Agent (this will test if all dependencies work)
        const { CSAAgent } = require('./csa_agent');
        
        console.log("1. Initializing CSA Agent...");
        const agent = new CSAAgent();
        console.log("✅ CSA Agent initialized successfully");
        
        console.log("\n2. Testing HubSpot tool directly...");
        const toolResult = await agent.tools.hubspot_ticket.invoke({
            title: "Test from CSA Agent Tool",
            description: "Direct tool test - user needs escalation",
            customer_email: "agent.test@example.com",
            priority: "high",
            conversation_summary: "User expressed frustration and requested human assistance"
        });
        
        console.log("Tool result:", JSON.stringify(toolResult, null, 2));
        
        if (toolResult.success) {
            console.log("✅ CSA Agent HubSpot tool working correctly!");
            console.log("Ticket ID:", toolResult.ticket_id);
        } else {
            console.log("❌ Tool returned failure:", toolResult.message);
        }
        
    } catch (error) {
        console.error("❌ CSA Agent tool test failed:", error.message);
        
        if (error.message.includes('GOOGLE_APPLICATION_CREDENTIALS')) {
            console.log("\n💡 Note: Google Cloud authentication not set up for this test.");
            console.log("   The HubSpot tool should still work independently.");
        }
    }
}

// Run tests
async function runTests() {
    await testWebhookWithEnvCredentials();
    await testCSAAgentTool();
    
    console.log("\n=== Test Summary ===");
    console.log("If both tests passed, your HubSpot integration is ready!");
    console.log("Next: Test the full CSA Agent escalation workflow");
}

// Execute
runTests().catch(console.error); 