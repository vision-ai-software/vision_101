// Detailed debug script to trace the binding error
require('dotenv').config();

async function detailedDebug() {
    console.log("=== Detailed Binding Error Debug ===");
    
    try {
        const { CSAAgent } = require('./csa_agent');
        console.log("✅ CSAAgent imported");
        
        const agent = new CSAAgent();
        console.log("✅ CSA Agent created");
        
        console.log("\n--- Testing individual workflow methods ---");
        
        // Test initial state creation
        const initialState = {
            user_input: "Hello, I need help",
            intent: null,
            entities: [],
            sentiment: { score: 0, magnitude: 0, label: "neutral" },
            language: "en",
            nlu_confidence: 0,
            retrieved_docs: [],
            context: null,
            knowledge_confidence: 0,
            action_taken: null,
            action_result: null,
            conversation_history: [],
            final_response: null
        };
        console.log("✅ Initial state created");
        
        // Test NLU workflow directly
        console.log("\n1. Testing NLU workflow...");
        try {
            const nluResult = await agent._nluWorkflow(initialState);
            console.log("✅ NLU workflow successful");
            console.log("NLU result intent:", nluResult.intent);
        } catch (nluError) {
            console.error("❌ NLU workflow failed:", nluError.message);
            return;
        }
        
        // Test route after NLU
        console.log("\n2. Testing route after NLU...");
        try {
            const route = await agent._routeAfterNlu(initialState);
            console.log("✅ Route after NLU successful:", route);
        } catch (routeError) {
            console.error("❌ Route after NLU failed:", routeError.message);
            return;
        }
        
        // Test invoke with very basic config
        console.log("\n3. Testing workflow invoke...");
        const config = { configurable: { thread_id: "debug-thread-" + Date.now() } };
        
        try {
            console.log("About to call mainWorkflow.invoke...");
            const result = await agent.mainWorkflow.invoke(initialState, config);
            console.log("✅ Workflow invoke successful!");
            console.log("Result:", result);
        } catch (invokeError) {
            console.error("❌ Workflow invoke failed:", invokeError.message);
            console.error("Stack:", invokeError.stack);
            
            // Try without config
            console.log("\n4. Trying without config...");
            try {
                const resultNoConfig = await agent.mainWorkflow.invoke(initialState);
                console.log("✅ Workflow invoke without config successful!");
                console.log("Result:", resultNoConfig);
            } catch (noConfigError) {
                console.error("❌ Workflow invoke without config also failed:", noConfigError.message);
            }
        }
        
    } catch (error) {
        console.error("❌ Overall test failed:", error.message);
        console.error("Stack:", error.stack);
    }
}

detailedDebug(); 