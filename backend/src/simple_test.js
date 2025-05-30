// Simplified test for CSA Agent - focusing on structure and logic
// This test mocks external dependencies to test core functionality

console.log("Starting simplified CSA Agent test...\n");

// Test 1: Check if dependencies can be loaded
try {
    console.log("1. Testing dependency imports...");
    
    // Test basic langchain imports
    const { StateGraph, END } = require("@langchain/langgraph");
    console.log("✅ @langchain/langgraph imported successfully");
    
    const { AIMessage, HumanMessage } = require("@langchain/core/messages");
    console.log("✅ @langchain/core/messages imported successfully");
    
    const { PromptTemplate } = require("@langchain/core/prompts");
    console.log("✅ @langchain/core/prompts imported successfully");
    
    const { Tool } = require("langchain/tools");
    console.log("✅ langchain/tools imported successfully");
    
    // Test fetch
    const fetch = require('node-fetch');
    console.log("✅ node-fetch imported successfully");
    
    console.log("\n");
    
} catch (error) {
    console.error("❌ Dependency import failed:", error.message);
    process.exit(1);
}

// Test 2: Test HubSpot webhook call directly
async function testHubSpotWebhook() {
    console.log("2. Testing HubSpot webhook call directly...");
    
    try {
        const fetch = require('node-fetch');
        const webhookUrl = "https://aman11.app.n8n.cloud/webhook/bef6ec76-5744-4160-acb3-3f3a38350b64";
        
        const testData = {
            title: "Test Ticket from Simple Test",
            description: "This is a test ticket to verify the webhook works",
            customer_email: "test@example.com",
            priority: "low",
            source: "AI Agent Test",
            conversation_summary: "Testing webhook connectivity"
        };
        
        // Mock basic auth
        const username = "test_user";
        const password = "test_password";
        const basicAuth = Buffer.from(`${username}:${password}`).toString('base64');
        
        console.log("Sending request to:", webhookUrl);
        console.log("Request data:", JSON.stringify(testData, null, 2));
        
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${basicAuth}`
            },
            body: JSON.stringify(testData)
        });
        
        console.log("Response status:", response.status);
        console.log("Response status text:", response.statusText);
        
        if (response.ok) {
            const responseData = await response.json();
            console.log("✅ Webhook call successful!");
            console.log("Response data:", JSON.stringify(responseData, null, 2));
        } else {
            const errorText = await response.text();
            console.log("⚠️ Webhook call returned non-200 status");
            console.log("Error response:", errorText);
        }
        
    } catch (error) {
        console.error("❌ Webhook test failed:", error.message);
        console.log("Note: This might be expected if the webhook requires different authentication or if there are network issues.");
    }
    
    console.log("\n");
}

// Test 3: Test basic LangGraph StateGraph creation
async function testStateGraph() {
    console.log("3. Testing LangGraph StateGraph creation...");
    
    try {
        const { StateGraph, END } = require("@langchain/langgraph");
        
        // Create a simple state graph
        const workflow = new StateGraph({
            channels: {
                user_input: { value: null },
                intent: { value: null },
                response: { value: null }
            }
        });
        
        // Add a simple node
        workflow.addNode("process", async (state) => {
            console.log("Processing state:", state.user_input);
            return {
                ...state,
                intent: "test_intent",
                response: "Test response generated"
            };
        });
        
        workflow.setEntryPoint("process");
        workflow.addEdge("process", END);
        
        console.log("✅ StateGraph created successfully");
        
        // Test compiling the workflow
        const compiledWorkflow = workflow.compile();
        console.log("✅ Workflow compiled successfully");
        
        // Test running the workflow
        const testState = { user_input: "Hello test" };
        const result = await compiledWorkflow.invoke(testState);
        console.log("✅ Workflow execution successful");
        console.log("Result:", result);
        
    } catch (error) {
        console.error("❌ StateGraph test failed:", error.message);
    }
    
    console.log("\n");
}

// Test 4: Test intent detection logic
function testIntentDetection() {
    console.log("4. Testing intent detection logic...");
    
    try {
        // Mock the intent detection from the CSA agent
        function detectIntent(query) {
            const lowerText = query.toLowerCase();
            if (lowerText.includes('order status') || lowerText.includes('where is my order') || lowerText.includes('track my order')) {
                return 'check_order_status';
            } else if (lowerText.includes('human') || lowerText.includes('agent') || lowerText.includes('escalate')) {
                return 'escalate_to_human';
            } else if (lowerText.endsWith('?') || lowerText.startsWith('what') || lowerText.startsWith('how') || lowerText.startsWith('why')) {
                return 'ask_question';
            }
            return 'unknown_intent';
        }
        
        // Test various inputs
        const testCases = [
            { input: "What are your business hours?", expected: "ask_question" },
            { input: "Where is my order?", expected: "check_order_status" },
            { input: "I need to speak to a human", expected: "escalate_to_human" },
            { input: "Hello there", expected: "unknown_intent" },
            { input: "Can you escalate this?", expected: "escalate_to_human" },
            { input: "How do I track my order 12345?", expected: "ask_question" }
        ];
        
        testCases.forEach(testCase => {
            const result = detectIntent(testCase.input);
            const status = result === testCase.expected ? "✅" : "❌";
            console.log(`${status} "${testCase.input}" -> ${result} (expected: ${testCase.expected})`);
        });
        
        console.log("✅ Intent detection logic test completed");
        
    } catch (error) {
        console.error("❌ Intent detection test failed:", error.message);
    }
    
    console.log("\n");
}

// Run all tests
async function runAllTests() {
    console.log("=== Simple CSA Agent Tests ===\n");
    
    await testHubSpotWebhook();
    await testStateGraph();
    testIntentDetection();
    
    console.log("=== All Simple Tests Completed ===");
}

// Execute
runAllTests().catch(console.error); 