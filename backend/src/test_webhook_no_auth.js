// Test HubSpot webhook without authentication to see what happens
const fetch = require('node-fetch');

async function testWebhookWithoutAuth() {
    console.log("=== Testing HubSpot Webhook Without Authentication ===\n");
    
    const webhookUrl = "https://aman11.app.n8n.cloud/webhook/bef6ec76-5744-4160-acb3-3f3a38350b64";
    
    const testData = {
        title: "Test Without Auth",
        description: "Testing webhook without authentication",
        customer_email: "test@example.com",
        priority: "low",
        source: "Test Script"
    };
    
    console.log("🔗 Webhook URL:", webhookUrl);
    console.log("📋 Test Data:", JSON.stringify(testData, null, 2));
    console.log("\n🚀 Sending request WITHOUT authentication...\n");
    
    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Vision-AI-Test/1.0'
            },
            body: JSON.stringify(testData)
        });
        
        console.log("📊 Status:", response.status, response.statusText);
        
        if (response.ok) {
            console.log("✅ SUCCESS! Webhook works without auth!");
            const responseData = await response.json();
            console.log("Response:", JSON.stringify(responseData, null, 2));
        } else {
            console.log("❌ Failed without auth");
            const errorText = await response.text();
            console.log("Error response:", errorText);
            
            if (response.status === 401) {
                console.log("\n💡 Requires authentication (expected)");
            } else if (response.status === 403) {
                console.log("\n💡 Forbidden - might need specific auth or be disabled");
            }
        }
        
    } catch (error) {
        console.error("❌ Error:", error.message);
    }
}

async function testDifferentAuthFormats() {
    console.log("\n=== Testing Different Auth Formats ===\n");
    
    const webhookUrl = "https://aman11.app.n8n.cloud/webhook/bef6ec76-5744-4160-acb3-3f3a38350b64";
    const testData = { title: "Auth Format Test" };
    
    // Test 1: No credentials (empty basic auth)
    console.log("1️⃣ Testing empty basic auth...");
    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + Buffer.from(':').toString('base64')
            },
            body: JSON.stringify(testData)
        });
        console.log("   Status:", response.status, response.statusText);
        if (!response.ok) {
            const errorText = await response.text();
            console.log("   Error:", errorText);
        }
    } catch (error) {
        console.log("   Error:", error.message);
    }
    
    // Test 2: API Key in header (common n8n pattern)
    console.log("\n2️⃣ Testing API key in header...");
    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': 'test-key',
                'Authorization': 'Bearer test-token'
            },
            body: JSON.stringify(testData)
        });
        console.log("   Status:", response.status, response.statusText);
        if (!response.ok) {
            const errorText = await response.text();
            console.log("   Error:", errorText);
        }
    } catch (error) {
        console.log("   Error:", error.message);
    }
    
    // Test 3: Query parameter auth
    console.log("\n3️⃣ Testing query parameter auth...");
    try {
        const urlWithAuth = webhookUrl + '?auth=test&key=test';
        const response = await fetch(urlWithAuth, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(testData)
        });
        console.log("   Status:", response.status, response.statusText);
        if (!response.ok) {
            const errorText = await response.text();
            console.log("   Error:", errorText);
        }
    } catch (error) {
        console.log("   Error:", error.message);
    }
}

async function runAllTests() {
    await testWebhookWithoutAuth();
    await testDifferentAuthFormats();
    
    console.log("\n" + "=".repeat(60));
    console.log("🔍 ANALYSIS:");
    console.log("If all tests return 403 'Authorization data is wrong!':");
    console.log("  - The n8n workflow expects specific credentials");
    console.log("  - You need to provide the actual username/password");
    console.log("  - Or check if the workflow authentication is configured differently");
    console.log("=".repeat(60));
}

runAllTests().catch(console.error); 