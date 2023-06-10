const express = require('express');
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;


// middleware

app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({ error: true, message: 'Unauthorized Access' });
  }
  const token = authorization.split(' ')[1];

  jwt.verify(token, process.env.SECRET_ACCESS_TOKEN, (error, decoded) => {
    if (error) {
      return res.status(401).send({ error: true, message: 'Unauthorized Access' });
    }
    req.decoded = decoded;
    next();
  })
}


// mongoDB connection

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ylmkwmz.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();


    // db connection
    const usersCollection = client.db("globe_lingual").collection("users");
    const classesCollection = client.db("globe_lingual").collection("classes");

    // routes

    // jwt api
    app.post('/jwt', (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.SECRET_ACCESS_TOKEN, { expiresIn: '1h' })
      res.send({ token });
    })

    //check admin / instructor function
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { user_email: email }
      const user = await usersCollection.findOne(query);
      if (user?.role !== 'admin') {
        return res.status(403).send({ error: true, message: 'Forbidden Access' });
      }
      next();
    }
    const verifyInstructor = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { user_email: email }
      const user = await usersCollection.findOne(query);
      if (user?.role !== 'instructor') {
        return res.status(403).send({ error: true, message: 'Forbidden Access' });
      }
      next();
    }

    // user api
    app.get('/user/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      const query = { user_email: email };
      const result = await usersCollection.findOne(query);
      res.send(result);
    })

    app.post('/user', async (req, res) => {
      const body = req.body;
      const query = { user_email: body.user_email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.status(408).send({ error: true, message: 'User already exist' });
      }
      const result = await usersCollection.insertOne(body);
      res.send(result);
    })

    app.patch('/user', async (req, res) => {
      const id = req.query.id;
      const role = req.body.role;
      const filter = { _id: new ObjectId(id) }
      const targetedUser = await usersCollection.findOne(filter);
      const updateDoc = {
        $set: {
          role: `${role}`,
        },
      }
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    })

    //instructor api
    app.post('/add-class', verifyJWT, verifyInstructor, async (req, res) => {
      const body = req.body;
      const result = await classesCollection.insertOne(body);
      res.send(result);
    })

    app.get('/instructor-classes/:email', verifyJWT, verifyInstructor, async (req, res) => {
      const email = req.params.email;
      const query = { instructor_email: email };
      const result = await classesCollection.find(query).toArray();
      res.send(result);
    })

    //admin api
    app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    })

    app.get('/classes', verifyJWT, verifyAdmin, async (req, res) => {
      const result = await classesCollection.find().toArray();
      res.send(result);
    })

    app.patch('/class', async (req, res) => {
      const id = req.query.id;
      console.log(req.body);
      const { status, review } = req.body;
      const filter = { _id: new ObjectId(id) }
      const targetedClass = await classesCollection.findOne(filter);
      const updateDoc = {
        $set: {
          class_status: `${status}`,
          admin_review: `${review}`
        },
      }
      const result = await classesCollection.updateOne(filter, updateDoc);
      res.send(result);
    })

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);





// basic api

app.get('/', (req, res) => {
  res.send('Globe Lingual is running');
});

app.listen(port, () => {
  console.log(`running port: ${port}`);
})