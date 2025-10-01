import express from 'express'
import cors from 'cors'
import 'dotenv/config'
import connectDB from './config/mongodb.js'
import connectCloudinary from './config/cloudinary.js'
import userRouter from './routes/userRoute.js'
import productRouter from './routes/productRoute.js'
import cartRouter from './routes/cartRoute.js'
import orderRouter from './routes/orderRoute.js'
import bookingRouter from './routes/bookingRoute.js'
import { initializeAdmin } from './controllers/userController.js' // Add this import

// App Config
const app = express()
const port = process.env.PORT || 4000
connectDB()
connectCloudinary()

// Initialize admin user after DB connection
connectDB().then(() => {
  initializeAdmin(); // This will create admin user if it doesn't exist
});

// middlewares
app.use(express.json())
app.use(cors())

// api endpoints
app.use('/api/user',userRouter)
app.use('/api/product',productRouter)
app.use('/api/cart',cartRouter)
app.use('/api/order',orderRouter)
app.use('/api/bookings', bookingRouter)

app.get('/',(req,res)=>{
	res.send("API Working")
})

app.listen(port, ()=> console.log('Server started on PORT : '+ port))