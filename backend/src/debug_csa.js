// Debug script to isolate the CSA agent binding error
require('dotenv').config();

console.log("=== CSA Agent Debug Script ===");

// Test 1: Import dependencies
console.log("1. Testing imports...");
try {
    const { StateGraph, END } = require("@langchain/langgraph");
    console.log("✅ StateGraph imported successfully");
    
    const { AIMessage, HumanMessage } = require("@langchain/core/messages");
    console.log("✅ Messages imported successfully");
    
    const { ChatVertexAI } = require("@langchain/google-vertexai");
    console.log("✅ VertexAI imported successfully");
    
} catch (error) {
    console.error("❌ Import failed:", error.message);
    process.exit(1);
}

// Test 2: Basic StateGraph creation
console.log("\n2. Testing basic StateGraph...");
try {
    const { StateGraph, END } = require("@langchain/langgraph");
    
    const simpleChannels = {
        test_field: {
            value: (x, y) => y ?? x,
            default: () => "default"
        }
    };
    
    const workflow = new StateGraph({ channels: simpleChannels });
    console.log("✅ StateGraph created successfully");
    
    workflow.addNode("test", async (state) => {
        return { ...state, test_field: "processed" };
    });
    console.log("✅ Node added successfully");
    
    workflow.setEntryPoint("test");
    workflow.addEdge("test", END);
    console.log("✅ Edges added successfully");
    
    const compiled = workflow.compile();
    console.log("✅ Workflow compiled successfully");
    
} catch (error) {
    console.error("❌ StateGraph test failed:", error.message);
    console.error("Stack:", error.stack);
}

// Test 3: CSA Agent class instantiation
console.log("\n3. Testing CSA Agent class...");
try {
    const { CSAAgent } = require('./csa_agent');
    console.log("✅ CSAAgent class imported successfully");
    
    console.log("Attempting to create CSA Agent instance...");
    const agent = new CSAAgent();
    console.log("✅ CSA Agent created successfully");
    
} catch (error) {
    console.error("❌ CSA Agent creation failed:", error.message);
    console.error("Stack:", error.stack);
}

console.log("\n=== Debug Complete ==="); 