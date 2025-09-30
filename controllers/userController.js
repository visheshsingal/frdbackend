import validator from "validator";
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import UserModel from "../models/userModel.js";

// Email transporter configuration optimized for cloud platforms
const createTransporter = () => {
  // Use different configurations for different environments
  if (process.env.NODE_ENV === 'production') {
    // Production configuration for Render/Vercel
    return nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false, // Use TLS
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      // Optimized for cloud environments
      connectionTimeout: 15000, // 15 seconds
      socketTimeout: 15000, // 15 seconds
      greetingTimeout: 10000, // 10 seconds
      // Retry configuration
      retries: 2,
      // DNS timeout
      dnsTimeout: 10000,
      // Better TLS handling
      tls: {
        rejectUnauthorized: false, // Important for some cloud environments
        ciphers: 'SSLv3'
      }
    });
  } else {
    // Development configuration
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  }
};

// Password validation function
const validatePassword = (password) => {
  const minLength = password.length >= 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const specialChars = password.match(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g);
  const hasTwoSpecialChars = specialChars && specialChars.length >= 2;

  return {
    isValid: minLength && hasUpperCase && hasLowerCase && hasTwoSpecialChars,
    minLength,
    hasUpperCase,
    hasLowerCase,
    hasTwoSpecialChars,
    specialCharCount: specialChars ? specialChars.length : 0
  };
};

// Helper: Create JWT token
const createToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { 
    expiresIn: '1d',
    algorithm: 'HS256'
  });
};

// Send OTP email with better error handling for cloud
const sendOTPEmail = async (email, otp) => {
  const transporter = createTransporter();
  
  return new Promise((resolve, reject) => {
    // Set timeout for entire email operation
    const timeout = setTimeout(() => {
      reject(new Error('Email sending timeout - please try again'));
    }, 20000);

    try {
      console.log('Attempting to send OTP email to:', email);
      console.log('Environment:', process.env.NODE_ENV);

      const mailOptions = {
        from: `"Admin System" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Your OTP for Password Change',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #052659;">Admin Password Change OTP</h2>
            <p>Your One-Time Password (OTP) for changing admin password is:</p>
            <div style="background: #f5f5f5; padding: 15px; text-align: center; margin: 20px 0;">
              <span style="font-size: 24px; font-weight: bold; color: #052659;">${otp}</span>
            </div>
            <p>This OTP is valid for 10 minutes.</p>
            <p>If you didn't request this, please ignore this email.</p>
          </div>
        `
      };

      transporter.sendMail(mailOptions, (error, info) => {
        clearTimeout(timeout);
        
        if (error) {
          console.error('Email sending failed:', error);
          console.error('Error code:', error.code);
          console.error('Error command:', error.command);
          
          // Specific error handling for cloud environments
          if (error.code === 'ECONNECTION' || error.code === 'ETIMEDOUT') {
            reject(new Error('Unable to connect to email service. This might be a platform restriction.'));
          } else if (error.code === 'EAUTH') {
            reject(new Error('Email authentication failed. Please check your email credentials.'));
          } else if (error.code === 'ESOCKET') {
            reject(new Error('Network connection issue. Please try again.'));
          } else {
            reject(new Error('Failed to send OTP email. Please try again.'));
          }
        } else {
          console.log('OTP email sent successfully:', info.messageId);
          console.log('Response:', info.response);
          resolve(true);
        }
      });

    } catch (error) {
      clearTimeout(timeout);
      console.error('Unexpected error in sendOTPEmail:', error);
      reject(new Error('Unexpected error while sending OTP email'));
    }
  });
};

// Send OTP
const sendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!validator.isEmail(email)) {
      return res.status(400).json({ 
        success: false, 
        message: "Please provide a valid email address" 
      });
    }

    let user = await UserModel.findOne({ email });
    const now = new Date();
    
    if (user && user.otpSentAt && (now - user.otpSentAt) < 30000) {
      const secondsLeft = Math.ceil((30000 - (now - user.otpSentAt)) / 1000);
      return res.status(429).json({ 
        success: false, 
        message: `Please wait ${secondsLeft} seconds before requesting a new OTP` 
      });
    }

    if (!user) {
      user = new UserModel({ 
        email, 
        name: "Temp User", 
        password: "Temp@1234!!",
        isTemp: true
      });
    }

    const otp = user.generateOTP();
    await user.save();
    
    await sendOTPEmail(email, otp);

    res.json({ 
      success: true, 
      message: "OTP sent successfully. Please check your email.",
      email: email
    });
  } catch (error) {
    console.error('OTP sending error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message || "An error occurred while sending OTP. Please try again later." 
    });
  }
};

