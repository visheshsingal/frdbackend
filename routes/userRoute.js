import express from 'express';
import { 
  loginUser,
  registerUser, 
  adminLogin,
  sendOTP,
  verifyOTP,
  forgotPassword,
  verifyResetOTP,
  resetPassword
} from '../controllers/userController.js';

const userRouter = express.Router();

userRouter.post('/send-otp', sendOTP);
userRouter.post('/verify-otp', verifyOTP);
userRouter.post('/register', registerUser);
userRouter.post('/login', loginUser);
userRouter.post('/admin', adminLogin);
userRouter.post('/forgot-password', forgotPassword);
userRouter.post('/verify-reset-otp', verifyResetOTP);
userRouter.post('/reset-password', resetPassword);

export default userRouter;