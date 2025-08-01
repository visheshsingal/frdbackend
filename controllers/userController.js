import validator from "validator";
import bcrypt from "bcrypt";
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import userModel from "../models/userModel.js";

// Email transporter configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Helper functions
const createToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '1d' });
};

const sendOTPEmail = async (email, otp) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Your OTP for Verification',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #052659;">Email Verification</h2>
        <p>Your OTP for verification is:</p>
        <h3 style="background: #052659; color: white; padding: 10px 15px; 
                   display: inline-block; border-radius: 4px;">
          ${otp}
        </h3>
        <p>This OTP will expire in 10 minutes.</p>
        <p>If you didn't request this, please ignore this email.</p>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
};

// OTP Verification Function - FIXED VERSION
const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    
    // Find user with matching email and unexpired OTP
    const user = await userModel.findOne({ 
      email,
      otp,
      otpExpires: { $gt: new Date() } // Only find unexpired OTPs
    });

    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: "Invalid or expired OTP" 
      });
    }

    // Clear OTP fields after successful verification
    user.otp = undefined;
    user.otpExpires = undefined;
    user.isVerified = true;
    await user.save();

    // If this is part of login/registration, create token
    const token = createToken(user._id);

    res.json({ 
      success: true, 
      message: "OTP verified successfully",
      token: token,
      user: {
        name: user.name,
        email: user.email,
        isVerified: true
      }
    });
  } catch (error) {
    console.error("OTP Verification Error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error during OTP verification" 
    });
  }
};

// Send OTP Function - FIXED VERSION
const sendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!validator.isEmail(email)) {
      return res.status(400).json({ 
        success: false, 
        message: "Please provide a valid email" 
      });
    }

    let user = await userModel.findOne({ email });

    if (!user) {
      // For registration flow
      user = new userModel({ email });
    }

    // Generate and save OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes expiry
    
    // MUST save before sending email
    await user.save(); 
    await sendOTPEmail(email, otp);

    res.json({ 
      success: true, 
      message: "OTP sent successfully" 
    });

  } catch (error) {
    console.error("Send OTP Error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to send OTP" 
    });
  }
};

// Login User Function - UPDATED
const loginUser = async (req, res) => {
  try {
    const { email, password, otp } = req.body;

    const user = await userModel.findOne({ email });
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    // Verify password first
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        message: "Invalid credentials" 
      });
    }

    // If OTP is provided, verify it
    if (otp) {
      const otpValid = await userModel.findOne({
        email,
        otp,
        otpExpires: { $gt: new Date() }
      });

      if (!otpValid) {
        return res.status(401).json({ 
          success: false, 
          message: "Invalid or expired OTP" 
        });
      }

      // Clear OTP after successful verification
      user.otp = undefined;
      user.otpExpires = undefined;
      await user.save();
    } 
    // If no OTP provided but user isn't verified, require OTP
    else if (!user.isVerified) {
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      user.otp = otp;
      user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
      await user.save();
      await sendOTPEmail(email, otp);

      return res.json({ 
        success: true, 
        message: "OTP sent to your email", 
        requiresOTP: true 
      });
    }

    const token = createToken(user._id);
    res.json({ 
      success: true, 
      token,
      user: {
        name: user.name,
        email: user.email,
        isVerified: user.isVerified
      }
    });

  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error" 
    });
  }
};

// Register User Function - UPDATED
const registerUser = async (req, res) => {
  try {
    const { name, email, password, otp } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: "Please provide all required fields" 
      });
    }

    if (!validator.isEmail(email)) {
      return res.status(400).json({ 
        success: false, 
        message: "Please provide a valid email" 
      });
    }

    if (password.length < 8) {
      return res.status(400).json({ 
        success: false, 
        message: "Password must be at least 8 characters" 
      });
    }

    // Check if user exists
    const existingUser = await userModel.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ 
        success: false, 
        message: "User already exists" 
      });
    }

    // If OTP is provided, verify it
    if (otp) {
      const otpValid = await userModel.findOne({
        email,
        otp,
        otpExpires: { $gt: new Date() }
      });

      if (!otpValid) {
        return res.status(401).json({ 
          success: false, 
          message: "Invalid or expired OTP" 
        });
      }
    } 
    // If no OTP provided, send one
    else {
      const newUser = new userModel({ email });
      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      newUser.otp = otp;
      newUser.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
      await newUser.save();
      await sendOTPEmail(email, otp);

      return res.json({ 
        success: true, 
        message: "OTP sent to your email", 
        requiresOTP: true 
      });
    }

    // Hash password and create user
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new userModel({
      name,
      email,
      password: hashedPassword,
      isVerified: true
    });

    await newUser.save();
    const token = createToken(newUser._id);
    res.status(201).json({ 
      success: true, 
      token,
      user: {
        name: newUser.name,
        email: newUser.email,
        isVerified: true
      }
    });

  } catch (error) {
    console.error("Registration Error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error" 
    });
  }
};

// Admin Login Function
const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
      const token = jwt.sign({ 
        email, 
        role: 'admin' 
      }, process.env.JWT_SECRET);
      
      res.json({ 
        success: true, 
        token 
      });
    } else {
      res.json({ 
        success: false, 
        message: "Invalid credentials" 
      });
    }
  } catch (error) {
    console.log("Admin Login Error:", error);
    res.json({ 
      success: false, 
      message: error.message 
    });
  }
};

// Export all functions
export { 
  loginUser, 
  registerUser, 
  adminLogin, 
  sendOTP, 
  verifyOTP 
};