// Verify OTP
const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ 
        success: false, 
        message: "Email and OTP are required" 
      });
    }

    const user = await UserModel.findOne({ email });
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "No account found with this email. Please register first." 
      });
    }

    const verification = user.verifyOTP(otp);
    if (!verification.isValid) {
      return res.status(401).json({ 
        success: false, 
        message: verification.message || "Invalid or expired OTP",
        isExpired: verification.isExpired
      });
    }

    await user.save();
    
    if (user.isTemp) {
      return res.json({ 
        success: true, 
        message: "OTP verified. Please complete your registration.",
        requiresRegistration: true,
        email: user.email
      });
    }

    const token = createToken(user._id);
    
    res.json({
      success: true,
      message: "OTP verified successfully",
      token,
      user: {
        name: user.name,
        email: user.email,
        isVerified: user.isVerified
      }
    });
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ 
      success: false, 
      message: "An error occurred during verification. Please try again." 
    });
  }
};

// Registration
const registerUser = async (req, res) => {
  try {
    const { name, email, password, otp } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: "Name, email and password are required" 
      });
    }

    if (!validator.isEmail(email)) {
      return res.status(400).json({ 
        success: false, 
        message: "Please provide a valid email address" 
      });
    }

    // Enhanced password validation
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      let errorMessage = "Password must contain:";
      if (!passwordValidation.minLength) errorMessage += " at least 8 characters,";
      if (!passwordValidation.hasUpperCase) errorMessage += " one uppercase letter,";
      if (!passwordValidation.hasLowerCase) errorMessage += " one lowercase letter,";
      if (!passwordValidation.hasTwoSpecialChars) errorMessage += " at least two special characters,";
      
      errorMessage = errorMessage.slice(0, -1) + '.';
      return res.status(400).json({ 
        success: false, 
        message: errorMessage
      });
    }

    let user = await UserModel.findOne({ email });

    if (user) {
      if (!user.isTemp && user.password) {
        return res.status(409).json({ 
          success: false, 
          message: "An account already exists with this email. Please login instead." 
        });
      }

      if (otp) {
        const verification = user.verifyOTP(otp);
        if (!verification.isValid) {
          return res.status(401).json({ 
            success: false, 
            message: verification.message || "Invalid or expired OTP",
            isExpired: verification.isExpired
          });
        }
        
        user.name = name;
        user.password = password;
        user.isTemp = false;
        user.isVerified = true;
        await user.save();

        const token = createToken(user._id);
        return res.status(201).json({
          success: true,
          message: "Registration successful",
          token,
          user: {
            name: user.name,
            email: user.email,
            isVerified: user.isVerified
          }
        });
      } else {
        const newOTP = user.generateOTP();
        await user.save();
        await sendOTPEmail(email, newOTP);
        
        return res.json({ 
          success: true, 
          message: "OTP sent to your email", 
          requiresOTP: true,
          email: user.email
        });
      }
    }

    const newUser = new UserModel({ 
      name, 
      email, 
      password,
      isVerified: false
    });

    const newOTP = newUser.generateOTP();
    await newUser.save();
    await sendOTPEmail(email, newOTP);

    res.status(200).json({ 
      success: true, 
      message: "OTP sent to your email for verification",
      requiresOTP: true,
      email: newUser.email
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ 
      success: false, 
      message: "An error occurred during registration. Please try again." 
    });
  }
};

// Login
const loginUser = async (req, res) => {
  try {
    const { email, password, otp } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: "Email and password are required" 
      });
    }

    const user = await UserModel.findOne({ email });
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "No account found with this email. Please register first." 
      });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        message: "Incorrect email or password",
        requiresOTP: false
      });
    }

    if (otp) {
      const verification = user.verifyOTP(otp);
      if (!verification.isValid) {
        return res.status(401).json({ 
          success: false, 
          message: verification.message || "Invalid or expired OTP",
          isExpired: verification.isExpired,
          requiresOTP: true
        });
      }
      
      await user.save();
    } else {
      const newOTP = user.generateOTP();
      await user.save();
      await sendOTPEmail(email, newOTP);
      
      return res.json({ 
        success: true, 
        message: "OTP sent to your email for verification",
        requiresOTP: true,
        email: user.email
      });
    }

    const token = createToken(user._id);
    
    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        name: user.name,
        email: user.email,
        isVerified: user.isVerified
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      success: false, 
      message: "An error occurred during login. Please try again." 
    });
  }
};

