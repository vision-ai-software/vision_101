const { StateGraph, END } = require("@langchain/langgraph");
// const { BaseCheckpointSaver } = require("@langchain/langgraph/checkpoint"); // This import path doesn't exist
const { Tool } = require("langchain/tools");
const { AIMessage, HumanMessage, SystemMessage } = require("@langchain/core/messages");
const { PromptTemplate } = require("@langchain/core/prompts");
const { StringOutputParser } = require("@langchain/core/output_parsers");
const { RunnableSequence } = require("@langchain/core/runnables");
const { LanguageServiceClient } = require('@google-cloud/language');
const { ChatGoogleGenerativeAI } = require("@langchain/google-webauth");
const { getKnowledgeBaseArticle } = require('./database');
const fetch = require('node-fetch');

// Simple in-memory checkpoint saver implementation
class MemorySaver {
    constructor() {
        this.storage = new Map();
    }

    get(config) {
        return this.storage.get(config.configurable.thread_id) || null;
    }

    put(config, checkpoint) {
        this.storage.set(config.configurable.thread_id, checkpoint);
        return Promise.resolve();
    }
}

class CSAAgent {
    constructor() {
        // Single agent with multiple internal workflows
        this.memory = new MemorySaver(); // Using InMemorySaver as a placeholder
        this.tools = this._setupIntegrationTools();
        
        // Initialize any LLMs or clients needed by the workflows here
        this.languageClient = new LanguageServiceClient(); // Initialize Google NLP Client
        // e.g., this.llm = new ChatOpenAI(...); // We'll use Google models like Gemini instead
        // Example: this.geminiModel = new VertexAI({ model: "gemini-pro", ... }); // Or ChatGoogleGenerativeAI
        // e.g., this.knowledgeBase = new YourKnowledgeBaseClient(...);

        // Initialize Google Generative AI model (Gemini)
        // Ensure your environment is authenticated (e.g., GOOGLE_APPLICATION_CREDENTIALS)
        this.chatModel = new ChatGoogleGenerativeAI({
            modelName: "gemini-pro", // Or your preferred Gemini model
            temperature: 0.7,
            // convertSystemMessageToHuman: true, // Might be needed depending on model version and desired behavior with system messages
        });
        
        // Define a simple prompt template for the dialog workflow
        this.dialogPrompt = new PromptTemplate({
            template: `You are Vision AI's helpful and friendly customer support agent.
            Current conversation history:
            {history}

            Knowledge base information (if relevant):
            {context}

            User's query: {user_input}
            Intent: {intent}
            Sentiment: {sentiment}

            Based on all the above, provide a concise and helpful answer to the user's query. If the knowledge base context is not relevant or doesn't answer the question, say you couldn't find specific information but will try to help. If the user asks to escalate or expresses strong negative sentiment, guide them towards escalation if appropriate.
            Answer:
            `,
            inputVariables: ["history", "context", "user_input", "intent", "sentiment"],
        });

        this.mainWorkflow = this._createCsaWorkflow(); // Moved to end of constructor after client initializations
    }

