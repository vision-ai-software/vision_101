// Simple invoke test to isolate the binding error
require('dotenv').config();

async function simpleInvokeTest() {
    console.log("=== Simple Invoke Test ===");
    
    try {
        const { CSAAgent } = require('./csa_agent');
        console.log("✅ CSAAgent imported");
        
        const agent = new CSAAgent();
        console.log("✅ CSA Agent created");
        
        // Test with the simplest possible state
        const simpleState = {
            user_input: "Hello",
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
        
        console.log("Testing workflow without config...");
        try {
            const result = await agent.mainWorkflow.invoke(simpleState);
            console.log("✅ Invoke without config successful!");
            console.log("Result:", result);
        } catch (invokeError) {
            console.error("❌ Invoke without config failed:", invokeError.message);
            console.error("Stack:", invokeError.stack);
        }
        
    } catch (error) {
        console.error("❌ Test failed:", error.message);
    }
}

simpleInvokeTest(); 