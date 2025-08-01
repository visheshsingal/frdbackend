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

// Helper: Create JWT token
const createToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '1d' });
};

// Helper: Send OTP Email
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

// Send OTP API
const sendOTP = async (req, res) => {
  try {
    const { email } = req.body;

    if (!validator.isEmail(email)) {
      return res.status(400).json({ success: false, message: "Invalid email" });
    }

    let user = await userModel.findOne({ email });

    if (!user) {
      user = new userModel({ email, name: "Temp", password: "Temp@1234" }); // temporary password
    }

    const otp = user.generateOTP();
    await user.save();
    await sendOTPEmail(email, otp);

    res.json({ success: true, message: "OTP sent successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to send OTP" });
  }
};

// Verify OTP API
const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await userModel.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const isOTPValid = user.verifyOTP(otp);
    if (!isOTPValid) {
      return res.status(401).json({ success: false, message: "Invalid or expired OTP" });
    }

    await user.save();

    res.json({ success: true, message: "OTP verified successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Register API
const registerUser = async (req, res) => {
  try {
    const { name, email, password, otp } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: "All fields are required" });
    }

    if (!validator.isEmail(email)) {
      return res.status(400).json({ success: false, message: "Invalid email" });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, message: "Password too short" });
    }

    let user = await userModel.findOne({ email });

    if (user) {
      if (!otp) {
        const newOTP = user.generateOTP();
        await user.save();
        await sendOTPEmail(email, newOTP);
        return res.json({ success: true, message: "OTP sent to your email", requiresOTP: true });
      }

      const isOTPValid = user.verifyOTP(otp);
      if (!isOTPValid) {
        return res.status(401).json({ success: false, message: "Invalid or expired OTP" });
      }

      user.name = name;
      user.password = password;
      await user.save();

      const token = createToken(user._id);
      return res.status(201).json({
        success: true,
        token,
        user: {
          name: user.name,
          email: user.email,
          isVerified: user.isVerified
        }
      });
    }

    // New user
    const newUser = new userModel({ name, email, password });
    const newOTP = newUser.generateOTP();
    await newUser.save();
    await sendOTPEmail(email, newOTP);

    res.json({ success: true, message: "OTP sent to your email", requiresOTP: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Login API
const loginUser = async (req, res) => {
  try {
    const { email, password, otp } = req.body;

    const user = await userModel.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    if (otp) {
      const isOTPValid = user.verifyOTP(otp);
      if (!isOTPValid) {
        return res.status(401).json({ success: false, message: "Invalid or expired OTP" });
      }
      await user.save();
    } else {
      const newOTP = user.generateOTP();
      await user.save();
      await sendOTPEmail(email, newOTP);
      return res.json({ success: true, message: "OTP sent to your email", requiresOTP: true });
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
    console.error(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Admin Login
const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
      const token = jwt.sign(email + password, process.env.JWT_SECRET);
      return res.json({ success: true, token });
    }

    res.json({ success: false, message: "Invalid credentials" });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// Export all controllers
export {
  loginUser,
  registerUser,
  adminLogin,
  sendOTP,
  verifyOTP
};
