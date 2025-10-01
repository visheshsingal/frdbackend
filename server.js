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

// App Config
const app = express();
const port = process.env.PORT || 4000;

// Connect to MongoDB and Cloudinary
connectDB();
connectCloudinary();

// Middlewares
app.use(express.json());
app.use(cors({
  origin: [
    'http://localhost:5174', // Local dev (Vite frontend)
    'https://your-frontend.vercel.app' // Replace with your actual Vercel URL after deployment
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