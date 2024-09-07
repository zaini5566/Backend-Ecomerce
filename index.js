const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
require('dotenv').config();

const app = express();
const port = process.env.PORT || 4000;
const dbUri = process.env.DB_URI;

// Middleware
app.use(express.json());
app.use(cors());

// MongoDB connection
mongoose.connect(dbUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => console.log("Connected to MongoDB"))
    .catch((err) => {
        console.error("Error connecting to MongoDB:", err.message);
        process.exit(1);
    });

// Cloudinary configuration
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Cloudinary storage engine
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'products', // Folder name in Cloudinary
        resource_type: 'image', // Format of the uploaded files
        public_id: (req, file) => file.fieldname + '_' + Date.now(),
    },
});

const upload = multer({ storage: storage });

// Home route
app.get("/", (req, res) => {
    res.send("Express app is running");
});

// Upload image endpoint
app.post("/upload", upload.single('product'), (req, res) => {
    res.json({
        success: 1,
        image_url: req.file.path, // Cloudinary URL
    });
});

// Product Schema
const ProductSchema = new mongoose.Schema({
    id: {
        type: Number,
        required: true,
    },
    name: {
        type: String,
        required: true,
    },
    image: {
        type: String,
        required: true,
    },
    category: {
        type: String,
        required: true,
    },
    new_price: {
        type: Number,
        required: true,
    },
    old_price: {
        type: Number,
        required: true,
    },
    date: {
        type: Date,
        default: Date.now,
    },
    available: {
        type: Boolean,
        default: true,
    },
});
const Product = mongoose.model("Product", ProductSchema);

// Add product endpoint
app.post('/addproduct', async (req, res) => {
    try {
        const products = await Product.find({});
        const id = products.length > 0 ? products[products.length - 1].id + 1 : 1;

        const product = new Product({
            id,
            name: req.body.name,
            image: req.body.image,
            category: req.body.category,
            new_price: req.body.new_price,
            old_price: req.body.old_price,
        });

        await product.save();
        res.json({ success: true, product });
    } catch (error) {
        console.error("Error adding product:", error.message);
        res.status(500).json({ success: false, errors: "Internal Server Error" });
    }
});

// Remove product endpoint
app.post('/removeproduct', async (req, res) => {
    try {
        await Product.findOneAndDelete({ id: req.body.id });
        res.json({ success: true });
    } catch (error) {
        console.error("Error removing product:", error.message);
        res.status(500).json({ success: false, errors: "Internal Server Error" });
    }
});

// Get all products endpoint
app.get('/allproducts', async (req, res) => {
    try {
        const products = await Product.find({});
        res.json(products);
    } catch (error) {
        console.error("Error fetching products:", error.message);
        res.status(500).json({ success: false, errors: "Internal Server Error" });
    }
});

// User Schema
const UserSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        unique: true,
        required: true,
    },
    password: {
        type: String,
        required: true,
    },
    cartData: {
        type: Map,
        of: Number,
    },
    date: {
        type: Date,
        default: Date.now,
    }
});
const User = mongoose.model('User', UserSchema);

// Signup endpoint
app.post('/signup', async(req,res) => {
    let check = await User.findOne({email:req.body.email}); 
    if (check){
        return res.status(400).json({success:false, errors: "esisting user found wiht email adress "})
    }
    let cart = {}; 
    for (let i = 0; i<300; i++) {
        cart[i]=0; 
    }
    const user = new User({   
        name:req.body.username,
        email:req.body.email, 
        password:req.body.password, 
        cartData:cart,
    })
    await user.save(); 


    const data = {
        user: {
            id: user.id
        }
    }
    const token = jwt.sign(data, 'secret_ecom'); 
    res.json({success:true, token})
})
// Login endpoint
app.post('/login', async (req, res) => {
    try {
        const user = await User.findOne({ email: req.body.email });
        if (!user) {
            return res.status(400).json({ success: false, errors: "Invalid email or password" });
        }

        const passCompare = req.body.password === user.password; // Consider using bcrypt to compare hashed passwords
        if (!passCompare) {
            return res.status(400).json({ success: false, errors: "Invalid email or password" });
        }

        const token = jwt.sign({ id: user.id }, 'secret_ecom', { expiresIn: '1h' });
        res.json({ success: true, token });
    } catch (error) {
        console.error("Error during login:", error.message);
        res.status(500).json({ success: false, errors: "Internal Server Error" });
    }
});

// Middleware to fetch user
const fetchUser = (req, res, next) => {
    const token = req.header('auth-token');
    if (!token) {
        return res.status(401).send({ errors: "Please authenticate using a valid token" });
    }
    try {
        const data = jwt.verify(token, 'secret_ecom');
        req.user = data;
        next();
    } catch (error) {
        res.status(401).send({ errors: "Please authenticate using a valid token" });
    }
};

