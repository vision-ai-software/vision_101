const express = require('express');

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json()); // Middleware to parse JSON bodies

// Basic route for testing
app.get('/', (req, res) => {
  res.status(200).send('Vision AI CSA Agent Backend is running!');
});

// Placeholder for API routes related to agent interactions
// app.post('/api/v1/interact', (req, res) => {
//   // Logic for handling agent interactions will go here
//   res.status(200).json({ message: 'Interaction received (placeholder)' });
// });

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

module.exports = app; // For potential testing or programmatic use 