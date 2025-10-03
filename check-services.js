const { MongoClient } = require('mongodb');

const uri = "mongodb+srv://anafariya:anafariya@cluster0.e3covlw.mongodb.net/fixera?retryWrites=true&w=majority&appName=Cluster0";

async function checkServices() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB\n');

    const db = client.db('fixera');

    // Get all service configurations
    const configs = await db.collection('serviceconfigurations')
      .find({})
      .project({ category: 1, service: 1, areaOfWork: 1, certificationRequired: 1, pricingModel: 1 })
      .toArray();

    console.log('📋 Service Configurations:\n');
    configs.forEach((config, i) => {
      console.log(`${i + 1}. Category: ${config.category}`);
      console.log(`   Service: ${config.service}`);
      console.log(`   Area: ${config.areaOfWork || 'N/A'}`);
      console.log(`   Pricing Model: ${config.pricingModel || 'NOT SET'}`);
      console.log(`   Certification Required: ${config.certificationRequired ? 'YES ✅' : 'NO'}`);
      console.log(`   ID: ${config._id}`);
      console.log('');
    });

    console.log(`\nTotal: ${configs.length} configurations found\n`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

checkServices();
