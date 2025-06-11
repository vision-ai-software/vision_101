/**
 * Langchain orchestration logic for the CSA Agent.
 * This module sets up Langchain chains, integrates with LLMs,
 * defines tools, and manages the conversational flow.
 */

// 1. Import necessary modules
// npm install langchain @langchain/google-vertexai @google-cloud/language
const { VertexAI } = require("@langchain/google-vertexai"); // Or other appropriate Langchain Google Vertex AI integration
const { ChatGoogleGenerativeAI } = require("@langchain/google-webauth"); // Example, confirm correct package for Gemini
const { HarmBlockThreshold, HarmCategory } = require("@google/generative-ai");
const { LanguageServiceClient } = require('@google-cloud/language');

const { HumanMessage, SystemMessage } = require("@langchain/core/messages");
const { PromptTemplate } = require("@langchain/core/prompts");
const { RunnableSequence } = require("@langchain/core/runnables");
const { StringOutputParser } = require("@langchain/core/output_parsers");
const { Tool } = require("langchain/tools"); // Check if this is the correct import path for Tool in newer Langchain versions
const { ConversationBufferMemory } = require("langchain/memory"); // Or from "@langchain/community/memory/buffer" etc.
const { getKnowledgeBaseArticle } = require("./database");
const fetch = require('node-fetch'); // Use fetch for HTTP API calls

// Initialize Firestore
const { Firestore } = require('@google-cloud/firestore');
const firestore = new Firestore();

