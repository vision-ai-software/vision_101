async _actionWorkflow(state) {
    console.log(`[CSAAgent Action] Routing intent: "${state.intent}" with entities:`, state.entities);
    let action_result = "No action performed.";
    // The intent directly maps to the action now, unless there's no action to take.
    let required_action = state.intent;
    const { entities } = state;

    try {
        switch (state.intent) {
            case 'check_order_status':
                if (entities.orderId) {
                    action_result = await this.integrationService.callIntegrationService('get_order_status', { orderId: entities.orderId });
                } else {
                    action_result = { success: false, message: "I can help with that! What's your order number?" };
                }
                break;

            case 'track_shipment':
                if (entities.trackingId) {
                    action_result = await this.integrationService.callIntegrationService('track_shipment', { trackingId: entities.trackingId });
                } else {
                    action_result = { success: false, message: "Of course, what's the tracking number?" };
                }
                break;
            
            case 'update_shipping_address':
                if (entities.orderId && entities.newAddress) {
                    action_result = await this.integrationService.callIntegrationService('update_shipping_address', { orderId: entities.orderId, newAddress: entities.newAddress });
                } else {
                    action_result = { success: false, message: "I can help update that. What is the order number and the new full shipping address?" };
                }
                break;

            case 'process_refund':
                if (entities.orderId && entities.amount) {
                    action_result = await this.integrationService.callIntegrationService('process_refund', { orderId: entities.orderId, amount: entities.amount, reason: entities.reason });
                } else {
                    action_result = { success: false, message: "I can process a refund. What is the order number and the refund amount?" };
                }
                break;

            case 'reset_password':
                if (entities.customerEmail) {
                    action_result = await this.integrationService.callIntegrationService('reset_password', { customerEmail: entities.customerEmail });
                } else {
                    action_result = { success: false, message: "I can help with that. What is the email address for the account?" };
                }
                break;

            case 'escalate_to_human':
                const conversationSummary = this._generateConversationSummary(state);
                const ticketArgs = {
                    title: `Escalation: ${state.user_input.substring(0, 50)}...`,
                    description: state.user_input,
                    customer_email: entities.customerEmail || "unknown@customer.com",
                    priority: state.sentiment?.label === 'negative' ? 'high' : 'medium',
                    conversation_summary: conversationSummary
                };
                action_result = await this.tools.hubspot_ticket.invoke(ticketArgs);
                console.log("[CSAAgent Action] HubSpot ticket result:", action_result);
                break;

            default:
                // For intents like 'ask_question' or 'unknown_intent', no specific action is taken here.
                required_action = null; 
                action_result = "No specific action required for this intent.";
                console.log(`[CSAAgent Action] No specific action required for intent: "${state.intent}"`);
                break;
        }
    } catch (error) {
        console.error(`[CSAAgent Action] Error during action execution for intent "${state.intent}":`, error);
        action_result = {
            success: false,
            message: `I encountered a technical issue while trying to perform the action. Please try again later.`,
            error: error.message
        };
    }

    return {
        ...state,
        action_taken: required_action,
        action_result,
    };
} 