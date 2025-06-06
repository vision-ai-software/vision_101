/**
 * Vision AI Customer Support Automation Agent
 * 
 * SECURITY NOTE: This file handles sensitive credentials.
 * - Service account private keys should NEVER be logged
 * - Always use environment variables or secure credential storage
 * - Regularly rotate service account keys
 * - Monitor for credential exposure in logs
 */

const { StateGraph, END } = require("@langchain/langgraph");
const { CheckpointTuple } = require("@langchain/langgraph-checkpoint");
// const { BaseCheckpointSaver } = require("@langchain/langgraph/checkpoint"); // This import path doesn't exist
const { Tool } = require("langchain/tools");
const { AIMessage, HumanMessage, SystemMessage } = require("@langchain/core/messages");
const { PromptTemplate } = require("@langchain/core/prompts");
const { StringOutputParser } = require("@langchain/core/output_parsers");
const { RunnableSequence } = require("@langchain/core/runnables");
const { LanguageServiceClient } = require('@google-cloud/language');
const { ChatVertexAI } = require("@langchain/google-vertexai");
const { getKnowledgeBaseArticle } = require('./database');
const fetch = require('node-fetch');
const { Firestore } = require('@google-cloud/firestore'); // Added Firestore import
const fs = require('fs');
const path = require('path');

// Simple in-memory checkpoint saver implementation - Fallback when Firestore fails
class MemorySaver {
    constructor() {
        this.storage = new Map();
        console.log("[MemorySaver] Initialized in-memory checkpoint storage");
    }

    async get(config) {
        const threadId = config?.configurable?.thread_id;
        if (!threadId) return null;
        
        const checkpoint = this.storage.get(threadId) || null;
        console.log(`[MemorySaver] Getting checkpoint for thread ${threadId}:`, checkpoint ? 'found' : 'not found');
        return checkpoint;
    }

    async getTuple(config) {
        const checkpoint = await this.get(config);
        if (!checkpoint) return undefined;
        
        return {
            checkpoint: checkpoint,
            config: config,
            parentConfig: null
        };
    }

    async put(config, checkpoint) {
        const threadId = config?.configurable?.thread_id;
        if (!threadId) return;
        
        this.storage.set(threadId, checkpoint);
        console.log(`[MemorySaver] Saved checkpoint for thread ${threadId}`);
        return Promise.resolve();
    }
}

// Firestore-based checkpoint saver with error handling
class FirestoreCheckpointSaver {
    constructor(config, authOptions) {
        if (!config || !config.collectionName) {
            throw new Error("FirestoreCheckpointSaver requires a 'collectionName' in config.");
        }
        
        this.fallbackSaver = new MemorySaver();
        this.firestoreHealthy = true;
        
        try {
        if (authOptions && authOptions.projectId && 
            authOptions.credentials && authOptions.credentials.client_email && authOptions.credentials.private_key) {
            console.log(`[FirestoreCheckpointSaver] Attempting to initialize Firestore with provided credentials for project: ${authOptions.projectId}`);
            this.firestore = new Firestore({
                projectId: authOptions.projectId,
                credentials: authOptions.credentials
            });
            console.log(`[FirestoreCheckpointSaver] Successfully initialized Firestore with provided credentials. Collection: ${config.collectionName}`);
        } else {
                console.warn(`[FirestoreCheckpointSaver] WARNING: Provided authOptions not complete or missing. Falling back to Application Default Credentials.`);
                this.firestore = new Firestore();
            }
            this.collection = this.firestore.collection(config.collectionName);
        } catch (error) {
            console.error(`[FirestoreCheckpointSaver] Failed to initialize Firestore:`, error);
            console.log(`[FirestoreCheckpointSaver] Using in-memory fallback storage`);
            this.firestoreHealthy = false;
        }
    }

