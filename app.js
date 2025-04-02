if(process.env.NODE_KEY != "production"){
    require('dotenv').config();
}

const express = require("express");
const app = express();
const mongoose = require("mongoose");
const path = require("path");
const Listing = require("./models/listing.js");
const methodoverride = require("method-override");
const ejsMate = require('ejs-mate');
const review = require("./models/review.js");
const session = require("express-session");
const flash = require("connect-flash");
const passport = require("passport");
const localStrategy = require("passport-local");
const User = require("./models/users.js");
// const multer  = require('multer');
// // const {storage} = require("./cloudconfig.js")
// const upload = multer({ storage });
const MongoStore = require('connect-mongo');

app.set("view engine" , "ejs");
app.set("views" , path.join(__dirname,"views"));
app.use(express.static(path.join(__dirname, "/public")));
app.use(express.urlencoded({extended:true}));
app.use(methodoverride("_method"));
app.engine('ejs', ejsMate);

const dburl = process.env.ATLASDB;


const store = MongoStore.create({
    mongoUrl: dburl,
    crypto:{
        secret :process.env.SECRET,
    },
    touchAfter:24* 3600,
  });

store.on("error" ,()=>{
    console.log("error in mongo store", err);
})
const sessionOption = {
    store,
    secret : process.env.SECRET,
    resave : false ,
    saveUninitialized: true,
    Cookie :{
        expires : Date.now() * 7 * 24 * 60 * 60 * 1000,
        maxAge : 7 * 24 * 60 * 60 * 1000,
        httpOnly : true,
    },
};



app.use(session( sessionOption));
app.use(flash());

app.use(passport.initialize());
app.use(passport.session());
passport.use(new localStrategy(User.authenticate()));

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

//search error handling
// if (!error) {
//     req.flash("error", "Please enter a search term.");
//     return res.redirect("/listings");
// }


main().catch(err => console.log(err));
async function main() {
  await mongoose.connect(dburl);

}

app.use((req,res, next) =>{
    res.locals.success = req.flash("success");
    res.locals.error = req.flash("error");
    res.locals.currUser = req.user;
    next();
})
app.use((req, res, next) => {
    if (!req.isAuthenticated() && req.method === "GET") {
        req.session.returnTo = req.originalUrl; // Store the original URL in the session
    }
    next();
});


//middleware
let isowner = async(req ,res , next) =>{
    let { id } = req.params;
    let listing = await Listing.findById(id);
    if(!res.locals.currUser && listing.owner._id.equals(res.locals.currUser)){
        req.flash("error" , "you don't have permisson to update.");
        res.redirect(`/listings/${id}`);
    }
    next();
};
let isAuthor = async (req, res, next) => {
    try {
        let { reviewId } = req.params;
        let reviewDoc = await review.findById(reviewId); // Fetch the review from the correct model
        if (!reviewDoc || !reviewDoc.author.equals(res.locals.currUser._id)) {
            req.flash("error", "You don't have permission to delete this review.");
            return res.redirect(`/listings/${req.params.id}`);
        }
        next();
    } catch (err) {
        console.error(err);
        req.flash("error", "Something went wrong.");
        res.redirect(`/listings/${req.params.id}`);
    }
};


//all listings title 1
app.get("/listings" ,async (req,res) =>{
   const alllistings = await Listing.find({});
   res.render("./listings/index.ejs" , {alllistings});
})

//new listings 3
app.get("/listings/new",(req,res) =>{
    if(!req.isAuthenticated()){
        req.flash("error" , "Please Login");
        res.redirect("/login");
    }
    res.render("./listings/new.ejs")
})

// show route 2
app.get("/listings/:id", async(req,res) =>{
    let { id} = req.params;
    const listing = await Listing.findById(id).populate({path : "reviews" , populate:{path:"author"} }).populate("owner");
    if(!listing){
        req.flash("error" , "Your listing was deleted!");
        res.redirect("/listings");
    }
    res.render("./listings/show.ejs",{listing});
})



//create route 
app.post("/listings", async (req,res , next) =>{
   try{
    if(!req.isAuthenticated()){
        req.flash("error" , "Please Login");
        res.redirect("/login");
    }
    // let url = req.file.path;
    // let filename = req.file.filename;
    // res.send(url);
    const newListing = new Listing(req.body.listing);
    newListing.owner = req.user._id;
   await newListing.save();
   req.flash("success" , "New Listing Created!");
   res.redirect("/listings");
   }catch (err){
    next(err);
   }
});

