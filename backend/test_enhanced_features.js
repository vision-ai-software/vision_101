// Test script for enhanced CSA Agent features
const { CSAAgent } = require('./src/csa_agent');

async function testEnhancedFeatures() {
    console.log("=== Testing Enhanced CSA Agent Features ===\n");
    
    try {
        const agent = new CSAAgent();
        const testThreadId = "test-enhanced-" + Date.now();
        
        // Test cases for enhanced intent recognition
        const testCases = [
            {
                input: "Hello, I need help with my order",
                expectedIntent: "greeting or request_support",
                description: "Greeting with support request"
            },
            {
                input: "Where is my order #12345?",
                expectedIntent: "check_order_status",
                description: "Order status inquiry with order number"
            },
            {
                input: "I want to speak to a human agent",
                expectedIntent: "escalate_to_human", 
                description: "Direct escalation request"
            },
            {
                input: "What are your product features?",
                expectedIntent: "product_inquiry",
                description: "Product information request"
            },
            {
                input: "I'm having trouble with my account",
                expectedIntent: "request_support",
                description: "Support request"
            },
            {
                input: "How much does this cost?",
                expectedIntent: "product_inquiry",
                description: "Pricing inquiry"
            },
            {
                input: "Track my shipment please",
                expectedIntent: "check_order_status",
                description: "Shipment tracking request"
            }
        ];
        
        console.log("Testing enhanced intent recognition and routing...\n");
        
        for (let i = 0; i < testCases.length; i++) {
            const testCase = testCases[i];
            console.log(`Test ${i + 1}: ${testCase.description}`);
            console.log(`Input: "${testCase.input}"`);
            console.log(`Expected Intent: ${testCase.expectedIntent}`);
            
            try {
                const response = await agent.processMessage(testCase.input, testThreadId + "_" + i);
                console.log(`Response: "${response}"`);
                console.log("✅ Test completed successfully\n");
            } catch (error) {
                console.error(`❌ Test failed: ${error.message}\n`);
            }
        }
        
        // Test order status extraction
        console.log("=== Testing Order ID Extraction ===\n");
        const orderTestCases = [
            "My order 12345 is missing",
            "Order #ABC123 status please",
            "Check order ID: 987654",
            "Where is order number 555-777?"
        ];
        
        for (let i = 0; i < orderTestCases.length; i++) {
            console.log(`Order Test ${i + 1}: "${orderTestCases[i]}"`);
            try {
                const response = await agent.processMessage(orderTestCases[i], testThreadId + "_order_" + i);
                console.log(`Response: "${response}"`);
                console.log("✅ Order test completed\n");
            } catch (error) {
                console.error(`❌ Order test failed: ${error.message}\n`);
            }
        }
        
        console.log("=== Enhanced Features Test Complete ===");
        
    } catch (error) {
        console.error("Test setup failed:", error);
    }
}

// Run the test
if (require.main === module) {
    testEnhancedFeatures().catch(console.error);
}

module.exports = { testEnhancedFeatures }; 