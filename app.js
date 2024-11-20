const express = require('express');
const cors = require('cors');
const userRoutes = require('./routes/user_routes');
const connectDB = require('./config/db');

const app = express();

// Connect to database
connectDB();

// CORS configuration
app.use(cors({
    origin: 'http://localhost:4200', // Your Angular app's URL
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middleware
app.use(express.json());

// Routes
app.use('/users', userRoutes);

// Server setup
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});