//edit route
app.get("/listings/:id/edit", isowner  , async (req, res) => {
    if(!req.isAuthenticated()){
        req.flash("error" , "Please Login");
        res.redirect("/login");
    }
    let { id } = req.params;
    const listing = await Listing.findById(id);
    res.render("listings/edit.ejs", { listing });
  });

//update route
app.put("/listings/:id", isowner ,async(req,res) =>{
    if(!req.isAuthenticated()){
        req.flash("error" , "Please Login");
        res.redirect("/login");
    }
    let { id } = req.params;
    await Listing.findByIdAndUpdate( id, {...req.body.listing});
    res.redirect(`/listings/${id}`);
})

//delete route
app.delete("/listings/:id",isowner ,  async (req,res) =>{
    if(!req.isAuthenticated()){
        req.flash("error" , "Please Login");
        res.redirect("/login");
    }else{
        
    let { id } = req.params;
    await Listing.findByIdAndDelete(id);
    req.flash("success" , " Listing Deleted!");
    res.redirect("/listings");
    }
})


// review route
app.post("/listings/:id/reviews",async( req, res) =>{
    if(!req.isAuthenticated()){
        req.flash("error" , "Please Login");
        res.redirect("/login");
    }
    let listing = await Listing.findById(req.params.id);
    let newreview  = new review(req.body.review);
    newreview.author = req.user._id;
    listing.reviews.push(newreview);
    req.flash("success" , "New Review Created!");
    await newreview.save();
    await listing.save();
    res.redirect(`/listings/${listing._id}`);

});

//delete route
app.delete("/listings/:id/reviews/:reviewId", isAuthor,async (req, res) =>{
    if(!req.isAuthenticated()){
        req.flash("error" , "Please Login");
        res.redirect("/login");
    }
    let{id , reviewId} = req.params;
    await Listing.findByIdAndUpdate(id ,{$pull : { reviews: reviewId}});
    await review.findByIdAndDelete(reviewId);

    res.redirect(`/listings/${id}`);
});


//signup
app.get("/signup" , (req,res) =>{
    res.render("./users/signup.ejs");
});

app.post("/signup" , async(req,res) =>{
    try{
        let { username , password , email} = req.body;
        const newUser = new User({email , username});
        const registerUser = await User.register(newUser , password);
        req.logIn(registerUser , (err)=>{
            if(err){
                return next(err);
            }
            req.flash("success", 'SignUp Successfully!');
            res.redirect("/listings");
        })
    }catch(e){
        req.flash("error" , "username is already exist");
        res.redirect("/signup");
    }
});

//login
app.get("/login" , (req,res) =>{
    res.render("./users/login.ejs");
});

app.post("/login", passport.authenticate('local', { failureRedirect: '/login' , failureFlash:true }), async(req,res) =>{
    req.flash("success", "Welcome back to wanderlust");
    res.redirect("/listings");
});


//logout
app.get("/logout", (req,res ,next) =>{
    req.logOut( (err) =>{
        if(err){
            next(err);
        }
        req.flash("success" , "you are logged out!");
        res.redirect("/listings");
    });
})

app.get("/search", async (req, res) => {
    try {
        const { q } = req.query; // Get the search query from the URL
        console.log("Search Query:", q); // Debugging

        if (!q || q.trim() === "") {
            req.flash("error", "Please enter a search term.");
            return res.redirect("/listings");
        }

        // Perform a case-insensitive search in the database
        const listings = await Listing.find({
            $or: [
                { title: { $regex: new RegExp(q, "i") } }, // Search in the title
                { location: { $regex: new RegExp(q, "i") } }, // Search in the location
                { description: { $regex: new RegExp(q, "i") } } // Search in the description
            ]
        });

        console.log("Listings Found:", listings); // Debugging

        if (listings.length === 0) {
            req.flash("error", "No results found for your search.");
            return res.redirect("/listings");
        }

        // Render the search results page
        res.render("searchResults.ejs", { listings, searchQuery: q});
    } catch (error) {
        console.error("Search Error:", error);
        req.flash("error", "Something went wrong. Please try again.");
        res.redirect("/listings");
    }
});


app.use((err, req, res, next) =>{
    res.send("Some thing wents wrong");
});

const port = 3000;
app.listen(port , (req , res) =>{
    console.log(`app working at ${port}`);
})