    async get(config) {
        if (!this.firestoreHealthy) {
            return this.fallbackSaver.get(config);
        }

        try {
        if (!config || !config.configurable || !config.configurable.thread_id) {
            console.warn("[FirestoreCheckpointSaver] Attempted to get checkpoint without thread_id in config.");
            return null;
        }
        const threadId = config.configurable.thread_id;
        console.log(`[FirestoreCheckpointSaver] Getting checkpoint for thread_id: ${threadId}`);
            
        const docRef = this.collection.doc(threadId);
        const doc = await docRef.get();
            
        if (!doc.exists) {
            console.log(`[FirestoreCheckpointSaver] No checkpoint found for thread_id: ${threadId}`);
            return null;
        }
            
        console.log(`[FirestoreCheckpointSaver] Checkpoint retrieved for thread_id: ${threadId}`);
        return doc.data(); 
        } catch (error) {
            console.error(`[FirestoreCheckpointSaver] Error getting checkpoint, falling back to memory:`, error.message);
            this.firestoreHealthy = false;
            return this.fallbackSaver.get(config);
        }
    }

    async getTuple(config) {
        if (!this.firestoreHealthy) {
            return this.fallbackSaver.getTuple(config);
        }

        try {
        if (!config || !config.configurable || !config.configurable.thread_id) {
            console.warn("[FirestoreCheckpointSaver] Attempted to getTuple without thread_id in config.");
                return undefined;
        }
            
        const threadId = config.configurable.thread_id;
        console.log(`[FirestoreCheckpointSaver] Getting tuple for thread_id: ${threadId}`);

        const docRef = this.collection.doc(threadId);
        const doc = await docRef.get();

        if (!doc.exists) {
            console.log(`[FirestoreCheckpointSaver] No checkpoint tuple found for thread_id: ${threadId}`);
                return undefined;
        }
        
        const checkpoint = doc.data();
        console.log(`[FirestoreCheckpointSaver] Checkpoint tuple retrieved for thread_id: ${threadId}`);
        
        return {
            checkpoint: checkpoint,
                config: config,
                parentConfig: null
            };
        } catch (error) {
            console.error(`[FirestoreCheckpointSaver] Error getting tuple, falling back to memory:`, error.message);
            this.firestoreHealthy = false;
            return this.fallbackSaver.getTuple(config);
        }
    }

    async put(config, checkpoint) {
        if (!this.firestoreHealthy) {
            return this.fallbackSaver.put(config, checkpoint);
        }

        try {
        if (!config || !config.configurable || !config.configurable.thread_id) {
            console.error("[FirestoreCheckpointSaver] Attempted to put checkpoint without thread_id in config.");
                return this.fallbackSaver.put(config, checkpoint);
        }
            
        const threadId = config.configurable.thread_id;
        console.log(`[FirestoreCheckpointSaver] Putting checkpoint for thread_id: ${threadId}`);
            
        await this.collection.doc(threadId).set(checkpoint);
        console.log(`[FirestoreCheckpointSaver] Checkpoint saved for thread_id: ${threadId}`);
        return Promise.resolve();
        } catch (error) {
            console.error(`[FirestoreCheckpointSaver] Error saving checkpoint, falling back to memory:`, error.message);
            this.firestoreHealthy = false;
            return this.fallbackSaver.put(config, checkpoint);
        }
    }
}

