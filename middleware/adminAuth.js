import jwt from 'jsonwebtoken';
import UserModel from '../models/userModel.js';

const adminAuth = async (req, res, next) => {
  try {
    const { token } = req.headers;
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Not Authorized Login Again"
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded || !decoded.id) {
      return res.status(401).json({
        success: false,
        message: "Not Authorized Login Again"
      });
    }

    // Find user in database and verify admin role
    const user = await UserModel.findById(decoded.id).select('-password');
    if (!user || user.role !== 'admin') {
      return res.status(401).json({
        success: false,
        message: "Not Authorized Login Again"
      });
    }

    // Attach user to request for use in controllers
    req.user = user;
    next();
  } catch (error) {
    console.log(error);
    res.status(401).json({ 
      success: false, 
      message: "Not Authorized Login Again" 
    });
  }
};

export default adminAuth;