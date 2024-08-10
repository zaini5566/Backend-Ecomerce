 
const express = require("express");
const app = express();
const mongoose = require("mongoose");
const jwt  = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const cors = require("cors");
const { type } = require("os");
const { error } = require("console");
const { truncate } = require("fs");
require('dotenv').config();


const port = process.env.PORT;


app.use(express.json());
app.use(cors());

//Data Base Connectin wiht Mongodb
mongoose.connect(process.env.DB_URI);
//API Creation 

app.get("/", (req,res)=>{
   res.send("Express app is running")
})

// Image Storeage ingine 

const storage = multer.diskStorage({
    destination:'./upload/images',
    filename:(req,file,cb)=>{
        return cb(null,`${file.fieldname}_${Date.now()}${path.extname(file.originalname)}`)
    }
})
const upload = multer({storage:storage})

// Creating upload end pont for images 
app.use('/images', express.static('upload/images'))

app.post("/upload",upload.single('product'), (req,res)=>{
    res.json({
        success:1, 
        image_url:`http://localhost:${port}/images/${req.file.filename}`

    })
})

// Sceema for Creating Products 

const Product = mongoose.model("Product", {
    id:{
        type: Number,
        required:true, 
    },
    name: {
          type: String,
          required: true,
    },
    image:{
        type: String,
        required:true,
    },
    category:{
        type: String,
        required:true,
    },
    new_price:{
        type: Number,
        required:true,
    },
    old_price:{
        type: Number,
        required:true,
    },
    date:{
        type:Date,
        default:Date.now,
    },
    availabel:{
        type:Boolean,
        default: true,
     },
})
app.post('/addproduct', async (req, res) => {
    let products = await Product.find({});
    let id;
    if(products.length>0)
    {
        let last_product_array = products.slice(-1);
        let last_product = last_product_array[0];
        id = last_product.id+1;
    }
    else{
        id=1;
    }
    const product = new Product({
        id: id,
        name: req.body.name,
        image: req.body.image,   
        category: req.body.category,
        new_price: req.body.new_price,
        old_price: req.body.old_price
    });
      console.log(product);
      await product.save();
      console.log("Saved")
      res.json({success:true,
        name:req.body.name,
    })
})
// Create Api for Delete product 

app.post('/removeproduct', async (req,res)=>{
    await Product.findOneAndDelete({id:req.body.id});
    console.log("Removed");
     res.json({
        success:true,
        name:req.body.name
     })
})


//Create Api For getting all Products 
app.get('/allproducts', async (req, res)=>{
        let products = await Product.find({});
        console.log("All products Fetched")
        res.send(products)
})

const Users = mongoose.model('Users',{
    name:{
        type:String, 
    }, 
    email:{
        type:String,
        unique:true,
    }, 
    password:{
        type:String,
    }, 
    cartData:{
        type:Object,
    }, 
    date:{
        type:Date, 
        default: Date.now,
    }

})

