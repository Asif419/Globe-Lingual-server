const express = require('express');
const cors = require('cors');
require('dotenv').config();
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY);
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
    // await client.connect();


    // db connection
    const usersCollection = client.db("globe_lingual").collection("users");
    const classesCollection = client.db("globe_lingual").collection("classes");
    const selectedClassesCollection = client.db("globe_lingual").collection("selectedClasses");
    const paymentCollection = client.db("globe_lingual").collection("payment");

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

    app.get('/user-classes/:id', verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { user_id: id };
      const result = await selectedClassesCollection.find(query).toArray();
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

    app.get('/user-classes/:id', verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { user_id: id };
      const result = await usersCollection.findOne(query);
      res.send(result);
    })

    app.get('/classes', async (req, res) => {
      const query = { class_status: 'approved' };
      const result = await classesCollection.find(query).toArray();
      res.send(result);
    })

    app.get('/popular-classes', async (req, res) => {
      const query = { class_status: 'approved' };
      const result = await classesCollection.find(query).sort({ 'enrolled_students': -1 }).limit(6).toArray();
      res.send(result);
    })

    app.get('/selected-class-user/:id', verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await classesCollection.findOne(query);
      res.send(result);
    })

    app.delete('/delete-class-from-array/:id', verifyJWT, async (req, res) => {
      const result = await selectedClassesCollection.deleteOne({ _id: new ObjectId(req.params.id) });
      res.send(result);
    })

    app.post('/selected-class', verifyJWT, async (req, res) => {
      const body = {
        user_id: req.body.userId,
        selected_classes_id: req.body.new_class_id
      };
      const result = await selectedClassesCollection.insertOne(body);
      res.send(result);
    })

    app.get('/enrolled-classes/:id', verifyJWT, async (req, res) => {
      const user_id = req.params.id;
      const pipeline = [
        {
          $match: {
            user_id: user_id
          }
        },
        {
          $lookup: {
            from: 'classes',
            localField: 'selected_class_id',
            foreignField: '_id',
            as: 'matchedClasses'
          }
        },
        {
          $unwind: '$matchedClasses'
        },
        {
          $project: {
            _id: '$matchedClasses._id',
            instructor_email: '$matchedClasses.instructor_email',
            instructor_id: '$matchedClasses.instructor_id',
            instructor_name: '$matchedClasses.instructor_name',
            class_name: '$matchedClasses.class_name',
            class_photo_url: '$matchedClasses.class_photo_url',
            class_price: '$matchedClasses.class_price',
            total_seats: '$matchedClasses.total_seats',
            enrolled_students: '$matchedClasses.enrolled_students',
            class_status: '$matchedClasses.class_status',
            class_details: '$matchedClasses.class_details',
            admin_review: '$matchedClasses.admin_review'
          }
        }
      ];
      const result = await paymentCollection.aggregate(pipeline).toArray();
      res.send(result);
    })

    app.get('/payment/:id', verifyJWT, async (req, res) => {
      // match class id in class collection and selected class id in payment collection
      const user_id = req.params.id;
      const pipeline = [
        {
          $match: {
            user_id: user_id
          }
        },
        {
          $lookup: {
            from: 'classes',
            localField: 'selected_class_id',
            foreignField: '_id',
            as: 'matchedClasses'
          }
        },
        {
          $unwind: '$matchedClasses'
        },
        {
          $project: {
            _id: '$matchedClasses._id',
            instructor_name: '$matchedClasses.instructor_name',
            class_name: '$matchedClasses.class_name',
            class_photo_url: '$matchedClasses.class_photo_url',
            class_price: '$matchedClasses.class_price',
            transaction_id: '$transaction_id',
            date: '$date'
          }
        },
        {
          $sort: {
            date: -1
          }
        }
      ];

      //sort date wise and send required data
      const result = await paymentCollection.aggregate(pipeline).toArray();
      res.send(result);
    })

    app.get('/instructors', async (req, res) => {
      const query = { role: 'instructor' };
      const result = await usersCollection.find(query).toArray();
      res.send(result);
    })

    app.get('/popular-instructors', async (req, res) => {
      const query = { role: 'instructor' };
      const result = await usersCollection.find(query).limit(6).toArray();
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

    app.get('/admin-classes', verifyJWT, verifyAdmin, async (req, res) => {
      const result = await classesCollection.find().toArray();
      res.send(result);
    })

    app.patch('/class', verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.query.id;
      const { status, review } = req.body;
      const filter = { _id: new ObjectId(id) }
      // const targetedClass = await classesCollection.findOne(filter);
      const updateDoc = {
        $set: {
          class_status: `${status}`,
          admin_review: `${review}`
        },
      }
      const result = await classesCollection.updateOne(filter, updateDoc);
      res.send(result);
    })

    app.patch('/edit-review', verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.query.id;
      const { newReview } = req.body;
      const filter = { _id: new ObjectId(id) }
      const targetedClass = await classesCollection.findOne(filter);
      const updateDoc = {
        $set: {
          admin_review: `${newReview}`
        },
      }
      const result = await classesCollection.updateOne(filter, updateDoc);
      res.send(result);
    })

    //payment
    app.post('/create-payment-intent', verifyJWT, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      if (amount < 1) {
        return res.status(400).send({ error: true, message: 'Invalid price value' });
      }
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });
      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })

    app.post('/payments', verifyJWT, async (req, res) => {
      const payment = req.body;
      payment.selected_class_id = new ObjectId(payment.selected_class_id);
      //insert data in payment
      const insertResult = await paymentCollection.insertOne(payment);

      // find with class id in class collection and update enrolled student
      const filter = { _id: new ObjectId(payment.selected_class_id) };
      const update = {
        $inc: {
          enrolled_students: 1
        }
      };
      const addingResult = await classesCollection.updateOne(filter, update);

      // delete data from selected collection
      const query = { _id: new ObjectId(payment.class_id) }
      const deleteResult = await selectedClassesCollection.deleteOne(query);

      res.send({ result: insertResult, deleteResult });
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