// Add to cart endpoint
app.post('/addtocart', fetchUser, async (req, res) => {
    try {
        let user = await User.findById(req.user.id);
        user.cartData.set(req.body.itemId, (user.cartData.get(req.body.itemId) || 0) + 1);
        await user.save();
        res.send("Added");
    } catch (error) {
        console.error("Error adding to cart:", error.message);
        res.status(500).json({ success: false, errors: "Internal Server Error" });
    }
});

// Remove from cart endpoint
app.post('/removefromcart', fetchUser, async (req, res) => {
    try {
        let user = await User.findById(req.user.id);
        let currentQuantity = user.cartData.get(req.body.itemId);
        if (currentQuantity > 0) {
            user.cartData.set(req.body.itemId, currentQuantity - 1);
            await user.save();
            res.send("Removed");
        } else {
            res.status(400).json({ success: false, errors: "Item not in cart" });
        }
    } catch (error) {
        console.error("Error removing from cart:", error.message);
        res.status(500).json({ success: false, errors: "Internal Server Error" });
    }
});

// Get cart data endpoint
app.post('/getcart', fetchUser, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        res.json(user.cartData);
    } catch (error) {
        console.error("Error fetching cart data:", error.message);
        res.status(500).json({ success: false, errors: "Internal Server Error" });
    }
});

// New Collection endpoint
app.get('/newcollection', async (req, res) => {
    try {
        const products = await Product.find({});
        const newCollection = products.slice(-8); // Get the last 8 products
        res.json(newCollection);
    } catch (error) {
        console.error("Error fetching new collection:", error.message);
        res.status(500).json({ success: false, errors: "Internal Server Error" });
    }
});

// Popular in Women endpoint
app.get('/popularinwomen', async (req, res) => {
    try {
        const popularInWomen = await Product.find({ category: "women" }).limit(4); // Get first 4 products in "women" category
        res.json(popularInWomen);
    } catch (error) {
        console.error("Error fetching popular in women:", error.message);
        res.status(500).json({ success: false, errors: "Internal Server Error" });
    }
});

// Order Schema
const OrderSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    products: [{
        id: { type: Number, required: true },
        name: { type: String, required: true },
        price: { type: Number, required: true },
        quantity: { type: Number, required: true },
        image: { type: String, required: true },
    }],
    deliveryInfo: {
        firstName: { type: String, required: true },
        lastName: { type: String},
        email: { type: String, required: true }, 
        Address: { type: String, required: true },
        city: { type: String, required: true },
        state: { type: String, required: true },
        zipCode: { type: String, required: true },
        country: { type: String, required: true },
        phone: { type: String, required: true },
    },
    totalAmount: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    status: { type: String, default: "Processing" },
});
const Order = mongoose.model('Order', OrderSchema);

// Place order endpoint
app.post('/placeorder', fetchUser, async (req, res) => {
    try {
        const newOrder = new Order({
            userId: req.user.id,
            products: req.body.products,
            deliveryInfo: req.body.deliveryInfo,
            totalAmount: req.body.totalAmount,
        });

        await newOrder.save();
        res.json({ success: true, order: newOrder });
    } catch (error) {
        console.error('Error placing order:', error.message);
        res.status(500).json({ success: false, errors: "Internal Server Error" });
    }
});

// Get my orders endpoint
app.get('/myorders', fetchUser, async (req, res) => {
    try {
        const orders = await Order.find({ userId: req.user.id }).sort({ date: -1 });
        res.json({ success: true, orders });
    } catch (error) {
        console.error('Error fetching orders:', error.message);
        res.status(500).json({ success: false, errors: "Internal Server Error" });
    }
});

// Get all orders endpoint
app.get('/api/orders', async (req, res) => {
    try {
        const orders = await Order.find().populate('userId', 'name email');
        res.json({ success: true, orders });
    } catch (error) {
        console.error('Error fetching orders:', error.message);
        res.status(500).json({ success: false, errors: "Internal Server Error" });
    }
});

// Update order status endpoint
app.post('/updateOrderStatus', async (req, res) => {
    try {
        const order = await Order.findByIdAndUpdate(req.body.orderId, { status: req.body.newStatus }, { new: true });
        if (!order) {
            return res.status(404).json({ success: false, errors: 'Order not found' });
        }
        res.json({ success: true, order });
    } catch (error) {
        console.error('Error updating order status:', error.message);
        res.status(500).json({ success: false, errors: "Internal Server Error" });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