// Admin Login
const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: "Email and password are required" 
      });
    }

    if (email !== 'frdgym@gmail.com') {
      return res.status(401).json({ 
        success: false, 
        message: "Unauthorized email address" 
      });
    }

    const isAdminPasswordValid = password === process.env.ADMIN_PASSWORD || password === 'Admin@123!!';
    if (!isAdminPasswordValid) {
      return res.status(401).json({ success: false, message: 'Invalid admin credentials' });
    }

    const token = jwt.sign(
      { 
        email,
        role: 'admin',
        timestamp: Date.now()
      }, 
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    
    return res.json({ 
      success: true, 
      token,
      user: { email, role: 'admin' }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ success: false, message: 'An error occurred during login' });
  }
};

// Change Admin Password - Send OTP
const changeAdminPasswordSendOTP = async (req, res) => {
  try {
    const { currentPassword } = req.body;
    const adminEmail = 'frdgym@gmail.com';
    const otpEmail = 'vishesh.singal.contact@gmail.com';

    console.log('Change password OTP request received');
    console.log('Deployment environment:', process.env.NODE_ENV);

    // Verify current password
    const isCurrentPasswordValid = currentPassword === process.env.ADMIN_PASSWORD || currentPassword === 'Admin@123!!';
    
    if (!isCurrentPasswordValid) {
      console.log('Current password invalid');
      return res.status(401).json({ 
        success: false, 
        message: "Current password is incorrect" 
      });
    }

    console.log('Current password verified');

    // Find or create admin user for OTP
    let adminUser = await UserModel.findOne({ email: adminEmail });
    if (!adminUser) {
      console.log('Creating new admin user for OTP');
      adminUser = new UserModel({ 
        email: adminEmail, 
        name: "Admin User", 
        password: process.env.ADMIN_PASSWORD || 'Admin@123!!',
        isTemp: false
      });
    }

    // Generate OTP
    const otp = adminUser.generateOTP();
    await adminUser.save();
    
    console.log('OTP generated:', otp);
    console.log('Sending OTP to:', otpEmail);

    // Send OTP to vishesh.singal.contact@gmail.com
    await sendOTPEmail(otpEmail, otp);

    console.log('OTP sent successfully');

    res.json({ 
      success: true, 
      message: "OTP sent to registered email for password change",
      email: otpEmail
    });
  } catch (error) {
    console.error('Change password OTP error:', error);
    
    let errorMessage = "An error occurred while sending OTP. Please try again.";
    
    if (error.message.includes('platform restriction') || error.message.includes('Unable to connect')) {
      errorMessage = "Email service is currently unavailable on this platform. Please try again later or contact support.";
    } else if (error.message.includes('authentication failed')) {
      errorMessage = "Email configuration error. Please contact administrator.";
    } else if (error.message.includes('timeout')) {
      errorMessage = "OTP sending is taking too long. Please try again.";
    }
    
    res.status(500).json({ 
      success: false, 
      message: errorMessage
    });
  }
};