// Placeholder for ADK (Application Development Kit) or GCP client libraries
// These would wrap actual calls to your microservices or GCP APIs.
const adk = {
  callKnowledgeBaseService: async (query) => {
    // Use the actual KB lookup function
    return await getKnowledgeBaseArticle(query);
  },
  callIntegrationService: async (action, details) => {
    let webhookUrl = '';
    let requestBody = details;
    let successMessage = `Integration action '${action}' completed successfully via webhook.`;
    let errorMessage = `Failed to complete action '${action}' via integration webhook.`;

    if (action === 'create_crm_task') {
      // TODO: Replace with your actual Zapier/n8n Webhook URL for creating a CRM task
      webhookUrl = process.env.ZAPIER_N8N_CREATE_CRM_TASK_WEBHOOK_URL || 'https://hooks.zapier.com/your/placeholder/create_crm_task_url';
      // requestBody will be `details` which should contain task information
      // e.g., { title: '...', description: '...', customerId: '...' }
      if (!details || !details.title) { // Basic validation
        console.error('[ADK] Missing task details for create_crm_task');
        throw new Error('Task details (e.g., title) are required.');
      }
      successMessage = "CRM task creation initiated via webhook.";
      errorMessage = "Failed to initiate CRM task creation via integration webhook.";

    } else if (action === 'get_order_status') {
      // TODO: Replace with your actual Zapier/n8n Webhook URL for getting order status
      webhookUrl = process.env.ZAPIER_N8N_GET_ORDER_STATUS_WEBHOOK_URL || 'https://hooks.zapier.com/your/placeholder/get_order_status_url'; 
      if (!details || !details.orderId) {
        console.error('[ADK] Missing orderId for get_order_status');
        throw new Error('Order ID is required to check status.');
      }
      requestBody = { orderId: details.orderId }; // Ensure only relevant data is sent
      successMessage = "Order status request sent via webhook."; // The actual status will be in responseData
      errorMessage = "Failed to get order status via integration webhook.";

    } else if (action === 'trigger_human_handoff') {
      // TODO: Replace with your actual Zapier/n8n Webhook URL for triggering human handoff
      webhookUrl = process.env.ZAPIER_N8N_TRIGGER_HUMAN_HANDOFF_WEBHOOK_URL || 'https://hooks.zapier.com/your/placeholder/trigger_human_handoff_url';
      // requestBody will be `details` which should include conversationId, summary, history
      if (!details || !details.conversationId || !details.summary) { // Basic validation
        console.error('[ADK] Missing details for trigger_human_handoff');
        throw new Error('Conversation ID and summary are required for handoff.');
      }
      successMessage = "Human handoff initiated via webhook.";
      errorMessage = "Failed to initiate human handoff via integration webhook.";

    } else if (action === 'track_shipment') {
      webhookUrl = process.env.ZAPIER_N8N_TRACK_SHIPMENT_WEBHOOK_URL || 'https://hooks.zapier.com/your/placeholder/track_shipment_url';
      if (!details || !details.trackingId) {
        console.error('[ADK] Missing trackingId for track_shipment');
        throw new Error('Tracking ID is required to track a shipment.');
      }
      requestBody = { trackingId: details.trackingId };
      successMessage = "Shipment tracking request sent via webhook.";
      errorMessage = "Failed to get shipment tracking via integration webhook.";

    } else if (action === 'update_shipping_address') {
      webhookUrl = process.env.ZAPIER_N8N_UPDATE_SHIPPING_ADDRESS_WEBHOOK_URL || 'https://hooks.zapier.com/your/placeholder/update_shipping_address_url';
      if (!details || !details.orderId || !details.newAddress) {
        console.error('[ADK] Missing orderId or newAddress for update_shipping_address');
        throw new Error('Order ID and the new address are required to update shipping information.');
      }
      requestBody = { orderId: details.orderId, newAddress: details.newAddress };
      successMessage = "Shipping address update initiated via webhook.";
      errorMessage = "Failed to initiate shipping address update via integration webhook.";

    } else if (action === 'process_refund') {
      webhookUrl = process.env.ZAPIER_N8N_PROCESS_REFUND_WEBHOOK_URL || 'https://hooks.zapier.com/your/placeholder/process_refund_url';
      if (!details || !details.orderId || !details.amount) {
        console.error('[ADK] Missing orderId or amount for process_refund');
        throw new Error('Order ID and refund amount are required to process a refund.');
      }
      requestBody = { orderId: details.orderId, amount: details.amount, reason: details.reason || 'Not specified' };
      successMessage = "Refund request processed via webhook.";
      errorMessage = "Failed to process refund via integration webhook.";

    } else if (action === 'reset_password') {
      webhookUrl = process.env.ZAPIER_N8N_RESET_PASSWORD_WEBHOOK_URL || 'https://hooks.zapier.com/your/placeholder/reset_password_url';
      if (!details || !details.customerEmail) {
        console.error('[ADK] Missing customerEmail for reset_password');
        throw new Error('Customer email is required to send a password reset link.');
      }
      requestBody = { email: details.customerEmail };
      successMessage = "Password reset link has been sent via webhook.";
      errorMessage = "Failed to send password reset link via integration webhook.";

    } else {
      console.warn(`[ADK] Unknown integration action: ${action}`);
      return `Unknown integration action: ${action} (placeholder response)`;
    }

    if (!webhookUrl) {
        console.error(`[ADK] Webhook URL not configured for action: ${action}`);
        throw new Error(`Webhook URL not configured for action: ${action}`);
    }

    console.log(`[ADK] Calling Zapier/n8n webhook for ${action}: ${webhookUrl}`);
    try {
      const headers = {
        'Content-Type': 'application/json',
      };

      // Add auth token if it exists
      if (process.env.ZAPIER_N8N_WEBHOOK_AUTH_TOKEN) {
        headers['Authorization'] = `Bearer ${process.env.ZAPIER_N8N_WEBHOOK_AUTH_TOKEN}`;
      }

      const response = await fetch(webhookUrl, {
        method: 'POST', // Assuming POST for all these actions
        headers: headers,
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[ADK] Zapier/n8n webhook call failed for ${action}: ${response.status} - ${errorBody}`);
        throw new Error(`${errorMessage} Status: ${response.statusText}`);
      }
      
      const responseData = await response.json();
      console.log(`[ADK] Received response from ${action} webhook:`, responseData);
      // TODO: Adapt this based on actual response from each Zapier/n8n webhook.
      // For get_order_status, responseData might be the status itself.
      // For create_crm_task, it might be { success: true, taskId: '123' }.
      // For trigger_human_handoff, it might be { success: true, handoffId: 'abc' }.
      // Consider returning a standardized success message or the actual data.
      return action === 'get_order_status' ? responseData : { success: true, message: successMessage, details: responseData };

    } catch (error) {
      console.error(`[ADK] Error calling ${action} webhook:`, error);
      // Ensure the error message is specific enough
      if (error.message.startsWith("Failed to complete") || error.message.startsWith("Failed to get order status") || error.message.startsWith("Failed to initiate")) {
        throw error; // Re-throw our specific error
      }
      throw new Error(`${errorMessage} Error: ${error.message}`);
    }
  },
  callNluService: async (text) => {
    // Use Google Cloud Natural Language API for entity extraction
    const document = {
      content: text,
      type: 'PLAIN_TEXT',
    };
    // Analyze entities
    const [entityResult] = await languageClient.analyzeEntities({ document });

    // --- Basic Rule-based Intent Detection & Entity Extraction ---
    // ML-based intent detection model in the future.
    let intent = 'unknown_intent';
    let extractedEntities = {}; // Object to hold our custom extracted entities
    const lowerText = text.toLowerCase();
    
    // Ordered by likely specificity to avoid premature matching
    if (lowerText.includes('order status') || lowerText.includes('where is my order')) {
      intent = 'check_order_status';
      const orderIdMatch = text.match(/(?:order|#|id)\s*:?\s*(\w+\d+|\d+\w*|\d{3,})/i);
      if (orderIdMatch) extractedEntities.orderId = orderIdMatch[1];
    } else if (lowerText.includes('track') && (lowerText.includes('shipment') || lowerText.includes('package'))) {
      intent = 'track_shipment';
      const trackingMatch = text.match(/\b([A-Z]{2}\d{9,}[A-Z]{2}|(?:\d\s?){10,})\b/i);
      if (trackingMatch) extractedEntities.trackingId = trackingMatch[0].replace(/\s/g, '');
    } else if (lowerText.includes('refund') || lowerText.includes('money back')) {
      intent = 'process_refund';
      const orderIdMatch = text.match(/(?:order|#|id)\s*:?\s*(\w+\d+|\d+\w*|\d{3,})/i);
      if (orderIdMatch) extractedEntities.orderId = orderIdMatch[1];
      const amountMatch = text.match(/(\$?\d+(?:\.\d{1,2})?)/);
      if (amountMatch) extractedEntities.amount = parseFloat(amountMatch[1].replace('$', ''));
    } else if ((lowerText.includes('update') || lowerText.includes('change')) && lowerText.includes('address')) {
      intent = 'update_shipping_address';
      const orderIdMatch = text.match(/(?:order|#|id)\s*:?\s*(\w+\d+|\d+\w*|\d{3,})/i);
      if (orderIdMatch) extractedEntities.orderId = orderIdMatch[1];
      const addressMatch = text.match(/(?:to|address:)\s*(.*)/i);
      if (addressMatch) extractedEntities.newAddress = addressMatch[1].trim();
    } else if (lowerText.includes('reset') && lowerText.includes('password')) {
      intent = 'reset_password';
      const emailMatch = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/);
      if (emailMatch) extractedEntities.customerEmail = emailMatch[0];
    } else if (lowerText.includes('help') || lowerText.includes('support') || lowerText.includes('agent')) {
      intent = 'request_support';
    } else if (lowerText.includes('thank')) {
      intent = 'thank_you';
    } else if (lowerText.includes('goodbye') || lowerText.includes('bye')) {
      intent = 'goodbye';
    } else if (lowerText.includes('hello') || lowerText.includes('hi')) {
      intent = 'greeting';
    } else {
      intent = 'general_inquiry';
    }
    // --- End Rule-based Intent Detection ---

    return { intent, entities: entityResult.entities, extracted: extractedEntities };
  }
};

// Placeholder for Dialogue Management Service interaction
const dialogueManagementService = {
    getState: async (conversationId) => {
        try {
            const conversationRef = firestore.collection('conversations').doc(conversationId);
            const doc = await conversationRef.get();
            if (!doc.exists) {
                console.log(`[DMS] No history found for ${conversationId}, returning empty array.`);
                return { messages: [] };
            }
            // console.log(`[DMS] Loaded history for ${conversationId}:`, doc.data().messages); 
            return doc.data(); // Assumes { messages: [...] }
        } catch (error) {
            console.error(`[DMS] Error getting state for ${conversationId}:`, error);
            // For robustness, return empty history on error or rethrow if critical
            return { messages: [] }; 
        }
    },
    saveMessages: async (conversationId, messages) => {
        try {
            const conversationRef = firestore.collection('conversations').doc(conversationId);
            // console.log(`[DMS] Saving messages for ${conversationId}:`, messages);
            await conversationRef.set({ messages }, { merge: true });
            console.log(`[DMS] Successfully saved messages for ${conversationId}`);
        } catch (error) {
            console.error(`[DMS] Error saving messages for ${conversationId}:`, error);
            // Decide if this error should halt execution or be handled gracefully
            throw error; // Re-throwing for now, can be adjusted
        }
    }
};


// 1. Initialize Models (using ADK/GCP Libraries)
// Configure with your project, location, and model name (e.g., 'gemini-2.0-flash-001')
const llm = new VertexAI({
  model: "gemini-2.0-flash-001", // Ensure this model name is correct and available
  temperature: 0.7,
  // Add other necessary configurations like project, location if not picked from env
  // safetySettings: [ // Example for Gemini, adjust as per VertexAI SDK
  //   { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE },
  // ],
});

// For chat models, if using Gemini or similar through a chat-specific interface:
const chatModel = new ChatGoogleGenerativeAI({ // This might be different based on actual package for Vertex Gemini
    modelName: "gemini-2.0-flash-001", // or specific chat model
    temperature: 0.7,
    // safetySettings, etc.
});

const languageClient = new LanguageServiceClient();

// 2. Define Tools
const knowledgeBaseTool = new Tool({
  name: "KnowledgeBaseSearch",
  description: "Useful for searching the internal knowledge base for answers to customer questions.",
  func: async (query) => {
    const results = await adk.callKnowledgeBaseService(query);
    return results;
  },
});

const createCRMTaskTool = new Tool({
  name: "CreateCRMTask",
  description: "Useful for creating a task in the CRM for a human agent.",
  func: async (taskDetails) => {
    const result = await adk.callIntegrationService('create_crm_task', taskDetails);
    return result;
  },
});

// NLU Tool (Optional but useful, as per document)
const nluTool = new Tool({
    name: "NLUService",
    description: "Processes text to understand intent and extract entities.",
    func: async (text) => {
        const nluResult = await adk.callNluService(text);
        return JSON.stringify(nluResult); // Tools typically return strings
    }
});

// 3. Define Prompts and Chains
const qaSystemTemplate = `You are an intelligent assistant for Vision AI. 
Answer the user's question based on the following knowledge base article.
If the article doesn't provide a direct answer, say that you couldn't find the information.
---
Knowledge Base Article:
{context}
---
User Question:
{question}
`;

const qaPrompt = PromptTemplate.fromTemplate(qaSystemTemplate);

const qaChain = RunnableSequence.from([
  {
    context: (input) => adk.callKnowledgeBaseService(input.question),
    question: (input) => input.question,
  },
  qaPrompt,
  llm, // Using the general llm for Q&A based on a retrieved context
  new StringOutputParser(),
]);


// 4. Memory Management (using Firestore)
// Function to get conversation history for a given ID
const getMemoryForConversation = async (conversationId) => {
    const memory = new ConversationBufferMemory({
        memoryKey: "history",
        inputKey: "question",
    });

    const doc = await firestore.collection('conversations').doc(conversationId).get();
    if (doc.exists) {
        const data = doc.data();
        // Assuming history is stored as an array of { human: "...", ai: "..." }
        if (data.history) {
            for (const turn of data.history) {
                await memory.chatHistory.addMessages([
                    new HumanMessage(turn.human),
                    new SystemMessage(turn.ai), // Or AIMessage depending on Langchain version
                ]);
            }
        }
    }
    return memory;
};

// Function to save conversation history
const saveMemoryForConversation = async (conversationId, memory) => {
    const history = await memory.chatHistory.getMessages();
    // Convert Langchain message objects to a serializable format
    const serializableHistory = history.map(msg => ({
        type: msg._getType(),
        content: msg.content
    }));

    await firestore.collection('conversations').doc(conversationId).set({
        history: serializableHistory,
        last_updated: new Date().toISOString()
    }, { merge: true });
};


// Main function to process a message
async function processMessageWithLangchain(messageText, conversationId) {
    console.log(`[Langchain] Processing message for conversation ${conversationId}: "${messageText}"`);
    
    // Step 1: NLU to understand intent and entities
    const nluResult = await adk.callNluService(messageText);
    console.log('[Langchain] NLU Result:', nluResult);
    
    // Step 2: Route based on intent
    const intent = nluResult.intent;
    let response;

    // Use a switch statement for cleaner routing logic
    switch (intent) {
        case 'check_order_status':
            if (nluResult.extracted && nluResult.extracted.orderId) {
                response = await adk.callIntegrationService('get_order_status', { orderId: nluResult.extracted.orderId });
            } else {
                response = "I can help with that. What is your order ID?";
            }
            break;

        case 'track_shipment':
             if (nluResult.extracted && nluResult.extracted.trackingId) {
                response = await adk.callIntegrationService('track_shipment', { trackingId: nluResult.extracted.trackingId });
            } else {
                response = "I can help track your shipment. What is the tracking ID?";
            }
            break;

        case 'process_refund':
            // This might require more complex logic, e.g., a multi-step conversation
            response = await adk.callIntegrationService('process_refund', { 
                orderId: nluResult.extracted.orderId, 
                amount: nluResult.extracted.amount 
            });
            break;

        case 'update_shipping_address':
             if (nluResult.extracted && nluResult.extracted.orderId && nluResult.extracted.newAddress) {
                response = await adk.callIntegrationService('update_shipping_address', { 
                    orderId: nluResult.extracted.orderId, 
                    newAddress: nluResult.extracted.newAddress 
                });
            } else {
                response = "I can help update a shipping address. What is the order ID and the new address?";
            }
            break;

        case 'reset_password':
            if (nluResult.extracted && nluResult.extracted.customerEmail) {
                response = await adk.callIntegrationService('reset_password', { customerEmail: nluResult.extracted.customerEmail });
            } else {
                response = "I can help with that. What is your email address?";
            }
            break;
            
        case 'request_support':
        case 'general_inquiry':
            // For general questions, use the Q&A chain with the knowledge base
            response = await qaChain.invoke({ question: messageText });
            break;

        case 'greeting':
            response = "Hello! How can I help you today?";
            break;
            
        case 'thank_you':
            response = "You're welcome! Is there anything else I can assist you with?";
            break;

        case 'goodbye':
            response = "Goodbye! Have a great day.";
            break;
            
        default:
            // Fallback to the Q&A chain for unknown intents
            console.log(`[Langchain] Intent '${intent}' not explicitly handled, falling back to QA chain.`);
            response = await qaChain.invoke({ question: messageText });
            break;
    }

    // Step 3: Update and save conversation memory (optional, can be managed by StateGraph)
    // const memory = await getMemoryForConversation(conversationId);
    // await memory.chatHistory.addMessages([
    //     new HumanMessage(messageText),
    //     new SystemMessage(JSON.stringify(response)), // Storing full response object as AI message
    // ]);
    // await saveMemoryForConversation(conversationId, memory);
    
    console.log(`[Langchain] Final response for conversation ${conversationId}:`, response);
    // The response might be an object from a tool, so we may need to format it.
    if (typeof response === 'object' && response !== null) {
        return JSON.stringify(response, null, 2);
    }
    
    return response;
}


module.exports = {
  processMessageWithLangchain,
  // Potentially export tools, chains, llm if they need to be accessed/configured elsewhere
  llm,
  chatModel,
  knowledgeBaseTool,
  createCRMTaskTool,
  nluTool,
  qaChain
}; 