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
const adk = require('./adk'); // Added adk import

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
        // --- Authentication Handled by Application Default Credentials (ADC) ---
        // The Google Cloud SDKs for Firestore, Vertex AI, and Natural Language
        // will automatically find their credentials from the environment.
        // - On Cloud Run/Agent Engine: They use the attached service account.
        // - On Local Machine: They use `gcloud auth application-default login`.
        // This removes the need to handle service account key files in the code.
        console.log("[CSAAgent] Initializing using Application Default Credentials.");

        // --- Initialize Google Cloud Services ---
        this.languageClient = new LanguageServiceClient();
        
        this.chatModel = new ChatVertexAI({
            modelName: "gemini-2.0-flash-001",
            temperature: 0.2, 
            maxOutputTokens: 1024,
        });
        
        // --- Initialize Firestore Checkpoint Saver ---
        this.checkpointSaver = new FirestoreCheckpointSaver({ collectionName: 'csa_agent_checkpoints' });

        // --- Initialize Services ---
        this.dbService = { getKnowledgeBaseArticle };
        this.integrationService = { callIntegrationService: adk.callIntegrationService };

        // --- Setup Tools ---
        this.tools = this._setupIntegrationTools();

        // --- Create and Compile Workflow ---
        this.workflow = this._createCsaWorkflow();
        try {
            this.app = this.workflow.compile({
                checkpointer: this.checkpointSaver,
            });
            console.log("[CSAAgent] LangGraph workflow compiled successfully.");
        } catch (error) {
            console.error("[CSAAgent] Error compiling LangGraph workflow:", error);
            throw new Error("Failed to compile the agent's workflow.");
        }

        // --- Initialize Dialog Prompt ---
        // This prompt needs to be initialized after the tools are set up
        this.dialogPrompt = this._createDialogPrompt();
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

            // --- Enhanced Rule-based Intent Detection ---
            const lowerText = query.toLowerCase();
            
            // Order Status Intent - Enhanced patterns
            const orderStatusPatterns = [
                /order\s*(status|tracking|update)/,
                /where\s*(is|are)\s*my\s*(order|package|shipment)/,
                /track\s*(my\s*)?(order|package|shipment)/,
                /(delivery|shipping)\s*status/,
                /when\s*will\s*(my\s*)?(order|package)\s*(arrive|be\s*delivered)/,
                /order\s*#?\s*\d+/,
                /(check|find)\s*(my\s*)?(order|delivery)/
            ];
            
            // Escalation Intent - Enhanced patterns  
            const escalationPatterns = [
                /speak\s*(to|with)\s*(human|agent|person|representative)/,
                /transfer\s*(me\s*)?to\s*(human|agent|person)/,
                /(human|agent|person|representative)\s*help/,
                /escalate/,
                /(talk|speak)\s*(to|with)\s*someone/,
                /not\s*helping|can't\s*help|unable\s*to\s*help/,
                /this\s*(isn't|is\s*not)\s*working/,
                /frustrated|angry|upset/,
                /complaint|complain/,
                /manager|supervisor/
            ];
            
            // Question Intent - Enhanced patterns
            const questionPatterns = [
                /^(what|how|why|when|where|who|which)/,
                /\?$/,
                /(can\s*you|could\s*you)\s*(help|tell|explain)/,
                /(do\s*you|does)\s*(have|know|support)/,
                /(is\s*it|are\s*there)\s*possible/,
                /help\s*(me\s*)?(with|understand)/,
                /(explain|tell\s*me\s*about)/
            ];
            
            // Support/Help Intent
            const supportPatterns = [
                /^(help|support|assist)/,
                /(need|want)\s*(help|support|assistance)/,
                /(having\s*)?(trouble|problem|issue|difficulty)/,
                /(can't|cannot|unable\s*to)/,
                /not\s*working|broken|error/
            ];
            
            // Greeting Intent
            const greetingPatterns = [
                /^(hi|hello|hey|good\s*(morning|afternoon|evening))/,
                /^(thanks|thank\s*you)/,
                /^(bye|goodbye|see\s*you)/
            ];
            
            // Product Information Intent
            const productInfoPatterns = [
                /(price|cost|pricing)/,
                /(feature|specification|specs)/,
                /(available|availability)/,
                /(compatible|compatibility)/,
                /(warranty|guarantee)/
            ];
            
            // Check patterns in order of specificity
            if (orderStatusPatterns.some(pattern => pattern.test(lowerText))) {
                intent = 'check_order_status';
            } else if (escalationPatterns.some(pattern => pattern.test(lowerText))) {
                intent = 'escalate_to_human';
            } else if (greetingPatterns.some(pattern => pattern.test(lowerText))) {
                intent = 'greeting';
            } else if (supportPatterns.some(pattern => pattern.test(lowerText))) {
                intent = 'request_support';
            } else if (productInfoPatterns.some(pattern => pattern.test(lowerText))) {
                intent = 'product_inquiry';
            } else if (questionPatterns.some(pattern => pattern.test(lowerText))) {
                intent = 'ask_question';
            }
            // --- End Enhanced Rule-based Intent Detection ---
            
            // Implement more advanced NLU steps
            language = await this._detectLanguage(query);
            nlu_confidence = await this._calculateConfidence(intent, entities, sentiment_analysis.label, query);

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
        let context = "No relevant information found in the knowledge base.";
        let knowledge_confidence = 0.0;
        let retrieved_articles = [];

        try {
            retrieved_articles = await this.dbService.getKnowledgeBaseArticle(state.user_input);

            if (retrieved_articles && retrieved_articles.length > 0) {
                if (retrieved_articles[0].source === 'database_error') {
                    context = "There was an issue accessing the knowledge base.";
                    knowledge_confidence = 0.1;
                } else {
                    console.log(`[CSAAgent KB] Retrieved ${retrieved_articles.length} articles. Re-ranking...`);
                    // ** NEW: Re-rank articles for relevance before synthesis **
                    const reranked_articles = await this._rerankArticles(state.user_input, retrieved_articles);

                    console.log(`[CSAAgent KB] Synthesizing from top ${reranked_articles.length} re-ranked articles...`);
                    context = await this._synthesizeKnowledge(state.user_input, reranked_articles);
                    
                    // Confidence is based on the relevance of the top *re-ranked* doc
                    knowledge_confidence = reranked_articles.length > 0 ? (reranked_articles[0].rerank_score || 0.8) : 0.5;
                }
            } else {
                console.log("[CSAAgent KB] No articles found for query.");
                // context remains "No relevant information..."
                knowledge_confidence = 0.2;
            }
        } catch (error) {
            console.error("[CSAAgent KB] Error during knowledge processing:", error);
            context = "An error occurred while trying to access knowledge.";
            knowledge_confidence = 0.0;
        }

        return {
            ...state,
            retrieved_docs: retrieved_articles || [], // Store all retrieved articles
            context,
            knowledge_confidence,
        };
    }

    async _rerankArticles(userInput, articles) {
        console.log("[CSAAgent RAG] Re-ranking articles for user input:", userInput);
        const rerankPrompt = new ChatPromptTemplate({
            inputVariables: ["user_input", "article_content"],
            template: `On a scale from 0.0 to 1.0, how relevant is the following article to the user's question?
Provide ONLY the numeric score and nothing else.

User Question: {user_input}
---
Article Content:
{article_content}
---
Relevance Score:`,
        });

        const rerankChain = RunnableSequence.from([
            rerankPrompt,
            this.chatModel,
            new StringOutputParser(),
        ]);

        const scoredArticles = [];
        for (const article of articles) {
            try {
                const scoreResponse = await rerankChain.invoke({
                    user_input: userInput,
                    article_content: article.content,
                });
                const score = parseFloat(scoreResponse.trim());
                if (!isNaN(score)) {
                    scoredArticles.push({ ...article, rerank_score: score });
                } else {
                    scoredArticles.push({ ...article, rerank_score: 0.2 }); // Assign a default low score on parsing failure
                }
            } catch (error) {
                console.error(`[CSAAgent RAG] Error re-ranking article "${article.title}":`, error);
                // Assign a low score if ranking fails
                scoredArticles.push({ ...article, rerank_score: 0.1 });
            }
        }

        // Sort by the new re-rank score in descending order
        scoredArticles.sort((a, b) => b.rerank_score - a.rerank_score);

        // Return the top 3 most relevant articles to avoid excessive context
        return scoredArticles.slice(0, 3);
    }

    async _synthesizeKnowledge(userInput, articles) {
        console.log("[CSAAgent KB] Synthesizing knowledge for user input:", userInput);
        
        const synthesisPrompt = new ChatPromptTemplate({
            inputVariables: ["user_input", "knowledge_articles"],
            template: `Based ONLY on the following context articles, provide a comprehensive answer to the user's question. If the articles do not contain the answer, state that you couldn't find the information. Do not use any outside knowledge.

Context Articles:
---
{knowledge_articles}
---

User Question: {user_input}

Comprehensive Answer:`,
        });

        const synthesisChain = RunnableSequence.from([
            synthesisPrompt,
            this.chatModel,
            new StringOutputParser(),
        ]);
        
        // Format articles into a single string for the prompt
        const formattedArticles = articles.map((art, i) => 
            `Article ${i+1} (Source: ${art.source}, Relevance: ${art.relevance.toFixed(2)}):\nTitle: ${art.title}\nContent: ${art.content}`
        ).join('\n\n');

        try {
            const synthesizedResponse = await synthesisChain.invoke({
                user_input: userInput,
                knowledge_articles: formattedArticles,
            });
            return synthesizedResponse;
        } catch (error) {
            console.error("[CSAAgent KB] Error during knowledge synthesis:", error);
            return "I found some information, but had trouble summarizing it. Please ask me again.";
        }
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

            // NEW: Add current intent and entities to the context for the LLM
            const recent_intent = state.intent || 'none';
            // Safely stringify entities, defaulting to an empty object
            const extracted_entities = state.entities ? JSON.stringify(state.entities) : '{}';

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
                intent: recent_intent,
                entities: extracted_entities, // Pass the new context here
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
        console.log(`[CSAAgent Action] Routing intent: "${state.intent}" with entities:`, state.entities);
        let required_action = state.intent;
        const { entities } = state;

        // Structured action result
        let action_result = {
            success: false,
            message: "No action performed.",
            data: null
        };

        try {
            switch (state.intent) {
                case 'check_order_status':
                    try {
                    if (entities.orderId) {
                            const data = await this.integrationService.callIntegrationService('get_order_status', { orderId: entities.orderId });
                            action_result = { success: true, message: "Order status retrieved.", data };
                    } else {
                        action_result = { success: false, message: "I can help with that! What's your order number?" };
                        }
                    } catch (toolError) {
                        console.error("[ActionTool Error] check_order_status failed:", toolError);
                        action_result = { success: false, message: "I couldn't check the order status right now. Please try again in a moment.", error: toolError.message };
                    }
                    break;

                case 'track_shipment':
                    try {
                    if (entities.trackingId) {
                            const data = await this.integrationService.callIntegrationService('track_shipment', { trackingId: entities.trackingId });
                            action_result = { success: true, message: "Shipment tracked.", data };
                    } else {
                        action_result = { success: false, message: "Of course, what's the tracking number?" };
                        }
                    } catch (toolError) {
                        console.error("[ActionTool Error] track_shipment failed:", toolError);
                        action_result = { success: false, message: "I was unable to track that shipment. Please double-check the tracking number.", error: toolError.message };
                    }
                    break;
                
                case 'update_shipping_address':
                    try {
                    if (entities.orderId && entities.newAddress) {
                            const data = await this.integrationService.callIntegrationService('update_shipping_address', { orderId: entities.orderId, newAddress: entities.newAddress });
                            action_result = { success: true, message: "Shipping address updated.", data };
                    } else {
                        action_result = { success: false, message: "I can help update that. What is the order number and the new full shipping address?" };
                        }
                    } catch (toolError) {
                        console.error("[ActionTool Error] update_shipping_address failed:", toolError);
                        action_result = { success: false, message: "I failed to update the shipping address. Please ensure the order number is correct.", error: toolError.message };
                    }
                    break;

                case 'process_refund':
                    try {
                    if (entities.orderId && entities.amount) {
                            const data = await this.integrationService.callIntegrationService('process_refund', { orderId: entities.orderId, amount: entities.amount, reason: entities.reason });
                            action_result = { success: true, message: "Refund processed.", data };
                    } else {
                        action_result = { success: false, message: "I can process a refund. What is the order number and the refund amount?" };
                        }
                    } catch (toolError) {
                        console.error("[ActionTool Error] process_refund failed:", toolError);
                        action_result = { success: false, message: "I encountered an issue processing the refund. Please try again later.", error: toolError.message };
                    }
                    break;

                case 'reset_password':
                    try {
                    if (entities.customerEmail) {
                            const data = await this.integrationService.callIntegrationService('reset_password', { customerEmail: entities.customerEmail });
                            action_result = { success: true, message: "Password reset initiated.", data };
                    } else {
                        action_result = { success: false, message: "I can help with that. What is the email address for the account?" };
                        }
                    } catch (toolError) {
                        console.error("[ActionTool Error] reset_password failed:", toolError);
                        action_result = { success: false, message: "I was unable to initiate a password reset for that email.", error: toolError.message };
                    }
                    break;

                case 'escalate_to_human':
                    try {
                    const conversationSummary = this._generateConversationSummary(state);
                    const ticketArgs = {
                        title: `Escalation: ${state.user_input.substring(0, 50)}...`,
                        description: state.user_input,
                        customer_email: entities.customerEmail || "unknown@customer.com",
                        priority: state.sentiment?.label === 'negative' ? 'high' : 'medium',
                        conversation_summary: conversationSummary
                    };
                        const data = await this.tools.hubspot_ticket.invoke(ticketArgs);
                        action_result = { success: true, message: "Escalation successful.", data };
                        console.log("[CSAAgent Action] HubSpot ticket result:", data);
                    } catch (toolError) {
                        console.error("[ActionTool Error] escalate_to_human failed:", toolError);
                        action_result = { success: false, message: "I tried to create a support ticket but failed. Please try again.", error: toolError.message };
                    }
                    break;

                default:
                    required_action = null; 
                    action_result = { success: true, message: "No specific action required for this intent." };
                    console.log(`[CSAAgent Action] No specific action required for intent: "${state.intent}"`);
                    break;
            }
        } catch (error) {
            console.error(`[CSAAgent Action] Unhandled error during action execution for intent "${state.intent}":`, error);
            action_result = {
                success: false,
                message: `I encountered a critical technical issue. Please try again later.`,
                error: error.message
            };
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

        const formattedHistory = history.slice(-4).map(msg => {
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

    // Enhanced routing to handle all new intent types
    async _routeAfterNlu(state) {
        console.log("[CSAAgent Router] NLU routing. Intent:", state.intent, "Confidence:", state.nlu_confidence, "Sentiment:", state.sentiment?.label || 'neutral');
        
        // Error handling - escalate immediately
        if (state.intent === 'nlu_error') {
            console.log("[CSAAgent Router] NLU error detected, escalating");
            return "escalate";
        }
        
        // Direct escalation requests
        if (state.intent === 'escalate_to_human') {
            console.log("[CSAAgent Router] Direct escalation request, routing to escalation workflow");
            return "escalate";
        }
        
        // Action-required intents
        if (state.intent === 'check_order_status') {
            console.log("[CSAAgent Router] Order status request, routing to action workflow");
            return "need_action";
        }
        
        // Simple greeting - can respond directly with knowledge base
        if (state.intent === 'greeting') {
            console.log("[CSAAgent Router] Greeting detected, proceeding to knowledge base");
            return "need_info";
        }
        
        // Support and product inquiries - need knowledge base lookup
        if (state.intent === 'request_support' || state.intent === 'product_inquiry' || state.intent === 'ask_question') {
            console.log("[CSAAgent Router] Information request, proceeding to knowledge base");
            return "need_info";
        }
        
        // Low confidence fallback
        if (state.nlu_confidence < 0.4) {
            console.log("[CSAAgent Router] Low NLU confidence, escalating");
            return "escalate";
        } else if (state.nlu_confidence < 0.6) {
            console.log("[CSAAgent Router] Medium-low NLU confidence, trying knowledge base");
            return "need_info";
        } else {
            console.log("[CSAAgent Router] Good confidence, continuing to knowledge base");
            return "need_info";  // Changed from "continue_chat" to "need_info" for knowledge lookup
        }
    }

    // --- Routing Logic --- 
    async _routeAfterKnowledge(state) {
        console.log("[CSAAgent Router] Knowledge routing. Confidence:", state.knowledge_confidence, "Intent:", state.intent, "Sentiment:", state.sentiment?.label);
        
        // High confidence - we have good knowledge to answer
        if (state.knowledge_confidence > 0.8) {
            console.log("[CSAAgent Router] High confidence knowledge found, proceeding to respond");
            return "respond";
        } 
        
        // Medium confidence - depends on intent and sentiment
        else if (state.knowledge_confidence > 0.5) {
            // If user seems frustrated or explicitly asks for human help, escalate
            if (state.sentiment?.label === 'negative' && state.sentiment?.score < -0.3) {
                console.log("[CSAAgent Router] Medium confidence but negative sentiment, escalating");
                return "escalate";
            }
            // If it's a simple question, try to respond with what we have
            else if (state.intent === 'ask_question') {
                console.log("[CSAAgent Router] Medium confidence for simple question, proceeding to respond");
                return "respond";
            }
            // For complex intents with medium confidence, ask for clarification
            else {
                console.log("[CSAAgent Router] Medium confidence, asking for more information");
                return "need_more";
            }
        } 
        
        // Low confidence - check if we should escalate or try action workflow
        else {
            // If user is asking for specific actions (order status, etc.), try action workflow
            if (state.intent === 'check_order_status' || state.intent === 'escalate_to_human') {
                console.log("[CSAAgent Router] Low knowledge confidence but action intent detected, routing to action");
                return "need_action";
            }
            // If user seems frustrated or this is a complex query, escalate
            else if (state.sentiment?.label === 'negative' || state.nlu_confidence < 0.4) {
                console.log("[CSAAgent Router] Low confidence with negative sentiment or low NLU confidence, escalating");
                return "escalate";
            }
            // Otherwise, try to respond with a helpful message about not finding information
            else {
                console.log("[CSAAgent Router] Low confidence, but attempting helpful response");
                return "respond";
            }
        }
    }
    
    // --- Helper methods for workflows ---
    
    async _detectLanguage(query) {
        try {
            // Use Google Cloud Natural Language API for language detection
            const document = {
                content: query,
                type: 'PLAIN_TEXT',
            };
            
            const [result] = await this.languageClient.analyzeEntitySentiment({ document });
            
            // The language is typically returned in the response metadata
            // For now, we'll use a simple approach and default to English
            // In production, you might want to use the detect language endpoint specifically
            if (query.length < 10) {
                return 'en'; // Default for short queries
            }
            
            // Simple language detection based on character patterns
            const hasAsianCharacters = /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf\u3400-\u4dbf]/.test(query);
            const hasArabicCharacters = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/.test(query);
            const hasRussianCharacters = /[\u0400-\u04ff]/.test(query);
            
            if (hasAsianCharacters) return 'ja'; // or 'zh', 'ko' depending on more specific detection
            if (hasArabicCharacters) return 'ar';
            if (hasRussianCharacters) return 'ru';
            
            return 'en'; // Default to English
        } catch (error) {
            console.error("[CSAAgent NLU] Error during language detection:", error);
            return 'en'; // Default to English on error
        }
    }
    
    async _calculateConfidence(intent, entities, sentimentLabel, query) {
        try {
            let baseConfidence = 0.5; // Start with medium confidence
            
            // Adjust confidence based on intent detection
            if (intent === 'unknown_intent' || intent === 'nlu_error') {
                baseConfidence = 0.2;
            } else if (intent === 'escalate_to_human') {
                // High confidence for explicit escalation requests
                if (query.toLowerCase().includes('human') || query.toLowerCase().includes('agent')) {
                    baseConfidence = 0.9;
                } else {
                    baseConfidence = 0.7;
                }
            } else if (intent === 'check_order_status') {
                // High confidence if order-related keywords are present
                const orderKeywords = ['order', 'status', 'track', 'delivery', 'shipment'];
                const hasOrderKeywords = orderKeywords.some(keyword => 
                    query.toLowerCase().includes(keyword)
                );
                baseConfidence = hasOrderKeywords ? 0.85 : 0.6;
            } else if (intent === 'ask_question') {
                // Medium to high confidence for questions
                const questionWords = ['what', 'how', 'why', 'when', 'where', 'who'];
                const hasQuestionWords = questionWords.some(word => 
                    query.toLowerCase().includes(word)
                );
                const endsWithQuestionMark = query.trim().endsWith('?');
                
                if (hasQuestionWords || endsWithQuestionMark) {
                    baseConfidence = 0.8;
                } else {
                    baseConfidence = 0.6;
                }
            }
            
            // Adjust confidence based on entities
            if (entities && entities.length > 0) {
                // More entities generally mean better understanding
                const entityBonus = Math.min(entities.length * 0.1, 0.2);
                baseConfidence += entityBonus;
            } else if (intent !== 'escalate_to_human') {
                // Lack of entities for non-escalation intents reduces confidence
                baseConfidence -= 0.1;
            }
            
            // Adjust confidence based on sentiment certainty
            if (sentimentLabel === 'negative' || sentimentLabel === 'positive') {
                baseConfidence += 0.05; // Clear sentiment adds small confidence boost
            }
            
            // Adjust confidence based on query length and complexity
            const wordCount = query.split(/\s+/).length;
            if (wordCount < 3) {
                baseConfidence -= 0.1; // Very short queries are harder to understand
            } else if (wordCount > 20) {
                baseConfidence -= 0.05; // Very long queries might be complex
            }
            
            // Ensure confidence stays within valid range
            return Math.max(0.1, Math.min(0.95, baseConfidence));
            
        } catch (error) {
            console.error("[CSAAgent NLU] Error calculating confidence:", error);
            return 0.5; // Default medium confidence on error
        }
    }

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
            const finalState = await this.workflow.invoke(initialState, config);
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