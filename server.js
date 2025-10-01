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
app.use(cors({
  origin: [
    'http://localhost:5174', // Local dev (Vite frontend)
    'https://frdadmin.vercel.app/' // Replace with your actual Vercel URL after deployment
  ],
  credentials: true // Allow cookies/auth headers if needed
}));

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

// Start Server
app.listen(port, () => console.log(`Server started on PORT: ${port}`));