// Change Admin Password - Verify OTP and Update
const changeAdminPasswordVerify = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword, otp } = req.body;
    const adminEmail = 'frdgym@gmail.com';

    // Validate inputs
    if (!currentPassword || !newPassword || !confirmPassword || !otp) {
      return res.status(400).json({ 
        success: false, 
        message: "All fields are required" 
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ 
        success: false, 
        message: "New passwords do not match" 
      });
    }

    // Enhanced password validation for admin
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      let errorMessage = "Password must contain:";
      if (!passwordValidation.minLength) errorMessage += " at least 8 characters,";
      if (!passwordValidation.hasUpperCase) errorMessage += " one uppercase letter,";
      if (!passwordValidation.hasLowerCase) errorMessage += " one lowercase letter,";
      if (!passwordValidation.hasTwoSpecialChars) errorMessage += " at least two special characters,";
      
      errorMessage = errorMessage.slice(0, -1) + '.';
      return res.status(400).json({ 
        success: false, 
        message: errorMessage
      });
    }

    // Verify current password
    const isCurrentPasswordValid = currentPassword === process.env.ADMIN_PASSWORD || currentPassword === 'Admin@123!!';
    if (!isCurrentPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        message: "Current password is incorrect" 
      });
    }

    // Find admin user and verify OTP
    const adminUser = await UserModel.findOne({ email: adminEmail });
    if (!adminUser) {
      return res.status(404).json({ 
        success: false, 
        message: "Admin user not found" 
      });
    }

    const verification = adminUser.verifyOTP(otp);
    if (!verification.isValid) {
      return res.status(401).json({ 
        success: false, 
        message: verification.message || "Invalid or expired OTP",
        isExpired: verification.isExpired
      });
    }

    // Update environment variable and admin user password
    process.env.ADMIN_PASSWORD = newPassword;
    adminUser.password = newPassword;
    await adminUser.save();

    res.json({
      success: true,
      message: "Admin password changed successfully"
    });
  } catch (error) {
    console.error('Change password verification error:', error);
    res.status(500).json({ 
      success: false, 
      message: "An error occurred while changing password. Please try again." 
    });
  }
};

// Forgot Password
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!validator.isEmail(email)) {
      return res.status(400).json({ 
        success: false, 
        message: "Please provide a valid email address" 
      });
    }

    const user = await UserModel.findOne({ email });
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "No account found with this email." 
      });
    }

    const otp = user.generateOTP();
    await user.save();
    
    await sendOTPEmail(email, otp);

    res.json({ 
      success: true, 
      message: "Password reset OTP sent successfully. Please check your email.",
      email: email
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ 
      success: false, 
      message: "An error occurred. Please try again later." 
    });
  }
};

// Verify Reset OTP
const verifyResetOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ 
        success: false, 
        message: "Email and OTP are required" 
      });
    }

    const user = await UserModel.findOne({ email });
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "No account found with this email." 
      });
    }

    const verification = user.verifyOTP(otp);
    if (!verification.isValid) {
      return res.status(401).json({ 
        success: false, 
        message: verification.message || "Invalid or expired OTP",
        isExpired: verification.isExpired
      });
    }

    const resetToken = jwt.sign(
      { 
        id: user._id,
        purpose: 'password_reset'
      }, 
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    await user.save();

    res.json({
      success: true,
      message: "OTP verified successfully",
      resetToken,
      email: user.email
    });
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ 
      success: false, 
      message: "An error occurred during verification. Please try again." 
    });
  }
};

// Reset Password
const resetPassword = async (req, res) => {
  try {
    const { resetToken, newPassword, confirmPassword } = req.body;

    if (!resetToken || !newPassword || !confirmPassword) {
      return res.status(400).json({ 
        success: false, 
        message: "All fields are required" 
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ 
        success: false, 
        message: "Passwords do not match" 
      });
    }

    // Enhanced password validation for reset
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      let errorMessage = "Password must contain:";
      if (!passwordValidation.minLength) errorMessage += " at least 8 characters,";
      if (!passwordValidation.hasUpperCase) errorMessage += " one uppercase letter,";
      if (!passwordValidation.hasLowerCase) errorMessage += " one lowercase letter,";
      if (!passwordValidation.hasTwoSpecialChars) errorMessage += " at least two special characters,";
      
      errorMessage = errorMessage.slice(0, -1) + '.';
      return res.status(400).json({ 
        success: false, 
        message: errorMessage
      });
    }

    const decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
    if (decoded.purpose !== 'password_reset') {
      return res.status(401).json({ 
        success: false, 
        message: "Invalid reset token" 
      });
    }

    const user = await UserModel.findById(decoded.id);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: "Password reset successfully. You can now login with your new password."
    });
  } catch (error) {
    console.error('Password reset error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        message: "Reset token has expired. Please request a new one." 
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false, 
        message: "Invalid reset token" 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: "An error occurred while resetting password. Please try again." 
    });
  }
};

export {
  loginUser,
  registerUser,
  adminLogin,
  sendOTP,
  verifyOTP,
  forgotPassword,
  verifyResetOTP,
  resetPassword,
  changeAdminPasswordSendOTP,
  changeAdminPasswordVerify
};