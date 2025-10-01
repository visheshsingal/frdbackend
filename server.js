import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import connectDB from './config/mongodb.js';
import connectCloudinary from './config/cloudinary.js';
import userRouter from './routes/userRoute.js'; // Assuming userRoute.js is your userRouter.js
import productRouter from './routes/productRoute.js';
import cartRouter from './routes/cartRoute.js';
import orderRouter from './routes/orderRoute.js';
import bookingRouter from './routes/bookingRoute.js';
import UserModel from './models/userModel.js';

// App Config
const app = express();
const port = process.env.PORT || 4000;

// Initialize database and admin user
const initializeApp = async () => {
  try {
    await connectDB();
    await connectCloudinary();
    
    // Ensure admin user exists (don't crash app if this fails)
    try {
      await UserModel.ensureAdminExists();
    } catch (adminError) {
      console.error('Admin seeding failed, but continuing app startup:', adminError.message);
    }
    
    console.log('Application initialized successfully');
  } catch (error) {
    console.error('Error initializing application:', error);
    process.exit(1);
  }
};

initializeApp();

// Middlewares
app.use(express.json());

// CORS Configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:5173', // Vite dev server default port
      'http://localhost:5174', // Alternative Vite port
      'http://localhost:3000', // React dev server
      'https://frdadmin.vercel.app', // Production Vercel URL
    ];
    
    // Check if origin is in allowed list or is a Vercel preview URL
    if (allowedOrigins.includes(origin) || origin.includes('vercel.app')) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'token'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// API Endpoints
app.use('/api/user', userRouter);
app.use('/api/product', productRouter);
app.use('/api/cart', cartRouter);
app.use('/api/order', orderRouter);
app.use('/api/bookings', bookingRouter);

// Test Route
app.get('/', (req, res) => {
  res.send('API Working');
});

// CORS Test Route
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'CORS is working!',
    origin: req.headers.origin,
    timestamp: new Date().toISOString()
  });
});

// Start Server
app.listen(port, () => console.log(`Server started on PORT: ${port}`));