class CSAAgent {
    constructor() {
        // Initialize any LLMs or clients needed by the workflows here
        
        // --- Load Service Account Credentials for Google Cloud Services ---
        let googleAuthOptions = {};
        const serviceAccountPath = path.join(__dirname, '..', '..', 'service-account', 'vision-101-460206-62ac37f1a9dc.json');
        try {
            if (fs.existsSync(serviceAccountPath)) {
                const credentialsJson = fs.readFileSync(serviceAccountPath, 'utf8');
                const credentials = JSON.parse(credentialsJson);
                googleAuthOptions = {
                    credentials: {
                        client_email: credentials.client_email,
                        private_key: credentials.private_key,
                    },
                    projectId: credentials.project_id,
                };
                console.log("[CSAAgent Constructor] Successfully loaded service account credentials from file.");
            } else {
                console.warn(`[CSAAgent Constructor] Service account key file not found at ${serviceAccountPath}. GOOGLE_APPLICATION_CREDENTIALS env var will be used if set.`);
            }
        } catch (error) {
            console.error("[CSAAgent Constructor] Error loading service account credentials:", error);
            console.warn("[CSAAgent Constructor] Proceeding without directly loaded credentials. GOOGLE_APPLICATION_CREDENTIALS will be used if set.");
        }
        // --- End Load Service Account Credentials ---

        // Safe logging without exposing sensitive credentials
        console.log("[CSAAgent Constructor] googleAuthOptions before FirestoreCheckpointSaver:", {
            projectId: googleAuthOptions.projectId,
            hasCredentials: !!(googleAuthOptions.credentials && googleAuthOptions.credentials.client_email),
            client_email: googleAuthOptions.credentials?.client_email,
            private_key: googleAuthOptions.credentials?.private_key ? "[REDACTED - PRIVATE KEY PRESENT]" : "[NOT PROVIDED]"
        });

        // Initialize memory and tools (single initialization)
        this.memory = new FirestoreCheckpointSaver({ collectionName: 'csa_agent_checkpoints_v1' }, googleAuthOptions);
        this.tools = this._setupIntegrationTools();
        
        this.languageClient = new LanguageServiceClient(googleAuthOptions.projectId ? { projectId: googleAuthOptions.projectId, credentials: googleAuthOptions.credentials } : {}); 

        // Initialize Google Vertex AI model (Gemini)
        this.chatModel = new ChatVertexAI({
            modelName: "gemini-pro", 
            temperature: 0.7,
            locationId: "us-central1", 
            authOptions: googleAuthOptions, // Pass loaded credentials
        });
        
        // Define a prompt template for context generation from KB articles
        this.contextGenerationPrompt = new PromptTemplate({
            template: `Given the following knowledge base article content:
            ---------------------
            {article_content}
            ---------------------
            And the user's query: "{user_query}"

            Extract the most relevant information from the article that directly addresses the user's query.
            If the article does not contain relevant information for the query, state that clearly.
            Present the information concisely.
            Relevant Information:
            `,
            inputVariables: ["article_content", "user_query"],
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
                    const webhookUrl = "http://localhost:5678/webhook/bef6ec76-5744-4160-acb3-3f3a38350b64";
                    const username = process.env.N8N_WEBHOOK_USER;
                    const password = process.env.N8N_WEBHOOK_PASSWORD;

                    if (!username || !password) {
                        console.error("[HubSpot Tool] Missing N8N_WEBHOOK_USER or N8N_WEBHOOK_PASSWORD environment variables.");
                        return {
                            success: false,
                            message: "Authentication credentials for webhook are not configured in the environment.",
                            error: "Missing environment variables for webhook authentication."
                        };
                    }
                    
                    const basicAuth = Buffer.from(`${username}:${password}`).toString('base64');
                    
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
                            'User-Agent': 'Vision-AI-CSA-Agent/1.0',
                            'Authorization': `Basic ${basicAuth}`
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
        
        // Use proper channels format for LangGraph 0.2.73 with simple replacement operator
        const workflow = new StateGraph({
            channels: {
                user_input: null,
                intent: null,
                entities: null,
                sentiment: null,
                language: null,
                nlu_confidence: null,
                retrieved_docs: null,
                context: null,
                knowledge_confidence: null,
                action_taken: null,
                action_result: null,
                conversation_history: null,
                final_response: null
            }
        });

        // Internal workflow nodes (not separate agents) - Use proper function binding
        workflow.addNode("understand", (state) => this._nluWorkflow(state));
        workflow.addNode("retrieve", (state) => this._knowledgeWorkflow(state));
        workflow.addNode("converse", (state) => this._dialogWorkflow(state));
        workflow.addNode("act", (state) => this._actionWorkflow(state));
        workflow.addNode("escalate", (state) => this._escalationWorkflow(state));

        // Workflow routing logic
        workflow.setEntryPoint("understand");

        workflow.addConditionalEdges(
            "understand",
            (state) => this._routeAfterNlu(state),
            {
                "need_info": "retrieve",
                "need_action": "act",
                "need_human": "escalate",
                "continue_chat": "converse"
            }
        );

        workflow.addConditionalEdges(
            "retrieve",
            (state) => this._routeAfterKnowledge(state),
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
        
        // Compile without checkpointer to avoid binding issues
        try {
            const compiledWorkflow = workflow.compile();
            console.log("[CSAAgent] Workflow compiled successfully without checkpointer");
            return compiledWorkflow;
        } catch (error) {
            console.error("[CSAAgent] Error compiling workflow:", error);
            throw error;
        }
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
            const queryForKB = state.intent === 'ask_question' || state.intent === 'unknown_intent' ? state.user_input : state.intent;
            retrieved_article = await getKnowledgeBaseArticle(queryForKB);

            if (retrieved_article && retrieved_article.source !== 'database_error') {
                if (retrieved_article.content && retrieved_article.content.trim() !== "") {
                    console.log(`[CSAAgent KB] Found article: ${retrieved_article.title}, Relevance: ${retrieved_article.relevance}. Attempting to generate context with LLM.`);
                    
                    try {
                        const contextChain = RunnableSequence.from([
                            this.contextGenerationPrompt,
                            this.chatModel,
                            new StringOutputParser(),
                        ]);

                        const generatedContext = await contextChain.invoke({
                            article_content: retrieved_article.content,
                            user_query: state.user_input 
                        });
                        
                        if (generatedContext && !generatedContext.toLowerCase().includes("does not contain relevant information")) {
                            context = generatedContext;
                            knowledge_confidence = 0.85; // Higher confidence for LLM-processed context
                            console.log("[CSAAgent KB] Successfully generated context with LLM:", context);
                        } else {
                            context = "I found an article, but it doesn't seem to directly answer your question. " + (generatedContext || "");
                            knowledge_confidence = 0.4; // Lower confidence if LLM determines not relevant or empty
                            console.log("[CSAAgent KB] LLM indicated article content not relevant or returned empty.");
                        }

                    } catch (llmError) {
                        console.error("[CSAAgent KB] Error during LLM context generation:", llmError);
                        context = "I found an article, but had trouble processing its content for your query. Using raw content.";
                        // Fallback to using raw content if LLM fails, but with adjusted confidence
                        context = retrieved_article.content; 
                        knowledge_confidence = 0.5; // Confidence that we have raw content, but processing failed
                    }
                } else {
                    context = `Found an article titled "${retrieved_article.title}", but it has no content.`;
                    knowledge_confidence = 0.1; // Low confidence as article is empty
                    console.log(`[CSAAgent KB] Found article: ${retrieved_article.title}, but it has no content.`);
                }
            } else if (retrieved_article && retrieved_article.source === 'database_error') {
                console.error("[CSAAgent KB] Error fetching article from database.");
                context = "There was an issue accessing the knowledge base.";
                knowledge_confidence = 0.1;
            } else {
                console.log("[CSAAgent KB] No article found for query.");
                // context remains "No relevant information..."
                knowledge_confidence = 0.2;
            }

            // TODO: Implement RAG - Re-rank (if multiple docs were retrieved)
            // const reranked_docs = await this._rerankByRelevance(docs, state.intent);
            // Note: The current getKnowledgeBaseArticle seems to return one article. Re-ranking would apply if it returned multiple candidates.

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
                sentiment: state.sentiment?.label || "neutral",
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
        console.log("[CSAAgent Router] NLU routing. Intent:", state.intent, "Confidence:", state.nlu_confidence, "Sentiment:", state.sentiment?.label || 'neutral');
        
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
            conversation_history: [], // Start with empty history for this invocation
            final_response: null
        };
        const config = { configurable: { thread_id: threadId || "default_thread-" + Date.now() } }; // Manage conversation threads

        console.log("[CSAAgent] Starting workflow execution...");
        try {
            // Use invoke instead of stream for simpler debugging
            const finalState = await this.mainWorkflow.invoke(initialState, config);
            console.log("[CSAAgent] Workflow execution completed successfully");
            return finalState?.final_response || "No response generated.";
        } catch (error) {
            console.error("[CSAAgent] Workflow execution failed:", error);
            throw error;
        }

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