// Create endpoint for reginster the user 
app.post('/signup', async(req,res) => {
    let check = await Users.findOne({email:req.body.email}); 
    if (check){
        return res.status(400).json({success:false, errors: "esisting user found wiht email adress "})
    }
    let cart = {}; 
    for (let i = 0; i<300; i++) {
        cart[i]=0; 
    }
    const user = new Users({   
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

// user login 
app.post('/login', async(req,res)=>{
    let user = await Users.findOne({email:req.body.email}); 
    if (user){
        const passCompare = req.body.password === user.password; 
        if (passCompare){
            const data = {
              user:{
                id:user.id
              }
            }
            const token = jwt.sign(data, 'secret_ecom')
            res.json({success:true, token}); 
        }
        else {
            res.json({success:false, errors:"Wrong Password"});
        }
    }
    else res.json({success:false, errors:"Wrong Email id"})
})

//Creating end point for new collectin 
app.get('/newcollection', async(req,res)=>{
    let products = await Product.find({}); 
    let newcollection = products.slice(1).slice(-8);
    console.log("newcollection fetch ")
    res.send(newcollection); 
})

//creating end pint for women 
app.get('/popularinwomen', async(req,res)=>{
    let products = await Product.find({category:"women"}); 
    let popularinwomen = products.slice(0,4)
    console.log("Popularinwomen fetch ")
    res.send(popularinwomen); 
})




// Creating Midleware to fetch user 
  const fetchUser = async(req,res,next)=>{
     const token = req.header('auth-token'); 
     if(!token){
        res.status(401).send({errors:"Plese authincatie using walid token"})
     }
     else {
        try{
            const data = jwt.verify(token,'secret_ecom'); 
            req.user = data.user; 
            next();
        } catch (error ){
       res.status(401).send({error:"Please autnecate using a valid token"})
        }
     }
  }
app.post('/addtocart', fetchUser, async(req,res) =>{
    console.log("Added" , req.body.itemId);
    let userData = await Users.findOne({_id:req.user.id}); 
    userData.cartData[req.body.itemId] += 1; 
    await Users.findOneAndUpdate({_id:req.user.id},{cartData:userData.cartData})
    res.send("Added")
})
 
// Creating end pont to remove product from cart data

app.post('/removefromcart', fetchUser, async(req,res)=>{
    console.log("remove" , req.body.itemId);
    let userData = await Users.findOne({_id:req.user.id}); 
    if( userData.cartData[req.body.itemId] > 0 )
    userData.cartData[req.body.itemId] -= 1; 
    await Users.findOneAndUpdate({_id:req.user.id},{cartData:userData.cartData})
    res.send("Removed")
})


// Createing end pont for get cart data 
app.post('/getcart', fetchUser, async(req, res) =>{
    console.log("GetCart"); 
    let userData = await Users.findOne({_id:req.user.id}); 
    res.json(userData.cartData); 

})
 
const Order = mongoose.model('Order', {
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Users',
        required: true
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
        lastName: { type: String, required: true },
        email: { type: String, required: true },
        street: { type: String, required: true },
        city: { type: String, required: true },
        state: { type: String, required: true },
        zipCode: { type: String, required: true },
        country: { type: String, required: true },
        phone: { type: String, required: true }
    },
    totalAmount: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    status:{type:String,default:"Processing"}
});
app.post('/placeorder', fetchUser, async (req, res) => {
    const { products, totalAmount, deliveryInfo } = req.body;

    const newOrder = new Order({
        userId: req.user.id,
        products,
        deliveryInfo,
        totalAmount
    });

    try {
        await newOrder.save();
        res.json({ success: true, order: newOrder });
    } catch (error) {
        console.error('Error placing order:', error.message);
        res.status(500).json({ success: false, errors: error.message });
    }
});

 app.get('/myorders', fetchUser, async (req, res) => { 
    try {
        const orders = await Order.find({ userId: req.user.id }).sort({ date: -1 });
        res.json({ success: true, orders });
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ success: false, errors: 'Internal Server Error' });
    }
});

app.get('/api/orders', async (req, res) => {
    try {
        const orders = await Order.find().populate('userId', 'name email');
        res.json({ success: true, orders });
    } catch (error) {
        console.error('Error fetching orders:', error);
        res.status(500).json({ success: false, errors: 'Internal Server Error' });
    }
});
// Update order status using POST method
app.post('/updateOrderStatus', async (req, res) => {
    const { orderId, newStatus } = req.body;
  
    try {
      const order = await Order.findByIdAndUpdate(orderId, { status: newStatus }, { new: true });
      if (!order) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }
      res.json({ success: true, order });
    } catch (error) {
      console.error('Error updating order status:', error);
      res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
  });
  
  
app.listen(port,(error)=>{
   if(!error){
    console.log("Server Running on port" +port)
   }
   else {
    console.log("Error: " + port)
   }
})