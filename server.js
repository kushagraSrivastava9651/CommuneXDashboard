// =================================================================
//                      IMPORTS AND SETUP
// =================================================================

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// =================================================================
//                          MIDDLEWARE
// =================================================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// =================================================================
//                      DATABASE CONNECTION
// =================================================================

mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log('✅ Successfully connected to MongoDB Atlas!');
        // Seed initial data when DB is ready
        await seedRoles();
        await seedSocieties(); // <-- ADDED: Seed societies
    })
    .catch(error => console.error('❌ Error connecting to MongoDB Atlas:', error));

// =================================================================
//                         MONGOOSE SCHEMAS
// =================================================================

// Roles (Admin, Supervisor, etc.)
const roleSchema = new mongoose.Schema({
    role_name: { type: String, required: true, unique: true }
});

// ** NEW: Society Schema **
const societySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true }
});

// Users (Admins & Supervisors)
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String },
    role: { type: String, required: true }, 
    // ** UPDATED: User can be associated with multiple societies **
    society: [{ 
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Society'
    }],
});

// Staffs
const staffSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    phone: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    // ** UPDATED: Staff can be assigned to multiple societies **
    society: [{ 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Society' 
    }],
    role: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Role',
        required: true 
    }
});

const User = mongoose.model('User', userSchema);
const Staff = mongoose.model('Staff', staffSchema); 
const Role = mongoose.model('Role', roleSchema);
const Society = mongoose.model('Society', societySchema); // <-- ADDED: Society Model

// =================================================================
//                 DATA SEEDING FUNCTIONS
// =================================================================
async function seedRoles() {
    try {
        const roles = ["Pickup Agent", "Delivery Agent", "Staff"];
        for (let roleName of roles) {
            const existing = await Role.findOne({ role_name: roleName });
            if (!existing) {
                await Role.create({ role_name: roleName });
                console.log(`✅ Role '${roleName}' added.`);
            }
        }
    } catch (error) {
        console.error("❌ Error seeding roles:", error);
    }
}

// ** NEW: Society Seeding Function **
async function seedSocieties() {
    try {
        const societies = ["Greenwood Estates", "Skyline Towers", "Oceanview Apartments", "Hillside Community"];
        for (let societyName of societies) {
            const existing = await Society.findOne({ name: societyName });
            if (!existing) {
                await Society.create({ name: societyName });
                console.log(`✅ Society '${societyName}' added.`);
            }
        }
    } catch (error) {
        console.error("❌ Error seeding societies:", error);
    }
}


// =================================================================
//            ADMIN & SUPERVISOR ROUTES
// =================================================================

// Serve login page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Signup new Admin or Supervisor
app.post('/signup', async (req, res) => {
    try {
        const { email, password, phone, society, role } = req.body;
        
        const existingUser = await User.findOne({ email: email });
        if (existingUser) {
            return res.status(400).send('A user with this email already exists.');
        }

        const newUser = new User({ email, password, phone, society, role });
        await newUser.save();
        res.redirect('/login.html');
    } catch (error) {
        console.error('Signup Error:', error);
        res.status(500).send('Server error during signup.');
    }
});

// Login route
app.post('/login', async (req, res) => {
    try {
        const user = await User.findOne({ email: req.body.email });
        if (!user) {
            return res.status(400).send('Account not found.');
        }
        if (req.body.password !== user.password) {
            return res.status(400).send('Incorrect password.');
        }
        // Redirect to staff page for this demo
        res.redirect('/home.html'); 
    } catch (error) {
        res.status(500).send('Server error during login.');
    }
});

// =================================================================
//            DATA MANAGEMENT ROUTES (ROLES & SOCIETIES)
// =================================================================

// GET all available roles
app.get('/api/roles', async (req, res) => {
    try {
        const roles = await Role.find({});
        res.json(roles);
    } catch (error) {
        res.status(500).json({ message: 'Server error while fetching roles.' });
    }
});

// ** NEW: GET all available societies **
app.get('/api/societies', async (req, res) => {
    try {
        const societies = await Society.find({});
        res.json(societies);
    } catch (error) {
        res.status(500).json({ message: 'Server error while fetching societies.' });
    }
});

// =================================================================
//            STAFF MANAGEMENT ROUTES
// =================================================================

// GET all staff
app.get('/api/staff', async (req, res) => {
    try {
        // ** UPDATED: Populate both role and society **
        const staffList = await Staff.find({}).populate('role').populate('society'); 
        res.json(staffList);
    } catch (error) {
        res.status(500).json({ message: 'Server error while fetching staff.' });
    }
});

// POST new staff
app.post('/api/staff', async (req, res) => {
    try {
        const newStaff = new Staff(req.body); 
        await newStaff.save();
        // ** UPDATED: Populate both role and society for the response **
        const populatedStaff = await Staff.findById(newStaff._id).populate('role').populate('society');
        res.status(201).json(populatedStaff);
    } catch (error) {
        if (error.code === 11000) {
            const field = Object.keys(error.keyValue)[0];
            return res.status(400).json({ message: `A staff member with this ${field} already exists.` });
        }
        res.status(500).json({ message: 'Server error while adding staff member.' });
    }
});

// UPDATE staff
app.put('/api/staff/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, phone, society, role, password } = req.body;
        
        const updateData = { name, email, phone, society, role };

        if (password && password.trim() !== '') {
            updateData.password = password; 
        }

        const updatedStaff = await Staff.findByIdAndUpdate(
            id, 
            updateData,
            { new: true, runValidators: true }
        ).populate('role').populate('society'); // ** UPDATED: Populate both **

        if (!updatedStaff) {
            return res.status(404).json({ message: 'Staff member not found.' });
        }

        res.json(updatedStaff);

    } catch (error) {
        console.error('Error updating staff:', error);
        res.status(500).json({ message: 'Server error while updating staff member.' });
    }
});

// DELETE staff
app.delete('/api/staff/:id', async (req, res) => {
    try {
        const deletedStaff = await Staff.findByIdAndDelete(req.params.id);
        if (!deletedStaff) {
            return res.status(404).json({ message: 'Staff member not found.' });
        }
        res.json({ message: 'Staff member deleted successfully.' });
    } catch (error) {
        res.status(500).json({ message: 'Server error while deleting staff member.' });
    }
});

// =================================================================
//                        START THE SERVER
// =================================================================

app.listen(PORT, () => {
    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});