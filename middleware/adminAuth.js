import jwt from 'jsonwebtoken'
import UserModel from "../models/userModel.js";

const adminAuth = async (req, res, next) => {
  try {
    const { token } = req.headers;
    if (!token) {
      return res.status(401).json({ success: false, message: "Not Authorized Login Again" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Handle different token formats
    let user;
    if (decoded.id) {
      // New format: token has user ID
      user = await UserModel.findById(decoded.id);
    } else if (decoded.email) {
      // Old format: token has only email
      user = await UserModel.findOne({ email: decoded.email, isAdmin: true });
    } else {
      return res.status(401).json({ success: false, message: "Invalid token format" });
    }
    
    if (!user || !user.isAdmin || user.email !== 'frdgym@gmail.com') {
      return res.status(401).json({ success: false, message: "Not Authorized Login Again" });
    }

    req.user = user;
    next();
  } catch (error) {
    console.log('Admin auth error:', error);
    res.status(401).json({ success: false, message: "Not Authorized Login Again" });
  }
}

export default adminAuth;