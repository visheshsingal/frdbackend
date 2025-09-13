import express from 'express';
import {
  listProducts,
  addProduct,
  updateProduct,
  removeProduct,
  singleProduct
} from '../controllers/productController.js';

import upload from '../middleware/multer.js';
import adminAuth from '../middleware/adminAuth.js';

const productRouter = express.Router();

productRouter.post('/add', adminAuth, upload.fields([
  { name: 'image1', maxCount: 1 },
  { name: 'image2', maxCount: 1 },
  { name: 'image3', maxCount: 1 },
  { name: 'image4', maxCount: 1 },
  { name: 'image5', maxCount: 1 }, // Added 5th image
  { name: 'video1', maxCount: 1 }, // Added video1
  { name: 'video2', maxCount: 1 }  // Added video2
]), addProduct);

productRouter.put('/update', adminAuth, upload.fields([
  { name: 'image1', maxCount: 1 },
  { name: 'image2', maxCount: 1 },
  { name: 'image3', maxCount: 1 },
  { name: 'image4', maxCount: 1 },
  { name: 'image5', maxCount: 1 }, // Added 5th image
  { name: 'video1', maxCount: 1 }, // Added video1
  { name: 'video2', maxCount: 1 }  // Added video2
]), updateProduct);

productRouter.post('/remove', adminAuth, removeProduct);
productRouter.post('/single', singleProduct);
productRouter.get('/list', listProducts);

export default productRouter;