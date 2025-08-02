import express from 'express';
import { 
  loginUser,
  registerUser, 
  adminLogin,
  sendOTP,
  verifyOTP 
} from '../controllers/userController.js';

const userRouter = express.Router();

userRouter.post('/send-otp', sendOTP);
userRouter.post('/verify-otp', verifyOTP);
userRouter.post('/register', registerUser);
userRouter.post('/login', loginUser);
userRouter.post('/admin', adminLogin);

export default userRouter;
