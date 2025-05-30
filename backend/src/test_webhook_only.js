// Simple HubSpot webhook test without CSA Agent dependencies
const fetch = require('node-fetch');

async function testHubSpotWebhookOnly() {
    console.log("=== Testing HubSpot Webhook Only ===\n");
    
    // Check environment variables
    const username = process.env.N8N_WEBHOOK_USER;
    const password = process.env.N8N_WEBHOOK_PASSWORD;
    
    console.log("Environment check:");
    console.log("N8N_WEBHOOK_USER:", username ? `✅ Set to: ${username}` : "❌ Not set");
    console.log("N8N_WEBHOOK_PASSWORD:", password ? `✅ Set to: ${password.replace(/./g, '*')}` : "❌ Not set");
    console.log();
    
    if (!username || !password) {
        console.error("❌ Environment variables not set in this session.");
        console.error("Please provide the correct credentials:");
        console.error("What should N8N_WEBHOOK_USER be?");
        console.error("What should N8N_WEBHOOK_PASSWORD be?");
        return;
    }
    
    try {
        const webhookUrl = "https://aman11.app.n8n.cloud/webhook/bef6ec76-5744-4160-acb3-3f3a38350b64";
        
        // Test data that matches what the CSA Agent will send
        const escalationTicket = {
            title: "CSA Agent Escalation Test",
            description: "User: I'm having trouble with my account and nothing is working. I need help from a real person!",
            customer_email: "test.escalation@visionai.com",
            priority: "high",
            source: "AI Agent",
            conversation_summary: "User: Hi, I'm having trouble with my account\nAgent: I understand you're having account issues. Let me help you with that.\nUser: This isn't working! I need to speak to a human right now!\nIntent: escalate_to_human\nSentiment: negative"
        };
        
        console.log("🔗 Webhook URL:", webhookUrl);
        console.log("📋 Ticket Data:");
        console.log(JSON.stringify(escalationTicket, null, 2));
        console.log();
        
        // Create basic auth
        const basicAuth = Buffer.from(`${username}:${password}`).toString('base64');
        
        console.log("🚀 Sending request...");
        const startTime = Date.now();
        
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${basicAuth}`,
                'User-Agent': 'Vision-AI-CSA-Agent/1.0'
            },
            body: JSON.stringify(escalationTicket)
        });
        
        const duration = Date.now() - startTime;
        console.log(`⏱️  Response received in ${duration}ms`);
        console.log("📊 Status:", response.status, response.statusText);
        
        if (response.ok) {
            console.log("✅ SUCCESS! Webhook call worked!");
            
            try {
                const responseData = await response.json();
                console.log("📄 Response Data:");
                console.log(JSON.stringify(responseData, null, 2));
                
                // Check for ticket ID
                const ticketId = responseData.ticket_id || responseData.id || responseData.ticketId;
                if (ticketId) {
                    console.log(`\n🎟️  HubSpot Ticket Created: ${ticketId}`);
                    console.log("✅ Integration is working perfectly!");
                } else {
                    console.log("⚠️  Ticket created but no ID returned");
                }
                
            } catch (jsonError) {
                console.log("⚠️  Response was successful but not valid JSON");
                const textResponse = await response.text();
                console.log("Response text:", textResponse);
            }
            
        } else {
            console.log("❌ FAILED! Webhook call failed");
            const errorText = await response.text();
            console.log("Error response:", errorText);
            
            // Provide specific troubleshooting
            if (response.status === 401) {
                console.log("\n💡 Authentication Issue:");
                console.log("   - Check if credentials are correct");
                console.log("   - Verify the n8n workflow expects basic auth");
            } else if (response.status === 403) {
                console.log("\n💡 Authorization Issue:");
                console.log("   - Credentials might be wrong");
                console.log("   - n8n workflow might not be active");
                console.log("   - Check if the webhook URL is correct");
            } else if (response.status === 404) {
                console.log("\n💡 Webhook Not Found:");
                console.log("   - Verify the webhook URL is correct");
                console.log("   - Check if the n8n workflow is deployed");
            }
        }
        
    } catch (error) {
        console.error("❌ Network/Connection Error:", error.message);
        
        if (error.code === 'ENOTFOUND') {
            console.log("\n💡 DNS/Network Issue:");
            console.log("   - Check internet connection");
            console.log("   - Verify the webhook domain is reachable");
        }
    }
    
    console.log("\n" + "=".repeat(50));
    console.log("📋 Summary:");
    console.log("   Webhook URL: ✅ Configured");
    console.log("   Credentials: " + (username && password ? "✅ Set" : "❌ Missing"));
    console.log("   Test Result: See above");
    console.log("=".repeat(50));
}

// Run the test
testHubSpotWebhookOnly().catch(console.error); 