    _setupIntegrationTools() {
        // HubSpot Ticket Creation Tool via n8n webhook
        const hubspotTicketTool = new Tool({
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

        return {
            hubspot_ticket: hubspotTicketTool,
            // Add more tools here as needed
            // zapier_order_status: orderStatusTool,
            // crm_update: crmUpdateTool
        };
    }

    _createCsaWorkflow() {
        console.log("[CSAAgent] Creating CSA workflow...");
        const workflow = new StateGraph({
            channels: {
                // Define the shape of your state object here
                // Based on your Python example, it might look like:
                user_input: { value: null },
                intent: { value: null },
                entities: { value: null },
                sentiment: { value: null },
                language: { value: null },
                nlu_confidence: { value: null },
                retrieved_docs: { value: null },
                context: { value: null },
                knowledge_confidence: { value: null },
                action_taken: { value: null },
                action_result: { value: null },
                conversation_history: { value: (x, y) => x.concat(y), default: () => [] }, // Example for accumulating history
                // Add other state fields as needed
            }
        });

        // Internal workflow nodes (not separate agents)
        workflow.addNode("understand", this._nluWorkflow.bind(this));
        workflow.addNode("retrieve", this._knowledgeWorkflow.bind(this));
        workflow.addNode("converse", this._dialogWorkflow.bind(this));
        workflow.addNode("act", this._actionWorkflow.bind(this));
        workflow.addNode("escalate", this._escalationWorkflow.bind(this));

        // Workflow routing logic
        workflow.setEntryPoint("understand");

        workflow.addConditionalEdges(
            "understand",
            this._routeAfterNlu.bind(this),
            {
                "need_info": "retrieve",
                "need_action": "act",
                "need_human": "escalate",
                "continue_chat": "converse"
            }
        );

        workflow.addConditionalEdges(
            "retrieve",
            this._routeAfterKnowledge.bind(this),
            {
                "respond": "converse",
                "need_more": "understand", // Loop back for more NLU or clarification
                "escalate": "escalate"
            }
        );

        workflow.addEdge("converse", END); // Assuming converse is a final step for now
        workflow.addEdge("act", "converse");    // After action, go to converse to inform user
        workflow.addEdge("escalate", END);  // Escalation is a final step

        console.log("[CSAAgent] Compiling main workflow...");
        return workflow.compile({ checkpointer: this.memory });
    }

    async _nluWorkflow(state) {
        console.log("[CSAAgent NLU] Processing:", state.user_input);
        const query = state.user_input;
        let intent = 'unknown_intent';
        let entities = [];
        let sentiment_analysis = { score: 0, magnitude: 0, label: "neutral" }; // Store detailed sentiment
        let language = "en"; // Placeholder for now
        let nlu_confidence = 0.7; // Default confidence

        try {
            const document = {
                content: query,
                type: 'PLAIN_TEXT',
            };

            // Entity Extraction
            const [entityResult] = await this.languageClient.analyzeEntities({ document });
            entities = entityResult.entities || [];

            // Sentiment Analysis
            const [sentimentResult] = await this.languageClient.analyzeSentiment({ document });
            const docSentiment = sentimentResult.documentSentiment || { score: 0, magnitude: 0 };
            sentiment_analysis = {
                score: docSentiment.score,
                magnitude: docSentiment.magnitude,
                label: docSentiment.score > 0.25 ? "positive" : docSentiment.score < -0.25 ? "negative" : "neutral"
            };

            // --- Basic Rule-based Intent Detection (from langchain_integration.js) ---
            const lowerText = query.toLowerCase();
            if (lowerText.includes('order status') || lowerText.includes('where is my order') || lowerText.includes('track my order')) {
                intent = 'check_order_status';
            } else if (lowerText.includes('human') || lowerText.includes('agent') || lowerText.includes('escalate')) {
                intent = 'escalate_to_human';
            } else if (lowerText.endsWith('?') || lowerText.startsWith('what') || lowerText.startsWith('how') || lowerText.startsWith('why')) {
                intent = 'ask_question';
            }
            // --- End Rule-based Intent Detection ---
            
            // TODO: Implement more advanced NLU steps from OAP plan if needed:
            // language = await this._detectLanguage(query); // e.g., using a language detection library or service
            // nlu_confidence = await this._calculateConfidence(intent, entities, sentiment_analysis.label);

        } catch (error) {
            console.error("[CSAAgent NLU] Error during NLU processing:", error);
            // Keep default values for intent, entities, etc. on error, or handle more gracefully
            intent = 'nlu_error';
            nlu_confidence = 0.1;
        }

        // Add user message to history if this is the start of a turn or last message was AI
        const historyUpdate = (state.conversation_history && (state.conversation_history.length === 0 || state.conversation_history[state.conversation_history.length -1] instanceof AIMessage)) 
                                ? [new HumanMessage(query)] 
                                : [];

        return {
            ...state,
            intent,
            entities,
            sentiment: sentiment_analysis, // Changed to store the sentiment_analysis object
            language,
            nlu_confidence,
            conversation_history: state.conversation_history ? state.conversation_history.concat(historyUpdate) : historyUpdate, // Ensure history is an array
        };
    }

    async _knowledgeWorkflow(state) {
        console.log("[CSAAgent KB] Processing query for KB:", state.user_input);
        let retrieved_article = null;
        let context = "No relevant information found in the knowledge base.";
        let knowledge_confidence = 0.0;

        try {
            // 1. Retrieve document (Basic RAG step)
            const queryForKB = state.intent === 'ask_question' || state.intent === 'unknown_intent' ? state.user_input : state.intent; // Use intent or full query
            retrieved_article = await getKnowledgeBaseArticle(queryForKB);

            if (retrieved_article && retrieved_article.source !== 'database_error') {
                // For now, context is the direct content. Re-ranking and advanced context generation are future RAG steps.
                context = retrieved_article.content || "Found an article, but it has no content.";
                // Simple confidence: base on relevance score if available, or presence of article
                knowledge_confidence = retrieved_article.relevance ? Math.min(retrieved_article.relevance / 10, 1.0) : 0.7; // Normalize relevance, capped at 1.0
                console.log(`[CSAAgent KB] Found article: ${retrieved_article.title}, Relevance: ${retrieved_article.relevance}, Confidence: ${knowledge_confidence}`);
            } else if (retrieved_article && retrieved_article.source === 'database_error') {
                console.error("[CSAAgent KB] Error fetching article from database.");
                context = "There was an issue accessing the knowledge base.";
                knowledge_confidence = 0.1; // Low confidence due to DB error
            } else {
                console.log("[CSAAgent KB] No article found for query.");
                // context remains "No relevant information..."
                knowledge_confidence = 0.2; // Low confidence as nothing was found
            }

            // TODO: Implement RAG - Re-rank (if multiple docs were retrieved)
            // const reranked_docs = await this._rerankByRelevance(docs, state.intent);

            // TODO: Implement RAG - Generate/Refine Context (e.g., using Gemini to summarize or extract from retrieved_article.content)
            // context = await this._buildContextFromDocs(reranked_docs, state.user_input); 
            // knowledge_confidence = await this._assessKnowledgeQuality(context, state.user_input);

        } catch (error) {
            console.error("[CSAAgent KB] Error during knowledge processing:", error);
            context = "An error occurred while trying to access knowledge.";
            knowledge_confidence = 0.0;
        }

        return {
            ...state,
            retrieved_docs: retrieved_article ? [retrieved_article] : [], // Store as an array
            context,
            knowledge_confidence,
        };
    }

    async _dialogWorkflow(state) {
        console.log("[CSAAgent Dialog] Generating response. Context:", state.context, "Intent:", state.intent);
        let responseContent = "I encountered an issue generating a response."; // Default error response

        try {
            const historyMessages = state.conversation_history || [];
            // Format history for the prompt
            const formattedHistory = historyMessages.map(msg => {
                if (msg instanceof HumanMessage) return `Human: ${msg.content}`;
                if (msg instanceof AIMessage) return `AI: ${msg.content}`;
                if (msg instanceof SystemMessage) return `System: ${msg.content}`;
                return msg.content; // Fallback
            }).join("\n");

            // Construct the chain for this dialog turn
            const dialogChain = RunnableSequence.from([
                this.dialogPrompt,
                this.chatModel,
                new StringOutputParser(),
            ]);

            responseContent = await dialogChain.invoke({
                history: formattedHistory,
                context: state.context || "No specific context available.",
                user_input: state.user_input,
                intent: state.intent,
                sentiment: state.sentiment.label || "neutral",
            });

        } catch (error) {
            console.error("[CSAAgent Dialog] Error during dialog generation:", error);
            responseContent = "Sorry, I'm having a little trouble responding right now. Could you try rephrasing?";
        }
        
        const aiResponse = new AIMessage(responseContent);
        return {
            ...state,
            conversation_history: state.conversation_history ? state.conversation_history.concat([aiResponse]) : [aiResponse],
            final_response: responseContent,
        };
    }

    async _actionWorkflow(state) {
        console.log("[CSAAgent Action] Determining action for intent:", state.intent);
        let required_action = null;
        let action_result = "No action performed.";

        // Determine what action to take based on intent and entities
        if (state.intent === 'escalate_to_human') {
            required_action = "create_hubspot_ticket";
        } else if (state.intent === 'check_order_status' && state.entities && state.entities.length > 0) {
            // Future: implement order status check
            required_action = "check_order_status";
            action_result = "Order status check not yet implemented.";
        }
        // Add more action mappings as needed

        // Execute the action
        if (required_action === "create_hubspot_ticket") {
            try {
                // Prepare conversation summary for the ticket
                const conversationSummary = this._generateConversationSummary(state);
                
                const ticketArgs = {
                    title: `Escalation: ${state.user_input.substring(0, 50)}...`,
                    description: state.user_input,
                    customer_email: state.customer_email || "unknown@customer.com", // You might want to extract this from entities or state
                    priority: state.sentiment && state.sentiment.label === 'negative' ? 'high' : 'medium',
                    conversation_summary: conversationSummary
                };

                action_result = await this.tools.hubspot_ticket.invoke(ticketArgs);
                console.log("[CSAAgent Action] HubSpot ticket result:", action_result);

            } catch (error) {
                console.error("[CSAAgent Action] Error creating HubSpot ticket:", error);
                action_result = {
                    success: false,
                    message: "Failed to create support ticket due to technical error",
                    error: error.message
                };
            }
        }

        return {
            ...state,
            action_taken: required_action,
            action_result,
        };
    }

    // Helper method to generate conversation summary for tickets
    _generateConversationSummary(state) {
        const history = state.conversation_history || [];
        if (history.length === 0) {
            return `User query: ${state.user_input}\nIntent: ${state.intent}\nSentiment: ${state.sentiment?.label || 'neutral'}`;
        }

        const formattedHistory = history.slice(-4).map(msg => { // Last 4 messages
            if (msg instanceof HumanMessage) return `User: ${msg.content}`;
            if (msg instanceof AIMessage) return `Agent: ${msg.content}`;
            return msg.content;
        }).join('\n');

        return `Recent conversation:\n${formattedHistory}\n\nCurrent query: ${state.user_input}\nIntent: ${state.intent}\nSentiment: ${state.sentiment?.label || 'neutral'}`;
    }

    async _escalationWorkflow(state) {
        console.log("[CSAAgent Escalation] Escalating conversation.");
        
        // First, create the ticket via action workflow
        const actionState = await this._actionWorkflow(state);
        
        // Prepare escalation response based on ticket creation result
        let escalationMessage = "I am escalating this to a human agent.";
        
        if (actionState.action_result && actionState.action_result.success) {
            escalationMessage = `I've created a support ticket for you and escalated this to our human support team. Your ticket reference is: ${actionState.action_result.ticket_id || 'pending'}. A human agent will follow up with you soon.`;
        } else {
            escalationMessage = "I'm escalating this to a human agent. There may be a brief delay in ticket creation, but someone will follow up with you soon.";
        }
        
        const aiResponse = new AIMessage(escalationMessage);
        return {
            ...actionState, // Include the action results
            conversation_history: state.conversation_history ? state.conversation_history.concat([aiResponse]) : [aiResponse],
            final_response: escalationMessage,
        };
    }

    // Update routing to ensure escalate_to_human goes to the action workflow first
    async _routeAfterNlu(state) {
        console.log("[CSAAgent Router] NLU routing. Intent:", state.intent, "Confidence:", state.nlu_confidence, "Sentiment:", state.sentiment.label);
        
        if (state.intent === 'nlu_error') {
            return "escalate";
        }
        if (state.intent === 'escalate_to_human') {
            return "escalate"; // This will now handle ticket creation
        }
        if (state.intent === 'ask_question' || state.nlu_confidence < 0.6) {
            return "need_info";
        } else if (state.intent === 'check_order_status') {
            return "need_action";
        } else {
            return "continue_chat";
        }
    }

    // --- Routing Logic --- 
    async _routeAfterKnowledge(state) {
        console.log("[CSAAgent Router] Knowledge routing. Confidence:", state.knowledge_confidence);
        // TODO: Implement routing logic based on knowledge retrieval output
        if (state.knowledge_confidence > 0.8) {
            return "respond";
        } else if (state.knowledge_confidence > 0.5) {
            // Maybe ask for clarification or try NLU again with more context
            return "need_more"; 
        } else {
            return "escalate"; // Or a different path if KB fails badly
        }
    }
    
    // --- Helper methods for workflows (to be implemented) ---
    // async _classifyIntent(query) { /* ... */ }
    // async _extractEntities(query) { /* ... */ }
    // async _analyzeSentiment(query) { /* ... */ }
    // async _detectLanguage(query) { /* ... */ }
    // async _calculateConfidence(intent, entities) { /* ... */ }
    // async _retrieveDocuments(query) { /* ... */ }
    // async _rerankByRelevance(docs, intent) { /* ... */ }
    // async _buildContext(rerankedDocs) { /* ... */ }
    // async _assessKnowledgeQuality(context) { /* ... */ }
    // async _determineAction(intent, entities) { /* ... */ }

    // Main entry point for processing a message
    async processMessage(userInput, threadId) {
        const initialState = {
            user_input: userInput,
            intent: null,
            entities: [],
            sentiment: { score: 0, magnitude: 0, label: "neutral" }, // Updated initial state for sentiment
            language: "en",
            nlu_confidence: 0,
            retrieved_docs: [],
            context: null,
            knowledge_confidence: 0,
            action_taken: null,
            action_result: null,
            conversation_history: [] // Start with empty history for this invocation
        };
        const config = { configurable: { thread_id: threadId || "default_thread-" + Date.now() } }; // Manage conversation threads

        let finalState = initialState;
        for await (const item of await this.mainWorkflow.stream(initialState, config)) {
            // console.log("Workflow step output:", item);
            // The final state will be the last key in the stream result (name of the END node or last active node)
            const nodeName = Object.keys(item)[0];
            console.log(`[CSAAgent Stream] Node: ${nodeName}, State:`, item[nodeName]);
            if(item[END]){
                finalState = item[END];
                break;
            }
             // Heuristic: if it's not an END node, the last processed node's state is what we capture
            // This might need refinement depending on how you define your graph's END states.
            finalState = item[nodeName];
        }
        
        console.log("[CSAAgent] Final processing state:", finalState);
        // Return the final response or relevant parts of the state
        return finalState?.final_response || "No response generated.";
    }
}

module.exports = { CSAAgent };

// Example Usage (for testing, likely to be called from your API layer)
// async function testAgent() {
//     const agent = new CSAAgent();
//     const threadId = "test-conversation-" + Date.now();

//     let response = await agent.processMessage("Hello, I need help with my order.", threadId);
//     console.log("User: Hello, I need help with my order.");
//     console.log("Agent:", response);

//     response = await agent.processMessage("My order ID is 12345.", threadId);
//     console.log("User: My order ID is 12345.");
//     console.log("Agent:", response);
// }

// testAgent(); 