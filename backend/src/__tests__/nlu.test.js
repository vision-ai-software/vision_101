const { adk } = require('../langchain_integration'); // Adjust path as needed

// Mock the Google Cloud Natural Language client to avoid actual API calls during tests
jest.mock('@google-cloud/language', () => ({
  LanguageServiceClient: jest.fn(() => ({
    analyzeEntities: jest.fn().mockResolvedValue([ { entities: [] } ]),
  })),
}));

describe('NLU Service Intent Detection', () => {

  // Test case 1: Check Order Status
  test('should correctly identify the "check_order_status" intent', async () => {
    const userInput = "I want to know where my order is.";
    const result = await adk.callNluService(userInput);
    expect(result.intent).toBe('check_order_status');
  });

  // Test case 2: Track Shipment
  test('should correctly identify the "track_shipment" intent', async () => {
    const userInput = "Can you track my package please?";
    const result = await adk.callNluService(userInput);
    expect(result.intent).toBe('track_shipment');
  });

  // Test case 3: Process Refund
  test('should correctly identify the "process_refund" intent', async () => {
    const userInput = "I need to get my money back for this purchase.";
    const result = await adk.callNluService(userInput);
    expect(result.intent).toBe('process_refund');
  });

  // Test case 4: Update Shipping Address
  test('should correctly identify the "update_shipping_address" intent', async () => {
    const userInput = "I need to change the delivery address for my order.";
    const result = await adk.callNluService(userInput);
    expect(result.intent).toBe('update_shipping_address');
  });

  // Test case 5: Reset Password
  test('should correctly identify the "reset_password" intent', async () => {
    const userInput = "I forgot my password and need to reset it.";
    const result = await adk.callNluService(userInput);
    expect(result.intent).toBe('reset_password');
  });

  // Test case 6: Escalate to Human
  test('should correctly identify the "escalate_to_human" intent', async () => {
    const userInput = "I need to speak with a human agent now.";
    const result = await adk.callNluService(userInput);
    expect(result.intent).toBe('escalate_to_human');
  });

  // Test case 7: Ask a generic question
  test('should correctly identify the "ask_question" intent', async () => {
    const userInput = "What are your business hours?";
    const result = await adk.callNluService(userInput);
    expect(result.intent).toBe('ask_question');
  });

  // Test case 8: Unknown Intent
  test('should return "unknown_intent" for ambiguous queries', async () => {
    const userInput = "This is a statement.";
    const result = await adk.callNluService(userInput);
    expect(result.intent).toBe('unknown_intent');
  });

}); 