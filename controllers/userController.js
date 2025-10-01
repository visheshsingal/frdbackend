import validator from "validator";
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import UserModel from "../models/userModel.js";

// Email transporter configuration
const createTransporter = () => {
  console.log('Creating email transporter for:', process.env.NODE_ENV);
  console.log('Email user:', process.env.EMAIL_USER ? 'Set' : 'Not set');
  
  // Common configuration for both environments
  const baseConfig = {
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    tls: {
      rejectUnauthorized: false
    }
  };

  // Production-specific settings with better timeout handling
  if (process.env.NODE_ENV === 'production') {
    return nodemailer.createTransport({
      ...baseConfig,
      connectionTimeout: 30000, // Increased to 30 seconds
      socketTimeout: 30000,     // Increased to 30 seconds
      greetingTimeout: 10000,
      logger: true,
      debug: true // Enable debug logs
    });
  } else {
    // Development - use service for simplicity
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
    hasTwoSpecialChars
  };
};

// Helper: Create JWT token
const createToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { 
    expiresIn: '1d',
    algorithm: 'HS256'
  });
};

// Initialize Admin User
const initializeAdmin = async () => {
  try {
    const adminExists = await UserModel.findOne({ email: 'frdgym@gmail.com', isAdmin: true });
    if (!adminExists) {
      const adminUser = new UserModel({
        email: 'frdgym@gmail.com',
        password: process.env.INITIAL_ADMIN_PASSWORD || 'Admin@123!!',
        name: 'Admin User',
        role: 'admin',
        isAdmin: true,
        isVerified: true
      });
      await adminUser.save();
      console.log('Admin user created successfully');
    } else {
      console.log('Admin user already exists');
    }
  } catch (error) {
    console.log('Error initializing admin:', error.message);
  }
};

// Send OTP email
const sendOTPEmail = async (email, otp) => {
  console.log('SEND OTP EMAIL: Starting for', email);
  
  try {
    const transporter = createTransporter();
    
    // Verify connection configuration first
    await transporter.verify();
    console.log('SEND OTP EMAIL: SMTP connection verified');

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

    console.log('SEND OTP EMAIL: Sending email...');
    const info = await transporter.sendMail(mailOptions);
    console.log('SEND OTP EMAIL: Email sent successfully', info.messageId);
    return true;

  } catch (error) {
    console.error('SEND OTP EMAIL ERROR DETAILS:');
    console.error('Error message:', error.message);
    console.error('Error code:', error.code);
    console.error('Command:', error.command);
    
    // More specific error messages
    if (error.code === 'EAUTH') {
      throw new Error('Email authentication failed. Check EMAIL_USER and EMAIL_PASS environment variables.');
    } else if (error.code === 'ECONNECTION' || error.code === 'ETIMEDOUT') {
      throw new Error('Cannot connect to email server. Check network connectivity and SMTP settings.');
    } else {
      throw new Error('Failed to send OTP email: ' + error.message);
    }
  }
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
      message: error.message
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

    // Find admin user in database
    const adminUser = await UserModel.findOne({ email: 'frdgym@gmail.com', isAdmin: true });
    if (!adminUser) {
      return res.status(401).json({ 
        success: false, 
        message: "Admin account not found" 
      });
    }

    // Verify password against database
    const isPasswordValid = await adminUser.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid admin credentials' 
      });
    }

    const token = jwt.sign(
      { 
        id: adminUser._id,
        email: adminUser.email,
        role: 'admin'
      }, 
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    
    return res.json({ 
      success: true, 
      token,
      user: { 
        email: adminUser.email, 
        role: 'admin',
        name: adminUser.name
      }
    });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ success: false, message: 'An error occurred during login' });
  }
};

// Change Admin Password - Send OTP
const changeAdminPasswordSendOTP = async (req, res) => {
  try {
    console.log('=== ADMIN OTP REQUEST START ===');
    const { currentPassword } = req.body;
    const otpEmail = 'vishesh.singal.contact@gmail.com';

    console.log('1. Request received with currentPassword:', !!currentPassword);

    // Find admin user
    const adminUser = await UserModel.findOne({ email: 'frdgym@gmail.com', isAdmin: true });
    console.log('2. Admin user found:', !!adminUser);
    
    if (!adminUser) {
      console.log('3. ADMIN USER NOT FOUND IN DATABASE');
      return res.status(404).json({ 
        success: false, 
        message: "Admin user not found" 
      });
    }

    console.log('4. Verifying current password...');
    // Verify current password
    const isCurrentPasswordValid = await adminUser.comparePassword(currentPassword);
    console.log('5. Password valid:', isCurrentPasswordValid);
    
    if (!isCurrentPasswordValid) {
      console.log('6. PASSWORD INVALID');
      return res.status(401).json({ 
        success: false, 
        message: "Current password is incorrect" 
      });
    }

    console.log('7. Generating OTP...');
    // Generate OTP
    const otp = adminUser.generateOTP();
    await adminUser.save();
    
    console.log('8. OTP generated:', otp);

    console.log('9. Sending OTP to:', otpEmail);
    // Send OTP
    await sendOTPEmail(otpEmail, otp);

    console.log('10. OTP sent successfully');
    console.log('=== ADMIN OTP REQUEST END ===');

    res.json({ 
      success: true, 
      message: "OTP sent to registered email for password change",
      email: otpEmail
    });
  } catch (error) {
    console.error('=== ADMIN OTP ERROR ===');
    console.error('Error:', error.message);
    console.error('Full error:', error);
    console.error('=== ADMIN OTP ERROR END ===');
    
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// Change Admin Password - Verify OTP and Update
const changeAdminPasswordVerify = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword, otp } = req.body;

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

    // Enhanced password validation
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

    // Find admin user
    const adminUser = await UserModel.findOne({ email: 'frdgym@gmail.com', isAdmin: true });
    if (!adminUser) {
      return res.status(404).json({ 
        success: false, 
        message: "Admin user not found" 
      });
    }

    // Verify current password against database
    const isCurrentPasswordValid = await adminUser.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        message: "Current password is incorrect" 
      });
    }

    // Verify OTP
    const verification = adminUser.verifyOTP(otp);
    if (!verification.isValid) {
      return res.status(401).json({ 
        success: false, 
        message: verification.message || "Invalid or expired OTP",
        isExpired: verification.isExpired
      });
    }

    // Update password in database
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
  changeAdminPasswordVerify,
  initializeAdmin
};