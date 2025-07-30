import { v2 as cloudinary } from "cloudinary";
import productModel from "../models/productModel.js";

// Add Product
const addProduct = async (req, res) => {
  try {
    const { 
      name, 
      description, 
      price, 
      category, 
      subCategory, 
      sizes, 
      bestseller, 
      discount = 0
    } = req.body;

    // Validation
    if (!name || !description || !price || !category || !subCategory) {
      return res.status(400).json({ 
        success: false, 
        message: "All required fields must be filled." 
      });
    }

    // Process images
    const images = [
      req.files?.image1?.[0],
      req.files?.image2?.[0],
      req.files?.image3?.[0],
      req.files?.image4?.[0]
    ].filter(Boolean);

    const imagesUrl = await Promise.all(
      images.map(async (item) => {
        const result = await cloudinary.uploader.upload(item.path, { 
          resource_type: 'image' 
        });
        return result.secure_url;
      })
    );

    // Process sizes
    let parsedSizes = [];
    try {
      parsedSizes = sizes ? JSON.parse(sizes) : [];
      if (!Array.isArray(parsedSizes)) throw new Error();
    } catch {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid sizes format." 
      });
    }

    // Create product
    const productData = {
      name,
      description,
      category,
      price: Number(price),
      subCategory,
      bestseller: bestseller === "true",
      sizes: parsedSizes,
      image: imagesUrl,
      discount: Math.min(100, Math.max(0, Number(discount))),
      date: Date.now(),
    };

    const product = await productModel.create(productData);

    res.json({ 
      success: true, 
      message: "Product Added",
      product
    });

  } catch (error) {
    console.error("Add Product Error:", error);
    res.status(500).json({ 
      success: false, 
      message: error.message || "Failed to add product" 
    });
  }
};

// Update Product (Fixed Version)
const updateProduct = async (req, res) => {
  try {
    const { id, ...updateData } = req.body;

    // Validate ID
    if (!id) {
      return res.status(400).json({ 
        success: false, 
        message: "Product ID is required" 
      });
    }

    // Process images if updated
    let updatedImages;
    const newImages = [
      req.files?.image1?.[0],
      req.files?.image2?.[0],
      req.files?.image3?.[0],
      req.files?.image4?.[0]
    ].filter(Boolean);

    if (newImages.length > 0) {
      updatedImages = await Promise.all(
        newImages.map(async (item) => {
          const result = await cloudinary.uploader.upload(item.path, { 
            resource_type: "image" 
          });
          return result.secure_url;
        })
      );
    }

    // Prepare update object
    const update = {
      ...updateData,
      ...(updateData.price && { price: Number(updateData.price) }),
      ...(updateData.discount !== undefined && { 
        discount: Math.min(100, Math.max(0, Number(updateData.discount)))
      }),
      ...(updatedImages && { image: updatedImages }),
      ...(updateData.bestseller !== undefined && { 
        bestseller: updateData.bestseller === "true" 
      })
    };

    // Process sizes if updated
    if (updateData.sizes) {
      try {
        update.sizes = JSON.parse(updateData.sizes);
        if (!Array.isArray(update.sizes)) throw new Error();
      } catch {
        return res.status(400).json({ 
          success: false, 
          message: "Invalid sizes format." 
        });
      }
    }

    // Perform update
    const updatedProduct = await productModel.findByIdAndUpdate(
      id, 
      update, 
      { new: true, runValidators: true }
    );

    if (!updatedProduct) {
      return res.status(404).json({ 
        success: false, 
        message: "Product not found" 
      });
    }

    res.json({ 
      success: true, 
      message: "Product updated successfully",
      product: updatedProduct 
    });

  } catch (error) {
    console.error("Update Product Error:", error);
    res.status(500).json({ 
      success: false, 
      message: error.message || "Failed to update product" 
    });
  }
};

// List Products (Optimized)
const listProducts = async (req, res) => {
  try {
    const { category, subCategory, onDiscount, sortBy = 'date', sortOrder = 'desc' } = req.query;

    // Build filter
    const filter = {};
    if (category && category !== "All") filter.category = category;
    if (subCategory) filter.subCategory = subCategory;
    if (onDiscount === "true") filter.discount = { $gt: 0 };

    // Build sort
    const sort = {};
    if (sortBy === 'discount') sort.discount = sortOrder === 'asc' ? 1 : -1;
    else if (sortBy === 'price') sort.price = sortOrder === 'asc' ? 1 : -1;
    else sort.date = sortOrder === 'asc' ? 1 : -1;

    // Query with discount field explicitly included
    const products = await productModel.find(filter)
      .sort(sort)
      .select('name price discount image category subCategory date');

    res.json({ 
      success: true, 
      products,
      count: products.length 
    });

  } catch (error) {
    console.error("List Products Error:", error);
    res.status(500).json({ 
      success: false, 
      message: error.message || "Failed to fetch products" 
    });
  }
};

// Remove Product
const removeProduct = async (req, res) => {
  try {
    const { id } = req.body;
    
    if (!id) {
      return res.status(400).json({ 
        success: false, 
        message: "Product ID is required." 
      });
    }

    const deletedProduct = await productModel.findByIdAndDelete(id);
    
    if (!deletedProduct) {
      return res.status(404).json({ 
        success: false, 
        message: "Product not found" 
      });
    }

    res.json({ 
      success: true, 
      message: "Product Removed",
      product: deletedProduct 
    });

  } catch (error) {
    console.error("Remove Product Error:", error);
    res.status(500).json({ 
      success: false, 
      message: error.message || "Failed to remove product" 
    });
  }
};

// Get Single Product
const singleProduct = async (req, res) => {
  try {
    const { productId } = req.body;
    
    if (!productId) {
      return res.status(400).json({ 
        success: false, 
        message: "Product ID is required." 
      });
    }

    const product = await productModel.findById(productId)
      .select('-__v');

    if (!product) {
      return res.status(404).json({ 
        success: false, 
        message: "Product not found." 
      });
    }

    res.json({ 
      success: true, 
      product 
    });

  } catch (error) {
    console.error("Single Product Error:", error);
    res.status(500).json({ 
      success: false, 
      message: error.message || "Failed to fetch product" 
    });
  }
};

export {
  addProduct,
  updateProduct,
  listProducts,
  removeProduct,
  singleProduct,
};