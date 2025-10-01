import jwt from 'jsonwebtoken'
import UserModel from "../models/userModel.js";

const adminAuth = async (req, res, next) => {
  try {
    const { token } = req.headers;
    
    if (!token) {
      return res.status(401).json({ success: false, message: "Token required" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // SIMPLE CHECK: Just verify the token is valid and has admin role
    if (decoded.role === 'admin' && decoded.email === 'vishesh.singal.contact@gmail.com') {
      next(); // Allow access
    } else {
      return res.status(401).json({ success: false, message: "Admin access required" });
    }
    
  } catch (error) {
    console.log('Admin auth error:', error.message);
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
}

export default adminAuth;