const { StateGraph, END } = require("@langchain/langgraph");

console.log("Testing StateGraph creation...");

// Simple test state
const TestStateChannels = {
    message: {
        value: (x, y) => y ?? x,
        default: () => null
    },
    counter: {
        value: (x, y) => y ?? x,
        default: () => 0
    }
};

async function testStateGraph() {
    try {
        console.log("1. Creating StateGraph...");
        const workflow = new StateGraph({ channels: TestStateChannels });
        
        console.log("2. Adding test node...");
        const testNode = async (state) => {
            console.log("Test node called with state:", state);
            return {
                ...state,
                counter: (state.counter || 0) + 1,
                message: `Processed: ${state.message}`
            };
        };
        
        workflow.addNode("test", testNode);
        
        console.log("3. Setting entry point...");
        workflow.setEntryPoint("test");
        
        console.log("4. Adding edge to END...");
        workflow.addEdge("test", END);
        
        console.log("5. Compiling workflow...");
        const compiledWorkflow = workflow.compile();
        
        console.log("6. Testing workflow execution...");
        const result = await compiledWorkflow.invoke({
            message: "Hello World",
            counter: 0
        });
        
        console.log("Result:", result);
        console.log("✅ StateGraph test completed successfully!");
        
    } catch (error) {
        console.error("❌ StateGraph test failed:", error);
        console.error("Stack trace:", error.stack);
    }
}

testStateGraph(); 