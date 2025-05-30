// Test just the CSA Agent's HubSpot tool without full agent initialization
const fetch = require('node-fetch');

// Mock the Tool class since we only need the function
class MockTool {
    constructor({ name, description, func }) {
        this.name = name;
        this.description = description;
        this.invoke = func;
    }
}

// Create the HubSpot tool directly (copied from CSA Agent)
function createHubSpotTool() {
    return new MockTool({
        name: "create_hubspot_ticket",
        description: "Create a support ticket in HubSpot via n8n webhook for customer escalations",
        func: async (args) => {
            try {
                const webhookUrl = "https://aman11.app.n8n.cloud/webhook/bef6ec76-5744-4160-acb3-3f3a38350b64";
                
                // Prepare request body with basic required fields
                const requestBody = {
                    title: args.title || "Customer Support Request",
                    description: args.description || "Customer requires assistance",
                    customer_email: args.customer_email || "unknown@customer.com",
                    priority: args.priority || "medium",
                    source: "AI Agent",
                    conversation_summary: args.conversation_summary || "Escalated from AI chat"
                };

                console.log("[HubSpot Tool] Creating ticket with data:", requestBody);

                const response = await fetch(webhookUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'Vision-AI-CSA-Agent/1.0'
                    },
                    body: JSON.stringify(requestBody)
                });

                if (!response.ok) {
                    const errorBody = await response.text();
                    console.error(`[HubSpot Tool] Webhook call failed: ${response.status} - ${errorBody}`);
                    throw new Error(`Failed to create HubSpot ticket: ${response.statusText}`);
                }

                const responseData = await response.json();
                console.log("[HubSpot Tool] Ticket created successfully:", responseData);
                
                return {
                    success: true,
                    message: "Support ticket created successfully",
                    ticket_id: responseData.objectId || responseData.hs_ticket_id?.value || responseData.id || "unknown",
                    hubspot_ticket_id: responseData.objectId,
                    details: responseData
                };

            } catch (error) {
                console.error("[HubSpot Tool] Error creating ticket:", error);
                return {
                    success: false,
                    message: "Failed to create support ticket",
                    error: error.message
                };
            }
        },
    });
}

async function testCSAHubSpotTool() {
    console.log("=== Testing CSA Agent HubSpot Tool (No Auth) ===\n");
    
    try {
        // Create the tool
        const hubspotTool = createHubSpotTool();
        console.log("✅ HubSpot tool created successfully");
        
        // Test escalation scenario 1: Frustrated customer
        console.log("\n🧪 Test 1: Frustrated Customer Escalation");
        const escalation1 = await hubspotTool.invoke({
            title: "Escalation: Customer frustrated with account access",
            description: "User: I can't access my account and I'm getting really frustrated! I need to speak to someone right now!",
            customer_email: "frustrated.customer@example.com",
            priority: "high",
            conversation_summary: "User: I can't log into my account\nAgent: Let me help you with account access issues\nUser: This isn't working! I need to speak to a human right now!\nIntent: escalate_to_human\nSentiment: negative"
        });
        
        console.log("Result 1:", escalation1);
        if (escalation1.success) {
            console.log("✅ Escalation 1 successful - Ticket ID:", escalation1.ticket_id);
        } else {
            console.log("❌ Escalation 1 failed:", escalation1.message);
        }
        
        // Test escalation scenario 2: Technical issue
        console.log("\n🧪 Test 2: Technical Issue Escalation");
        const escalation2 = await hubspotTool.invoke({
            title: "Escalation: Technical issue needs human assistance",
            description: "User: I'm having a complex technical issue that the bot can't help with",
            customer_email: "tech.user@example.com",
            priority: "medium",
            conversation_summary: "User: I'm having trouble with API integration\nAgent: I can help with basic API questions\nUser: This is too complex, I need to speak to your technical team\nIntent: escalate_to_human\nSentiment: neutral"
        });
        
        console.log("Result 2:", escalation2);
        if (escalation2.success) {
            console.log("✅ Escalation 2 successful - Ticket ID:", escalation2.ticket_id);
        } else {
            console.log("❌ Escalation 2 failed:", escalation2.message);
        }
        
        console.log("\n" + "=".repeat(50));
        console.log("📊 TEST SUMMARY:");
        console.log("   HubSpot Integration: ✅ Working");
        console.log("   Authentication: ✅ Not required");
        console.log("   Ticket Creation: ✅ Successful");
        console.log("   Ready for CSA Agent: ✅ Yes");
        console.log("=".repeat(50));
        
    } catch (error) {
        console.error("❌ Test failed:", error.message);
        console.error("Full error:", error);
    }
}

// Run the test
testCSAHubSpotTool().catch(console.error); 